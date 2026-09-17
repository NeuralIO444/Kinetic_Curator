/**
 * GL scene contract — Phase 0 (#186).
 *
 * The exact data the future WebGL backend consumes, built from the app's
 * existing resolved-layer data with no GL code and no store/schema changes.
 * The builder is a pure data transform: resolveLayers() output + project
 * doc + render caps in, versioned scene object out.
 *
 * Frozen decisions baked in:
 * - Effect stacks execute top-down in array order (#185): the first effect
 *   reads the layer's source, each later effect reads the previous effect's
 *   output. The contract records the stack verbatim (sanitized); Phase 2
 *   changes only the compiler target, never the order.
 * - An FX layer wraps all content accumulated below it (buildLayerStack
 *   fold); the precomputed `fxWraps` array captures that fold exactly.
 * - Filter rasterization stays outside the determinism contract (as in
 *   fxFilters.js) — parity for FX scenes uses the relaxed policy.
 *
 * Versioning: GL_CONTRACT_VERSION bumps on any breaking shape change.
 * Additive fields do not bump the version. Consumers must reject
 * `version` values they don't understand.
 */

import { sanitizeFxEffects, FX_EFFECT_KINDS } from '../fx/fxFilters.js';

export const GL_CONTRACT_VERSION = 1;

/** Canvas the contract is built for (matches studio/render.mjs). */
export const CONTRACT_CANVAS = Object.freeze({ w: 1000, h: 700 });

const KNOWN_BLENDS = new Set([
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference',
  'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'plus-lighter',
]);

const r3 = (v) => Math.round(Number(v) * 1000) / 1000;
const clamp01 = (v) => Math.min(1, Math.max(0, Number(v)));

/**
 * Sanitize a doc layer's `matte` field (#154 re-plan, landed in #189 as a
 * mask texture — never the SVG mask/feColorMatrix path).
 *
 * Shape: { sourceId, mode: 'alpha'|'luma', invert }. Returns null when the
 * field is absent or unusable; the backend then renders the layer normally
 * (fail closed). Additive: does not bump GL_CONTRACT_VERSION.
 */
export function sanitizeMatte(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.sourceId !== 'string' || !raw.sourceId) return null;
  return {
    sourceId: raw.sourceId,
    mode: raw.mode === 'luma' ? 'luma' : 'alpha',
    invert: !!raw.invert,
  };
}

function hexColor(c, fallback = '#000000') {
  const s = String(c || '');
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : fallback;
}

/**
 * Map one placement item to a contract instance (an instanced quad).
 * Draw order = array order; the backend must not re-sort.
 */
function toInstance(item, layerId, itemBlend) {
  const s = Number(item.scale) || 0;
  const mirrored = !!item._mirrored;
  return {
    asset: String(item.assetId),
    layer: layerId,
    x: r3(item.x),
    y: r3(item.y),
    scaleX: r3(mirrored ? -s : s),
    scaleY: r3(s),
    rotation: r3(item.rotation), // degrees, clockwise (SVG convention)
    tint: hexColor(item.color),
    accent: hexColor(item.accent),
    opacity: clamp01((Number(item.alpha) || 0) / 100),
    blend: KNOWN_BLENDS.has(itemBlend) ? itemBlend : 'normal',
    zTier: Number(item.zTier) || 0,
    key: String(item.key ?? ''),
  };
}

/**
 * Precompute the buildLayerStack fold: FX layers wrap the content
 * accumulated below them. Returns ordered wrap groups; each group names
 * the FX layer, its filter id, its opacity, and the content layer ids it
 * wraps (bottom-up). Content layers above the topmost FX layer, or with
 * no FX layer below them, are not wrapped.
 *
 * Mirrors studio/render.mjs exactly, including the shed rules: the tier's
 * maxFxLayers budget drops FX layers past the budget, and a layer whose
 * effects sanitize to nothing produces no filter (fxFilterStringForLayer
 * returns null) — both pass content through unwrapped (no wrap entry).
 */
