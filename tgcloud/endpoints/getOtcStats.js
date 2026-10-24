import { directoryStats } from '../lib/otc-directory.js';
import { requireViewer, viewerLanguage } from '../lib/viewer.js';

export default async function (_input, ctx) {
  const userId = requireViewer(ctx);
  return await directoryStats(userId, { language: viewerLanguage(ctx) });
}
