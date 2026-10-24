import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture } from './platform.mjs';

const chat = { id: -1002187584621, type: 'supergroup' };
const event = (f, id = 1, sender = 42) => ({ chat, message_id: id, date: f.now(), text: 'market listing', from: { id: sender, is_bot: false } });

test('group commands, service events, unrelated chats, and channel posts never produce messages', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    for (const text of ['/start', '/app', '/app@FindOTCAi', '/top']) await f.handler({ ...event(f), text });
    await f.handler({ chat, message_id: 3, date: f.now(), new_chat_members: [] });
    await f.handler({ ...event(f), chat: { id: -99, type: 'group' } });
    await f.handler({ ...event(f), chat: { id: -99, type: 'channel' } });
    assert.equal(f.calls.filter(call => call.method === 'sendMessage').length, 0);
    assert.equal((await f.otc.pilotStats()).activity.messages, 0);
    const methods = ['otc','chat-state','gift-inventory','maintenance'].flatMap(name =>
      [...readFileSync(`tgcloud/lib/${name}.js`, 'utf8').matchAll(/api\.([a-zA-Z]+)\(/g)].map(match=>match[1]));
    assert.ok(methods.length > 0);
    assert.ok(methods.every(method => ['getMe', 'getChatMember', 'getChat', 'getChatMemberCount', 'getChatAdministrators', 'getUserGifts'].includes(method)));
  } finally { f.close(); }
});

test('duplicates do not inflate messages, distinct posters, or gift inventory; checks are cached', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.state.gifts = { gifts: [{ type: 'unique', gift: { name: 'Gift-1' } }, { type: 'unique', gift: { name: 'Gift-1' } }] };
    f.sqlite.exec('UPDATE otcs SET admin_refresh_after=2147483647');
    await f.handler(event(f));
    await f.handler(event(f));
    await f.handler(event(f, 2));
    const stats = await f.otc.pilotStats();
    assert.equal(stats.activity.messages, 2);
    assert.equal(stats.activity.posters, 1);
    assert.equal(stats.gifts.uniqueGifts, 1);
    assert.equal(stats.gifts.observedHolders, 1);
    assert.equal(stats.gifts.completeChecks, 1);
    assert.equal(f.calls.filter(call => call.method === 'getUserGifts').length, 1);
  } finally { f.close(); }
});

test('daily frequency uses a rolling 24-hour count and language survives retries without storing text', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    const now = f.now();
    f.sqlite.prepare('UPDATE otcs SET started_at=?, active_since=?, admin_refresh_after=2147483647').run(now - 3 * 86400,now - 3 * 86400);
    const text = 'This group is a marketplace where people can buy and sell collectible gifts. Please contact the seller directly if you are interested in any of the items listed here.';
    for (let i=0;i<12;i++) {
      const message = {...event(f,i+1),date:now-(i<2 ? 86401 : 60),text};
      await f.handler(message);
      await f.handler(message);
    }
    const stats = await f.otc.pilotStats();
    assert.equal(stats.activity.messages,12);
    assert.equal(stats.activity.messagesPerDay,10);
    assert.equal(stats.activity.dailyWindowSeconds,86400);
    assert.equal(stats.language.code,'eng');
    assert.equal(stats.language.classifiedMessages,12);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM otc_messages WHERE language_code=?').get('eng').n,12);
    assert.ok(!JSON.stringify(f.sqlite.prepare('SELECT * FROM otc_messages').all()).includes(text));
    assert.ok(!JSON.stringify(stats).includes(text));
    assert.equal(f.calls.filter(call => call.method === 'sendMessage').length,0);
  } finally { f.close(); }
});

test('old observations stay unclassified and a new collector reports its partial daily window', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.sqlite.exec('UPDATE otcs SET admin_refresh_after=2147483647');
    await f.handler(event(f));
    f.sqlite.exec('UPDATE otc_messages SET language_code=NULL');
    const stats = await f.otc.pilotStats();
    assert.equal(stats.language.status,'unavailable');
    assert.equal(stats.language.analyzedMessages,0);
    assert.equal(stats.language.legacyMessages,1);
    assert.equal(stats.activity.messagesPerDay,1);
    assert.ok(stats.activity.dailyWindowSeconds < 86400);
  } finally { f.close(); }
});

test('partial and failed gift checks stay distinct from complete empty inventories', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.state.gifts = { gifts: [{ type: 'unique', gift: { name: 'Gift-1' } }], next_offset: 'next-page' };
    await f.handler(event(f));
    f.state.giftError = true;
    await f.handler(event(f, 2, 43));
    const stats = await f.otc.pilotStats();
    assert.equal(stats.activity.messages, 2);
    assert.equal(stats.gifts.completeChecks, 0);
    assert.equal(stats.gifts.partialChecks, 1);
    assert.equal(stats.gifts.unavailableChecks, 1);
    assert.equal(stats.gifts.uniqueGifts, 1);
    assert.ok(f.sqlite.prepare('SELECT retry_after FROM otc_gift_checks WHERE user_id=43').get().retry_after >= f.now() + 590);
  } finally { f.close(); }
});