function buildFxWraps(resolvedLayers, caps) {
  const wraps = [];
  const maxFx = caps?.maxFxLayers ?? Infinity;
  let acc = [];
  let fxIndex = 0;
  for (const rl of resolvedLayers) {
    if (rl.isFx) {
      const fx = sanitizeFxEffects(rl.layer?.effects);
      if (acc.length > 0 && fxIndex < maxFx && fx.length > 0) {
        wraps.push({
          fxLayerId: rl.id,
          filterId: `fx-${String(rl.id).replace(/[^A-Za-z0-9_-]/g, '_')}`,
          opacity: clamp01(rl.layerOpacity ?? 1),
          contentLayerIds: acc.map((l) => l.id),
        });
      }
      acc = [];
      fxIndex += 1;
    } else {
      acc.push(rl);
    }
  }
  return wraps;
}

/**
 * Build the scene contract.
 *
 * @param {object} args
 * @param {object} args.doc — project document (seed, quality, layers…)
 * @param {Array} args.resolvedLayers — resolveLayers(doc, {caps}) output
 * @param {object} [args.caps] — render caps (recorded for provenance)
 * @param {object|null} [args.accum] — { enabled, fade, background } or null
 * @returns versioned, JSON-serializable scene object
 */
export function buildSceneContract({ doc, resolvedLayers, caps = null, accum = null }) {
  if (!doc || typeof doc !== 'object') throw new TypeError('buildSceneContract: doc required');
  if (!Array.isArray(resolvedLayers)) throw new TypeError('buildSceneContract: resolvedLayers required');

  const layers = [];
  const instances = [];
  const assetIds = new Set();
  // Doc layers are looked up by id for fields resolveLayers() doesn't
  // forward (matte); the app model itself is untouched (#189).
  const docLayerById = new Map(
    (doc.layers || []).filter((l) => l && l.id != null).map((l) => [String(l.id), l])
  );

  for (const rl of resolvedLayers) {
    if (rl.isFx) {
      layers.push({
        id: String(rl.id),
        name: String(rl.layer?.name ?? rl.id),
        type: 'fx',
        visible: true, // resolved layers are pre-filtered for visibility
        opacity: clamp01(rl.layerOpacity ?? rl.layer?.layerOpacity ?? 1),
        blend: 'normal', // FX wrap groups carry no blend mode (buildLayerStack)
        fx: sanitizeFxEffects(rl.layer?.effects), // top-down, #185 order preserved
        matte: sanitizeMatte(rl.layer?.matte),
      });
      continue;
    }
    const layerId = String(rl.id);
    const itemBlend = rl.layoutParams?.blendMode || 'normal';
    layers.push({
      id: layerId,
      name: String(rl.layer?.name ?? layerId),
      type: 'content',
      visible: true,
      opacity: clamp01(rl.layerOpacity ?? 1),
      blend: KNOWN_BLENDS.has(rl.layerBlendMode) ? rl.layerBlendMode : 'normal',
      matte: sanitizeMatte(docLayerById.get(layerId)?.matte),
      layout: {
        blendMode: KNOWN_BLENDS.has(itemBlend) ? itemBlend : 'normal',
        hueRotate: Number(rl.layoutParams?.hueRotate) || 0,
      },
    });
    for (const item of rl.items || []) {
      assetIds.add(String(item.assetId));
      instances.push(toInstance(item, layerId, itemBlend));
    }
  }

  const scene = {
    version: GL_CONTRACT_VERSION,
    canvas: { w: CONTRACT_CANVAS.w, h: CONTRACT_CANVAS.h },
    seed: Number(doc.seed) >>> 0,
    quality: String(doc.quality || 'balanced'),
    atlas: {
      // Phase 1 fills uv rects when assets are baked to the texture atlas.
      // Phase 0 records the referenced asset ids (100x100 source box each).
      assets: [...assetIds].sort().map((id) => ({ id, w: 100, h: 100, uv: null })),
    },
    layers,
    compositeOrder: layers.map((l) => l.id), // bottom -> top; backend draws in this order
    fxWraps: buildFxWraps(resolvedLayers, caps),
    instances, // draw order = array order within each layer's slice
    textRuns: [], // reserved for Phase 1 glyph atlas; text is baked into stamp assets today
    accum: accum && accum.enabled
      ? {
          enabled: true,
          fade: Math.min(0.99, Math.max(0, Number(accum.fade ?? 0.88))),
          background: hexColor(accum.background, '#000000'),
        }
      : null,
    provenance: {
      contractVersion: GL_CONTRACT_VERSION,
      caps: caps ? { ...caps } : null,
    },
  };
  assertSceneContract(scene);
  return scene;
}

