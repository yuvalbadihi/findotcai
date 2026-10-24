import { api, db } from 'sdk';
import { sql } from 'sdk/db';
import {
  currentChat,
  getChatRow,
  nowSeconds,
  verifiedAdmin,
} from './chat-state.js';
import { GIFT_TTL } from './otc-config.js';
import { loadCollectionFloors, valueAdminGifts } from './gift-valuation.js';

const uniqueGifts = (result) => {
  if (!Array.isArray(result.gifts)) throw new Error('Invalid gift inventory');
  return result.gifts.filter(
    (item) =>
      item.type === 'unique' &&
      !item.gift?.is_burned &&
      typeof item.gift?.name === 'string' &&
      item.gift.name.length > 0 &&
      item.gift.name.length <= 128,
  );
};

export async function checkVisibleGifts(userId) {
  const now = nowSeconds();
  const claim =
    await db.run(sql`INSERT INTO otc_gift_checks (user_id,status,checked_at,retry_after,version)
    VALUES (${userId},'checking',0,${now + 120},1)
    ON CONFLICT(user_id) DO UPDATE SET status='checking',retry_after=${now + 120},version=version+1
    WHERE retry_after<=${now} RETURNING version`);
  if (!claim.rows?.length) return;
  const version = claim.rows[0].version;
  try {
    const result = await api.getUserGifts({
      user_id: userId,
      limit: 100,
      exclude_unlimited: true,
      exclude_limited_upgradable: true,
      exclude_limited_non_upgradable: true,
      exclude_from_blockchain: false,
    });
    const names = [
      ...new Set(uniqueGifts(result).map((item) => item.gift.name)),
    ];
    if (names.length) {
      const params = { ':user': userId, ':version': version, ':observed': now };
      const selects = names.map((name, index) => {
        params[':name' + index] = name;
        return `SELECT :name${index},:user,:observed,:version WHERE EXISTS (SELECT 1 FROM otc_gift_checks WHERE user_id=:user AND version=:version)`;
      });
      await db.run(
        `INSERT INTO otc_observed_gifts (name,user_id,observed_at,check_version) ${selects.join(' UNION ALL ')}
        ON CONFLICT(name) DO UPDATE SET user_id=excluded.user_id,observed_at=excluded.observed_at,check_version=excluded.check_version
        WHERE observed_at<=excluded.observed_at`,
        params,
      );
    }
    await db.run(sql`DELETE FROM otc_observed_gifts WHERE user_id=${userId} AND check_version!=${version}
      AND EXISTS(SELECT 1 FROM otc_gift_checks WHERE user_id=${userId} AND version=${version})`);
    await db.run(sql`UPDATE otc_gift_checks SET status=${result.next_offset ? 'partial' : 'complete'},checked_at=${now},
      retry_after=${now + GIFT_TTL},error_code=NULL WHERE user_id=${userId} AND version=${version}`);
  } catch (error) {
    const wait = Math.max(
      300,
      Math.min(Number(error.parameters?.retry_after) || 0, 86400),
    );
    await db.run(sql`UPDATE otc_gift_checks SET status='unavailable',retry_after=${now + wait},error_code=${String(error.code || 'API_ERROR')}
      WHERE user_id=${userId} AND version=${version}`);
  }
}

const roster = (rows) => {
  if (!Array.isArray(rows)) throw new Error('Invalid administrator list');
  const admins = [
    ...new Map(
      rows
        .filter(
          (item) =>
            !item.user?.is_bot &&
            Number.isSafeInteger(item.user?.id) &&
            item.user.id > 0,
        )
        .map((item) => [item.user.id, item]),
    ).values(),
  ];
  if (!admins.length) throw new Error('Administrator list is empty');
  return admins;
};
const signature = (admins) =>
  admins
    .map((item) => item.user.id)
    .sort((a, b) => a - b)
    .join(',');

