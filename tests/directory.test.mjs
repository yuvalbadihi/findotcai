import test from 'node:test';
import assert from 'node:assert/strict';
import { selectEntries, keepOrder, formatGram, relativeTime } from '../src/directory.js';

const entry = (title, username, price, members, amountNano, currency = 'GRAM') => ({
  group: { title, username, starsPerMessage: price, memberCount: members },
  adminSample: { valuation: { amountNano, currency, status: amountNano === null ? 'unavailable' : 'complete' } },
});
const entries = [
  entry('Free Market','freemarket',39,2356,'306399742858450'),
  entry('Open Bazaar','openbazaar',0,1000,'5000000000'),
  entry('Unknown Price','othermarket',null,500,null),
];

test('search matches group titles and handles, independently from price filters', () => {
  assert.equal(selectEntries(entries,{search:' @FREEMARKET '})[0],entries[0]);
  assert.equal(selectEntries(entries,{search:'open bazaar'})[0],entries[1]);
  assert.equal(selectEntries(entries,{search:'missing'}).length,0);
  assert.equal(selectEntries(entries,{price:'free'}).length,1);
  assert.equal(selectEntries(entries,{price:'free'})[0],entries[1]);
  assert.equal(selectEntries(entries,{price:'paid'})[0],entries[0]);
  assert.equal(selectEntries(entries,{search:'free',price:'free'}).length,0);
});

test('sorts use numeric costs and Gram valuations, putting unknown values last', () => {
  assert.deepEqual(selectEntries(entries,{sort:'price'}),[entries[1],entries[0],entries[2]]);
  const incompatible = entry('Stars price','starsmarket',2,4,'9999999999999999999','XTR');
  assert.equal(selectEntries([...entries,incompatible],{sort:'value'})[0],entries[0]);
  assert.equal(selectEntries(entries,{sort:'members'})[0],entries[0]);
  assert.equal(entries[0].group.username,'freemarket');
});

test('language searches and filters include every qualifying language, and activity sorting uses daily counts', () => {
  const chats = [
    {...entries[0],language:{status:'estimated',code:'eng',label:'English',languages:[{code:'eng',label:'English',share:70},{code:'rus',label:'Russian',share:30}]},activity:{messagesPerDay:12}},
    {...entries[1],language:{status:'estimated',code:'rus',label:'Russian',languages:[{code:'rus',label:'Russian',share:100}]},activity:{messagesPerDay:50}},
    {...entries[2],language:{status:'unavailable',code:null,label:null,languages:[]},activity:{messagesPerDay:3}},
    {...entry('World market','world',0,50,null),language:{status:'estimated',code:'eng',label:'English',languages:[{code:'eng',label:'English',share:40},{code:'rus',label:'Russian',share:35}],topLanguages:[{code:'eng',label:'English'},{code:'rus',label:'Russian'},{code:'hin',label:'Hindi'}]}},
  ];
  assert.deepEqual(selectEntries(chats,{search:'russian'}),[chats[0],chats[1],chats[3]]);
  assert.deepEqual(selectEntries(chats,{language:'rus'}),[chats[0],chats[1],chats[3]]);
  assert.deepEqual(selectEntries(chats,{language:'eng'}),[chats[0],chats[3]]);
  assert.deepEqual(selectEntries(chats,{language:'eng',price:'free'}),[chats[3]]);
  assert.deepEqual(selectEntries(chats,{language:'multiple'}),[chats[0],chats[3]]);
  assert.deepEqual(selectEntries(chats,{search:'hindi'}),[]);
  assert.deepEqual(selectEntries(chats,{language:'hin'}),[]);
  assert.equal(selectEntries(chats,{sort:'activity'})[0],chats[1]);
  assert.equal(selectEntries(chats,{sort:'activity'}).at(-1),chats[3]);
});

test('missing valuations are not shown as zero; valid zero remains distinguishable', () => {
  assert.equal(formatGram({status:'unavailable',currency:'GRAM',amountNano:null}),'—');
  assert.equal(formatGram({status:'complete',currency:'XTR',amountNano:'100'}),'—');
  assert.match(formatGram({status:'complete',currency:'GRAM',amountNano:'0'}),/0 Gram/);
  assert.match(formatGram({status:'complete',currency:'GRAM',amountNano:'306399742858450'}),/306,399\.74 Gram/);
  assert.equal(formatGram({status:'complete',currency:'TON',amountNano:'306399742858450'}),formatGram({status:'complete',currency:'GRAM',amountNano:'306399742858450'}));
  const legacy = entry('Legacy cache','legacy',0,50,'999999999999999','TON');
  assert.equal(selectEntries([...entries,legacy],{sort:'value'})[0],legacy);
});

test('liked-only filtering combines with language, search and price; most-liked sorting is numeric', () => {
  const spoken = (code,label) => ({status:'estimated',code,label,languages:[{code,label,share:100}]});
  const chats = [
    {...entries[0],likes:{count:9,likedByMe:true},language:spoken('eng','English')},
    {...entries[1],likes:{count:100,likedByMe:false},language:spoken('rus','Russian')},
    {...entries[2],likes:{count:2,likedByMe:true},language:spoken('eng','English')},
    entry('No likes yet','new',0,100,null),
  ];
  assert.deepEqual(selectEntries(chats,{likedOnly:true}),[chats[0],chats[2]]);
  assert.deepEqual(selectEntries(chats,{likedOnly:true,price:'paid',language:'eng',search:'free market'}),[chats[0]]);
  assert.equal(selectEntries(chats,{likedOnly:true,language:'rus'}).length,0);
  assert.deepEqual(selectEntries(chats,{sort:'likes'}),[chats[1],chats[0],chats[2],chats[3]]);
  assert.deepEqual(selectEntries(chats,{sort:'likes',likedOnly:true}),[chats[0],chats[2]]);
});

test('snapshot age uses the supplied snapshot time rather than a successful refresh time', () => {
  assert.equal(relativeTime(100,110),'Just now');
  assert.equal(relativeTime(100,8200),'2h ago');
  assert.equal(relativeTime(100,100+3*86400),'3d ago');
  assert.equal(relativeTime(null,8200),'Not checked');
});

test('Recommended is the default sort: rank score first, server order for ties and unranked entries', () => {
  const ranked = (title,score) => ({...entry(title,title,0,10,null),...(score === undefined ? {} : {rank:{version:1,score}})});
  const chats = [ranked('a',40),ranked('b',72.5),ranked('c',40),ranked('d')];
  assert.deepEqual(selectEntries(chats).map(chat => chat.group.title),['b','a','c','d']);
  assert.deepEqual(selectEntries(chats,{sort:'rank'}).map(chat => chat.group.title),['b','a','c','d']);
  assert.deepEqual(selectEntries(chats,{sort:'unknown'}),chats);
});

test('between re-ranks the shown order holds, and new entries join at the end in sorted order', () => {
  const key = chat => chat.group.title;
  const chat = title => entry(title,title,0,10,null);
  const [a,b,c,d,e] = ['a','b','c','d','e'].map(chat);
  // Fresh data now sorts c,a,b, but the list last showed a,b,c.
  assert.deepEqual(keepOrder([c,a,b],['a','b','c'],key),[a,b,c]);
  // Removed entries drop out; new ones (e, then d) follow in their sorted order.
  assert.deepEqual(keepOrder([e,c,d,a],['a','b','c'],key),[a,c,e,d]);
  assert.deepEqual(keepOrder([b,a],[],key),[b,a]);
});
