import { fetch, db } from 'sdk';
import { sql } from 'sdk/db';
import { nowSeconds } from './chat-state.js';

export const FLOOR_SOURCE = 'https://proxy.thermos.gifts/api/v1/collections';

export function normalizeGramEstimate(estimate) {
  // The token was renamed; cached amounts and evidence dates stay intact.
  return estimate?.currency === 'TON'
    ? { ...estimate, currency: 'GRAM' }
    : estimate;
}

async function fetchCollectionFloors() {
  // Fetch a generic public catalogue; no Telegram identity is sent to this service.
  let response;
  try {
    response = await fetch(FLOOR_SOURCE);
  } catch {
    response = await fetch(FLOOR_SOURCE);
  }
  // Retry a transient upstream failure once; never substitute an invented quote.
  if (response.status >= 500 || response.status === 429)
    response = await fetch(FLOOR_SOURCE);
  if (!response.ok) throw new Error('Gift price feed unavailable');
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0)
    throw new Error('Invalid gift price feed');
  const prices = new Map();
  for (const row of rows) {
    const id = row.id;
    const floor = row.stats?.floor;
    if (
      typeof id !== 'string' ||
      !/^\d{1,32}$/.test(id) ||
      typeof floor !== 'string' ||
      !/^\d{1,64}$/.test(floor) ||
      !Number.isSafeInteger(row.stats?.count) ||
      row.stats.count < 1
    )
      continue;
    if (prices.has(id))
      throw new Error('Duplicate collection in gift price feed');
    if (BigInt(floor) > 0n) prices.set(id, floor);
  }
  if (!prices.size) throw new Error('No usable collection floors');
  return prices;
}

export async function loadCollectionFloors() {
  const now = nowSeconds();
  const cached = await db.get(
    sql`SELECT * FROM otc_runtime_cache WHERE key='gift_floors'`,
  );
  if (cached?.value && cached.checked_at > now - 300) {
    const prices = new Map(JSON.parse(cached.value));
    prices.checkedAt = cached.checked_at;
    return prices;
  }
  const claim =
    await db.run(sql`INSERT INTO otc_runtime_cache (key,retry_after,version) VALUES ('gift_floors',${now + 30},1)
    ON CONFLICT(key) DO UPDATE SET retry_after=${now + 30},version=version+1 WHERE retry_after<=${now} RETURNING version`);
  if (!claim.rows?.length) throw new Error('Gift prices are refreshing');
  const version = claim.rows[0].version;
  try {
    const prices = await fetchCollectionFloors();
    prices.checkedAt = now;
    await db.run(sql`UPDATE otc_runtime_cache SET value=${JSON.stringify([...prices])},checked_at=${now},retry_after=${now + 300}
      WHERE key='gift_floors' AND version=${version}`);
    return prices;
  } catch (error) {
    await db.run(
      sql`UPDATE otc_runtime_cache SET retry_after=${now + 60} WHERE key='gift_floors' AND version=${version}`,
    );
    throw error;
  }
}

export function valueAdminGifts(gifts, floors, inventoryComplete, checkedAt) {
  let total = 0n;
  let pricedGifts = 0;
  for (const gift of gifts.values()) {
    const price = floors?.get(gift.collectionId);
    if (!price) continue;
    total += BigInt(price);
    pricedGifts++;
  }
  const knownEmpty = inventoryComplete && gifts.size === 0;
  return {
    status:
      pricedGifts === gifts.size &&
      inventoryComplete &&
      (pricedGifts > 0 || knownEmpty)
        ? 'complete'
        : pricedGifts > 0
          ? 'partial'
          : 'unavailable',
    currency: 'GRAM',
    amountNano: pricedGifts > 0 || knownEmpty ? total.toString() : null,
    pricedGifts,
    unpricedGifts: gifts.size - pricedGifts,
    method: 'collection_floor',
    source: 'Thermos',
    sourceUrl: FLOOR_SOURCE,
    checkedAt:
      floors || knownEmpty
        ? Math.min(checkedAt, floors?.checkedAt ?? checkedAt)
        : null,
  };
}
