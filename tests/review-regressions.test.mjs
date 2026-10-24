import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './platform.mjs';

const chatId = -1002187584621,
  chat = { id: chatId, type: 'supergroup', title: 'Free Market' };
const viewer = { initData: { user: { id: 42 } } };
const event = (f, id = 1, date = f.now()) => ({
  chat,
  message_id: id,
  date,
  text: 'market listing',
  from: { id: 42, is_bot: false },
});
const membership = (f, status, date = f.now()) => ({
  chat,
  date,
  new_chat_member: { status, user: { id: 8731206462, is_bot: true } },
});
const gift = (name) => ({ type: 'unique', gift: { name, gift_id: '1' } });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
async function until(predicate) {
  for (let i = 0; i < 100 && !predicate(); i++) await Promise.resolve();
  assert.ok(predicate());
}
const messageCount = (f) =>
  f.sqlite.prepare('SELECT count(*) AS n FROM otc_messages').get().n;

test('same-second membership events use update IDs, and a later date tolerates ID restart', async () => {
  const f = await fixture();
  try {
    await f.otc.recordMembershipChange(membership(f, 'administrator'), 100);
    await f.otc.recordMembershipChange(membership(f, 'member'), 102);
    await f.otc.recordMembershipChange(membership(f, 'administrator'), 101);
    assert.equal((await f.chatState.getChatRow(chatId)).botStatus, 'member');
    await f.handler(event(f));
    assert.equal(
      f.sqlite.prepare('SELECT count(*) AS n FROM otc_messages').get().n,
      0,
    );
    f.advance(8 * 86400);
    await f.otc.recordMembershipChange(membership(f, 'administrator'), 1);
    assert.equal(
      (await f.chatState.getChatRow(chatId)).botStatus,
      'administrator',
    );
    assert.equal((await f.chatState.getChatRow(chatId)).membershipUpdateId, 1);
  } finally {
    f.close();
  }
});

test('same-second paid-price events cannot be rolled back by a delayed older update', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    const price = (n) => ({
      ...event(f, n),
      text: undefined,
      paid_message_price_changed: { paid_message_star_count: n },
    });
    await f.handler(price(700), { update: { update_id: 102 } });
    await f.handler(price(300), { update: { update_id: 101 } });
    assert.equal((await f.chatState.getChatRow(chatId)).starsPerMessage, 700);
  } finally {
    f.close();
  }
});

test('expired verification never lets concurrent messages through the refresh lease', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.advance(301);
    const gate = deferred();
    let pending = false;
    f.state.onGetChat = async () => {
      pending = true;
      await gate.promise;
    };
    const first = f.handler(event(f));
    await until(() => pending);
    await f.handler(event(f, 2));
    assert.equal(
      f.sqlite.prepare('SELECT count(*) AS n FROM otc_messages').get().n,
      0,
    );
    gate.resolve();
    await first;
    assert.equal(
      f.sqlite.prepare('SELECT count(*) AS n FROM otc_messages').get().n,
      1,
    );
  } finally {
    f.close();
  }
});

test('messages keep flowing while a verification is renewed before it lapses', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.advance(270);
    const gate = deferred();
    let pending = false;
    f.state.onGetChat = async () => {
      pending = true;
      await gate.promise;
    };
    const first = f.handler(event(f));
    await until(() => pending);
    await f.handler(event(f, 2));
    assert.equal(messageCount(f), 1);
    gate.resolve();
    await first;
    assert.equal(messageCount(f), 2);
    assert.ok(f.chatState.verifiedAdmin(await f.chatState.getChatRow(chatId)));
  } finally {
    f.close();
  }
});

