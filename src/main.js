import './style.css';
import { MODES, keepOrder, nextMode, selectEntries } from './directory.js';
import { element, setText, reconcileCards, reduceMotion } from './ui.js';
import { createCard } from './cards.js';
import {
  callServerless,
  parseDirectory,
  performanceClass,
  unauthorized,
} from './telegram.js';
import {
  THEME_TOKENS,
  paintChrome,
  resolveScheme,
  telegramPalette,
} from './theme.js';
import { LANGUAGE_LABELS } from '../tgcloud/lib/language-labels.js';
import {
  REFRESH_SECONDS,
  RERANK_SECONDS,
  SCAN_SECONDS,
} from '../tgcloud/lib/otc-config.js';

const $ = (id) => document.getElementById(id);
const webApp = window.Telegram?.WebApp;
const canCall =
  Boolean(webApp?.initData) && typeof webApp.Serverless?.call === 'function';
const supports = (version) =>
  Boolean(webApp?.initData) && webApp.isVersionAtLeast?.(version) === true;
const haptics = supports('6.1') ? webApp.HapticFeedback : null;
const backButton = supports('6.1') ? webApp.BackButton : null;
if (performanceClass(navigator.userAgent) === 'LOW')
  document.documentElement.dataset.performance = 'low';

// Storage can be unavailable inside a webview; choices then last one session.
function recall(key, allowed, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return allowed.includes(saved) ? saved : fallback;
  } catch {
    return fallback;
  }
}
function remember(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

const state = {
  entries: [],
  search: '',
  price: 'all',
  language: 'all',
  likedOnly: false,
  sort: 'rank',
  density: recall('otc-card-density', MODES, 'normal'),
  themeMode: recall('otc-theme-mode', ['light', 'dark', 'device'], 'device'),
  modes: new Map(),
  order: [],
  orderedAt: 0,
  loading: false,
  loaded: false,
  authExpired: false,
  likeRequests: new Set(),
  likeErrors: new Map(),
  likeVersion: 0,
};

function pressChoices(attribute, value) {
  for (const button of document.querySelectorAll(`[data-${attribute}]`))
    button.setAttribute(
      'aria-pressed',
      String(button.getAttribute(`data-${attribute}`) === value),
    );
}
// A segmented choice ticks only when its value actually changes.
function onChoice(attribute, current, apply) {
  for (const button of document.querySelectorAll(`[data-${attribute}]`))
    button.addEventListener('click', () => {
      const value = button.getAttribute(`data-${attribute}`);
      if (current() !== value) haptics?.selectionChanged();
      apply(value);
    });
}

const deviceAppearance = matchMedia('(prefers-color-scheme: dark)');
function theme() {
  const telegram = webApp?.initData ? webApp : null;
  const scheme = resolveScheme(
    state.themeMode,
    telegram?.colorScheme,
    deviceAppearance.matches,
  );
  // Telegram's own colours apply whenever they match the chosen scheme.
  const palette =
    telegram?.colorScheme === scheme
      ? telegramPalette(telegram.themeParams, scheme)
      : null;
  const root = document.documentElement;
  root.dataset.theme = scheme;
  for (const token of THEME_TOKENS)
    if (palette?.[token]) root.style.setProperty(token, palette[token]);
    else root.style.removeProperty(token);
  const background = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]').content = background;
  if (telegram)
    paintChrome(
      telegram,
      background,
      palette && background === telegram.themeParams.secondary_bg_color
        ? 'secondary_bg_color'
        : null,
    );
  pressChoices('theme-choice', state.themeMode);
}
theme();
deviceAppearance.addEventListener('change', theme);
if (webApp?.initData) {
  webApp.ready();
  webApp.expand();
  webApp.onEvent('themeChanged', theme);
}

function status(message = '', type = '') {
  setText($('status'), message);
  if ($('status').dataset.state !== type) $('status').dataset.state = type;
}
function offlineStatus() {
  status(
    state.loaded
      ? 'You’re offline. Showing your last update.'
      : 'You’re offline. Connect to load OTCs.',
    'error',
  );
  if (!state.loaded) $('cards').querySelector('.skeleton')?.remove();
}

