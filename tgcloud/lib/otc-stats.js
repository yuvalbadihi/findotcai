import { db } from 'sdk';
import { sql } from 'sdk/db';
import { getChatRow, nowSeconds, verifiedAdmin } from './chat-state.js';
import { GIFT_TTL } from './otc-config.js';
import { normalizeGramEstimate } from './gift-valuation.js';
import { summarizeLanguages } from './language.js';

export function publicEntry(
  group,
  activity = {},
  languages = [],
  likes = { count: 0, likedByMe: false },
  now = nowSeconds(),
) {
  let sample = null;
  try {
    sample = group.adminSample ? JSON.parse(group.adminSample) : null;
  } catch {}
  const cutoff = Math.max(group.startedAt, now - 7 * 86400);
  return {
    group: {
      id: group.chatId,
      title: group.title,
      username: group.username || null,
      memberCount: group.memberCount,
      starsPerMessage: group.starsPerMessage,
      botStatus: group.botStatus,
      metadataCheckedAt: group.checkedAt,
    },
    startedAt: group.startedAt,
    windowStartedAt: cutoff,
    capturedAt: now,
    activity: {
      messages: Number(activity.messages || 0),
      posters: Number(activity.posters || 0),
      messagesPerDay: Number(activity.messages_24h || 0),
      lastMessageAt: activity.last_message_at ?? null,
      dailyWindowSeconds:
        group.activeSince > 0
          ? Math.max(0, Math.min(86400, now - group.activeSince))
          : 0,
    },
    language: summarizeLanguages(languages, cutoff),
    adminSample: sample
      ? {
          complete: sample.complete,
          partial: sample.partial,
          visibleUniqueGifts: sample.visibleUniqueGifts,
          checkedAt: sample.checkedAt,
          valuation: normalizeGramEstimate(sample.valuation),
        }
      : null,
    likes,
  };
}

export async function chatStats(chatId) {
  const group = await getChatRow(chatId);
  if (!group) return { group: null, state: 'not_enrolled' };
  const now = nowSeconds(),
    cutoff = Math.max(group.startedAt, now - 7 * 86400);
  const activity =
    await db.get(sql`SELECT count(*) AS messages,count(DISTINCT sender_id) AS posters,max(sent_at) AS last_message_at,
    sum(CASE WHEN sent_at>=${now - 86400} THEN 1 ELSE 0 END) AS messages_24h FROM otc_messages
    WHERE chat_id=${chatId} AND sent_at>=${cutoff} AND sent_at<=${now}`);
  const languages =
    await db.all(sql`SELECT language_code,count(*) AS messages FROM otc_messages
    WHERE chat_id=${chatId} AND sent_at>=${cutoff} AND sent_at<=${now} GROUP BY language_code`);
  const entry = publicEntry(group, activity, languages, undefined, now);
  // Operator diagnostics: verification freshness stays out of the public list.
  entry.state = verifiedAdmin(group, now) ? 'collecting' : 'paused';
  const gifts =
    await db.get(sql`WITH participants AS (SELECT DISTINCT sender_id FROM otc_messages
    WHERE chat_id=${chatId} AND sent_at>=${cutoff} AND sent_at<=${now} AND sender_id IS NOT NULL)
    SELECT count(CASE WHEN c.status='complete' AND c.checked_at>=${now - GIFT_TTL} THEN 1 END) AS complete_checks,
    count(CASE WHEN c.status='partial' AND c.checked_at>=${now - GIFT_TTL} THEN 1 END) AS partial_checks,
    count(CASE WHEN c.status='unavailable' THEN 1 END) AS unavailable_checks,
    (SELECT count(*) FROM otc_observed_gifts g JOIN participants p ON p.sender_id=g.user_id JOIN otc_gift_checks c ON c.user_id=g.user_id
      WHERE c.status IN ('complete','partial') AND c.checked_at>=${now - GIFT_TTL}) AS unique_gifts,
    (SELECT count(DISTINCT g.user_id) FROM otc_observed_gifts g JOIN participants p ON p.sender_id=g.user_id JOIN otc_gift_checks c ON c.user_id=g.user_id
      WHERE c.status IN ('complete','partial') AND c.checked_at>=${now - GIFT_TTL}) AS holders
    FROM participants p LEFT JOIN otc_gift_checks c ON c.user_id=p.sender_id`);
  entry.gifts = {
    completeChecks: Number(gifts.complete_checks),
    partialChecks: Number(gifts.partial_checks),
    unavailableChecks: Number(gifts.unavailable_checks),
    uniqueGifts: Number(gifts.unique_gifts),
    observedHolders: Number(gifts.holders),
  };
  if (group.adminSample) {
    try {
      entry.adminSample = JSON.parse(group.adminSample);
      entry.adminSample.valuation = normalizeGramEstimate(
        entry.adminSample.valuation,
      );
    } catch {}
  }
  return entry;
}
