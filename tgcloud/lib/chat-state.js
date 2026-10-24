import { api, db } from 'sdk';
import { eq, sql } from 'sdk/db';
import { otcs } from '../schema.js';
import { METADATA_TTL } from './otc-config.js';

export const nowSeconds = () => Math.floor(Date.now() / 1000);
export const isAdmin = (status) =>
  status === 'administrator' || status === 'creator';
export const isGroup = (payload) =>
  Number.isSafeInteger(payload?.chat?.id) &&
  payload.chat.id < 0 &&
  ['group', 'supergroup'].includes(payload.chat.type);
export const getChatRow = (chatId) =>
  db.select().from(otcs).where(eq(otcs.chatId, chatId)).get();
export const verifiedAdmin = (row, now = nowSeconds()) =>
  Boolean(
    row &&
    isAdmin(row.botStatus) &&
    row.checkedAt > 0 &&
    row.refreshAfter > now,
  );

async function provisional(chatId, title = 'OTC') {
  await db
    .insert(otcs)
    .values({
      chatId,
      title,
      username: null,
      botStatus: 'unverified',
      startedAt: nowSeconds(),
      checkedAt: 0,
    })
    .onConflictDoNothing({ target: otcs.chatId })
    .run();
}

export async function refreshChat(chatId, { force = false } = {}) {
  if (!Number.isSafeInteger(chatId) || chatId >= 0)
    throw new Error('Invalid group');
  if (!(await getChatRow(chatId))) await provisional(chatId);
  const started = nowSeconds();
  const claim =
    await db.run(sql`UPDATE otcs SET metadata_lease_until=${started + 60}, revision=revision+1
    WHERE chat_id=${chatId} AND metadata_lease_until<=${started}
    AND (refresh_after<=${started} OR ${force ? 1 : 0}=1) RETURNING revision`);
  if (!claim.rows?.length) return await getChatRow(chatId);
  const version = claim.rows[0].revision;
  try {
    const me = await api.getMe({});
    const member = await api.getChatMember({ chat_id: chatId, user_id: me.id });
    if (!isAdmin(member.status)) {
      await db.run(sql`UPDATE otcs SET bot_status=${member.status}, active_since=0,
        metadata_lease_until=0,refresh_after=${started + METADATA_TTL},admin_scan_version=admin_scan_version+1
        WHERE chat_id=${chatId} AND revision=${version} AND status_event_at<=${started}`);
      return await getChatRow(chatId);
    }
    const chat = await api.getChat({ chat_id: chatId });
    const count = await api.getChatMemberCount({ chat_id: chatId });
    if (
      typeof chat.title !== 'string' ||
      !Number.isSafeInteger(count) ||
      count < 0
    )
      throw new Error('Invalid group metadata');
    // The official Bot API serializer omits this field for a zero-price chat.
    const price =
      chat.paid_message_star_count === undefined
        ? 0
        : chat.paid_message_star_count;
    if (!Number.isSafeInteger(price) || price < 0)
      throw new Error('Invalid posting price');
    const now = nowSeconds();
    await db.run(sql`UPDATE otcs SET title=${chat.title},username=${chat.username || null},member_count=${count},
      stars_per_message=CASE WHEN price_event_at<=${started} THEN ${price} ELSE stars_per_message END,
      bot_status=${member.status},checked_at=${now},refresh_after=${now + METADATA_TTL},metadata_lease_until=0,
      active_since=CASE WHEN active_since>0 THEN active_since ELSE ${now} END
      WHERE chat_id=${chatId} AND revision=${version} AND status_event_at<=${started}`);
    return await getChatRow(chatId);
  } catch (error) {
    // Only the holder of this generation can fail or complete the job.
    await db.run(sql`UPDATE otcs SET bot_status='unverified',active_since=0,
      metadata_lease_until=0,refresh_after=${nowSeconds() + 60}
      WHERE chat_id=${chatId} AND revision=${version}`);
    throw error;
  }
}

export async function currentChat(chatId, { refreshMetadata = true } = {}) {
  let row = await getChatRow(chatId);
  if (!row) return null;
  if (
    refreshMetadata &&
    row.refreshAfter <= nowSeconds() &&
    ['administrator', 'creator', 'unverified'].includes(row.botStatus)
  ) {
    try {
      row = await refreshChat(chatId);
    } catch {
      row = await getChatRow(chatId);
    }
  }
  return row;
}

export async function membershipChanged(update, updateId = 0) {
  if (
    !isGroup(update) ||
    !Number.isSafeInteger(update.date) ||
    update.date < 0 ||
    update.date > nowSeconds() + 60
  )
    return;
  const status = update.new_chat_member?.status;
  if (
    ![
      'administrator',
      'creator',
      'member',
      'restricted',
      'left',
      'kicked',
    ].includes(status)
  )
    return;
  const chatId = update.chat.id;
  const id = Number.isSafeInteger(updateId) && updateId > 0 ? updateId : 0;
  const old = await getChatRow(chatId);
  if (!old && !isAdmin(status)) return;
  if (!old) await provisional(chatId, update.chat.title || 'OTC');
  // Compare date first: Telegram can restart update_id after a week of inactivity.
  const applied =
    await db.run(sql`UPDATE otcs SET bot_status=${status},status_event_at=${update.date},
    membership_update_id=${id},revision=revision+1,metadata_lease_until=0,refresh_after=0,
    admin_scan_version=admin_scan_version+1,admin_refresh_after=0,active_since=CASE WHEN ${isAdmin(status) ? 1 : 0}=1 AND bot_status IN ('administrator','creator') THEN active_since ELSE 0 END
    WHERE chat_id=${chatId} AND (status_event_at<${update.date} OR
      (status_event_at=${update.date} AND (${id}>membership_update_id OR
        (${id}=0 AND membership_update_id=0 AND bot_status!=${status})))) RETURNING chat_id`);
  if (!applied.rows?.length) return;
  if (isAdmin(status)) await refreshChat(chatId);
}

export async function priceChanged(chatId, price, date, updateId = 0) {
  if (!Number.isSafeInteger(price) || price < 0) return;
  const id = Number.isSafeInteger(updateId) && updateId > 0 ? updateId : 0;
  await db.run(sql`UPDATE otcs SET stars_per_message=${price},price_event_at=${date},price_update_id=${id},
    revision=revision+1,metadata_lease_until=0
    WHERE chat_id=${chatId} AND (price_event_at<${date} OR
      (price_event_at=${date} AND (${id}>price_update_id OR (${id}=0 AND price_update_id=0))))`);
}