const entryKey = (entry) =>
  String(entry.group.id ?? entry.group.username ?? entry.group.title);

function expireSession() {
  state.authExpired = true;
  status('Your session expired. Close and reopen the Mini App.', 'error');
  render();
}

async function changeLike(entry) {
  const key = entryKey(entry);
  entry = state.entries.find((item) => entryKey(item) === key);
  if (!entry) return;
  if (!canCall || state.authExpired || state.likeRequests.has(key)) return;
  if (!navigator.onLine) {
    state.likeErrors.set(key, 'You are offline. Reconnect to save your like.');
    haptics?.notificationOccurred('error');
    render();
    return;
  }
  haptics?.impactOccurred('light');
  const before = entry.likes || { count: 0, likedByMe: false };
  const liked = !before.likedByMe;
  state.likeRequests.add(key);
  state.likeErrors.delete(key);
  state.likeVersion++;
  entry.likes = {
    likedByMe: liked,
    count: Math.max(0, before.count + (liked ? 1 : -1)),
  };
  render();
  try {
    const result = await callEndpoint('setOtcLike', {
      chatId: entry.group.id,
      liked,
    });
    if (result?.chatId === entry.group.id && result.available === false) {
      state.entries = state.entries.filter((item) => entryKey(item) !== key);
      return;
    }
    if (
      result?.chatId !== entry.group.id ||
      !Number.isSafeInteger(result.likes?.count) ||
      result.likes.count < 0 ||
      typeof result.likes.likedByMe !== 'boolean'
    )
      throw new Error('Could not save your like. Try again.');
    const current = state.entries.find((item) => entryKey(item) === key);
    if (current) current.likes = result.likes;
  } catch (error) {
    const current = state.entries.find((item) => entryKey(item) === key);
    if (current) current.likes = before;
    if (unauthorized(error)) expireSession();
    else {
      state.likeErrors.set(
        key,
        error.message || 'Could not save your like. Try again.',
      );
      haptics?.notificationOccurred('error');
    }
  } finally {
    state.likeRequests.delete(key);
    state.likeVersion++;
    const restoreFocus =
      document.activeElement === document.body ||
      document.activeElement?.matches('.like-button');
    render();
    if (restoreFocus)
      [...$('cards').children]
        .find((card) => card.dataset.key === key)
        ?.querySelector('.like-button')
        ?.focus({ preventScroll: true });
  }
}

function renderCard(entry) {
  const id = entryKey(entry);
  return createCard(entry, {
    mode: state.modes.get(id) || state.density,
    disabled: !canCall || state.authExpired,
    pending: state.likeRequests.has(id),
    error: state.likeErrors.get(id),
    onLike: () => changeLike(entry),
    onCycle: () => {
      state.modes.set(id, nextMode(state.modes.get(id) || state.density));
      haptics?.selectionChanged();
      render();
      [...$('cards').children]
        .find((card) => card.dataset.key === id)
        ?.querySelector('.card-view')
        ?.focus({ preventScroll: true });
    },
  });
}

function renderEmptyState(shown) {
  let title = state.entries.length ? 'No matching OTCs' : 'No OTCs listed yet';
  let text = state.entries.length
    ? 'Try another search or change your filters.'
    : 'Connected groups will appear here.';
  if (state.likedOnly && !state.entries.some((entry) => entry.likes?.likedByMe))
    [title, text] = ['No liked OTCs yet', 'Tap a heart on an OTC to save it here.'];
  if (!canCall)
    [title, text] = [
      'Open in Telegram',
      'Open the Mini App from the bot to browse live OTCs.',
    ];
  $('empty-state').hidden = canCall && (!state.loaded || shown > 0);
  setText($('empty-title'), title);
  setText($('empty-description'), text);
  $('empty-reset').hidden = !canCall || state.entries.length === 0;
}

