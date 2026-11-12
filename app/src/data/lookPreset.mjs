// lookPreset.mjs — #1479 (the DLC Look phase, pulled forward by Matt's 2026-10-14 decision 3): the kc-look/1 preset
// type. Pure: text or value in, verdict out. No UI, no loader, no slots — this module is the format contract the
// pipeline loader and the loot folder's looks/ slice build on later (docs/DLC_PRESET_TYPES.md §1; §2 and §3 are
// separate PRs).
//
// A Look preset is one JSON object:
//
//   { format: 'kc-look/1', mode, layoutParams, paletteId, seed? }
//
// `mode` + `layoutParams` are the live layout vocabulary (data/layout-modes.js): mode is one of MODE_IDS and
// layoutParams is validated and clamped by that module's own validateLayoutParams, so a preset can never carry a
// value the sliders themselves could not produce. `paletteId` names the paired palette. `seed` is optional —
// a seedless Look applies to the live scene; a seeded Look is a frozen composition.
//
// Shared preset rules (DLC_PRESET_TYPES.md §1), enforced here:
//   - Unknown `format` is refused with a named error, never half-applied; a newer kc-look version is refused
//     plainly, the way projectFile.mjs refuses a newer kcproject.
//   - Unknown fields are ignored — the normalised Look carries exactly the fields above, nothing else.
//   - Out-of-range values are clamped (by the layout module's own clamps); values that are structurally
//     unreadable (NaN, a mode that does not exist, a non-numeric count) refuse the whole preset, fail closed.
//   - Scope never crosses: a Look sets mode, layout params and a palette id — never FX, geometry or voice data.
//     Foreign fields, at the top level or inside layoutParams, are stripped, never carried through.
//   - Hostile or malformed JSON is refused, never thrown and never repaired; quarantining the bytes is the
//     caller's store concern, exactly as with project documents.
//
// Live-shape note: in the live scene the mode lives INSIDE the layout params and presets keep it there too
// (data/styleLooks.js, data/presets.js). The kc-look/1 payload names mode at the top level (the DLC spec's shape),
// so this module treats the top level as the one truth: a layoutParams.mode that disagrees refuses the preset,
// and the normalised layoutParams never repeats it.
import { MODE_IDS, DEFAULT_LAYOUT_PARAMS, PARAM_SPEC, validateLayoutParams } from './layout-modes.js';

export const KC_LOOK_FORMAT = 'kc-look';
/** The version this app writes. A kc-look/2 file is refused plainly until a migration is specced. */
export const KC_LOOK_VERSION = 1;

const FORMAT_RE = /^kc-look\/(\d{1,6})$/;
const formatTag = (v) => `${KC_LOOK_FORMAT}/${v}`;
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/** The layout-param key set a Look may carry: the live defaults plus every key the param spec names. */
const LAYOUT_KEYS = new Set([...Object.keys(DEFAULT_LAYOUT_PARAMS), ...Object.keys(PARAM_SPEC)]);

/**
 * The cheap first pass for a future loader: which kc-look version a value claims, or null when it does not claim
 * to be a Look preset at all. Sniffing is not validation — parseLookPreset is the authority.
 */
export function sniffLookFormat(value) {
  if (!isObj(value) || typeof value.format !== 'string') return null;
  const m = FORMAT_RE.exec(value.format);
  return m ? Number(m[1]) : null;
}

/** Which version a parsed value claims: { version }, or { version: null } when it is not a Look preset. */
function versionOf(raw) {
  if (!isObj(raw)) return { version: null };
  if (typeof raw.format === 'string') {
    const m = FORMAT_RE.exec(raw.format);
    return m ? { version: Number(m[1]) } : { version: null, badFormat: raw.format };
  }
  if ('format' in raw) return { version: null, badFormat: String(raw.format) };
  return { version: null };
}

// #642's seed rule, restated (projectDocument.js keeps its copy private): seeds are uint32. Oversized, negative,
// fractional or non-numeric seeds refuse with a clear message instead of silently truncating to 0 via `>>> 0`.
// Hex strings stay supported for legacy files.
const MAX_UINT32 = 0xffffffff;
function coerceSeed(raw) {
  let seed = raw;
  if (typeof seed === 'string') seed = parseInt(seed, 16);
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_UINT32) {
    return { ok: false, error: `Invalid seed: ${String(raw)}` };
  }
  return { ok: true, seed: seed >>> 0 };
}

