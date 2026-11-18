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
// kc-r/3 (#2324) carries the whole scene: `{ v:3, d, b, s, o?, p?, po?, l?, x?, k?, n? }`, deflate-raw then base64url.
// `d` is the layout-defaults epoch the layout delta is against (data/recipeDefaults), `b` the build that wrote
// the link, `x` the scene block (recipeSceneKeys.js), `k` the layer stack, `n` how many custom assets did not fit
// the 8 KB budget and were left out. Writers emit v3 only; readers accept 1, 2 and 3. The v3 codec is async
// (CompressionStream), so decodeRecipeUrl and parseBootHash are too.
//
// Pure, node-importable: no React, no DOM, no store. Fail-closed: unknown
// version refuses, bad payloads return { ok:false } with a plain-language
// error — never throw on hostile input. The boot path (slice 3) turns a
// refusal into a clean boot + note.

import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { getCatalogPalette } from '../data/palettes.js';
import { RECIPE_OFFSET_CHANNELS, readSeedOffsets } from './recipes.js';
import { expandStack, stackOf } from './recipeStack.js';
import { LAYOUT_DEFAULTS_EPOCH, defaultsForEpoch } from '../data/recipeDefaults/index.js';
import { sceneBlockFrom } from './recipeSceneKeys.js';

/** Version tag — cleartext prefix of every recipe URL. Bump on format change. */
export const RECIPE_URL_VERSION = 'kc-r/1';
export const RECIPE_URL_PREFIX = 'kc-r/1.';
export const RECIPE_URL_PREFIX_2 = 'kc-r/2.'; // #1131: carries the layer stack
export const RECIPE_URL_PREFIX_3 = 'kc-r/3.'; // #2324: carries the whole scene

/** Custom assets travel when their deflated JSON is at most this many bytes (Matt, 2026-11-17); above it they are left out. */
export const RECIPE_CUSTOM_ASSET_BUDGET = 8 * 1024;
/** A v3 payload may inflate to at most this much: a hostile link must not be able to fill memory. */
export const RECIPE_MAX_INFLATED_BYTES = 1024 * 1024;
const READS = 'kc-r/1, kc-r/2 and kc-r/3';

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

