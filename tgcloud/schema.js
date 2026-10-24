import { table, integer, text, index, uniqueIndex } from 'sdk/db';

export const otcs = table('otcs', {
  chatId: integer('chat_id').primaryKey(),
  title: text('title').notNull(),
  username: text('username'),
  memberCount: integer('member_count'),
  starsPerMessage: integer('stars_per_message'),
  botStatus: text('bot_status').notNull(),
  startedAt: integer('started_at').notNull(),
  checkedAt: integer('checked_at').notNull(),
  statusEventAt: integer('status_event_at').notNull().default(0),
  refreshAfter: integer('refresh_after').notNull().default(0),
  adminSample: text('admin_sample'),
  adminRefreshAfter: integer('admin_refresh_after').notNull().default(0),
  revision: integer('revision').notNull().default(0),
  metadataLeaseUntil: integer('metadata_lease_until').notNull().default(0),
  adminScanVersion: integer('admin_scan_version').notNull().default(0),
  activeSince: integer('active_since').notNull().default(0),
  membershipUpdateId: integer('membership_update_id').notNull().default(0),
  priceUpdateId: integer('price_update_id').notNull().default(0),
  priceEventAt: integer('price_event_at').notNull().default(0),
});

// One immutable metadata row per message: retries cannot inflate derived counts.
export const otcMessages = table(
  'otc_messages',
  {
    id: text('id').primaryKey(),
    chatId: integer('chat_id').notNull(),
    messageId: integer('message_id').notNull(),
    senderId: integer('sender_id'),
    sentAt: integer('sent_at').notNull(),
    receivedAt: integer('received_at').notNull(),
    // NULL: historical record without text; 'und': analyzed but uncertain.
    languageCode: text('language_code'),
  },
  (t) => ({
    chatTime: index('otc_messages_chat_time').on(t.chatId, t.sentAt),
    sender: index('otc_messages_sender').on(t.senderId),
    retention: index('otc_messages_retention').on(t.sentAt),
  }),
);

// Shared, cached checks for identifiable observed posters. No names or text.
export const giftChecks = table('otc_gift_checks', {
  userId: integer('user_id').primaryKey(),
  status: text('status').notNull(),
  checkedAt: integer('checked_at').notNull().default(0),
  retryAfter: integer('retry_after').notNull(),
  errorCode: text('error_code'),
  version: integer('version').notNull().default(0),
});

// Gift names identify unique gifts and prevent double counting after a transfer.
export const observedGifts = table(
  'otc_observed_gifts',
  {
    name: text('name').primaryKey(),
    userId: integer('user_id').notNull(),
    observedAt: integer('observed_at').notNull(),
    checkVersion: integer('check_version').notNull().default(0),
  },
  (t) => ({
    holder: index('otc_observed_gifts_holder').on(t.userId),
  }),
);

// The server constructs id as chatId:userId: one persisted like per viewer/OTC.
export const otcLikes = table(
  'otc_likes',
  {
    id: text('id').primaryKey(),
    chatId: integer('chat_id').notNull(),
    userId: integer('user_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    chat: index('otc_likes_chat').on(t.chatId),
    viewer: index('otc_likes_viewer').on(t.userId, t.chatId),
    onePerViewer: uniqueIndex('otc_likes_one_per_viewer').on(
      t.chatId,
      t.userId,
    ),
  }),
);

// Shared non-secret caches and maintenance leases. No credentials are stored here.
export const runtimeCache = table('otc_runtime_cache', {
  key: text('key').primaryKey(),
  value: text('value'),
  checkedAt: integer('checked_at').notNull().default(0),
  retryAfter: integer('retry_after').notNull().default(0),
  version: integer('version').notNull().default(0),
});
