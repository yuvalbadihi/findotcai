import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './platform.mjs';

const chatId = -1002187584621;
const ctx = id => ({initData:{user:{id}}});
const listed = async (f,id) => (await f.endpoint({},ctx(id))).entries.find(entry => entry.group.id === chatId);
async function enrolled() {
  const f = await fixture();
  await f.otc.refreshPilot();
  f.sqlite.exec('UPDATE otcs SET admin_refresh_after=2147483647');
  return f;
}

test('likes require a verified viewer and a real listed OTC with a boolean desired state', async () => {
  const f = await enrolled();
  try {
    for (const context of [{},ctx(null),ctx(0),ctx(-1),ctx('42'),ctx(1.5)]) {
      await assert.rejects(() => f.likeEndpoint({chatId,liked:true},context),error => error.parameters.code === 'USER_REQUIRED');
      await assert.rejects(() => f.endpoint({},context),error => error.parameters.code === 'USER_REQUIRED');
    }
    for (const input of [{chatId,liked:'true'},{chatId,liked:1},{chatId},{chatId:String(chatId),liked:true}]) {
      await assert.rejects(() => f.likeEndpoint(input,ctx(42)),error => error.parameters.code === 'INVALID_LIKE');
    }
    await assert.rejects(() => f.likeEndpoint({chatId:-999,liked:true},ctx(42)),error => error.parameters.code === 'OTC_NOT_FOUND');
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM otc_likes').get().n,0);
  } finally {f.close();}
});

test('one vote per viewer survives concurrent retries and unlike only removes that viewer', async () => {
  const f = await enrolled();
  try {
    await Promise.all(Array.from({length:8},() => f.likeEndpoint({chatId,liked:true},ctx(42))));
    let stats = await listed(f,42);
    assert.equal(stats.likes.count,1);
    assert.equal(stats.likes.likedByMe,true);
    await f.likeEndpoint({chatId,liked:true},ctx(43));
    const viewer = await listed(f,44);
    assert.equal(viewer.likes.count,2);
    assert.equal(viewer.likes.likedByMe,false);
    await Promise.all(Array.from({length:4},() => f.likeEndpoint({chatId,liked:false},ctx(42))));
    stats = await listed(f,42);
    assert.equal(stats.likes.count,1);
    assert.equal(stats.likes.likedByMe,false);
    assert.equal((await listed(f,43)).likes.likedByMe,true);
    await f.likeEndpoint({chatId,liked:false},ctx(43));
    assert.equal((await listed(f,43)).likes.count,0);
    assert.equal(f.calls.filter(call => call.method === 'sendMessage').length,0);
  } finally {f.close();}
});

test('client-supplied identities and totals cannot change ownership or fabricate votes', async () => {
  const f = await enrolled();
  try {
    const result = await f.likeEndpoint({chatId,liked:true,userId:999,count:1000},ctx(42));
    assert.equal(result.likes.count,1);
    assert.equal(result.likes.likedByMe,true);
    assert.equal(f.sqlite.prepare('SELECT user_id FROM otc_likes').get().user_id,42);
    assert.equal((await listed(f,999)).likes.likedByMe,false);
    assert.ok(!JSON.stringify(result).match(/userId|user_id|createdAt|created_at/));
    await f.likeEndpoint({chatId,liked:false,userId:42},ctx(999));
    assert.equal((await listed(f,42)).likes.count,1);
  } finally {f.close();}
});

test('a fresh viewer gets zero likes; stats remain valid before pilot enrollment', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.endpoint({},ctx(42))).entries.length,0);
    await f.otc.refreshPilot();
    f.sqlite.exec('UPDATE otcs SET admin_refresh_after=2147483647');
    const stats = await listed(f,42);
    assert.equal(stats.group.id,chatId);
    assert.equal(stats.likes.count,0);
    assert.equal(stats.likes.likedByMe,false);
  } finally {f.close();}
});
