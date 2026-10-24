import { setOtcLike } from '../lib/otc-likes.js';
import { requireViewer } from '../lib/viewer.js';

export default async function (input, ctx) {
  const userId = requireViewer(ctx);
  return await setOtcLike(input?.chatId, userId, input?.liked);
}