test('a failed early renewal keeps the current verification until it lapses', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.advance(270);
    f.state.metadataError = true;
    const attempts = () =>
      f.calls.filter((call) => call.method === 'getChat').length;
    await f.handler(event(f));
    // The pilot refresh, then the failed early renewal; the message still counts.
    assert.equal(attempts(), 2);
    assert.equal(messageCount(f), 1);
    f.advance(10);
    await f.handler(event(f, 2));
    assert.equal(attempts(), 2);
    assert.equal(messageCount(f), 2);
    f.advance(21);
    await f.handler(event(f, 3));
    assert.equal(messageCount(f), 2);
    assert.equal(
      (await f.chatState.getChatRow(chatId)).botStatus,
      'unverified',
    );
  } finally {
    f.close();
  }
});

test('verification failures back off, and a membership event still re-verifies at once', async () => {
  const f = await fixture();
  try {
    f.state.metadataError = true;
    await assert.rejects(() =>
      f.otc.recordMembershipChange(membership(f, 'administrator'), 1),
    );
    // A newly enrolled group retries within a minute...
    assert.equal(
      (await f.chatState.getChatRow(chatId)).refreshAfter,
      f.now() + 60,
    );
    // ...but one that stays unreachable all day is not retried every minute.
    for (let minute = 0; minute < 24 * 60; minute++) {
      f.advance(60);
      await f.maintenance.maintainDirectory({ metadataOnly: true });
    }
    const attempts = f.calls.filter((call) => call.method === 'getChat').length;
    assert.ok(attempts < 50, `${attempts} verification attempts in a day`);
    f.state.metadataError = false;
    await f.otc.recordMembershipChange(membership(f, 'administrator'), 2);
    assert.ok(f.chatState.verifiedAdmin(await f.chatState.getChatRow(chatId)));
  } finally {
    f.close();
  }
});

test('a superseded metadata failure cannot pause a newer successful verification', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    const gate = deferred();
    let pending = false;
    f.state.onGetChat = async () => {
      pending = true;
      await gate.promise;
    };
    const old = f.otc.refreshPilot();
    await until(() => pending);
    f.state.onGetChat = null;
    await f.otc.recordMembershipChange(membership(f, 'member'), 10);
    await f.otc.recordMembershipChange(membership(f, 'administrator'), 11);
    gate.reject(new Error('Old request failed'));
    await assert.rejects(() => old);
    assert.equal(
      (await f.chatState.getChatRow(chatId)).botStatus,
      'administrator',
    );
    assert.ok(f.chatState.verifiedAdmin(await f.chatState.getChatRow(chatId)));
  } finally {
    f.close();
  }
});

test('an absent paid-message field means free posting, rather than an unknown price', async () => {
  const f = await fixture();
  try {
    f.state.chats = {
      [chatId]: { title: 'Free Market', username: 'freemarket' },
    };
    await f.otc.refreshPilot();
    assert.equal((await f.endpoint({}, viewer)).entries[0].group.starsPerMessage, 0);
  } finally {
    f.close();
  }
});

test('future-dated activity is withheld until its event time, and a reconnect resets coverage', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.sqlite.exec('UPDATE otcs SET admin_refresh_after=2147483647');
    await f.handler(event(f, 1, f.now() + 30));
    assert.equal((await f.otc.pilotStats()).activity.messages, 0);
    f.advance(31);
    assert.equal((await f.otc.pilotStats()).activity.messages, 1);
    await f.otc.recordMembershipChange(membership(f, 'member'), 10);
    f.advance(5);
    await f.otc.recordMembershipChange(membership(f, 'administrator'), 11);
    assert.equal((await f.otc.pilotStats()).activity.dailyWindowSeconds, 0);
  } finally {
    f.close();
  }
});

test('same-second inventory replacement removes obsolete and burned gifts', async () => {
  const f = await fixture();
  try {
    f.state.gifts = { gifts: [gift('Old-1')] };
    await f.otc.checkVisibleGifts(42);
    f.sqlite.exec('UPDATE otc_gift_checks SET retry_after=0');
    f.state.gifts = {
      gifts: [
        gift('New-1'),
        { ...gift('Burned-1'), gift: { name: 'Burned-1', is_burned: true } },
      ],
    };
    await f.otc.checkVisibleGifts(42);
    assert.deepEqual(
      f.sqlite
        .prepare('SELECT name FROM otc_observed_gifts')
        .all()
        .map((row) => row.name),
      ['New-1'],
    );
  } finally {
    f.close();
  }
});

