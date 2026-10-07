// state/recipeStack.js — the layer stack inside a recipe (kc-recipe/2, kc-r/2).
//
// v1 recipes and share links carried one scene: seed, palette, layout. Everything else about a piece (extra KC
// tracks, FX, MATH, PATTERN tracks) was lost on share and on keep. v2 adds ONE optional block, the stack:
//   { l: layers, a: activeLayerId, n: { <kcLayerId>: { s, o?, p, po?, l, e } } }
// `n` is a save state for every KC track that is not the active one (the active track's state IS the recipe's
// top-level seed / palette / layout). Layout is delta-vs-defaults, like the link's own layout block.
//
// A scene with nothing beyond one plain KC track has NO stack, so its recipe and link are byte-identical to v1
// and older builds still open them. Pure and node-importable. Fail-closed: a damaged stack is refused with a
// plain-language error; it never throws and never reaches the store un-normalized.
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { normalizeLayers, normalizeSnapshots } from './projectNormalize.js';

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** One plain KC track, nothing else: a v1 scene. */
export function isTrivialStack(layers) {
  if (!Array.isArray(layers) || layers.length === 0) return true;
  if (layers.length > 1) return false;
  const l = layers[0];
  return !!l && l.type === 'content' && l.visible !== false && (l.layerBlendMode ?? 'normal') === 'normal'
    && (l.layerOpacity ?? 1) === 1 && (!l.patch || l.patch.mode === 'off') && !l.matte;
}

const enabledIds = (map) => (isObj(map) ? Object.keys(map).filter((k) => map[k]).sort() : []);

/**
 * The compact stack of any carrier: the live store ({ layers, activeLayerId, layerSnapshots }) or a keep that
 * stored one ({ stack: <compact> } is returned as is). Null when there is nothing to carry.
 */
export function stackOf(src) {
  if (!isObj(src)) return null;
  if (isObj(src.stack)) return src.stack;
  if (!Array.isArray(src.layers) || isTrivialStack(src.layers)) return null;
  const { layers, activeLayerId } = normalizeLayers(src.layers, src.activeLayerId);
  if (!layers || isTrivialStack(layers)) return null;
  const n = {};
  const snaps = isObj(src.layerSnapshots) ? src.layerSnapshots : {};
  for (const l of layers) {
    if (l.type !== 'content' || l.id === activeLayerId || !isObj(snaps[l.id])) continue;
    const s = snaps[l.id];
    const lay = isObj(s.layoutParams) ? s.layoutParams : {};
    const delta = {};
    for (const k of new Set([...Object.keys(DEFAULT_LAYOUT_PARAMS), ...Object.keys(lay)])) if (!same(lay[k], DEFAULT_LAYOUT_PARAMS[k])) delta[k] = lay[k];
    const o = {};
    for (const [ch, v] of Object.entries(isObj(s.seedOffsets) ? s.seedOffsets : {})) if (Number.isFinite(v) && v !== 0) o[ch] = Math.trunc(v);
    n[l.id] = {
      s: Number(s.seed) >>> 0,
      ...(Object.keys(o).length ? { o } : {}),
      p: typeof s.paletteId === 'string' ? s.paletteId : '',
      ...(s.paletteOverrides ? { po: s.paletteOverrides } : {}),
      ...(Object.keys(delta).length ? { l: delta } : {}),
      e: enabledIds(s.enabledAssets),
    };
  }
  return { l: JSON.parse(JSON.stringify(layers)), a: activeLayerId, n };
}

/**
 * Compact stack -> { ok:true, stack:{ layers, activeLayerId, layerSnapshots } } ready for applyProject,
 * or { ok:false, error }. Everything goes through the project normalizers.
 */
export function expandStack(compact) {
  if (!isObj(compact) || !Array.isArray(compact.l)) return { ok: false, error: 'the layer stack is malformed' };
  const { layers, activeLayerId } = normalizeLayers(compact.l, compact.a);
  if (!layers) return { ok: false, error: 'the layer stack has no usable tracks' };
  const raw = {};
  for (const [id, s] of Object.entries(isObj(compact.n) ? compact.n : {})) {
    if (!isObj(s)) continue;
    raw[id] = {
      seed: Number(s.s) >>> 0,
      seedOffsets: isObj(s.o) ? s.o : {},
      paletteId: typeof s.p === 'string' && s.p ? s.p : undefined,
      paletteOverrides: isObj(s.po) ? s.po : null,
      layoutParams: { ...DEFAULT_LAYOUT_PARAMS, ...(isObj(s.l) ? s.l : {}) },
      enabledAssets: Object.fromEntries((Array.isArray(s.e) ? s.e : []).filter((k) => typeof k === 'string').map((k) => [k, true])),
    };
  }
  const layerSnapshots = normalizeSnapshots(raw, [], {}, layers.filter((l) => l.type === 'content').map((l) => l.id));
  return { ok: true, stack: { layers, activeLayerId, layerSnapshots } };
}
