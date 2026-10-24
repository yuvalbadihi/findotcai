import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THEME_TOKENS,
  mix,
  paintChrome,
  resolveScheme,
  telegramPalette,
} from '../src/theme.js';

// Telegram Desktop's default Night theme, as its WebViewParams sends it.
const desktopNight = {
  bg_color: '#17212b',
  secondary_bg_color: '#232e3c',
  section_bg_color: '#17212b',
  text_color: '#f5f5f5',
  hint_color: '#708499',
  subtitle_text_color: '#708499',
  link_color: '#6ab3f3',
  accent_text_color: '#6ab2f2',
  section_header_text_color: '#6ab3f3',
  destructive_text_color: '#ec3942',
  button_color: '#5288c1',
  button_text_color: '#ffffff',
};

test('an explicit Day or Night choice wins; Device follows Telegram, then the system', () => {
  assert.equal(resolveScheme('light', 'dark', true), 'light');
  assert.equal(resolveScheme('dark', 'light', false), 'dark');
  assert.equal(resolveScheme('device', 'dark', false), 'dark');
  assert.equal(resolveScheme('device', 'light', true), 'light');
  assert.equal(resolveScheme('device', undefined, true), 'dark');
  assert.equal(resolveScheme('device', 'sepia', false), 'light');
});

test('Telegram theme parameters become section cards on the secondary background', () => {
  const palette = telegramPalette(desktopNight, 'dark');
  assert.deepEqual(Object.keys(palette), THEME_TOKENS);
  assert.equal(palette['--bg'], '#232e3c');
  assert.equal(palette['--surface'], '#17212b');
  assert.equal(palette['--text'], '#f5f5f5');
  assert.equal(palette['--muted'], '#708499');
  assert.equal(palette['--blue'], '#6ab2f2');
  assert.equal(palette['--error'], '#ec3942');
  assert.equal(palette['--heading'], '#6ab3f3');
  assert.equal(palette['--blue-bg'], mix('#6ab2f2', '#17212b', 0.18));
  assert.equal(palette['--line'], mix('#708499', '#17212b', 0.22));
});

test('older clients fall back to the colours every Telegram version sends', () => {
  const palette = telegramPalette(
    {
      bg_color: '#ffffff',
      text_color: '#000000',
      hint_color: '#999999',
      link_color: '#2481cc',
    },
    'light',
  );
  assert.equal(palette['--bg'], '#ffffff');
  assert.equal(palette['--surface'], '#ffffff');
  assert.equal(palette['--muted'], '#999999');
  assert.equal(palette['--blue'], '#2481cc');
  assert.equal(palette['--blue-bg'], mix('#2481cc', '#ffffff', 0.12));
  // Missing optional colours stay unset so style.css supplies them.
  assert.equal(palette['--error'], undefined);
  assert.equal(palette['--heading'], undefined);
});

test('incomplete or malformed theme parameters keep the built-in palette', () => {
  assert.equal(telegramPalette(undefined, 'dark'), null);
  assert.equal(telegramPalette({}, 'dark'), null);
  assert.equal(
    telegramPalette({ ...desktopNight, text_color: 'white' }, 'dark'),
    null,
  );
  assert.equal(
    telegramPalette(
      { ...desktopNight, link_color: undefined, accent_text_color: '#12' },
      'dark',
    ),
    null,
  );
});

test('mix blends two hex colours channel by channel', () => {
  assert.equal(mix('#ffffff', '#000000', 0.5), '#808080');
  assert.equal(mix('#6ab8f7', '#222e3b', 0), '#222e3b');
  assert.equal(mix('#6ab8f7', '#222e3b', 1), '#6ab8f7');
});

function fakeWebApp(version, { rejectHex = false } = {}) {
  const calls = [];
  const at = (wanted) => {
    const [a, b] = version.split('.').map(Number);
    const [c, d] = wanted.split('.').map(Number);
    return a > c || (a === c && b >= d);
  };
  const record = (method) => (value) => {
    if (rejectHex && value.startsWith('#')) throw new Error('rejected');
    calls.push([method, value]);
  };
  return {
    calls,
    isVersionAtLeast: at,
    setHeaderColor: record('setHeaderColor'),
    setBackgroundColor: record('setBackgroundColor'),
    setBottomBarColor: record('setBottomBarColor'),
  };
}

test('Telegram header, background and bottom bar follow the page colour', () => {
  const current = fakeWebApp('8.0');
  paintChrome(current, '#f4f6f8', null);
  assert.deepEqual(current.calls, [
    ['setHeaderColor', '#f4f6f8'],
    ['setBackgroundColor', '#f4f6f8'],
    ['setBottomBarColor', '#f4f6f8'],
  ]);
  const keyed = fakeWebApp('8.0');
  paintChrome(keyed, '#232e3c', 'secondary_bg_color');
  assert.deepEqual(keyed.calls, [
    ['setHeaderColor', 'secondary_bg_color'],
    ['setBackgroundColor', 'secondary_bg_color'],
    ['setBottomBarColor', 'secondary_bg_color'],
  ]);
});

test('each chrome colour waits for the Bot API version that supports it', () => {
  const v66 = fakeWebApp('6.6');
  paintChrome(v66, '#f4f6f8', null);
  // Before 6.9 a header accepts only theme keys; before 7.10 there is no bottom bar.
  assert.deepEqual(v66.calls, [['setBackgroundColor', '#f4f6f8']]);
  const keyed = fakeWebApp('6.6');
  paintChrome(keyed, '#232e3c', 'secondary_bg_color');
  assert.deepEqual(keyed.calls, [
    ['setHeaderColor', 'secondary_bg_color'],
    ['setBackgroundColor', 'secondary_bg_color'],
  ]);
  const v60 = fakeWebApp('6.0');
  paintChrome(v60, '#f4f6f8', null);
  assert.deepEqual(v60.calls, []);
  paintChrome({}, '#f4f6f8', null);
});

test('a client that rejects one colour still receives the others', () => {
  const picky = fakeWebApp('8.0', { rejectHex: true });
  assert.doesNotThrow(() => paintChrome(picky, '#f4f6f8', null));
  assert.deepEqual(picky.calls, []);
  const partial = fakeWebApp('8.0');
  partial.setHeaderColor = () => {
    throw new Error('WebAppHeaderColorInvalid');
  };
  paintChrome(partial, '#f4f6f8', null);
  assert.deepEqual(partial.calls, [
    ['setBackgroundColor', '#f4f6f8'],
    ['setBottomBarColor', '#f4f6f8'],
  ]);
});
