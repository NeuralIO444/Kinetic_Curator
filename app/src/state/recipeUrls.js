// state/recipeUrls.js — #534: kc-r/1, the recipe URL codec.
//
// A composition as a short URL fragment: `…/#r=kc-r/1.<base64url(JSON)>`.
// The JSON carries version first, then only what differs from the boot
// state: seed, nonzero sub-seed offsets, palette id + dirty overrides, and
// non-default layout params (delta-vs-defaults keeps links to hundreds of
// chars). OUT of v1: layers/snapshots, custom assets, user-palette
// definitions, lockedParams/caGrid, quality.
// kc-r/2 (#1131) adds the layer stack (extra KC tracks, FX, MATH, PATTERN) as one optional
// block (recipeStack.js). A scene with only one plain KC track still encodes as kc-r/1, byte for byte.
//
// Pure, node-importable: no React, no DOM, no store. Fail-closed: unknown
// version refuses, bad payloads return { ok:false } with a plain-language
// error — never throw on hostile input. The boot path (slice 3) turns a
// refusal into a clean boot + note.

import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { getCatalogPalette } from '../data/palettes.js';
import { RECIPE_OFFSET_CHANNELS, readSeedOffsets } from './recipes.js';
import { expandStack } from './recipeStack.js';

/** Version tag — cleartext prefix of every recipe URL. Bump on format change. */
export const RECIPE_URL_VERSION = 'kc-r/1';
export const RECIPE_URL_PREFIX = 'kc-r/1.';
export const RECIPE_URL_PREFIX_2 = 'kc-r/2.'; // #1131: carries the layer stack

/** Hash key: the share link is `…/#r=kc-r/1.…`. */
export const RECIPE_URL_HASH_KEY = 'r';

const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const _te = new TextEncoder();
const _td = new TextDecoder();

function b64urlEncodeBytes(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += B64URL_ALPHABET[(n >>> 18) & 63] + B64URL_ALPHABET[(n >>> 12) & 63];
    if (i + 1 < bytes.length) out += B64URL_ALPHABET[(n >>> 6) & 63];
    if (i + 2 < bytes.length) out += B64URL_ALPHABET[n & 63];
  }
  return out;
}

/** Throws on bad alphabet or impossible length. Trailing sub-byte bits are ignored. */
function b64urlDecodeToBytes(str) {
  if (typeof str !== 'string' || str.length === 0) throw new Error('empty payload');
  if (str.length % 4 === 1) throw new Error('bad payload length');
  const bytes = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < str.length; i++) {
    const v = B64URL_ALPHABET.indexOf(str[i]);
    if (v < 0) throw new Error(`bad character ${JSON.stringify(str[i])}`);
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >>> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/** Deep value equality for JSON-ish layout param values (primitives, arrays, plain objects). */
function valuesEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b)
      && a.length === b.length
      && a.every((v, i) => valuesEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => valuesEqual(a[k], b[k]));
  }
  return false;
}

function fail(error) {
  return { ok: false, error };
}

/**
 * Build the full shareable href for an encoded payload: the current page
 * minus any existing fragment, plus `#r=<payload>`. Pure — the fragment
 * never leaves the machine except by user copy.
 */
export function buildShareHref(payload, baseUrl) {
  const base = typeof baseUrl === 'string' ? baseUrl.split('#')[0] : '';
  return `${base}#${RECIPE_URL_HASH_KEY}=${payload}`;
}

/**
 * Find a kc-r/1 payload inside pasted text: a full share URL
 * (`…/#r=kc-r/1.…`), a bare `kc-r/1.…` payload, or either wrapped in
 * whitespace. Returns the payload string or null.
 */
export function extractRecipePayload(text) {
  if (typeof text !== 'string') return null;
  const m = /(kc-r\/[12]\.[A-Za-z0-9-_]+)/.exec(text);
  return m ? m[1] : null;
}

/**
 * Decide what a location hash means for boot. Returns:
 *   { status: 'none' }                          — no share fragment; boot normally.
 *   { status: 'bad', error }                     — fragment present but unreadable; clean boot + note.
 *   { status: 'ok', recipe }                     — fragment decodes; apply the recipe.
 * Pure — the hook applies the decision.
 */