/**
 * Validate a scene contract. Throws on the first violation.
 * Unknown effect kinds are rejected here (the builder sanitizes, so a
 * hand-built scene with an unknown kind is a bug, not data).
 */
export function assertSceneContract(scene) {
  const fail = (msg) => { throw new Error(`sceneContract: ${msg}`); };
  if (!scene || typeof scene !== 'object') fail('scene must be an object');
  if (scene.version !== GL_CONTRACT_VERSION) fail(`unsupported version ${scene.version}`);
  if (!scene.canvas || !Number.isFinite(scene.canvas.w) || !Number.isFinite(scene.canvas.h)) {
    fail('canvas.w/h must be finite numbers');
  }
  if (!Array.isArray(scene.layers)) fail('layers must be an array');
  if (!Array.isArray(scene.instances)) fail('instances must be an array');
  if (!Array.isArray(scene.textRuns)) fail('textRuns must be an array');
  if (!Array.isArray(scene.fxWraps)) fail('fxWraps must be an array');
  const layerIds = new Set();
  for (const l of scene.layers) {
    if (!l.id || layerIds.has(l.id)) fail(`duplicate or missing layer id: ${l.id}`);
    layerIds.add(l.id);
    if (l.type !== 'content' && l.type !== 'fx') fail(`layer ${l.id}: bad type ${l.type}`);
    if (l.matte !== null && l.matte !== undefined) {
      const m = l.matte;
      if (typeof m !== 'object' || typeof m.sourceId !== 'string' || !m.sourceId) {
        fail(`layer ${l.id}: matte.sourceId must be a non-empty string`);
      }
      if (m.mode !== 'alpha' && m.mode !== 'luma') fail(`layer ${l.id}: matte.mode must be alpha|luma`);
      if (typeof m.invert !== 'boolean') fail(`layer ${l.id}: matte.invert must be boolean`);
    }
    if (l.type === 'fx') {
      if (!Array.isArray(l.fx)) fail(`fx layer ${l.id}: fx must be an array`);
      for (const fx of l.fx) {
        if (!FX_EFFECT_KINDS.includes(fx.kind)) fail(`fx layer ${l.id}: unknown effect kind ${fx.kind}`);
        if (!fx.params || typeof fx.params !== 'object') fail(`fx layer ${l.id}: params must be an object`);
      }
    }
  }
  for (const w of scene.fxWraps) {
    if (!layerIds.has(w.fxLayerId)) fail(`fxWrap references unknown fx layer ${w.fxLayerId}`);
    for (const id of w.contentLayerIds) {
      if (!layerIds.has(id)) fail(`fxWrap references unknown content layer ${id}`);
    }
  }
  for (const it of scene.instances) {
    if (!layerIds.has(it.layer)) fail(`instance references unknown layer ${it.layer}`);
    for (const k of ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity']) {
      if (!Number.isFinite(it[k])) fail(`instance ${it.key}: ${k} must be finite`);
    }
    if (it.opacity < 0 || it.opacity > 1) fail(`instance ${it.key}: opacity out of range`);
  }
  return true;
}

/** Deterministic JSON for hashing / snapshot comparison. */
export function serializeSceneContract(scene) {
  assertSceneContract(scene);
  return JSON.stringify(scene);
}
