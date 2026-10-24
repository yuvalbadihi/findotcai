// style.css tokens that can follow Telegram's live theme.
export const THEME_TOKENS = [
  '--bg',
  '--surface',
  '--line',
  '--text',
  '--muted',
  '--blue',
  '--blue-bg',
  '--error',
  '--heading',
];

export function resolveScheme(mode, telegramScheme, deviceDark) {
  if (mode === 'light' || mode === 'dark') return mode;
  if (telegramScheme === 'light' || telegramScheme === 'dark')
    return telegramScheme;
  return deviceDark ? 'dark' : 'light';
}

const channels = (hex) =>
  [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));

export function mix(color, base, amount) {
  const top = channels(color);
  return `#${channels(base)
    .map((value, index) =>
      Math.round(value + (top[index] - value) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

// Telegram recommends section-coloured cards on the secondary background.
// Returns null when the client sends too few colours to build a palette.
export function telegramPalette(params, scheme) {
  const pick = (...keys) =>
    keys
      .map((key) => params?.[key])
      .find(
        (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value),
      );
  const bg = pick('secondary_bg_color', 'bg_color');
  const surface = pick('section_bg_color', 'bg_color');
  const text = pick('text_color');
  const muted = pick('subtitle_text_color', 'hint_color');
  const accent = pick('accent_text_color', 'link_color');
  if (!bg || !surface || !text || !muted || !accent) return null;
  return {
    '--bg': bg,
    '--surface': surface,
    '--line': mix(muted, surface, 0.22),
    '--text': text,
    '--muted': muted,
    '--blue': accent,
    '--blue-bg': mix(accent, surface, scheme === 'dark' ? 0.18 : 0.12),
    '--error': pick('destructive_text_color'),
    '--heading': pick('section_header_text_color'),
  };
}

// Colour Telegram's header, background and bottom bar like the page. A theme
// key lets Telegram keep them in step with its own theme changes.
export function paintChrome(webApp, color, key) {
  const paint = (method, version, value) => {
    if (!webApp.isVersionAtLeast?.(version)) return;
    try {
      webApp[method](value);
    } catch {
      /* A client can still reject a colour; the page keeps working. */
    }
  };
  paint('setHeaderColor', key ? '6.1' : '6.9', key || color);
  paint('setBackgroundColor', '6.1', key || color);
  paint('setBottomBarColor', '7.10', key || color);
}
