import { EndpointError } from 'sdk';
import { LANGUAGE_LABELS } from './language-labels.js';

// The platform verifies ctx.initData before an endpoint runs.
export function requireViewer(ctx) {
  const id = ctx?.initData?.user?.id;
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new EndpointError('Open the Mini App in Telegram.', {
      code: 'USER_REQUIRED',
    });
  return id;
}

// Telegram sends the app's interface language as an IETF tag ("en", "pt-br");
// chat languages use the detector's ISO 639-3 codes.
const ISO_639_3 = {
  am: 'amh', ar: 'arb', az: 'azj', be: 'bel', bg: 'bul', bn: 'ben', bs: 'bos',
  cs: 'ces', de: 'deu', el: 'ell', en: 'eng', es: 'spa', fa: 'pes', fil: 'tgl',
  fr: 'fra', gu: 'guj', ha: 'hau', he: 'heb', hi: 'hin', hr: 'hrv', hu: 'hun',
  id: 'ind', ig: 'ibo', in: 'ind', it: 'ita', iw: 'heb', ja: 'jpn', jv: 'jav',
  kk: 'kaz', kn: 'kan', ko: 'kor', ln: 'lin', mg: 'plt', ml: 'mal', mr: 'mar',
  ms: 'zlm', my: 'mya', ne: 'npi', nl: 'nld', ny: 'nya', pa: 'pan', pl: 'pol',
  ps: 'pbu', pt: 'por', rn: 'run', ro: 'ron', ru: 'rus', rw: 'kin', si: 'sin',
  so: 'som', sr: 'srp', su: 'sun', sv: 'swe', sw: 'swh', ta: 'tam', te: 'tel',
  th: 'tha', tl: 'tgl', tr: 'tur', uk: 'ukr', ur: 'urd', uz: 'uzn', vi: 'vie',
  yo: 'yor', zh: 'cmn', zu: 'zul',
};

// The viewer's own language, used only to personalise the ranking.
export function viewerLanguage(ctx) {
  const tag = ctx?.initData?.user?.language_code;
  if (typeof tag !== 'string') return null;
  const primary = tag.toLowerCase().split(/[-_]/)[0];
  const code = Object.hasOwn(ISO_639_3, primary) ? ISO_639_3[primary] : primary;
  return Object.hasOwn(LANGUAGE_LABELS, code) ? code : null;
}
