import { element, icon, stat, metric } from './ui.js';
import {
  nextMode,
  formatNumber,
  formatGram,
  relativeTime,
  entryLanguages,
} from './directory.js';

function likeButton(entry, options) {
  const like = element('button', 'like-button');
  const liked = entry.likes?.likedByMe === true;
  const count = entry.likes?.count ?? 0;
  const key = String(entry.group.id);
  like.type = 'button';
  like.setAttribute('aria-pressed', String(liked));
  like.setAttribute(
    'aria-label',
    `${liked ? 'Unlike' : 'Like'} ${entry.group.title} · ${formatNumber(count)} ${count === 1 ? 'like' : 'likes'}`,
  );
  like.disabled =
    options.disabled ||
    options.pending ||
    !Number.isSafeInteger(entry.group.id);
  if (options.pending) like.setAttribute('aria-busy', 'true');
  like.append(
    icon('heart'),
    element('span', 'like-count', formatNumber(count, true)),
  );
  like.addEventListener('click', options.onLike);
  return like;
}

export function createCard(entry, options) {
  const { group, activity } = entry;
  const sample = entry.adminSample;
  const valuation = sample?.valuation;
  const id = String(entry.group.id);
  const mode = options.mode;
  const card = element('article', 'otc-card');
  card.dataset.mode = mode;
  card.dataset.key = id;
  card.setAttribute('aria-label', group.title);
  const top = element('div', 'card-top');
  const username =
    group.username && /^[a-zA-Z0-9_]+$/.test(group.username)
      ? group.username
      : null;
  const name = element(username ? 'a' : 'span', 'group-name');
  name.append(element('span', '', username ? `@${username}` : group.title));
  if (username) {
    name.href = `https://t.me/${username}`;
    name.target = '_blank';
    name.rel = 'noopener noreferrer';
  }
  const price = element('span', 'price');
  price.dataset.metric = 'price';
  if (group.starsPerMessage === null)
    price.append(element('span', '', 'Unknown'));
  else if (group.starsPerMessage === 0)
    price.append(element('span', '', 'Free'));
  else
    price.append(
      icon('star'),
      element('span', '', formatNumber(group.starsPerMessage)),
      element('small', '', '/msg'),
    );
  const cycle = element('button', 'card-view');
  cycle.type = 'button';
  cycle.setAttribute(
    'aria-label',
    `Switch ${group.title} to ${nextMode(mode)} view`,
  );
  cycle.append(icon('chevron'));
  cycle.addEventListener('click', options.onCycle);
  top.append(name, price, cycle);
  card.append(top);

  const languages = entryLanguages(entry.language);
  const language = languages.map((item) => item.label).join(' · ');
  const daily = activity.messagesPerDay;
  const dailyTitle =
    activity.dailyWindowSeconds < 86400
      ? 'Messages today (partial day)'
      : 'Messages in the last 24 hours';
  const giftCount =
    sample && sample.complete + sample.partial > 0
      ? sample.visibleUniqueGifts
      : null;
  const timestamp = valuation?.checkedAt || sample?.checkedAt;
  const age = timestamp
    ? `${formatGram(valuation) === '—' ? 'Gifts checked' : 'Gift estimate'} · ${relativeTime(timestamp)}`
    : '';

  if (mode === 'compact') {
    const strip = element('div', 'card-stats compact-stats');
    strip.append(
      likeButton(entry, options),
      stat(
        'message',
        `${formatNumber(daily, true)} /day`,
        dailyTitle,
        'frequency',
      ),
      stat(
        'gram',
        formatGram(valuation, true),
        'Admin gift value estimate in Gram',
        'value',
      ),
    );
    if (language) {
      const tag = element('span', 'compact-language', language);
      tag.dataset.metric = 'language';
      strip.append(tag);
    }
    card.append(strip);
  } else {
    if (mode === 'normal') {
      const stats = element('div', 'card-stats');
      stats.append(
        stat(
          'people',
          `${formatNumber(group.memberCount, true)} members`,
          'Group members',
        ),
        stat(
          'message',
          `${formatNumber(daily, true)} /day`,
          dailyTitle,
          'frequency',
        ),
      );
      if (language) {
        const tag = element('span', 'tag language-tag', language);
        tag.dataset.metric = 'language';
        stats.append(tag);
      }
      card.append(stats);
    }

    const summary = element(
      'div',
      mode === 'large' ? 'valuation-summary' : 'card-valuation',
    );
    summary.append(
      element(
        'span',
        'valuation-label',
        mode === 'large' ? 'Admin gift value · estimate' : 'Admin gifts',
      ),
    );
    summary.append(
      stat(
        'gram',
        formatGram(valuation, mode !== 'large'),
        'Admin gift value estimate in Gram',
        'value',
      ),
    );
    if (valuation?.status === 'partial')
      summary.append(element('span', 'tag partial-tag', 'Partial estimate'));
    if (mode === 'normal' && giftCount !== null)
      summary.append(
        stat(
          'gift',
          formatNumber(giftCount, true),
          'Gifts held by admins',
          'gift-count',
        ),
      );
    card.append(summary);

    if (mode === 'large') {
      const meta = element('div', 'valuation-meta');
      if (giftCount !== null) {
        const count = element(
          'span',
          '',
          `${formatNumber(giftCount)} ${giftCount === 1 ? 'gift' : 'gifts'}`,
        );
        count.dataset.metric = 'gift-count';
        meta.append(count);
      }
      if (age) meta.append(element('span', '', age));
      card.append(meta);
      const detail = element('dl', 'detail-grid');
      metric(detail, 'Members', formatNumber(group.memberCount), 'members');
      metric(detail, 'Messages / day', formatNumber(daily), 'daily');
      if (activity.dailyWindowSeconds < 86400)
        detail.lastChild.append(element('small', 'metric-hint', 'Partial day'));
      if (language) metric(detail, languages.length > 1 ? 'Languages' : 'Language', language, 'language');
      metric(
        detail,
        'Last post',
        activity.lastMessageAt ? relativeTime(activity.lastMessageAt) : '—',
        'last-post',
      );
      card.append(detail);
    }

    const footer = element('div', 'card-bottom');
    footer.append(likeButton(entry, options));
    // Large cards already show the estimate age beside the gift value.
    if (mode === 'normal' && age)
      footer.append(element('span', 'updated', age));
    card.append(footer);
  }

  if (options.error) {
    const error = element('p', 'like-error', options.error);
    error.setAttribute('role', 'alert');
    card.append(error);
  }
  return card;
}
