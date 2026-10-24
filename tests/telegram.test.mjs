import test from 'node:test';
import assert from 'node:assert/strict';
import {
  callServerless,
  parseDirectory,
  performanceClass,
  unauthorized,
} from '../src/telegram.js';
import { formatGram, selectEntries } from '../src/directory.js';

const entry = {
  group: { id: -1001, title: 'Market', starsPerMessage: 0 },
  activity: { messagesPerDay: 3 },
};

test('malformed, duplicate and incomplete directory responses cannot replace the current list', () => {
  for (const value of [
    null,
    {},
    [],
    { entries: {} },
    { entries: [{}] },
    { entries: [entry, entry] },
    { entries: [{ ...entry, group: { ...entry.group, id: 123 } }] },
    { entries: [{ ...entry, activity: { messagesPerDay: -1 } }] },
    {
      entries: [{ ...entry, group: { ...entry.group, starsPerMessage: '0' } }],
    },
    { entries: [{ ...entry, rank: { score: 'high' } }] },
    { entries: [{ ...entry, rank: null }] },
    // The single-group response shape predates the directory.
    { group: null },
    entry,
  ]) {
    assert.throws(() => parseDirectory(value));
  }
  assert.deepEqual(parseDirectory({ entries: [] }), []);
  assert.deepEqual(parseDirectory({ entries: [entry] }), [entry]);
  const ranked = { ...entry, rank: { version: 1, score: 41.5 } };
  assert.deepEqual(parseDirectory({ entries: [ranked] }), [ranked]);
});

test('native-asset formatting and sorting retain precision beyond Number safe integers', () => {
  const quote = (amountNano) => ({
    currency: 'GRAM',
    status: 'complete',
    amountNano,
  });
  assert.equal(
    formatGram(quote('12345678901234567005000000')),
    '≈ 12,345,678,901,234,567.01 Gram',
  );
  assert.equal(formatGram(quote('999999999')), '≈ 1 Gram');
  const a = { ...entry, adminSample: { valuation: quote('9007199254740992') } };
  const b = { ...entry, adminSample: { valuation: quote('9007199254740993') } };
  assert.deepEqual(selectEntries([a, b], { sort: 'value' }), [b, a]);
});

test('transport rejects timeouts and synchronous SDK failures; late callbacks cannot change a result', async () => {
  let callback;
  await assert.rejects(
    callServerless(
      {
        Serverless: {
          call(n, i, cb) {
            callback = cb;
          },
        },
      },
      'getOtcStats',
      {},
      5,
    ),
    /timed out/,
  );
  callback(null, { entries: [] });
  await assert.rejects(
    callServerless(
      {
        Serverless: {
          call() {
            throw new Error('SDK unavailable');
          },
        },
      },
      'getOtcStats',
    ),
    /SDK unavailable/,
  );
  assert.deepEqual(
    await callServerless(
      {
        Serverless: {
          call(n, i, cb) {
            cb(null, { entries: [] });
          },
        },
      },
      'getOtcStats',
    ),
    { entries: [] },
  );
  assert.ok(unauthorized({ parameters: { code: 'USER_REQUIRED' } }));
  assert.ok(unauthorized({ status: 401 }));
  assert.equal(unauthorized(new Error('Temporary outage')), false);
});

test('Android performance class is read from the Telegram user agent only', () => {
  const android = (level) =>
    `Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.5672.136 Mobile Safari/537.36 Telegram-Android/11.3.3 (Google sdk_gphone64_arm64; Android 14; SDK 34; ${level})`;
  assert.equal(performanceClass(android('LOW')), 'LOW');
  assert.equal(performanceClass(android('AVERAGE')), 'AVERAGE');
  assert.equal(performanceClass(android('HIGH')), 'HIGH');
  assert.equal(
    performanceClass(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    ),
    null,
  );
  assert.equal(performanceClass(android('UNKNOWN')), null);
  assert.equal(performanceClass(), null);
});