/**
 * Validate and normalise an already-parsed value into a Look. Never throws.
 * @returns {{ ok: true, look: { format, mode, layoutParams, paletteId, seed? } } | { ok: false, error: string, newer?: true, found?: number }}
 *   The returned look is a fresh object carrying only Look-scope fields; layoutParams holds only the keys the
 *   author supplied (mode excluded — it lives at the top level), each clamped by the layout module.
 */
function normalizeLook(raw) {
  const { version, badFormat } = versionOf(raw);
  if (version === null) {
    return { ok: false, error: badFormat ? `unknown file format "${badFormat}"` : 'not a look preset' };
  }
  if (version > KC_LOOK_VERSION) {
    return {
      ok: false,
      newer: true,
      found: version,
      error: `made by a newer version of KC-1 (${formatTag(version)}); this app reads up to ${formatTag(KC_LOOK_VERSION)}`,
    };
  }
  if (version < KC_LOOK_VERSION) {
    return { ok: false, error: `no migration from ${formatTag(version)}` };
  }

  // mode: the top level is the one truth, and it must name a layout mode that exists. An unknown mode is not a
  // value at the edge of a range — the preset cannot be half-applied, so it refuses (validateLayoutParams' rule).
  if (typeof raw.mode !== 'string' || raw.mode === '') return { ok: false, error: 'a look preset needs a mode' };
  if (!MODE_IDS.includes(raw.mode)) return { ok: false, error: `unknown mode "${raw.mode}"` };
  const mode = raw.mode;

  // paletteId names the paired palette. Whether that palette exists is the applier's question (user palettes
  // live outside the built-in table, and a missing palette has its own honest message) — the type only
  // requires the name to be a name.
  if (typeof raw.paletteId !== 'string' || raw.paletteId === '')
    return { ok: false, error: 'a look preset needs a paletteId' };

  const lp = raw.layoutParams === undefined ? {} : raw.layoutParams;
  if (!isObj(lp)) return { ok: false, error: 'layoutParams must be an object of layout parameters' };
  if (lp.mode !== undefined && lp.mode !== mode) {
    return {
      ok: false,
      error: `layoutParams mode "${String(lp.mode)}" disagrees with the look's mode "${mode}"`,
    };
  }

  // The layout module is the trust boundary: structurally unreadable values come back named in `rejected`
  // (fail closed — refuse the preset), readable-but-out-of-range values come back clamped in `params`.
  const { params, rejected } = validateLayoutParams({ ...lp, mode });
  if (rejected.length > 0) {
    return { ok: false, error: `unreadable layoutParams: ${rejected.join(', ')}` };
  }
  // Project onto the keys the author actually supplied: normalizeLayoutParams fills every default, and a preset
  // must not silently invent the params it never named. Foreign keys (FX, geometry, voice data, prototype
  // names) are not in LAYOUT_KEYS and never survive.
  const layoutParams = {};
  for (const key of Object.keys(lp)) {
    if (key === 'mode') continue;
    if (LAYOUT_KEYS.has(key)) layoutParams[key] = params[key];
  }

  const look = { format: formatTag(KC_LOOK_VERSION), mode, layoutParams, paletteId: raw.paletteId };
  if (raw.seed !== undefined) {
    const seed = coerceSeed(raw.seed);
    if (!seed.ok) return seed;
    look.seed = seed.seed;
  }
  return { ok: true, look };
}

/**
 * Read a Look preset from JSON text or an already-parsed value. Never throws, never repairs.
 * @returns {{ ok: true, look } | { ok: false, error: string, newer?: true, found?: number }}
 */
export function parseLookPreset(input) {
  let raw = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      return { ok: false, error: `not readable as a look preset (${e.message})` };
    }
  }
  return normalizeLook(raw);
}

/**
 * Write a Look preset: always the CURRENT version, only Look-scope fields. Throws on input this module could
 * not read back, rather than writing a file that would refuse on open (writeSessionFile's rule).
 * @returns {string} JSON text, ending in a newline
 */
export function writeLookPreset(look) {
  if (!isObj(look)) throw new Error('writeLookPreset: look must be an object');
  const r = normalizeLook({ ...look, format: formatTag(KC_LOOK_VERSION) });
  if (!r.ok) throw new Error(`writeLookPreset: ${r.error}`);
  return `${JSON.stringify(r.look)}\n`;
}
