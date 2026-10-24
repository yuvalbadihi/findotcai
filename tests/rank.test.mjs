import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RANK_VERSION,
  WEIGHTS,
  rankDirectory,
  rankScore,
  rankSignals,
} from '../tgcloud/lib/otc-rank.js';
import { fixture } from './platform.mjs';

const NOW = 1_800_000_000;
const DAY = 86400;
function otc(id, options = {}) {
  const {
    members = 1000,
    price = 0,
    messages = 0,
    posters = 0,
    idleHours = null,
    days = 7,
    likes = 0,
    gram = null,
    languages = [],
  } = options;
  return {
    group: { id, title: `OTC ${id}`, memberCount: members, starsPerMessage: price },
    windowStartedAt: NOW - days * DAY,
    activity: {
      messages,
      posters,
      lastMessageAt: idleHours === null ? null : NOW - idleHours * 3600,
    },
    language: { languages: languages.map((code) => ({ code })) },
    adminSample:
      gram === null
        ? null
        : { valuation: { currency: 'GRAM', status: 'complete', amountNano: `${gram}000000000` } },
    likes: { count: likes, likedByMe: false },
  };
}
const order = (entries, options = {}) =>
  rankDirectory(entries, { now: NOW, ...options }).map((entry) => entry.group.id);
const score = (entry, options) => rankDirectory([entry], { now: NOW, ...options })[0].rank.score;

test('weights add up to one and every score stays within 0-100', () => {
  assert.equal(Math.round(Object.values(WEIGHTS).reduce((a, b) => a + b) * 1e9), 1e9);
  const silent = otc(-1, { price: null, members: 0, days: 0 });
  const maximal = otc(-2, {
    members: 1e7, messages: 1e6, posters: 1e5, idleHours: 0, likes: 1e5, gram: 1e9, languages: ['eng'],
  });
  const audiences = new Map([[-2, { checked: 1e5, holders: 1e5 }]]);
  for (const entry of rankDirectory([silent, maximal], { now: NOW, audiences, language: 'eng' })) {
    assert.ok(entry.rank.score >= 0 && entry.rank.score <= 100, entry.rank.score);
    for (const value of Object.values(entry.rank.signals)) assert.ok(value >= 0 && value <= 1);
  }
  assert.equal(rankScore(Object.fromEntries(Object.keys(WEIGHTS).map((name) => [name, 1])), true), 100);
});

test('a smaller group with regular posters outranks a large, nearly inactive one', () => {
  const quiet = otc(-1, { members: 50000, messages: 2, posters: 1, idleHours: 120 });
  const active = otc(-2, { members: 800, messages: 280, posters: 35, idleHours: 0.2 });
  assert.deepEqual(order([quiet, active]), [-2, -1]);
});

test('lower posting prices rank higher, and an unknown price is not treated as free', () => {
  const free = otc(-1, { price: 0 });
  const paid = otc(-2, { price: 39 });
  const unknown = otc(-3, { price: null });
  const expensive = otc(-4, { price: 500 });
  assert.deepEqual(order([expensive, unknown, paid, free]), [-1, -2, -3, -4]);
});

test('a first-day burst does not outrank a week of steady, broad activity', () => {
  const burst = otc(-1, { days: 1, messages: 120, posters: 4, idleHours: 0.1 });
  const steady = otc(-2, { days: 7, messages: 140, posters: 25, idleHours: 1 });
  assert.deepEqual(order([burst, steady]), [-2, -1]);
  // A brand-new group with no data sits at the neutral prior, not at zero.
  const fresh = rankSignals(otc(-3, { days: 0 }), {}, NOW);
  assert.equal(fresh.activity, 0.3);
  assert.equal(fresh.collectors, 0.3);
});

test('broad collector participation beats one very valuable admin collection', () => {
  const whale = otc(-1, { gram: 5_000_000, messages: 70, posters: 10, idleHours: 2 });
  const collectors = otc(-2, { gram: 0, messages: 70, posters: 10, idleHours: 2 });
  const audiences = new Map([
    [-1, { checked: 10, holders: 0 }],
    [-2, { checked: 20, holders: 12 }],
  ]);
  assert.deepEqual(order([whale, collectors], { audiences }), [-2, -1]);
  // Admin value has diminishing returns: 10x the Gram adds far less than 10x the score.
  const small = rankSignals(otc(-3, { gram: 1000 }), {}, NOW).value;
  const large = rankSignals(otc(-4, { gram: 10_000 }), {}, NOW).value;
  assert.ok(large > small && large - small < 0.2);
});

test('likes, members and recent activity each move a group up', () => {
  const base = { messages: 70, posters: 10, idleHours: 2 };
  assert.ok(score(otc(-1, { ...base, likes: 8 })) > score(otc(-1, base)));
  assert.ok(score(otc(-1, { ...base, members: 20000 })) > score(otc(-1, base)));
  assert.ok(score(otc(-1, base)) > score(otc(-1, { ...base, idleHours: 240 })));
});