async function deflateRaw(bytes) {
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  w.write(bytes).catch(() => {});
  w.close().catch(() => {});
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

/** Inflate with a hard cap on the output; throws a `tooLarge` error the moment the cap is passed. */
async function inflateRaw(bytes, cap) {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(bytes).catch(() => {});
  w.close().catch(() => {});
  const r = ds.readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await r.cancel().catch(() => {});
      throw Object.assign(new Error('too large'), { tooLarge: true });
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/** Deep value equality for JSON-ish layout param values (primitives, arrays, plain objects). */
function valuesEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => valuesEqual(v, b[i]));
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
 * Find a kc-r payload inside pasted text: a full share URL
 * (`…/#r=kc-r/3.…`), a bare `kc-r/3.…` payload, or either wrapped in
 * whitespace. Returns the payload string or null.
 */
export function extractRecipePayload(text) {
  if (typeof text !== 'string') return null;
  const m = /(kc-r\/[123]\.[A-Za-z0-9-_]+)/.exec(text);
  return m ? m[1] : null;
}

/**
 * Decide what a location hash means for boot. Returns:
 *   { status: 'none' }                          — no share fragment; boot normally.
 *   { status: 'bad', error }                     — fragment present but unreadable; clean boot + note.
 *   { status: 'ok', recipe }                     — fragment decodes; apply the recipe.
 * Async (a v3 link inflates through DecompressionStream). Pure — the hook applies the decision.
 */
export async function parseBootHash(hash) {
  if (typeof hash !== 'string' || !hash) return { status: 'none' };
  const payload = extractRecipePayload(hash);
  if (!payload) {
    // A #r= key with nothing parseable in it is a bad link, not "no link".
    const m = /(?:^|&|#)r=/.exec(hash);
    if (m) return { status: 'bad', error: 'Share link is empty or unreadable — starting clean.' };
    return { status: 'none' };
  }
  const result = await decodeRecipeUrl(payload);
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
 * The v1/v2 writer, kept so old links stay reproducible in tests and for any caller that must emit one. The app
 * writes v3 (encodeRecipeUrl below).
 * Fields: { seed, seedOffsets, paletteId, paletteOverrides?, layoutParams }.
 * Accepts the same carrier shape as recipes.recipeFieldsFromKept.
 */
export function encodeRecipeUrlV12(fields) {
  const f = fields && typeof fields === 'object' ? fields : {};
  const stack = f.stack && typeof f.stack === 'object' ? f.stack : null;
  const payload = { v: stack ? 2 : 1, s: f.seed >>> 0 };

  const offsets = readSeedOffsets({ seedOffsets: f.seedOffsets });
  const o = {};
  for (const ch of RECIPE_OFFSET_CHANNELS) {
    if (offsets[ch] !== 0) o[ch] = offsets[ch];
  }
  if (Object.keys(o).length) payload.o = o;

  if (typeof f.paletteId === 'string' && f.paletteId) payload.p = f.paletteId;
  if (f.paletteOverrides !== undefined && f.paletteOverrides !== null) payload.po = f.paletteOverrides;

  const layout = f.layoutParams && typeof f.layoutParams === 'object' ? f.layoutParams : {};
  const l = {};
  const keys = new Set([...Object.keys(DEFAULT_LAYOUT_PARAMS), ...Object.keys(layout)]);
  for (const key of keys) {
    if (!valuesEqual(layout[key], DEFAULT_LAYOUT_PARAMS[key])) l[key] = layout[key];
  }
  // #1127 — ROTATE spin is always written, even at its default: a link that lacks it predates the field and means 0.
  // #1128: so are the two living-motion amounts (breath, drift): a link without them predates the floor.
  // #1151: palette-breath likewise.
  for (const k of ['rotateSpin', 'kinemeBreath', 'kinemeDrift', 'kinemePaletteBreath'])
    l[k] = Number.isFinite(layout[k]) ? layout[k] : 0;
  if (Object.keys(l).length) payload.l = l;

  if (stack) payload.k = stack;
  return (stack ? RECIPE_URL_PREFIX_2 : RECIPE_URL_PREFIX) + b64urlEncodeBytes(_te.encode(JSON.stringify(payload)));
}

/**
 * Decode a kc-r/1 or kc-r/2 URL string (the original, synchronous reader; unchanged by v3). Returns
 * { ok:true, recipe } or { ok:false, error } — never throws.
 * The recipe is render-ready: full seedOffsets, layoutParams merged over the
 * current defaults, paletteOverrides preserved for the apply path.
 */
function decodeLegacyUrl(t) {
  const b64 = t.slice(RECIPE_URL_PREFIX.length); // both prefixes are 7 characters
  let json;
  try {
    json = JSON.parse(_td.decode(b64urlDecodeToBytes(b64), { fatal: true }));
  } catch {
    return fail('Bad recipe link: the payload is not readable. Starting from a clean scene.');
  }
  if (!isPlainObject(json)) return fail('Bad recipe link: the payload is not a recipe. Starting from a clean scene.');
  if (json.v !== 1 && json.v !== 2) {
    return fail(`Unknown recipe link version "kc-r/${json.v}" — this build reads ${READS}.`);
  }
  if (json.v !== (t.startsWith(RECIPE_URL_PREFIX_2) ? 2 : 1))
    return fail('Bad recipe link: its version does not match its payload. Starting from a clean scene.');
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
    if (typeof json.p !== 'string')
      return fail('Bad recipe link: the palette id is malformed. Starting from a clean scene.');
    paletteId = json.p || null;
  }
  let paletteOverrides = null;
  if (json.po !== undefined && json.po !== null) {
    if (!isPlainObject(json.po))
      return fail('Bad recipe link: the palette overrides are malformed. Starting from a clean scene.');
    paletteOverrides = json.po;
  }
  let layoutParams = {
    ...DEFAULT_LAYOUT_PARAMS,
    rotateSpin: 0,
    kinemeBreath: 0,
    kinemeDrift: 0,
    kinemePaletteBreath: 0,
  }; // #1127/#1128/#1151: absent in a link = it predates them
  if (json.l !== undefined) {
    if (!isPlainObject(json.l))
      return fail('Bad recipe link: the layout params are malformed. Starting from a clean scene.');
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

/**
 * The build that writes a link (`b`): the build stamp (git short sha) when there is one, else the package version.
 */
export function defaultBuildId() {
  // The exact `import.meta.env.VITE_*` expressions, so Vite's define replaces them in a build; under plain node
  // import.meta.env is undefined and the read throws, which is the "no stamp" case.
  let stamp = '';
  let ver = '';
  try {
    stamp = import.meta.env.VITE_BUILD_ID;
  } catch {
    // plain node
  }
  try {
    ver = import.meta.env.VITE_APP_VERSION;
  } catch {
    // plain node
  }
  if (typeof stamp === 'string' && stamp && stamp !== 'dev') return stamp.slice(0, 40);
  return typeof ver === 'string' && ver ? ver.slice(0, 40) : 'dev';
}

/**
 * Apply the custom-asset budget to a scene block: the assets stay when their deflated JSON is at most
 * RECIPE_CUSTOM_ASSET_BUDGET bytes, else they are all left out. Returns { scene, dropped } — `dropped` is how many
 * assets were left out (0 when none were).
 */
export async function fitCustomAssets(scene) {
  const sc = scene && typeof scene === 'object' ? scene : {};
  const assets = sc.customAssets;
  if (!Array.isArray(assets) || assets.length === 0) return { scene: sc, dropped: 0 };
  const size = (await deflateRaw(_te.encode(JSON.stringify(assets)))).length;
  if (size <= RECIPE_CUSTOM_ASSET_BUDGET) return { scene: sc, dropped: 0 };
  const { customAssets, ...rest } = sc; // eslint-disable-line no-unused-vars
  return { scene: rest, dropped: assets.length };
}

/** The badge text for a link whose custom assets did not fit ("2 custom assets not in link"), or null. */
export function describeDroppedAssets(n) {
  const c = Number.isInteger(n) ? n : 0;
  if (c <= 0) return null;
  return `${c} custom asset${c === 1 ? '' : 's'} not in link`;
}

/**
 * Encode recipe fields to a kc-r/3 URL string (the part after `#r=`). Async: the payload is deflated.
 * Fields: { seed, seedOffsets, paletteId, paletteOverrides?, layoutParams, stack?, scene? } — `scene` is the scene
 * block (recipeSceneKeys.pickSceneBlock of `sceneOf(state)`); a carrier without one (a favorite) writes no `x`.
 * The layout is a delta against the frozen defaults of the epoch the link names, never the live defaults.
 * opts: { buildId }.
 */
export async function encodeRecipeUrl(fields, opts = {}) {
  const f = fields && typeof fields === 'object' ? fields : {};
  const epoch = LAYOUT_DEFAULTS_EPOCH;
  const defaults = defaultsForEpoch(epoch);
  const payload = {
    v: 3,
    d: epoch,
    b: typeof opts.buildId === 'string' && opts.buildId ? opts.buildId : defaultBuildId(),
    s: f.seed >>> 0,
  };

  const offsets = readSeedOffsets({ seedOffsets: f.seedOffsets });
  const o = {};
  for (const ch of RECIPE_OFFSET_CHANNELS) {
    if (offsets[ch] !== 0) o[ch] = offsets[ch];
  }
  if (Object.keys(o).length) payload.o = o;

  if (typeof f.paletteId === 'string' && f.paletteId) payload.p = f.paletteId;
  if (f.paletteOverrides !== undefined && f.paletteOverrides !== null) payload.po = f.paletteOverrides;

  // No always-write list here: a v3 link is read against its own epoch, so an absent key means the epoch's default.
  const layout = f.layoutParams && typeof f.layoutParams === 'object' ? f.layoutParams : {};
  const l = {};
  for (const key of new Set([...Object.keys(defaults), ...Object.keys(layout)])) {
    if (layout[key] !== undefined && !valuesEqual(layout[key], defaults[key])) l[key] = layout[key];
  }
  if (Object.keys(l).length) payload.l = l;

  const { scene, dropped } = await fitCustomAssets(sceneBlockFrom(f.scene));
  if (Object.keys(scene).length) payload.x = scene;
  if (dropped > 0) payload.n = dropped;

  const stack = stackOf(f, defaults);
  if (stack) payload.k = stack;

  return RECIPE_URL_PREFIX_3 + b64urlEncodeBytes(await deflateRaw(_te.encode(JSON.stringify(payload))));
}

async function decodeV3Url(t) {
  let json;
  try {
    const raw = await inflateRaw(b64urlDecodeToBytes(t.slice(RECIPE_URL_PREFIX_3.length)), RECIPE_MAX_INFLATED_BYTES);
    json = JSON.parse(_td.decode(raw, { fatal: true }));
  } catch (e) {
    if (e && e.tooLarge)
      return fail('Bad recipe link: it unpacks to far more than a scene holds. Starting from a clean scene.');
    return fail('Bad recipe link: the payload is not readable. Starting from a clean scene.');
  }
  if (!isPlainObject(json)) return fail('Bad recipe link: the payload is not a recipe. Starting from a clean scene.');
  if (json.v !== 3) {
    return json.v === 1 || json.v === 2
      ? fail('Bad recipe link: its version does not match its payload. Starting from a clean scene.')
      : fail(`Unknown recipe link version "kc-r/${json.v}" — this build reads ${READS}.`);
  }
  if (!Number.isInteger(json.d) || json.d < 1) {
    return fail('Bad recipe link: its layout-defaults epoch is missing. Starting from a clean scene.');
  }
  const defaults = defaultsForEpoch(json.d);
  if (!defaults) {
    return fail(`This link was made by a newer build (layout defaults epoch ${json.d}) — update to open it.`);
  }
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
    if (typeof json.p !== 'string')
      return fail('Bad recipe link: the palette id is malformed. Starting from a clean scene.');
    paletteId = json.p || null;
  }
  let paletteOverrides = null;
  if (json.po !== undefined && json.po !== null) {
    if (!isPlainObject(json.po))
      return fail('Bad recipe link: the palette overrides are malformed. Starting from a clean scene.');
    paletteOverrides = json.po;
  }
  let layoutParams = { ...defaults };
  if (json.l !== undefined) {
    if (!isPlainObject(json.l))
      return fail('Bad recipe link: the layout params are malformed. Starting from a clean scene.');
    layoutParams = { ...layoutParams, ...json.l };
  }
  if (json.x !== undefined && !isPlainObject(json.x)) {
    return fail('Bad recipe link: the scene block is malformed. Starting from a clean scene.');
  }
  let stack = null;
  if (json.k !== undefined) {
    const ex = expandStack(json.k, defaults);
    if (!ex.ok) return fail(`Bad recipe link: ${ex.error}. Starting from a clean scene.`);
    stack = ex.stack;
  }
  return {
    ok: true,
    recipe: {
      version: 'kc-r/3',
      seed: json.s >>> 0,
      seedOffsets,
      paletteId,
      paletteOverrides,
      layoutParams,
      ...(stack ? { stack } : {}),
      scene: sceneBlockFrom(json.x),
      layoutEpoch: json.d,
      buildId: typeof json.b === 'string' ? json.b.slice(0, 40) : null,
      droppedCustomAssets: Number.isInteger(json.n) && json.n > 0 ? Math.min(json.n, 9999) : 0,
    },
  };
}

/**
 * Decode a kc-r/1, kc-r/2 or kc-r/3 URL string back to recipe fields. Async (v3 inflates through
 * DecompressionStream). Returns { ok:true, recipe } or { ok:false, error } — never throws. A v1/v2 link decodes
 * exactly as it always has; a v3 recipe carries `scene` (the scene block), `layoutEpoch`, `buildId` and
 * `droppedCustomAssets`, and is applied with `replaceAll` (recipes.recipeApplyOptions).
 */
export async function decodeRecipeUrl(str) {
  if (typeof str !== 'string' || !str.trim()) return fail('Empty link — paste a recipe URL first.');
  const t = str.trim();
  if (!t.startsWith('kc-r/')) {
    return fail(`Not a recipe link: it should start with "${RECIPE_URL_PREFIX}".`);
  }
  if (t.startsWith(RECIPE_URL_PREFIX_3)) return decodeV3Url(t);
  if (!t.startsWith(RECIPE_URL_PREFIX) && !t.startsWith(RECIPE_URL_PREFIX_2)) {
    const m = /^kc-r\/([^.]+)\./.exec(t);
    const ver = m ? m[1] : '?';
    return fail(`Unknown recipe link version "kc-r/${ver}" — this build reads ${READS}.`);
  }
  return decodeLegacyUrl(t);
}