// Values update on every refresh, but cards only change places on a re-rank
// (every RERANK_SECONDS) or at once when the viewer changes the search,
// filters or sort, so the list never shifts under a reader.
function render({ background = false, resort = false } = {}) {
  let entries = selectEntries(state.entries, state);
  if (resort || Date.now() - state.orderedAt >= RERANK_SECONDS * 1000)
    state.orderedAt = Date.now();
  else entries = keepOrder(entries, state.order, entryKey);
  state.order = entries.map(entryKey);
  reconcileCards($('cards'), entries.map(renderCard), { background });
  setText(
    $('result-count'),
    state.loaded
      ? `${entries.length} ${entries.length === 1 ? 'OTC' : 'OTCs'}`
      : '',
  );
  renderEmptyState(entries.length);
  $('clear-search').hidden = !state.search;
  $('filter-toggle').querySelector('.filter-dot').hidden =
    state.price === 'all' &&
    state.sort === 'rank' &&
    state.language === 'all' &&
    !state.likedOnly;
  pressChoices('price', state.price);
  pressChoices('liked', state.likedOnly ? 'liked' : 'all');
  pressChoices('density', state.density);
}

for (const [code, label] of Object.entries(LANGUAGE_LABELS).sort((a, b) =>
  a[1].localeCompare(b[1]),
)) {
  const option = element('option', '', label);
  option.value = code;
  $('language').append(option);
}
function resetFilters() {
  state.price = 'all';
  state.language = 'all';
  state.likedOnly = false;
  state.sort = 'rank';
  $('sort').value = 'rank';
  $('language').value = 'all';
  render({ resort: true });
}
$('search').addEventListener('input', (event) => {
  state.search = event.target.value;
  render({ resort: true });
});
$('clear-search').addEventListener('click', () => {
  state.search = '';
  $('search').value = '';
  render({ resort: true });
  $('search').focus();
});
// Group and bot links open inside Telegram rather than in a browser tab.
document.addEventListener('click', (event) => {
  const link = event.target.closest?.('a[href^="https://t.me/"]');
  if (!link || !webApp?.initData) return;
  if (typeof webApp.openTelegramLink !== 'function') return;
  try {
    webApp.openTelegramLink(link.href);
    event.preventDefault();
  } catch {
    /* The ordinary Telegram link remains the browser fallback. */
  }
});
const toggles = { settings: 'settings-toggle', filters: 'filter-toggle' };
function showPanel(name, open) {
  for (const [panel, toggle] of Object.entries(toggles)) {
    const visible = panel === name && open;
    $(panel).hidden = !visible;
    $(toggle).setAttribute('aria-expanded', String(visible));
  }
  // Telegram's back button, and Android's back gesture, close an open panel.
  if (open) backButton?.show();
  else backButton?.hide();
  if (!open) return;
  // A panel opened from further down the list scrolls into view.
  const offset =
    $(name).getBoundingClientRect().top -
    document.querySelector('.toolbar').getBoundingClientRect().bottom;
  if (offset < 0)
    window.scrollBy({
      top: offset,
      behavior: reduceMotion() ? 'auto' : 'smooth',
    });
}
function openSettings() {
  showPanel('settings', true);
  $('settings')
    .querySelector('[data-theme-choice][aria-pressed=true]')
    ?.focus({ preventScroll: true });
}
$('filter-toggle').addEventListener('click', () =>
  showPanel('filters', $('filters').hidden),
);
$('settings-toggle').addEventListener('click', () => {
  if ($('settings').hidden) openSettings();
  else showPanel('settings', false);
});
backButton?.onClick(() => {
  const open = Object.keys(toggles).find((panel) => !$(panel).hidden);
  if (!open) return;
  const restoreFocus = $(open).contains(document.activeElement);
  showPanel(open, false);
  if (restoreFocus) $(toggles[open]).focus({ preventScroll: true });
});
// Settings also appears in the Mini App's ⋮ menu, as in other Telegram apps.
if (supports('7.0')) webApp.SettingsButton.show().onClick(openSettings);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('settings').hidden) {
    showPanel('settings', false);
    $('settings-toggle').focus({ preventScroll: true });
  }
});
document.addEventListener('click', (event) => {
  if (
    !$('settings').hidden &&
    !$('settings').contains(event.target) &&
    !$('settings-toggle').contains(event.target)
  )
    showPanel('settings', false);
});
onChoice(
  'price',
  () => state.price,
  (value) => {
    state.price = value;
    render({ resort: true });
  },
);
onChoice(
  'liked',
  () => (state.likedOnly ? 'liked' : 'all'),
  (value) => {
    state.likedOnly = value === 'liked';
    render({ resort: true });
  },
);
$('sort').addEventListener('change', (event) => {
  state.sort = event.target.value;
  render({ resort: true });
});
$('language').addEventListener('change', (event) => {
  state.language = event.target.value;
  render({ resort: true });
});
$('reset-filters').addEventListener('click', resetFilters);
$('empty-reset').addEventListener('click', () => {
  state.search = '';
  $('search').value = '';
  resetFilters();
});
onChoice(
  'theme-choice',
  () => state.themeMode,
  (value) => {
    state.themeMode = value;
    remember('otc-theme-mode', value);
    theme();
  },
);
onChoice(
  'density',
  () => state.density,
  (value) => {
    state.density = value;
    state.modes.clear();
    remember('otc-card-density', value);
    render();
  },
);