test('an expired poster scan cannot overwrite a newer completed generation', async () => {
  const f = await fixture();
  try {
    const gate = deferred();
    let pending = false;
    f.state.gifts = async () => {
      pending = true;
      return await gate.promise;
    };
    const old = f.otc.checkVisibleGifts(42);
    await until(() => pending);
    f.advance(121);
    f.state.gifts = { gifts: [gift('New-1')] };
    await f.otc.checkVisibleGifts(42);
    gate.resolve({ gifts: [gift('Old-1')] });
    await old;
    assert.deepEqual(
      f.sqlite
        .prepare('SELECT name FROM otc_observed_gifts')
        .all()
        .map((row) => row.name),
      ['New-1'],
    );
    assert.equal(
      f.sqlite.prepare('SELECT version FROM otc_gift_checks').get().version,
      2,
    );
  } finally {
    f.close();
  }
});

test('a superseded admin scan cannot overwrite the newer inventory snapshot', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    const gate = deferred();
    let pending = false;
    f.state.gifts = async ({ user_id }) => {
      if (user_id === 41) {
        pending = true;
        return await gate.promise;
      }
      return { gifts: [] };
    };
    const old = f.otc.samplePilotAdmins();
    await until(() => pending);
    f.state.gifts = { gifts: [gift('New-1')] };
    await f.otc.samplePilotAdmins();
    gate.resolve({ gifts: [gift('Old-1'), gift('Old-2')] });
    assert.equal(await old, null);
    assert.equal(
      JSON.parse((await f.chatState.getChatRow(chatId)).adminSample)
        .visibleUniqueGifts,
      1,
    );
  } finally {
    f.close();
  }
});

test('demotion hides the OTC immediately and invalidates an in-flight admin scan', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    const gate = deferred();
    let pending = false;
    f.state.gifts = async () => {
      pending = true;
      return await gate.promise;
    };
    const scan = f.otc.samplePilotAdmins();
    await until(() => pending);
    await f.otc.recordMembershipChange(membership(f, 'member'), 10);
    gate.resolve({ gifts: [gift('Gift-1')] });
    assert.equal(await scan, null);
    assert.equal((await f.endpoint({}, viewer)).entries.length, 0);
    assert.equal((await f.chatState.getChatRow(chatId)).adminSample, null);
  } finally {
    f.close();
  }
});

test('an admin scan survives a routine metadata renewal', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    const gate = deferred();
    let pending = false;
    f.state.gifts = async ({ user_id }) => {
      if (user_id !== 41) return { gifts: [] };
      pending = true;
      return await gate.promise;
    };
    const scan = f.otc.samplePilotAdmins();
    await until(() => pending);
    await f.otc.refreshPilot();
    gate.resolve({ gifts: [gift('Gift-1')] });
    assert.ok(await scan);
    assert.equal(
      JSON.parse((await f.chatState.getChatRow(chatId)).adminSample)
        .visibleUniqueGifts,
      1,
    );
  } finally {
    f.close();
  }
});

test('directory query count stays constant with 100 OTCs and never calls the Bot API', async () => {
  const f = await fixture();
  try {
    const insert = f.sqlite.prepare(
      'INSERT INTO otcs(chat_id,title,username,bot_status,started_at,checked_at,refresh_after,active_since) VALUES(?,?,?,?,?,?,?,?)',
    );
    for (let i = 1; i <= 100; i++)
      insert.run(
        -1003000000000 - i,
        'OTC ' + i,
        'market' + i,
        'administrator',
        f.now(),
        f.now(),
        f.now() + 300,
        f.now(),
      );
    const queries = f.state.queryCount || 0,
      apiCalls = f.calls.length;
    const result = await f.endpoint({}, viewer);
    assert.equal(result.entries.length, 100);
    assert.equal(f.state.queryCount - queries, 5);
    assert.equal(f.calls.length, apiCalls);
  } finally {
    f.close();
  }
});

