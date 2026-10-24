// The original pilot remains the default for existing operator helpers. Other
// groups enroll through verified bot-administrator membership updates.
export const PILOT_CHAT_ID = -1002187584621;
export const PILOT_USERNAME = 'freemarket';
export const METADATA_TTL = 300;
export const RENEW_AHEAD = 60; // renew a verification this long before it lapses
export const GIFT_TTL = 86400;
export const MESSAGE_RETENTION = 30 * 86400;

// Mini App cadence, in seconds. The front-end imports these too, so a change
// ships with `npm run deploy`. Refreshes and scans are silent; the list order
// changes only on a re-rank so cards stay put while people read.
export const REFRESH_SECONDS = 10; // re-read live stats
export const SCAN_SECONDS = 10; // background metadata and gift scan
export const RERANK_SECONDS = 180; // re-sort the list
