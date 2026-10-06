// bundleParts.js — the real readers for each bundle part (#1051). Every part
// is checked by the SAME validator its own single-purpose import already uses,
// so a bundle can never smuggle in something the individual importers refuse.
import { parseProject } from './projectDocument.js';
import { sanitizeFavorite } from './slices/davisSlice.js';
import { sanitizeUserVoice, MAX_USER_VOICES } from './slices/voiceSlice.js';
import { validateTaste } from '../curator/tasteHead.js';
import { validateBiologyPolicy } from '../biology/policy.js';
import { sanitizeUserPresets } from '../data/canvasPresets.js';

const asList = (raw, what) => (Array.isArray(raw) ? { ok: true, list: raw } : { ok: false, error: `${what} is not a list` });

export const BUNDLE_SANITIZERS = {
  project(raw) {
    const r = parseProject(raw);
    return r.ok ? { ok: true, value: { doc: r.doc, sanitized: r.sanitized } } : { ok: false, error: r.error };
  },
  // Palettes are re-sanitized and de-duplicated by importUserPalettes when applied.
  userPalettes(raw) {
    const l = asList(raw, 'palettes');
    return l.ok ? { ok: true, value: l.list, given: l.list.length } : l;
  },
  // #1063 — the performer's captured voices (the VOICE shelf, capped at 12).
  userVoices(raw) {
    const l = asList(raw, 'voices');
    return l.ok ? { ok: true, value: l.list.map(sanitizeUserVoice).filter(Boolean).slice(0, MAX_USER_VOICES), given: l.list.length } : l;
  },
  favorites(raw) {
    const l = asList(raw, 'favorites');
    return l.ok ? { ok: true, value: l.list.map(sanitizeFavorite).filter(Boolean), given: l.list.length } : l;
  },
  keeps(raw) {
    const l = asList(raw, 'keeps');
    return l.ok ? { ok: true, value: l.list.map(sanitizeFavorite).filter(Boolean), given: l.list.length } : l;
  },
  taste(raw) {
    const r = validateTaste(raw);
    return r.ok ? { ok: true, value: raw } : { ok: false, error: r.error || 'invalid taste' };
  },
  biology(raw) {
    const r = validateBiologyPolicy(raw);
    return r.ok ? { ok: true, value: raw } : { ok: false, error: r.error || 'invalid policy' };
  },
  canvasPresets(raw) {
    const l = asList(raw, 'canvas presets');
    return l.ok ? { ok: true, value: sanitizeUserPresets(l.list), given: l.list.length } : l;
  },
};
