import { db } from 'sdk';
import { sql } from 'sdk/db';
import { publicEntry } from './otc-stats.js';
import { nowSeconds } from './chat-state.js';
import { GIFT_TTL } from './otc-config.js';
import { rankDirectory } from './otc-rank.js';

// Database-only read: five aggregate queries for any nonempty directory,
// returned best first by OTC Rank, personalised by the viewer's language.
export async function directoryStats(userId, { language = null } = {}) {
  const now = nowSeconds();
  const rows =
    await db.all(sql`SELECT * FROM otcs WHERE username IS NOT NULL AND username!=''
    AND checked_at>0 AND bot_status IN ('administrator','creator') ORDER BY started_at,chat_id`);
  if (!rows.length) return { apiVersion: 3, entries: [], capturedAt: now };
  const activities =
    await db.all(sql`SELECT m.chat_id,count(*) AS messages,count(DISTINCT m.sender_id) AS posters,max(m.sent_at) AS last_message_at,
    sum(CASE WHEN m.sent_at>=${now - 86400} THEN 1 ELSE 0 END) AS messages_24h
    FROM otc_messages m JOIN otcs o ON o.chat_id=m.chat_id
    WHERE m.sent_at>=max(o.started_at,${now - 7 * 86400}) AND m.sent_at<=${now} GROUP BY m.chat_id`);
  const languages =
    await db.all(sql`SELECT m.chat_id,m.language_code,count(*) AS messages
    FROM otc_messages m JOIN otcs o ON o.chat_id=m.chat_id
    WHERE m.sent_at>=max(o.started_at,${now - 7 * 86400}) AND m.sent_at<=${now} GROUP BY m.chat_id,m.language_code`);
  const likes = await db.all(
    sql`SELECT chat_id,count(*) AS count,max(CASE WHEN user_id=${userId} THEN 1 ELSE 0 END) AS liked_by_me FROM otc_likes GROUP BY chat_id`,
  );
  // Recent posters with a fresh gift check, and how many hold a unique gift.
  const audiences =
    await db.all(sql`WITH posters AS (SELECT DISTINCT m.chat_id,m.sender_id FROM otc_messages m JOIN otcs o ON o.chat_id=m.chat_id
    WHERE m.sent_at>=max(o.started_at,${now - 7 * 86400}) AND m.sent_at<=${now} AND m.sender_id IS NOT NULL)
    SELECT p.chat_id,count(*) AS checked,
    count(CASE WHEN EXISTS(SELECT 1 FROM otc_observed_gifts g WHERE g.user_id=p.sender_id) THEN 1 END) AS holders
    FROM posters p JOIN otc_gift_checks c ON c.user_id=p.sender_id
    WHERE c.status IN ('complete','partial') AND c.checked_at>=${now - GIFT_TTL} GROUP BY p.chat_id`);
  const activityMap = new Map(activities.map((row) => [row.chat_id, row]));
  const likeMap = new Map(
    likes.map((row) => [
      row.chat_id,
      { count: Number(row.count), likedByMe: Boolean(row.liked_by_me) },
    ]),
  );
  const languageMap = new Map();
  for (const row of languages) {
    if (!languageMap.has(row.chat_id)) languageMap.set(row.chat_id, []);
    languageMap.get(row.chat_id).push(row);
  }
  const audienceMap = new Map(
    audiences.map((row) => [
      row.chat_id,
      { checked: Number(row.checked), holders: Number(row.holders) },
    ]),
  );
  const entries = rows.map((row) =>
    publicEntry(
      {
        chatId: row.chat_id,
        title: row.title,
        username: row.username,
        memberCount: row.member_count,
        starsPerMessage: row.stars_per_message,
        botStatus: row.bot_status,
        checkedAt: row.checked_at,
        startedAt: row.started_at,
        activeSince: row.active_since,
        adminSample: row.admin_sample,
      },
      activityMap.get(row.chat_id),
      languageMap.get(row.chat_id) || [],
      likeMap.get(row.chat_id),
      now,
    ),
  );
  return {
    apiVersion: 3,
    entries: rankDirectory(entries, { audiences: audienceMap, language, now }),
    capturedAt: now,
  };
}
