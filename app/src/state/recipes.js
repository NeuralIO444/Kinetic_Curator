// state/recipes.js — #307: kc-recipe/1, the human-readable interchange format
// for kept renders.
//
// Every kept render already has a deterministic recipe (params + seed +
// sub-seed offsets once #305 lands). This module is the recipe as text:
//   - encodeRecipe(fields) -> plain text, one copy button's worth
//   - parseRecipe(text)    -> the exact scene fields, or a plain-language error
//   - recipeToProjectDoc(recipe) -> a doc for the existing EXPORT_LOAD_PROJECT
//     path, so pasting a recipe back restores the exact scene.
//
// Pure, node-importable: no React, no DOM, no store. The selfcheck covers the
// round-trip. Node-safe: copyTextToClipboard guards navigator/document.

/** Version tag — the first line of every recipe. Bump on format change. */
export const RECIPE_VERSION = 'kc-recipe/1';

/**
 * Sub-seed offset channels. Issue #305 stores these at state.seedOffsets as
 * { spatial, color, asset, noise }; that PR may not have landed, so every
 * read here is defensive: missing offsets are exactly 0, which #305
 * guarantees renders bit-identical to a seed with no offsets at all.
 */
export const RECIPE_OFFSET_CHANNELS = ['spatial', 'color', 'asset', 'noise'];

/**
 * Read sub-seed offsets defensively from any carrier. Works pre-#305 (no
 * field anywhere -> all zeros) and post-#305 (real values flow through), so
 * recipes automatically include offsets once #305 lands.
 */
export function readSeedOffsets(source) {
  const raw = (source && typeof source === 'object' && source.seedOffsets) || {};
  const out = {};
  for (const ch of RECIPE_OFFSET_CHANNELS) {
    const v = Number(raw[ch]);
    out[ch] = Number.isFinite(v) ? Math.trunc(v) : 0;
  }
  return out;
}

/**
 * Normalize any "kept render" carrier into recipe fields. Carriers:
 *   - live store state: { seed, seedOffsets, paletteId, layoutParams }
 *   - snapshot/favorite: { seed, seedOffsets?, config: { layout, palette: { id }, seedOffsets? } }
 * Offsets are read defensively at both the top level and inside config so a
 * snapshot keeps working whichever place #305's writer puts them.
 */
export function recipeFieldsFromKept(kept) {
  const k = (kept && typeof kept === 'object') ? kept : {};
  const config = (k.config && typeof k.config === 'object') ? k.config : {};
  const palette = (config.palette && typeof config.palette === 'object') ? config.palette : {};
  const layout = (config.layout && typeof config.layout === 'object' && !Array.isArray(config.layout))
    ? config.layout
    : (k.layoutParams && typeof k.layoutParams === 'object' ? k.layoutParams : {});
  return {
    seed: k.seed >>> 0,
    seedOffsets: readSeedOffsets({ seedOffsets: k.seedOffsets ?? config.seedOffsets }),
    paletteId: typeof palette.id === 'string' && palette.id ? palette.id
      : (typeof k.paletteId === 'string' && k.paletteId ? k.paletteId : null),
    layoutParams: { ...layout },
  };
}

/** Encode one value for a recipe line: JSON-first so numbers, booleans,
 *  arrays, and quoted strings round-trip exactly; bare words (palette ids,
 *  enum values) stay unquoted for hand-editing. */
function encodeValue(v) {
  if (typeof v === 'string' && /^[A-Za-z0-9_.-]+$/.test(v)) return v;
  const j = JSON.stringify(v);
  return j === undefined ? 'null' : j;
}

/**
 * Serialize recipe fields to the kc-recipe/1 text format. Layout params are
 * emitted sorted for stable, diff-friendly text.
 *
 *   kc-recipe/1
 *   seed: 0x1a2b3c4d
 *   palette: praystation
 *   seedOffset.spatial: 0
 *   ...
 *   layout.accumulation: false
 *   layout.blendMode: normal
 *   layout.scale: [0.4,1.6]
 */