// Quiet background work: live stats every REFRESH_SECONDS and a metadata/gift
// scan every SCAN_SECONDS. Nothing on screen announces either; failures keep
// the last good list and retry on the next tick.
const callEndpoint = (name, input) => callServerless(webApp, name, input);
const online = () =>
  canCall && !state.authExpired && !document.hidden && navigator.onLine;
async function refresh() {
  if (state.loading || !online()) {
    if (canCall && !navigator.onLine && !document.hidden) offlineStatus();
    return;
  }
  const firstLoad = !state.loaded;
  state.loading = true;
  if (firstLoad) status('Loading OTCs…');
  const likeVersion = state.likeVersion;
  try {
    const incoming = parseDirectory(await callEndpoint('getOtcStats', {}));
    if (state.authExpired) return;
    // A like changed while this read was in flight is newer than the read.
    for (const entry of incoming) {
      const current = state.entries.find(
        (item) => entryKey(item) === entryKey(entry),
      );
      if (
        current &&
        (state.likeRequests.has(entryKey(entry)) ||
          state.likeVersion !== likeVersion)
      )
        entry.likes = current.likes;
    }
    state.entries = incoming;
    state.loaded = true;
    render({ background: !firstLoad });
    if (navigator.onLine) status();
  } catch (error) {
    if (unauthorized(error)) expireSession();
    else if (firstLoad) {
      $('cards').replaceChildren();
      status('Couldn’t load OTCs. Trying again…', 'error');
    }
  } finally {
    state.loading = false;
  }
}
let scanning = false;
async function scan() {
  if (scanning || !online()) return;
  scanning = true;
  try {
    const result = await callEndpoint('refreshDirectory', {});
    if (result?.changed && !state.authExpired) await refresh();
  } catch (error) {
    if (unauthorized(error)) expireSession();
  } finally {
    scanning = false;
  }
}
const catchUp = () => refresh().then(scan);

render();
if (canCall) {
  const loading = element('div', 'otc-card skeleton');
  loading.setAttribute('aria-hidden', 'true');
  loading.append(
    element('div', 'skeleton-line'),
    element('div', 'skeleton-line'),
  );
  $('cards').append(loading);
  catchUp();
  setInterval(refresh, REFRESH_SECONDS * 1000);
  setInterval(scan, SCAN_SECONDS * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) catchUp();
  });
  window.addEventListener('online', catchUp);
  window.addEventListener('offline', offlineStatus);
}