export async function scanAdmins(chatId, { force = false } = {}) {
  const group = await currentChat(chatId);
  if (!verifiedAdmin(group))
    throw new Error('Administrator access is not verified');
  const now = nowSeconds();
  const claim =
    await db.run(sql`UPDATE otcs SET admin_refresh_after=${now + 120},admin_scan_version=admin_scan_version+1
    WHERE chat_id=${chatId} AND revision=${group.revision}
    AND (admin_refresh_after<=${now} OR ${force ? 1 : 0}=1) RETURNING admin_scan_version`);
  if (!claim.rows?.length)
    return group.adminSample ? JSON.parse(group.adminSample) : null;
  const version = claim.rows[0].admin_scan_version;
  const guard = { chatId, revision: group.revision, version };
  try {
    const floorsRequest = loadCollectionFloors().catch(() => null);
    const admins = roster(await api.getChatAdministrators({ chat_id: chatId }));
    const gifts = new Map();
    const jobs = admins.map((item) => ({
      id: item.user.id,
      offset: '',
      offsets: new Set(),
      pages: 0,
      count: 0,
      state: 'pending',
    }));
    let requests = 0;
    while (requests < 120) {
      const current = await getChatRow(chatId);
      if (
        !verifiedAdmin(current) ||
        current.revision !== guard.revision ||
        current.adminScanVersion !== version
      )
        return null;
      const batch = jobs
        .filter((job) => ['pending', 'paging'].includes(job.state))
        .sort((a, b) => a.pages - b.pages)
        .slice(0, Math.min(5, 120 - requests));
      if (!batch.length) break;
      requests += batch.length;
      await Promise.all(
        batch.map(async (job) => {
          try {
            const result = await api.getUserGifts({
              user_id: job.id,
              offset: job.offset,
              limit: 100,
              exclude_unlimited: true,
              exclude_limited_upgradable: true,
              exclude_limited_non_upgradable: true,
              exclude_from_blockchain: false,
            });
            const items = uniqueGifts(result);
            for (const item of items)
              gifts.set(item.gift.name, { collectionId: item.gift.gift_id });
            job.count += items.length;
            job.pages++;
            const cursor = result.next_offset;
            if (!cursor) job.state = 'complete';
            else if (
              typeof cursor !== 'string' ||
              job.offsets.has(cursor) ||
              job.pages >= 10
            )
              job.state = 'partial';
            else {
              job.offsets.add(cursor);
              job.offset = cursor;
              job.state = 'paging';
            }
          } catch {
            job.state = job.pages ? 'partial' : 'unavailable';
          }
        }),
      );
    }
    const finalRoster = roster(
      await api.getChatAdministrators({ chat_id: chatId }),
    );
    if (signature(admins) !== signature(finalRoster))
      throw new Error('Administrator list changed during scan');
    const sample = {
      scope: 'all_admins',
      inventoryPolicy: 'visible_including_blockchain',
      adminCount: admins.length,
      ownerCount: admins.filter((item) => item.status === 'creator').length,
      administratorCount: admins.filter(
        (item) => item.status === 'administrator',
      ).length,
      sampled: 0,
      complete: 0,
      partial: 0,
      unavailable: 0,
      pending: 0,
      observedHolders: 0,
      visibleUniqueGifts: gifts.size,
      pagesRead: jobs.reduce((sum, job) => sum + job.pages, 0),
      checkedAt: nowSeconds(),
    };
    for (const job of jobs) {
      const state = job.state === 'paging' ? 'partial' : job.state;
      sample[state]++;
      if (state !== 'pending') sample.sampled++;
      if (job.count) sample.observedHolders++;
    }
    sample.valuation = valueAdminGifts(
      gifts,
      await floorsRequest,
      sample.complete === admins.length,
      nowSeconds(),
    );
    const previous = group.adminSample ? JSON.parse(group.adminSample) : null;
    const keepPrevious =
      sample.valuation.amountNano === null &&
      typeof previous?.valuation?.amountNano === 'string' &&
      previous.inventoryPolicy === sample.inventoryPolicy;
    const value = keepPrevious ? previous : sample;
    const retry =
      nowSeconds() +
      (keepPrevious || sample.valuation.status === 'unavailable' ? 300 : 3600);
    const saved =
      await db.run(sql`UPDATE otcs SET admin_sample=${JSON.stringify(value)},admin_refresh_after=${retry}
      WHERE chat_id=${guard.chatId} AND revision=${guard.revision} AND admin_scan_version=${guard.version}
      AND bot_status IN ('administrator','creator') AND refresh_after>${nowSeconds()} RETURNING chat_id`);
    return saved.rows?.length ? value : null;
  } catch (error) {
    await db.run(sql`UPDATE otcs SET admin_refresh_after=${nowSeconds() + 300}
      WHERE chat_id=${guard.chatId} AND revision=${guard.revision} AND admin_scan_version=${guard.version}`);
    throw error;
  }
}
