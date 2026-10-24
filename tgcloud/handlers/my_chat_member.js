import { recordMembershipChange } from '../lib/otc.js';

export default async function (update, ctx = {}) {
  await recordMembershipChange(update, ctx.update?.update_id);
}
