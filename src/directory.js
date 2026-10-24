export const MODES = ['compact', 'normal', 'large'];
export function nextMode(mode) {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length];
}

export function entryLanguages(language) {
  return Array.isArray(language?.languages) ? language.languages : [];
}

// Exact admin gift value in nanoGram, or null without a usable estimate.
function gramValue(entry) {
  const estimate = entry.adminSample?.valuation;
  return ['GRAM', 'TON'].includes(estimate?.currency) &&
    estimate.status !== 'unavailable' &&
    typeof estimate.amountNano === 'string' &&
    /^\d{1,64}$/.test(estimate.amountNano)
    ? BigInt(estimate.amountNano)
    : null;
}

const descending = (read) => (a, b) => read(b) - read(a);
const SORTS = {
  // OTC Rank arrives best first from the server; equal scores keep that order.
  rank: descending((entry) => entry.rank?.score ?? -1),
  likes: descending((entry) => entry.likes?.count ?? 0),
  members: descending((entry) => entry.group.memberCount ?? -1),
  activity: descending((entry) => entry.activity?.messagesPerDay ?? -1),
  price: (a, b) =>
    (a.group.starsPerMessage ?? Infinity) -
    (b.group.starsPerMessage ?? Infinity),
  value: (a, b) => {
    const x = gramValue(a);
    const y = gramValue(b);
    return x === y ? 0 : x === null ? 1 : y === null ? -1 : x > y ? -1 : 1;
  },
};

export function selectEntries(
  entries,
  {
    search = '',
    price = 'all',
    language = 'all',
    likedOnly = false,
    sort = 'rank',
  } = {},
) {
  const query = search.trim().replace(/^@/, '').toLocaleLowerCase();
  const result = entries.filter((entry) => {
    const languages = entryLanguages(entry.language);
    const text = `${entry.group.title} ${entry.group.username || ''} ${languages
      .map((item) => `${item.label} ${item.code}`)
      .join(' ')}`;
    const cost = entry.group.starsPerMessage;
    return (
      text.toLocaleLowerCase().includes(query) &&
      (language === 'all' ||
        (language === 'multiple'
          ? languages.length > 1
          : languages.some((item) => item.code === language))) &&
      (!likedOnly || entry.likes?.likedByMe === true) &&
      (price === 'all' ||
        (price === 'free' && cost === 0) ||
        (price === 'paid' && typeof cost === 'number' && cost > 0))
    );
  });
  return Object.hasOwn(SORTS, sort) ? result.sort(SORTS[sort]) : result;
}

// Keeps the order the list last showed; entries new since then follow in their
// sorted order. Sorting is stable, so ties never shuffle between refreshes.
export function keepOrder(entries, order, keyOf) {
  const position = new Map(order.map((key, index) => [key, index]));
  const place = (entry) => position.get(keyOf(entry)) ?? Infinity;
  return [...entries].sort((a, b) => place(a) - place(b));
}

export function formatNumber(value, compact = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(
    undefined,
    compact ? { notation: 'compact', maximumFractionDigits: 1 } : {},
  ).format(value);
}
export function formatGram(estimate, compact = false) {
  // TON is the legacy ticker on earlier snapshots of the same native asset.
  if (
    !['GRAM', 'TON'].includes(estimate?.currency) ||
    estimate.status === 'unavailable' ||
    typeof estimate.amountNano !== 'string' ||
    !/^\d{1,64}$/.test(estimate.amountNano)
  )
    return '—';
  if (compact)
    return `≈ ${new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(Number(estimate.amountNano) / 1e9)} Gram`;
  const cents = (BigInt(estimate.amountNano) + 5000000n) / 10000000n;
  const whole = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(cents / 100n);
  const fraction = String(cents % 100n)
    .padStart(2, '0')
    .replace(/0+$/, '');
  const decimal =
    new Intl.NumberFormat(undefined)
      .formatToParts(1.1)
      .find((part) => part.type === 'decimal')?.value || '.';
  return `≈ ${whole}${fraction ? decimal + fraction : ''} Gram`;
}
export function relativeTime(seconds, now = Date.now() / 1000) {
  if (!seconds) return 'Not checked';
  const elapsed = Math.max(0, Math.floor(now - seconds));
  if (elapsed < 60) return 'Just now';
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h ago`;
  return `${Math.floor(elapsed / 86400)}d ago`;
}
