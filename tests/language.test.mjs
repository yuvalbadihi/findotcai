import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMessageLanguage, summarizeLanguages } from '../tgcloud/lib/language.js';

export const english = 'This group is a marketplace where people can buy and sell collectible gifts. Please contact the seller directly if you are interested in any of the items listed here.';
test('language detection uses message text and captions across common chat languages', () => {
  const samples = [
    ['eng',english],
    ['rus','В этой группе можно покупать и продавать коллекционные подарки. Пожалуйста, напишите продавцу напрямую, если вас интересуют его предложения и условия сделки.'],
    ['hin','इस समूह में आप अपने उपहार खरीद और बेच सकते हैं। किसी भी वस्तु की कीमत और अधिक जानकारी के लिए कृपया विक्रेता से सीधे संपर्क करें।'],
    ['ben','এই গ্রুপে আপনি আপনার উপহার কিনতে এবং বিক্রি করতে পারেন। দাম এবং অন্যান্য তথ্য জানতে অনুগ্রহ করে সরাসরি বিক্রেতার সাথে যোগাযোগ করুন।'],
    ['tam','இந்த குழுவில் உங்கள் பரிசுகளை வாங்கவும் விற்கவும் முடியும். பொருளின் விலை மற்றும் கூடுதல் தகவல்களுக்கு விற்பனையாளரை நேரடியாக தொடர்பு கொள்ளவும்.'],
    ['heb','בקבוצה הזאת אפשר לקנות ולמכור מתנות מיוחדות. לפרטים נוספים על המחיר ועל התנאים של המכירה אפשר לפנות ישירות למוכר בהודעה פרטית.'],
  ];
  for (const [code,text] of samples) {
    assert.equal(detectMessageLanguage({text}),code,code);
    assert.equal(detectMessageLanguage({caption:text}),code,`${code} caption`);
  }
});

test('short ads, links and entity code blocks cannot manufacture a language signal', () => {
  for (const text of ['Sell Pepe 100 TON', '@username https://example.com/english/russian', '🎁 12345 💎', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']) assert.equal(detectMessageLanguage({text}),'und');
  assert.equal(detectMessageLanguage({text:english,entities:[{type:'code',offset:0,length:english.length}]}),'und');
  assert.equal(detectMessageLanguage({text:'https://example.com/' + 'abcdefghijk'.repeat(30)}),'und');
});

test('the top language appears immediately and exactly 30 percent qualifies as a second language', () => {
  const row = (code,messages) => ({language_code:code,messages});
  let summary = summarizeLanguages([row(null,50),row('eng',9),row('und',4)],123);
  assert.equal(summary.status,'estimated');
  assert.equal(summary.code,'eng');
  assert.deepEqual(summary.languages.map(item => [item.code,item.share]),[['eng',100]]);
  assert.equal(summary.legacyMessages,50);
  summary = summarizeLanguages([row('eng',7),row('rus',3),row('und',2)],123);
  assert.equal(summary.status,'estimated');
  assert.equal(summary.code,'eng');
  assert.equal(summary.share,70);
  assert.deepEqual(summary.languages.map(item => [item.code,item.share]),[['eng',70],['rus',30]]);
  assert.equal(summary.classifiedMessages,10);
  assert.equal(summary.analyzedMessages,12);
  assert.equal(summary.unknownMessages,2);
  assert.equal(summary.windowStartedAt,123);
  assert.deepEqual(summarizeLanguages([row('eng',1)],123).languages.map(item=>item.code),['eng']);
  assert.equal(summarizeLanguages([row('eng',10),row('und',100)],123).code,'eng');
});

test('the exact threshold excludes smaller minorities, retains three qualifying languages and always keeps the leader', () => {
  const summarize = counts => summarizeLanguages(Object.entries(counts).map(([language_code,messages])=>({language_code,messages})),123);
  assert.deepEqual(summarize({eng:701,rus:299}).languages.map(item=>item.code),['eng']);
  assert.deepEqual(summarize({eng:700,rus:300}).languages.map(item=>item.code),['eng','rus']);
  // Rounding 29.99% to 30% must not promote the minority.
  assert.deepEqual(summarize({eng:7001,rus:2999}).languages.map(item=>item.code),['eng']);
  assert.deepEqual(summarize({eng:34,rus:33,hin:33}).languages.map(item=>item.code),['eng','hin','rus']);
  assert.deepEqual(summarize({eng:25,rus:24,hin:23,heb:15,spa:13}).languages.map(item=>item.code),['eng']);
  assert.deepEqual(summarize({rus:5,eng:5}).languages.map(item=>item.code),['eng','rus']);
});

test('messages without identifiable language cannot invent a language or display an unknown label', () => {
  for (const rows of [[],[{language_code:null,messages:50}],[{language_code:'und',messages:20}]]) {
    const summary = summarizeLanguages(rows,123);
    assert.equal(summary.status,'unavailable');
    assert.equal(summary.code,null);
    assert.equal(summary.label,null);
    assert.deepEqual(summary.languages,[]);
  }
});