export function encodeRecipe(fields) {
  const f = fields && typeof fields === 'object' ? fields : {};
  const seed = (f.seed >>> 0).toString(16);
  const offsets = readSeedOffsets({ seedOffsets: f.seedOffsets });
  const layout = (f.layoutParams && typeof f.layoutParams === 'object') ? f.layoutParams : {};
  const lines = [RECIPE_VERSION, `seed: 0x${seed}`];
  lines.push(`palette: ${typeof f.paletteId === 'string' && f.paletteId ? encodeValue(f.paletteId) : 'null'}`);
  for (const ch of RECIPE_OFFSET_CHANNELS) lines.push(`seedOffset.${ch}: ${offsets[ch]}`);
  for (const key of Object.keys(layout).sort()) {
    lines.push(`layout.${key}: ${encodeValue(layout[key])}`);
  }
  return lines.join('\n');
}

function fail(error) {
  return { ok: false, error };
}

/** Parse one recipe value: JSON first (numbers, booleans, arrays, quoted
 *  strings), falling back to the raw string so hand-typed bare words work. */
function parseValue(raw) {
  const t = raw.trim();
  if (t === '') return '';
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

/** Parse the seed line: 0x… is hex, all-digits is decimal, anything else is
 *  read as hex (the app has always displayed seeds in hex). */
function parseSeed(raw) {
  const t = raw.trim();
  if (/^0x[0-9a-fA-F]+$/.test(t)) return parseInt(t, 16) >>> 0;
  if (/^[0-9]+$/.test(t)) {
    const n = Number(t);
    if (Number.isSafeInteger(n)) return n >>> 0;
    return null;
  }
  if (/^[0-9a-fA-F]+$/.test(t)) return parseInt(t, 16) >>> 0;
  return null;
}

/**
 * Parse recipe text back into fields. Returns { ok: true, recipe } or
 * { ok: false, error } with a plain-language reason — never throws on
 * hostile input.
 */
export function parseRecipe(text) {
  if (typeof text !== 'string' || !text.trim()) return fail('Empty recipe — paste kc-recipe/1 text first.');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const [head, ...rest] = lines;
  if (head !== RECIPE_VERSION) {
    return fail(`Not a recipe: the first line must be "${RECIPE_VERSION}".`);
  }
  const recipe = {
    version: RECIPE_VERSION,
    seed: null,
    seedOffsets: readSeedOffsets(null),
    paletteId: null,
    layoutParams: {},
  };
  for (const line of rest) {
    const idx = line.indexOf(':');
    if (idx < 0) return fail(`Bad line (needs "key: value"): ${line}`);
    const key = line.slice(0, idx).trim();
    const rawVal = line.slice(idx + 1).trim();
    if (key === 'seed') {
      const s = parseSeed(rawVal);
      if (s === null) return fail(`Bad seed "${rawVal}" — use 0x… hex or a plain number.`);
      recipe.seed = s;
    } else if (key === 'palette') {
      const v = parseValue(rawVal);
      recipe.paletteId = typeof v === 'string' && v ? v : null;
    } else if (key.startsWith('seedOffset.')) {
      const ch = key.slice('seedOffset.'.length);
      if (!RECIPE_OFFSET_CHANNELS.includes(ch)) return fail(`Unknown offset channel "${ch}".`);
      const n = Number(rawVal);
      if (!Number.isFinite(n)) return fail(`Bad offset for "${ch}": "${rawVal}" is not a number.`);
      recipe.seedOffsets[ch] = Math.trunc(n);
    } else if (key.startsWith('layout.')) {
      const param = key.slice('layout.'.length);
      if (!param || param.includes('.')) return fail(`Bad layout key "${key}".`);
      recipe.layoutParams[param] = parseValue(rawVal);
    } else {
      return fail(`Unknown recipe key "${key}".`);
    }
  }
  if (recipe.seed === null) return fail('Recipe has no seed line.');
  return { ok: true, recipe };
}

/**
 * Build a project document from a parsed recipe, for the existing
 * EXPORT_LOAD_PROJECT -> applyProject path. Pre-#305, applyProject ignores
 * the unknown seedOffsets key (it builds its apply set from known fields
 * only); post-#305 the sibling task can pick it up — and the UI also applies
 * offsets through the store setter when one exists, so both orders work.
 */
export function recipeToProjectDoc(recipe) {
  return {
    version: 1,
    seed: recipe.seed >>> 0,
    paletteId: recipe.paletteId,
    layoutParams: { ...recipe.layoutParams },
    seedOffsets: { ...recipe.seedOffsets },
  };
}

/**
 * Best-effort clipboard write; resolves true on success. Tries the async
 * clipboard API, then the legacy execCommand path. Node-safe: resolves
 * false with no DOM.
 */
export async function copyTextToClipboard(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch {
    return false;
  }
}
