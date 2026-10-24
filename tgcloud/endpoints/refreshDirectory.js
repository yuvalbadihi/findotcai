import { maintainDirectory } from '../lib/maintenance.js';
import { requireViewer } from '../lib/viewer.js';

export default async function (input, ctx) {
  requireViewer(ctx);
  return await maintainDirectory({
    metadataOnly: input?.metadataOnly === true,
  });
}