test('like uniqueness is enforced by SQLite and hidden OTCs can still be unliked privately', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    await f.likeEndpoint({ chatId, liked: true }, viewer);
    assert.throws(
      () =>
        f.sqlite
          .prepare(
            'INSERT INTO otc_likes(id,chat_id,user_id,created_at) VALUES(?,?,?,?)',
          )
          .run('noncanonical', chatId, 42, f.now()),
      /UNIQUE/,
    );
    await f.otc.recordMembershipChange(membership(f, 'member'), 10);
    await assert.rejects(() => f.likeEndpoint({ chatId, liked: true }, viewer));
    const result = await f.likeEndpoint({ chatId, liked: false }, viewer);
    assert.equal(result.available, false);
    assert.equal(result.likes, null);
    assert.equal(
      f.sqlite.prepare('SELECT count(*) AS n FROM otc_likes').get().n,
      0,
    );
  } finally {
    f.close();
  }
});

test('global retention cleanup removes inactive telemetry even for departed chats', async () => {
  const f = await fixture();
  try {
    const old = f.now() - 32 * 86400;
    f.sqlite
      .prepare(
        'INSERT INTO otc_messages(id,chat_id,message_id,sender_id,sent_at,received_at) VALUES(?,?,?,?,?,?)',
      )
      .run('old', chatId, 1, 999, old, old);
    f.sqlite
      .prepare(
        'INSERT INTO otc_gift_checks(user_id,status,checked_at,retry_after) VALUES(?,?,?,?)',
      )
      .run(999, 'complete', old, old + 86400);
    f.sqlite
      .prepare(
        'INSERT INTO otc_observed_gifts(name,user_id,observed_at) VALUES(?,?,?)',
      )
      .run('Old-1', 999, old);
    await f.maintenance.pruneTelemetry();
    for (const table of [
      'otc_messages',
      'otc_gift_checks',
      'otc_observed_gifts',
    ])
      assert.equal(
        f.sqlite.prepare('SELECT count(*) AS n FROM ' + table).get().n,
        0,
      );
  } finally {
    f.close();
  }
});

test('one public price catalogue is cached across multiple admin scans', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.state.gifts = { gifts: [gift('Gift-1')] };
    await f.otc.samplePilotAdmins();
    await f.otc.samplePilotAdmins();
    assert.equal(f.state.priceFetches, 1);
    f.advance(301);
    await f.otc.samplePilotAdmins();
    assert.equal(f.state.priceFetches, 2);
  } finally {
    f.close();
  }
});

test('an administrator roster change discards the incomplete replacement snapshot', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.state.gifts = {gifts:[gift('Original-1')]};
    await f.otc.samplePilotAdmins();
    const before = (await f.chatState.getChatRow(chatId)).adminSample;
    f.state.gifts = () => {
      f.state.admins = {[chatId]:[{status:'creator',user:{id:41}}]};
      return {gifts:[gift('Replacement-1')]};
    };
    await assert.rejects(f.otc.samplePilotAdmins(),/Administrator list changed/);
    assert.equal((await f.chatState.getChatRow(chatId)).adminSample,before);
    assert.equal((await f.chatState.getChatRow(chatId)).adminRefreshAfter,f.now()+300);
  } finally { f.close(); }
});

test('maintenance refuses missing identity before performing any reads or writes', async () => {
  const f = await fixture();
  try {
    const before = f.state.queryCount || 0;
    for (const ctx of [undefined,{}, {initData:{user:{id:-1}}}]) {
      await assert.rejects(f.refreshEndpoint({},ctx),error=>error.parameters?.code==='USER_REQUIRED');
    }
    assert.equal(f.state.queryCount || 0,before);
    assert.equal(f.calls.length,0);
  } finally { f.close(); }
});
