import { francAll } from './vendor/franc.js';
import { LANGUAGE_LABELS } from './language-labels.js';

const SKIPPED_ENTITIES = ['url', 'email', 'mention', 'code', 'pre'];

// Classify only the message's writing. Telegram user language / nationality is
// not evidence of a chat's language. Text is never stored or sent to a provider.
export function detectMessageLanguage(message) {
  let text = String(message.text || message.caption || '').slice(0, 8192);
  const entities = message.text ? message.entities : message.caption_entities;
  for (const entity of [...(entities || [])].sort(
    (a, b) => b.offset - a.offset,
  )) {
    if (
      SKIPPED_ENTITIES.includes(entity.type) &&
      Number.isSafeInteger(entity.offset) &&
      Number.isSafeInteger(entity.length) &&
      entity.offset >= 0 &&
      entity.length > 0
    )
      text =
        text.slice(0, entity.offset) +
        ' ' +
        text.slice(entity.offset + entity.length);
  }
  text = text
    .replace(
      /https?:\/\/\S+|www\.\S+|t\.me\/\S+|@[\w]+|\b(?:EQ|UQ)[\w-]{46}\b|\b0x[\da-f]{20,}\b/gi,
      ' ',
    )
    .replace(/[^\p{L}\p{M}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2048);
  const letters = text.match(/\p{L}/gu) || [];
  if (
    letters.length < 30 ||
    new Set(letters.map((letter) => letter.toLowerCase())).size < 7
  )
    return 'und';
  if (
    (text.match(/\p{Script=Hebrew}/gu) || []).length / letters.length >=
    0.6
  )
    return 'heb';
  const [first, second] = francAll(text, { minLength: 30 });
  // A small ranking margin is ambiguous, not a probability of correctness.
  if (!LANGUAGE_LABELS[first?.[0]] || (second && first[1] - second[1] < 0.04))
    return 'und';
  return first[0];
}

export function summarizeLanguages(rows, windowStartedAt) {
  let analyzedMessages = 0;
  let legacyMessages = 0;
  const ranked = [];
  for (const row of rows) {
    const count = Number(row.messages);
    if (row.language_code === null) {
      legacyMessages += count;
      continue;
    }
    analyzedMessages += count;
    if (LANGUAGE_LABELS[row.language_code])
      ranked.push({
        code: row.language_code,
        label: LANGUAGE_LABELS[row.language_code],
        messages: count,
      });
  }
  ranked.sort(
    (a, b) => b.messages - a.messages || a.code.localeCompare(b.code),
  );
  const classifiedMessages = ranked.reduce(
    (sum, item) => sum + item.messages,
    0,
  );
  // Always keep the most common detected language. Include secondary languages
  // at an exact 30% boundary, using identifiable messages as the denominator;
  // media, links and historical messages without text cannot vote for a language.
  const languages = ranked
    .filter(
      (item, index) =>
        index === 0 || item.messages * 10 >= classifiedMessages * 3,
    )
    .map((item) => ({
      ...item,
      share: Math.round((item.messages * 1000) / classifiedMessages) / 10,
    }));
  const leading = languages[0];
  return {
    status: leading ? 'estimated' : 'unavailable',
    code: leading?.code ?? null,
    label: leading?.label ?? null,
    languages,
    analyzedMessages,
    classifiedMessages,
    unknownMessages: analyzedMessages - classifiedMessages,
    legacyMessages,
    windowStartedAt,
    share: leading?.share ?? null,
    topLanguages: ranked.slice(0, 3),
  };
}