test('the viewer language gives a bounded boost, and other groups keep their own scores', () => {
  const english = otc(-1, { messages: 70, posters: 10, idleHours: 2, languages: ['eng'] });
  const russian = otc(-2, { messages: 70, posters: 10, idleHours: 2, languages: ['rus'] });
  assert.deepEqual(order([english, russian], { language: 'rus' }), [-2, -1]);
  assert.deepEqual(order([english, russian], { language: 'eng' }), [-1, -2]);
  const alone = score(otc(-2, { messages: 70, posters: 10, idleHours: 2, languages: ['rus'] }));
  const boosted = score(otc(-2, { messages: 70, posters: 10, idleHours: 2, languages: ['rus'] }), { language: 'rus' });
  // Scores are rounded to 0.1, so compare the 10% boost within that precision.
  assert.ok(Math.abs(boosted - alone * 1.1) <= 0.11, `${boosted} vs ${alone}`);
  // A score does not depend on which other groups are listed.
  const listed = rankDirectory([otc(-3), otc(-2, { messages: 70, posters: 10, idleHours: 2, languages: ['rus'] })], { now: NOW });
  assert.equal(listed.find((entry) => entry.group.id === -2).rank.score, alone);
});

test('equal scores fall back to likes, members and then chat id', () => {
  assert.deepEqual(order([otc(-1), otc(-3), otc(-2)]), [-3, -2, -1]);
  const ranked = rankDirectory([otc(-1)], { now: NOW })[0].rank;
  assert.equal(ranked.version, RANK_VERSION);
  assert.deepEqual(Object.keys(ranked.signals), Object.keys(WEIGHTS));
});

const ids = [-1003000000001, -1003000000002];
const membership = (f, id) => ({
  chat: { id, type: 'supergroup', title: 'OTC' },
  date: f.now(),
  from: { id: 700, is_bot: false },
  new_chat_member: { user: { id: 8731206462, is_bot: true }, status: 'administrator' },
});
const english =
  'This is a marketplace where people can buy and sell their collectible gifts. Contact the seller directly for more information.';
const post = (f, id, messageId, sender) => ({
  chat: { id, type: 'supergroup', title: 'OTC' },
  message_id: messageId,
  date: f.now(),
  text: english,
  from: { id: sender, is_bot: false },
});

test('the directory arrives ranked from live activity, collectors and the viewer language', async () => {
  const f = await fixture();
  try {
    f.state.chats = {
      [ids[0]]: { title: 'Quiet OTC', username: 'quietotc', paid_message_star_count: 0 },
      [ids[1]]: { title: 'Busy OTC', username: 'busyotc', paid_message_star_count: 20 },
    };
    for (const id of ids) await f.otc.recordMembershipChange(membership(f, id));
    f.sqlite.exec(`UPDATE otcs SET admin_refresh_after=2147483647, started_at=${f.now() - 7 * DAY}`);
    // Posters 101-103 hold a unique gift; the others do not.
    f.state.gifts = ({ user_id }) => ({
      gifts: user_id <= 103 ? [{ type: 'unique', gift: { name: `Gift-${user_id}`, gift_id: '1' } }] : [],
    });
    for (let sender = 101; sender <= 106; sender++)
      await f.handler(post(f, ids[1], sender, sender));
    await f.handler(post(f, ids[0], 1, 200));
    const viewer = (language_code) => ({ initData: { user: { id: 900, language_code } } });
    const directory = await f.endpoint({}, viewer('en'));
    assert.equal(directory.apiVersion, 3);
    assert.deepEqual(directory.entries.map((entry) => entry.group.id), [ids[1], ids[0]]);
    const [busy, quiet] = directory.entries;
    assert.ok(busy.rank.score > quiet.rank.score);
    assert.ok(busy.rank.signals.collectors > quiet.rank.signals.collectors);
    assert.ok(busy.rank.signals.activity > quiet.rank.signals.activity);
    // Both groups write English: an English interface boosts them by 10%.
    const neutral = await f.endpoint({}, viewer('ru'));
    const plain = neutral.entries.find((entry) => entry.group.id === ids[1]).rank.score;
    assert.ok(Math.abs(busy.rank.score - plain * 1.1) <= 0.11, `${busy.rank.score} vs ${plain}`);
    const unknown = await f.endpoint({}, viewer('xx-unknown'));
    assert.equal(unknown.entries.find((entry) => entry.group.id === ids[1]).rank.score, plain);
    assert.ok(!JSON.stringify(directory).includes('senderId'));
  } finally {
    f.close();
  }
});