test('demotion pauses collection, stale membership events cannot undo it, and admin refresh failures fail closed', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.state.botStatus = 'member';
    await f.otc.recordMembershipChange({ chat, date: f.now(), new_chat_member: { status: 'member' } });
    await f.otc.recordMembershipChange({ chat, date: f.now() - 10, new_chat_member: { status: 'administrator' } });
    await f.handler(event(f));
    assert.equal((await f.otc.pilotStats()).state, 'paused');
    assert.equal((await f.otc.pilotStats()).activity.messages, 0);
    f.state.botStatus = 'administrator';
    await f.otc.refreshPilot();
    f.state.metadataError = true;
    f.sqlite.exec('UPDATE otcs SET refresh_after=0');
    await f.handler(event(f, 2));
    assert.equal((await f.otc.pilotStats()).state, 'paused');
    assert.equal((await f.otc.pilotStats()).activity.messages, 0);
  } finally { f.close(); }
});

test('anonymous human activity is counted without inventing a person; bots and pre-monitoring events are excluded', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.sqlite.exec('UPDATE otcs SET admin_refresh_after=2147483647');
    await f.handler({ ...event(f), date: f.now() - 86400 });
    await f.handler({ ...event(f, 2), from: { id: 999, is_bot: true } });
    await f.handler({ ...event(f, 3), sender_chat: chat, from: { id: 999, is_bot: true } });
    const stats = await f.otc.pilotStats();
    assert.equal(stats.activity.messages, 1);
    assert.equal(stats.activity.posters, 0);
    assert.equal(f.calls.filter(call => call.method === 'getUserGifts').length, 0);
  } finally { f.close(); }
});

test('stats endpoint requires Telegram identity and exposes aggregates without participant identifiers', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    await assert.rejects(() => f.endpoint({}, {}), error => error.parameters.code === 'USER_REQUIRED');
    const result = await f.endpoint({}, { initData: { user: { id: 1 } } });
    assert.equal(result.entries[0].group.starsPerMessage, 350);
    assert.equal(result.entries[0].group.memberCount, 2353);
    assert.equal('state' in result.entries[0], false);
    assert.ok(!JSON.stringify(result).includes('senderId'));
    assert.ok(!JSON.stringify(result).includes('userId'));
  } finally { f.close(); }
});

test('metadata refresh cannot overwrite a newer demotion or new paid-message price', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.state.onGetChat = async () => {
      f.sqlite.prepare('UPDATE otcs SET bot_status=?, status_event_at=?, stars_per_message=?, checked_at=?, refresh_after=0').run('member', f.now() + 1, 700, f.now() + 1);
    };
    await f.otc.refreshPilot();
    const row = f.sqlite.prepare('SELECT * FROM otcs').get();
    assert.equal(row.bot_status, 'member');
    assert.equal(row.stars_per_message, 700);
    assert.equal(row.refresh_after, 0);
  } finally { f.close(); }
});

test('admin gift sample is separate, deduplicated, and aggregate-only', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.state.gifts = { gifts: [{ type: 'unique', gift: { name: 'Gift-1' } }], next_offset: 'next' };
    const sample = await f.otc.samplePilotAdmins();
    assert.equal(sample.sampled, 3);
    assert.equal(sample.partial, 3);
    assert.equal(sample.visibleUniqueGifts, 1);
    const stats = await f.otc.pilotStats();
    assert.equal(stats.activity.posters, 0);
    assert.equal(stats.gifts.observedHolders, 0);
    assert.equal(stats.adminSample.observedHolders, 3);
    assert.ok(!JSON.stringify(sample).includes('Gift-1'));
  } finally { f.close(); }
});

test('admin value sums unique gifts at collection floor, paginates every admin, and caches the result', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.state.gifts = ({ user_id, offset }) => user_id === 41 ? (offset ? { gifts: [{ type: 'unique', gift: { name: 'Gift-2', gift_id: '1' } }] } : { gifts: [{ type: 'unique', gift: { name: 'Gift-1', gift_id: '1' } }], next_offset: 'page2' }) : { gifts: [{ type: 'unique', gift: { name: 'Gift-1', gift_id: '1' } }] };
    const stats = await f.otc.pilotStats();
    assert.equal(stats.adminSample.adminCount, 3);
    assert.equal(stats.adminSample.ownerCount, 1);
    assert.equal(stats.adminSample.administratorCount, 2);
    assert.equal(stats.adminSample.pagesRead, 4);
    assert.deepEqual([...new Set(f.calls.filter(call => call.method === 'getUserGifts').map(call => call.input.user_id))].sort(), [41, 42, 43]);
    assert.equal(stats.adminSample.complete, 3);
    assert.equal(stats.adminSample.visibleUniqueGifts, 2);
    assert.equal(stats.adminSample.valuation.amountNano, '5000000000');
    assert.equal(stats.adminSample.valuation.currency, 'GRAM');
    const requests = f.calls.length;
    await f.otc.pilotStats();
    assert.equal(f.calls.length, requests);
    assert.equal(f.state.priceRequests.length, 1);
    assert.ok(f.state.priceRequests.every(url => url === 'https://proxy.thermos.gifts/api/v1/collections'));
  } finally { f.close(); }
});

