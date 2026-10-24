// OTC Rank: the model behind the "Recommended" sort. Each signal maps onto
// 0..1 with diminishing returns over fixed bounds, so a group's score never
// depends on which other groups are listed, and no single number (one burst of
// messages, one expensive gift) can carry a group to the top. Signals that need
// time to observe lean toward a neutral prior until about a week of data
// exists: a new group is neither buried nor promoted on a first-day burst.
// Weights start from docs/otc-finder-metrics.md. Posting rules and congestion
// are not measured, so visibility is not scored yet.
export const RANK_VERSION = 1;
export const WEIGHTS = {
  collectors: 0.3, // observed posters who hold collectible gifts
  activity: 0.3, // distinct posters, messages per day and recency
  cost: 0.15, // Stars per message for a general user
  value: 0.1, // visible admin gift value
  likes: 0.1, // community likes
  reach: 0.05, // members
};
const PRIOR = 0.3; // neutral value for a signal that is still being observed
const UNKNOWN_PRICE = 0.35; // an unconfirmed price is not treated as free
const LANGUAGE_BOOST = 1.1; // the group speaks the viewer's language
const DAY = 86400;

const saturate = (value, half) => value / (value + half); // `half` scores 0.5
const logScale = (value, top) =>
  Math.min(1, Math.log10(1 + Math.max(0, value)) / Math.log10(1 + top));

function gram(valuation) {
  return ['GRAM', 'TON'].includes(valuation?.currency) &&
    valuation.status !== 'unavailable' &&
    /^\d{1,64}$/.test(valuation.amountNano ?? '')
    ? Number(valuation.amountNano) / 1e9
    : 0;
}

// `audience` counts this group's recent posters with a fresh gift check
// (`checked`) and those holding at least one unique gift (`holders`).
export function rankSignals(entry, audience = {}, now) {
  const { group, activity = {} } = entry;
  const days = Math.min(7, Math.max(0, (now - entry.windowStartedAt) / DAY));
  // About 33% confidence after one day of data, 78% after a full week.
  const confidence = days / (days + 2);
  const settle = (value) => confidence * value + (1 - confidence) * PRIOR;
  const holders = audience.holders ?? 0;
  const checked = audience.checked ?? 0;
  // Holder share is smoothed toward 20% so two lucky checks prove little.
  const collectors =
    0.6 * saturate(holders, 8) + 0.4 * ((holders + 1) / (checked + 5));
  const perDay = (activity.messages ?? 0) / Math.max(1, days);
  const idleDays = activity.lastMessageAt
    ? Math.max(0, now - activity.lastMessageAt) / DAY
    : Infinity;
  const active =
    0.45 * saturate(activity.posters ?? 0, 10) +
    0.35 * saturate(perDay, 25) +
    0.2 * Math.exp(-idleDays / 3);
  const price = group.starsPerMessage;
  return {
    collectors: settle(collectors),
    activity: settle(active),
    cost: Number.isSafeInteger(price) ? 25 / (25 + price) : UNKNOWN_PRICE,
    value: logScale(gram(entry.adminSample?.valuation), 1e6),
    likes: saturate(entry.likes?.count ?? 0, 5),
    reach: logScale(group.memberCount ?? 0, 1e5),
  };
}

// A 0-100 score, to one decimal place.
export function rankScore(signals, speaksViewerLanguage = false) {
  const base = Object.entries(WEIGHTS).reduce(
    (sum, [name, weight]) => sum + weight * signals[name],
    0,
  );
  const boosted = base * (speaksViewerLanguage ? LANGUAGE_BOOST : 1);
  return Math.round(Math.min(1, boosted) * 1000) / 10;
}

// Scores every entry in place and returns them best first. Ties fall back to
// likes, members and finally the chat id, so the order is deterministic.
export function rankDirectory(entries, { audiences, language, now }) {
  for (const entry of entries) {
    const signals = rankSignals(entry, audiences?.get(entry.group.id), now);
    const match = Boolean(
      language &&
        entry.language?.languages?.some((item) => item.code === language),
    );
    entry.rank = {
      version: RANK_VERSION,
      score: rankScore(signals, match),
      signals: Object.fromEntries(
        Object.entries(signals).map(([name, value]) => [
          name,
          Math.round(value * 100) / 100,
        ]),
      ),
    };
  }
  return entries.sort(
    (a, b) =>
      b.rank.score - a.rank.score ||
      (b.likes?.count ?? 0) - (a.likes?.count ?? 0) ||
      (b.group.memberCount ?? 0) - (a.group.memberCount ?? 0) ||
      a.group.id - b.group.id,
  );
}
