import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './platform.mjs';

const ids = [-1003000000001,-1003000000002];
const group = (id,title='New OTC') => ({id,type:'supergroup',title});
const membership = (f,id,status='administrator',date=f.now()) => ({chat:group(id),date,from:{id:700,is_bot:false},new_chat_member:{user:{id:8731206462,is_bot:true},status}});
const message = (f,id,sender=42) => ({chat:group(id),message_id:1,date:f.now(),text:'This is a marketplace where people can buy and sell their collectible gifts. Contact the seller directly for more information.',from:{id:sender,is_bot:false}});
function metadata(f) {
  f.state.chats = {
    [ids[0]]:{title:'First OTC',username:'firstotc',paid_message_star_count:0},
    [ids[1]]:{title:'Second OTC',username:'secondotc',paid_message_star_count:20},
  };
}

test('admin promotion enrolls real groups silently and collection remains isolated per OTC', async () => {
  const f=await fixture();
  try {
    metadata(f);
    await f.otc.recordMembershipChange(membership(f,ids[0]));
    await f.otc.recordMembershipChange(membership(f,ids[1]));
    f.sqlite.exec('UPDATE otcs SET admin_refresh_after=2147483647');
    await f.handler(message(f,ids[0],42));
    await f.handler(message(f,ids[0],42));
    await f.handler(message(f,ids[1],43));
    const first=await f.otc.pilotStats(ids[0]);
    const second=await f.otc.pilotStats(ids[1]);
    assert.equal(first.group.username,'firstotc');assert.equal(first.group.starsPerMessage,0);
    assert.equal(second.group.username,'secondotc');assert.equal(second.group.starsPerMessage,20);
    assert.equal(first.activity.messages,1);assert.equal(second.activity.messages,1);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM otc_messages').get().n,2);
    await f.likeEndpoint({chatId:ids[1],liked:true},{initData:{user:{id:900}}});
    const directory=await f.endpoint({}, {initData:{user:{id:900}}});
    assert.equal(directory.entries.length,2);
    assert.equal(directory.entries.find(entry=>entry.group.id===ids[1]).likes.likedByMe,true);
    assert.equal(directory.entries.find(entry=>entry.group.id===ids[0]).likes.count,0);
    assert.ok(!JSON.stringify(directory).includes('senderId'));
    assert.equal(f.calls.filter(call=>call.method==='sendMessage').length,0);
  }finally{f.close();}
});

test('a regular member and an unverified promotion cannot publish or collect an OTC', async () => {
  const f=await fixture();
  try {
    metadata(f);
    await f.otc.recordMembershipChange(membership(f,ids[0],'member'));
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM otcs').get().n,0);
    f.state.botStatuses = {[ids[0]]:'member'};
    await f.otc.recordMembershipChange(membership(f,ids[0]));
    await f.handler(message(f,ids[0]));
    assert.equal((await f.endpoint({}, {initData:{user:{id:900}}})).entries.length,0);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM otc_messages').get().n,0);
  }finally{f.close();}
});

test('retries preserve enrollment; demotions and stale events remain ordered for every group', async () => {
  const f=await fixture();
  try {
    metadata(f);
    const event=membership(f,ids[0]);
    await f.otc.recordMembershipChange(event);
    const started=f.sqlite.prepare('SELECT started_at FROM otcs').get().started_at;
    await f.otc.recordMembershipChange(event);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM otcs').get().n,1);
    assert.equal(f.sqlite.prepare('SELECT started_at FROM otcs').get().started_at,started);
    await f.otc.recordMembershipChange(membership(f,ids[0],'member',f.now()+1));
    await f.otc.recordMembershipChange(event);
    await f.handler(message(f,ids[0]));
    assert.equal(f.sqlite.prepare('SELECT bot_status FROM otcs').get().bot_status,'member');
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM otc_messages').get().n,0);
  }finally{f.close();}
});

test('a demotion during initial metadata reads wins over the older enrollment snapshot', async () => {
  const f=await fixture();
  try {
    metadata(f);
    f.state.onGetChat=async()=>f.otc.recordMembershipChange(membership(f,ids[0],'member',f.now()+1));
    await f.otc.recordMembershipChange(membership(f,ids[0]));
    await f.handler(message(f,ids[0]));
    assert.equal(f.sqlite.prepare('SELECT bot_status FROM otcs').get().bot_status,'member');
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM otc_messages').get().n,0);
  }finally{f.close();}
});

test('private or provisional groups are absent from the shared directory and likes endpoint', async () => {
  const f=await fixture();
  try {
    metadata(f);f.state.chats[ids[0]].username=null;
    await f.otc.recordMembershipChange(membership(f,ids[0]));
    assert.equal((await f.endpoint({}, {initData:{user:{id:900}}})).entries.length,0);
    await assert.rejects(()=>f.likeEndpoint({chatId:ids[0],liked:true},{initData:{user:{id:900}}}),error=>error.parameters.code==='OTC_NOT_FOUND');
    f.state.metadataError=true;
    await assert.rejects(()=>f.otc.recordMembershipChange(membership(f,ids[1])));
    assert.equal((await f.endpoint({}, {initData:{user:{id:900}}})).entries.length,0);
    assert.equal(f.sqlite.prepare('SELECT bot_status FROM otcs WHERE chat_id=?').get(ids[1]).bot_status,'unverified');
    f.state.metadataError=false;
    await f.otc.recordMembershipChange(membership(f,ids[1]));
    const recovered=await f.endpoint({}, {initData:{user:{id:900}}});
    assert.equal(recovered.entries.length,1);
    assert.equal(recovered.entries[0].group.username,'secondotc');
  }finally{f.close();}
});

test('directory reads are database-only and maintenance scans rotate across due OTCs', async () => {
  const f=await fixture();
  try {
    metadata(f);
    for(const id of ids)await f.otc.recordMembershipChange(membership(f,id));
    await f.endpoint({}, {initData:{user:{id:900}}});
    assert.equal(f.calls.filter(call=>call.method==='getChatAdministrators').length,0);
    await f.refreshEndpoint({}, {initData:{user:{id:900}}});
    assert.equal(f.calls.filter(call=>call.method==='getChatAdministrators').length,2);
    f.advance(11);
    await f.endpoint({}, {initData:{user:{id:900}}});
    await f.refreshEndpoint({}, {initData:{user:{id:900}}});
    const scans=f.calls.filter(call=>call.method==='getChatAdministrators');
    assert.equal(scans.length,4);
    assert.notEqual(scans[0].input.chat_id,scans[2].input.chat_id);
  }finally{f.close();}
});
