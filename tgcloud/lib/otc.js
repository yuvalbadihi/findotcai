// Compatibility facade for existing operator commands. State, inventories and
// public reads live in separate modules; none sends messages to an OTC.
import { db } from 'sdk';
import { sql } from 'sdk/db';
import { PILOT_CHAT_ID } from './otc-config.js';
import {
  currentChat,
  refreshChat,
  verifiedAdmin,
  isGroup,
  nowSeconds,
  priceChanged,
} from './chat-state.js';
import { checkVisibleGifts, scanAdmins } from './gift-inventory.js';
import { chatStats } from './otc-stats.js';
import { detectMessageLanguage } from './language.js';

export { checkVisibleGifts };
export {
  membershipChanged as recordMembershipChange,
  isGroup as isOtcMessage,
} from './chat-state.js';
export const refreshPilot = (chatId = PILOT_CHAT_ID) =>
  refreshChat(chatId, { force: true });
export const samplePilotAdmins = (chatId = PILOT_CHAT_ID) =>
  scanAdmins(chatId, { force: true });

const CONTENT_KEYS = [
  'text',
  'animation',
  'audio',
  'document',
  'photo',
  'sticker',
  'video',
  'video_note',
  'voice',
  'contact',
  'dice',
  'game',
  'poll',
  'venue',
  'location',
  'story',
  'paid_media',
  'rich_message',
  'live_photo',
  'checklist',
];
export function qualifiesAsActivity(message) {
  return (
    Number.isSafeInteger(message.message_id) &&
    message.message_id > 0 &&
    !message.is_ephemeral &&
    (!message.from?.is_bot || Boolean(message.sender_chat)) &&
    !/^\/(?:start|app|top)(?:@\w+)?(?:\s|$)/i.test(message.text || '') &&
    CONTENT_KEYS.some((key) => message[key] !== undefined)
  );
}

export async function collectMessage(message, updateId = 0) {
  if (!isGroup(message)) return;
  const chatId = message.chat.id;
  const row = await currentChat(chatId);
  const now = nowSeconds();
  if (
    !verifiedAdmin(row, now) ||
    !Number.isSafeInteger(message.date) ||
    message.date < row.startedAt ||
    message.date > now + 60
  )
    return;
  const price = message.paid_message_price_changed?.paid_message_star_count;
  if (Number.isSafeInteger(price))
    await priceChanged(
      chatId,
      price,
      message.date,
      updateId || message.message_id,
    );
  if (!qualifiesAsActivity(message)) return;
  const senderId =
    !message.sender_chat &&
    Number.isSafeInteger(message.from?.id) &&
    message.from.id > 0
      ? message.from.id
      : null;
  const result =
    await db.run(sql`INSERT INTO otc_messages (id,chat_id,message_id,sender_id,sent_at,received_at,language_code)
    SELECT ${`${chatId}:${message.message_id}`},${chatId},${message.message_id},${senderId},${message.date},${now},${detectMessageLanguage(message)}
    WHERE EXISTS(SELECT 1 FROM otcs WHERE chat_id=${chatId} AND revision=${row.revision}
      AND bot_status IN ('administrator','creator') AND refresh_after>${now})
    ON CONFLICT(id) DO NOTHING`);
  if (result.rowsAffected && senderId) await checkVisibleGifts(senderId);
}

export async function pilotStats(
  chatId = PILOT_CHAT_ID,
  { refreshAdmins = true, refreshMetadata = true } = {},
) {
  const group = await currentChat(chatId, { refreshMetadata });
  if (!group) return { group: null, state: 'not_enrolled' };
  if (refreshAdmins && verifiedAdmin(group)) await scanAdmins(chatId);
  return await chatStats(chatId);
}