test('missing prices produce a partial amount, total source failures do not become zero', async () => {
  const f = await fixture();
  try {
    const gifts = new Map([['one', { collectionId: '1' }], ['unknown', { collectionId: '9' }]]);
    const partial = f.valuation.valueAdminGifts(gifts, new Map([['1','2500000000']]), true, 100);
    assert.equal(partial.status, 'partial');
    assert.equal(partial.amountNano, '2500000000');
    assert.equal(partial.pricedGifts, 1);
    assert.equal(partial.unpricedGifts, 1);
    const missing = f.valuation.valueAdminGifts(gifts, null, true, 100);
    assert.equal(missing.status, 'unavailable');
    assert.equal(missing.amountNano, null);
    const empty = f.valuation.valueAdminGifts(new Map(), null, true, 100);
    assert.equal(empty.amountNano, '0');
    const incomplete = f.valuation.valueAdminGifts(new Map(), null, false, 100);
    assert.equal(incomplete.amountNano, null);
  } finally { f.close(); }
});

test('an upstream price outage preserves the dated last-known admin estimate', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.state.gifts = { gifts: [{ type: 'unique', gift: { name: 'Gift-1', gift_id: '1' } }] };
    const first = await f.otc.samplePilotAdmins();
    assert.equal(first.valuation.amountNano, '2500000000');
    f.state.priceError = true;
    f.state.gifts = { gifts: [{ type: 'unique', gift: { name: 'Gift-2', gift_id: '999' } }] };
    const afterFailure = await f.otc.samplePilotAdmins();
    assert.equal(afterFailure.valuation.amountNano, first.valuation.amountNano);
    assert.equal(afterFailure.checkedAt, first.checkedAt);
    const stored = JSON.parse(f.sqlite.prepare('SELECT admin_sample FROM otcs').get().admin_sample);
    assert.equal(stored.valuation.amountNano, first.valuation.amountNano);
  } finally { f.close(); }
});

test('legacy currency snapshots are published as GRAM without altering amounts or evidence dates', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    const old = {inventoryPolicy:'visible_including_blockchain',checkedAt:100,valuation:{currency:'TON',amountNano:'306399742858450',checkedAt:99,status:'complete'}};
    f.sqlite.prepare('UPDATE otcs SET admin_sample=?, admin_refresh_after=2147483647').run(JSON.stringify(old));
    const stats = await f.otc.pilotStats();
    assert.equal(stats.adminSample.valuation.currency,'GRAM');
    assert.equal(stats.adminSample.valuation.amountNano,old.valuation.amountNano);
    assert.equal(stats.adminSample.valuation.checkedAt,99);
    assert.equal(stats.adminSample.checkedAt,100);
    assert.equal(JSON.parse(f.sqlite.prepare('SELECT admin_sample FROM otcs').get().admin_sample).valuation.currency,'TON');
  } finally {f.close();}
});

test('a transient market feed transport error is retried once', async () => {
  const f = await fixture();
  try {
    f.state.priceFailures = 1;
    const floors = await f.valuation.loadCollectionFloors();
    assert.equal(floors.get('1'), '2500000000');
    assert.equal(f.state.priceFetches, 2);
  } finally { f.close(); }
});

test('admin totals include blockchain-linked gifts and still exclude burned gifts', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.state.gifts = ({user_id}) => ({ gifts: [
      {type:'unique',gift:{name:'Native-1',gift_id:'1'}},
      {type:'unique',gift:{name:'Chain-1',gift_id:'1',is_from_blockchain:true}},
      {type:'unique',gift:{name:'Burned-1',gift_id:'1',is_burned:true}},
    ] });
    const sample = await f.otc.samplePilotAdmins();
    assert.equal(sample.inventoryPolicy, 'visible_including_blockchain');
    assert.equal(sample.visibleUniqueGifts, 2);
    assert.equal(sample.valuation.amountNano, '5000000000');
    assert.ok(f.calls.filter(call => call.method === 'getUserGifts').every(call => call.input.exclude_from_blockchain === false));
  } finally { f.close(); }
});

test('a new inclusive scan never falls back to an older blockchain-excluding total', async () => {
  const f = await fixture();
  try {
    await f.otc.refreshPilot();
    f.sqlite.prepare('UPDATE otcs SET admin_sample=?').run(JSON.stringify({inventoryPolicy:'telegram_only',valuation:{amountNano:'1000000000'}}));
    f.state.priceError = true;
    f.state.gifts = {gifts:[{type:'unique',gift:{name:'Chain-1',gift_id:'1',is_from_blockchain:true}}]};
    const sample = await f.otc.samplePilotAdmins();
    assert.equal(sample.inventoryPolicy, 'visible_including_blockchain');
    assert.equal(sample.visibleUniqueGifts, 1);
    assert.equal(sample.valuation.amountNano, null);
  } finally { f.close(); }
});