export function parseBootHash(hash) {
  if (typeof hash !== 'string' || !hash) return { status: 'none' };
  const payload = extractRecipePayload(hash);
  if (!payload) {
    // A #r= key with nothing parseable in it is a bad link, not "no link".
    const m = /(?:^|&|#)r=/.exec(hash);
    if (m) return { status: 'bad', error: 'Share link is empty or unreadable — starting clean.' };
    return { status: 'none' };
  }
  const result = decodeRecipeUrl(payload);
  if (!result.ok) return { status: 'bad', error: result.error };
  return { status: 'ok', recipe: result.recipe };
}

/**
 * Check whether a recipe's palette id resolves on this machine. Returns null
 * when it does (catalog or a local user palette), else { requested, used } —
 * the apply path falls back via getCatalogPalette, and the boot note badges it.
 */
export function describePaletteFallback(paletteId, userPalettes) {
  if (typeof paletteId !== 'string' || !paletteId) return null;
  const extra = Array.isArray(userPalettes) ? userPalettes : [];
  const resolved = getCatalogPalette(paletteId, extra);
  if (resolved && resolved.id === paletteId) return null;
  return { requested: paletteId, used: resolved ? resolved.id : null };
}

/**
 * Encode recipe fields to a kc-r/1 URL string (the part after `#r=`).
 * Fields: { seed, seedOffsets, paletteId, paletteOverrides?, layoutParams }.
 * Accepts the same carrier shape as recipes.recipeFieldsFromKept — favorites
 * carry the identical field set, so favorite-as-link is this one function.
 */
export function encodeRecipeUrl(fields) {
  const f = (fields && typeof fields === 'object') ? fields : {};
  const stack = f.stack && typeof f.stack === 'object' ? f.stack : null;
  const payload = { v: stack ? 2 : 1, s: (f.seed >>> 0) };

  const offsets = readSeedOffsets({ seedOffsets: f.seedOffsets });
  const o = {};
  for (const ch of RECIPE_OFFSET_CHANNELS) {
    if (offsets[ch] !== 0) o[ch] = offsets[ch];
  }
  if (Object.keys(o).length) payload.o = o;

  if (typeof f.paletteId === 'string' && f.paletteId) payload.p = f.paletteId;
  if (f.paletteOverrides !== undefined && f.paletteOverrides !== null) payload.po = f.paletteOverrides;

  const layout = (f.layoutParams && typeof f.layoutParams === 'object') ? f.layoutParams : {};
  const l = {};
  const keys = new Set([...Object.keys(DEFAULT_LAYOUT_PARAMS), ...Object.keys(layout)]);
  for (const key of keys) {
    if (!valuesEqual(layout[key], DEFAULT_LAYOUT_PARAMS[key])) l[key] = layout[key];
  }
  // #1127 — ROTATE spin is always written, even at its default: a link that lacks it predates the field and means 0.
  l.rotateSpin = Number.isFinite(layout.rotateSpin) ? layout.rotateSpin : 0;
  if (Object.keys(l).length) payload.l = l;

  if (stack) payload.k = stack;
  return (stack ? RECIPE_URL_PREFIX_2 : RECIPE_URL_PREFIX) + b64urlEncodeBytes(_te.encode(JSON.stringify(payload)));
}

/**
 * Decode a kc-r/1 URL string back to recipe fields. Returns
 * { ok:true, recipe } or { ok:false, error } — never throws.
 * The recipe is render-ready: full seedOffsets, layoutParams merged over the
 * current defaults, paletteOverrides preserved for the apply path.
 */
export function decodeRecipeUrl(str) {
  if (typeof str !== 'string' || !str.trim()) return fail('Empty link — paste a recipe URL first.');
  const t = str.trim();
  if (!t.startsWith('kc-r/')) {
    return fail(`Not a recipe link: it should start with "${RECIPE_URL_PREFIX}".`);
  }
  if (!t.startsWith(RECIPE_URL_PREFIX) && !t.startsWith(RECIPE_URL_PREFIX_2)) {
    const m = /^kc-r\/([^.]+)\./.exec(t);
    const ver = m ? m[1] : '?';
    return fail(`Unknown recipe link version "kc-r/${ver}" — this build reads ${RECIPE_URL_VERSION} only.`);
  }
  const b64 = t.slice(RECIPE_URL_PREFIX.length); // both prefixes are 7 characters
  let json;
  try {
    json = JSON.parse(_td.decode(b64urlDecodeToBytes(b64), { fatal: true }));
  } catch {
    return fail('Bad recipe link: the payload is not readable. Starting from a clean scene.');
  }
  if (!isPlainObject(json)) return fail('Bad recipe link: the payload is not a recipe. Starting from a clean scene.');
  if (json.v !== 1 && json.v !== 2) {
    return fail(`Unknown recipe link version "kc-r/${json.v}" — this build reads kc-r/1 and kc-r/2.`);
  }
  if (json.v !== (t.startsWith(RECIPE_URL_PREFIX_2) ? 2 : 1)) return fail('Bad recipe link: its version does not match its payload. Starting from a clean scene.');
  if (typeof json.s !== 'number' || !Number.isFinite(json.s)) {
    return fail('Bad recipe link: the seed is missing. Starting from a clean scene.');
  }
  const seedOffsets = readSeedOffsets(null);
  if (json.o !== undefined) {
    if (!isPlainObject(json.o)) return fail('Bad recipe link: the offsets are malformed. Starting from a clean scene.');
    for (const ch of RECIPE_OFFSET_CHANNELS) {
      const v = json.o[ch];
      if (v !== undefined) {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          return fail('Bad recipe link: an offset is not a number. Starting from a clean scene.');
        }
        seedOffsets[ch] = Math.trunc(v);
      }
    }
  }
  let paletteId = null;
  if (json.p !== undefined && json.p !== null) {
    if (typeof json.p !== 'string') return fail('Bad recipe link: the palette id is malformed. Starting from a clean scene.');
    paletteId = json.p || null;
  }
  let paletteOverrides = null;
  if (json.po !== undefined && json.po !== null) {
    if (!isPlainObject(json.po)) return fail('Bad recipe link: the palette overrides are malformed. Starting from a clean scene.');
    paletteOverrides = json.po;
  }
  let layoutParams = { ...DEFAULT_LAYOUT_PARAMS, rotateSpin: 0 }; // #1127: absent in a link = the link predates spin
  if (json.l !== undefined) {
    if (!isPlainObject(json.l)) return fail('Bad recipe link: the layout params are malformed. Starting from a clean scene.');
    layoutParams = { ...layoutParams, ...json.l };
  }
  let stack = null;
  if (json.v === 2) {
    const ex = expandStack(json.k);
    if (!ex.ok) return fail(`Bad recipe link: ${ex.error}. Starting from a clean scene.`);
    stack = ex.stack;
  }
  return {
    ok: true,
    recipe: {
      version: json.v === 2 ? 'kc-r/2' : RECIPE_URL_VERSION,
      seed: json.s >>> 0,
      seedOffsets,
      paletteId,
      paletteOverrides,
      layoutParams,
      ...(stack ? { stack } : {}),
    },
  };
}
