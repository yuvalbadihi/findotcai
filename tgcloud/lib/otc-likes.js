import { db, EndpointError } from 'sdk';
import { sql } from 'sdk/db';
import { nowSeconds } from './chat-state.js';

export async function getOtcLikes(chatId, userId) {
  const row = await db.get(sql`SELECT count(*) AS likes,
    coalesce(max(CASE WHEN user_id = ${userId} THEN 1 ELSE 0 END), 0) AS liked_by_me
    FROM otc_likes WHERE chat_id = ${chatId}`);
  return { count: Number(row.likes), likedByMe: Boolean(row.liked_by_me) };
}

export async function setOtcLike(chatId, userId, liked) {
  if (
    !Number.isSafeInteger(chatId) ||
    chatId >= 0 ||
    typeof liked !== 'boolean'
  ) {
    throw new EndpointError('Choose an OTC and whether to like it.', {
      code: 'INVALID_LIKE',
    });
  }
  if (liked) {
    const now = nowSeconds();
    await db.run(sql`INSERT INTO otc_likes (id,chat_id,user_id,created_at)
      SELECT ${`${chatId}:${userId}`},${chatId},${userId},${now} FROM otcs WHERE chat_id=${chatId}
      AND username IS NOT NULL AND username!='' AND checked_at>0
      AND bot_status IN ('administrator','creator') AND refresh_after>${now} ON CONFLICT DO NOTHING`);
  } else {
    // A user can always remove their own preference, even after unlisting.
    await db.run(
      sql`DELETE FROM otc_likes WHERE chat_id=${chatId} AND user_id=${userId}`,
    );
  }
  const group =
    await db.get(sql`SELECT chat_id FROM otcs WHERE chat_id=${chatId}
    AND username IS NOT NULL AND username!='' AND checked_at>0 AND bot_status IN ('administrator','creator')
    AND (${liked ? 1 : 0}=0 OR refresh_after>${nowSeconds()})`);
  if (!group && liked)
    throw new EndpointError('This OTC is not listed.', {
      code: 'OTC_NOT_FOUND',
    });
  // Do not return aggregate counts for a hidden chat.
  return {
    chatId,
    available: Boolean(group),
    likes: group ? await getOtcLikes(chatId, userId) : null,
  };
}
