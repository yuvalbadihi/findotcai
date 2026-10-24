import { db } from 'sdk';
import { sql } from 'sdk/db';
import { refreshChat, nowSeconds } from './chat-state.js';
import { scanAdmins } from './gift-inventory.js';
import { MESSAGE_RETENTION } from './otc-config.js';

async function claim(key, seconds) {
  const now = nowSeconds();
  const result =
    await db.run(sql`INSERT INTO otc_runtime_cache (key,retry_after,version) VALUES (${key},${now + seconds},1)
    ON CONFLICT(key) DO UPDATE SET retry_after=${now + seconds},version=version+1
    WHERE retry_after<=${now} RETURNING version`);
  return result.rows?.[0]?.version ?? null;
}

export async function pruneTelemetry() {
  if (!(await claim('telemetry_cleanup', 3600))) return;
  const cutoff = nowSeconds() - MESSAGE_RETENTION;
  await db.run(sql`DELETE FROM otc_messages WHERE sent_at<${cutoff}`);
  await db.run(sql`DELETE FROM otc_observed_gifts WHERE user_id IN
    (SELECT user_id FROM otc_gift_checks WHERE checked_at<${cutoff} AND retry_after<=${nowSeconds()})
    AND NOT EXISTS(SELECT 1 FROM otc_messages WHERE sender_id=otc_observed_gifts.user_id)`);
  await db.run(sql`DELETE FROM otc_observed_gifts WHERE observed_at<${cutoff}
    AND NOT EXISTS(SELECT 1 FROM otc_gift_checks WHERE user_id=otc_observed_gifts.user_id)`);
  await db.run(sql`DELETE FROM otc_gift_checks WHERE checked_at<${cutoff} AND retry_after<=${nowSeconds()}
    AND NOT EXISTS(SELECT 1 FROM otc_messages WHERE sender_id=otc_gift_checks.user_id)`);
  await db.run(
    sql`DELETE FROM otc_likes WHERE NOT EXISTS(SELECT 1 FROM otcs WHERE chat_id=otc_likes.chat_id)`,
  );
}

export async function maintainDirectory({ metadataOnly = false } = {}) {
  let changed = false;
  await pruneTelemetry();
  if (await claim('metadata_sync', 5)) {
    const row =
      await db.get(sql`SELECT chat_id FROM otcs WHERE bot_status IN ('administrator','creator','unverified')
      AND refresh_after<=${nowSeconds() + 30} AND metadata_lease_until<=${nowSeconds()}
      ORDER BY refresh_after,chat_id LIMIT 1`);
    if (row) {
      try {
        await refreshChat(row.chat_id, { force: true });
        changed = true;
      } catch {
        changed = true; /* Failure already invalidated this generation's verification. */
      }
    }
  }
  if (!metadataOnly) {
    const row =
      await db.get(sql`SELECT chat_id FROM otcs WHERE bot_status IN ('administrator','creator')
      AND checked_at>0 AND refresh_after>${nowSeconds()} AND username IS NOT NULL AND username!=''
      AND admin_refresh_after<=${nowSeconds()} ORDER BY admin_refresh_after,chat_id LIMIT 1`);
    if (row) {
      const version = await claim('inventory_sync', 120);
      if (version !== null) {
        try {
          changed = Boolean(await scanAdmins(row.chat_id)) || changed;
        } catch {
          /* A dated prior estimate is retained. */
        }
        await db.run(sql`UPDATE otc_runtime_cache SET retry_after=${nowSeconds() + 10}
          WHERE key='inventory_sync' AND version=${version}`);
      }
    }
  }
  return { changed };
}
