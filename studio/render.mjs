#!/usr/bin/env node
// studio/render.mjs — project JSON -> standalone SVG, offline.
//
// #192: the SVG *export* role is retired — shipped output is raster-only
// (studio.py render → GPU readback PNG). renderSvg() stays in-repo as the
// DEV-ONLY parity reference: app/src/gl/parity/reference.mjs imports it to
// pixel-diff the WebGL candidate against. It must never be imported by the
// shipped app bundle (vite) — see gl/phase6.selfcheck.mjs, which asserts the
// production import graph has no path to it.
//
// resolveLayers() below is shared plumbing (the GL path uses it to resolve
// layers before building the scene contract); it is not SVG rendering and
// stays in normal use.
import { readFileSync, writeFileSync } from 'node:fs';
import { ASSETS } from '../app/src/data/assets/index.js';
import { buildPlacements, clampCount } from '../app/src/engine/buildPlacements.js';
import { bakeSwarmItems } from '../app/src/engine/kernel/bake/index.js';
import { resolvePalette } from '../app/src/data/palettes.js';
import { getRenderCaps, shouldRenderGloss } from '../app/src/data/quality.js';
import { DEFAULT_LAYOUT_PARAMS } from '../app/src/data/layout-modes.js';
import { parseProject } from '../app/src/state/projectDocument.js';
import { blend, BLEND_FALLBACK } from './blendFallback.mjs';
import { KERNEL_VERSION } from '../app/src/engine/kernel/version.js';
import { fxFilterStringForLayer, fxFilterId, isFxLayer } from '../app/src/fx/fxFilters.js';

export const CANVAS_W = 1000;
export const CANVAS_H = 700;
const ASSET_SIZE = 100;
const HALF = ASSET_SIZE / 2;

const ASSET_BY_ID = new Map(ASSETS.map((a) => [a.id, a]));

const n = (v) => Math.round((Number(v) || 0) * 1000) / 1000;

function safePaint(c) {
  const s = String(c || '');
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if (/^url\(#[A-Za-z0-9_-]+\)$/.test(s)) return s;
  return '#000000';
}

function topLevelSource(doc) {
  return {
    seed: doc.seed,
    paletteId: doc.paletteId,
    paletteOverrides: doc.paletteOverrides,
    layoutParams: doc.layoutParams,
    caGrid: doc.caGrid ?? null,
    enabledAssets: doc.enabledAssets,
  };
}

const _warned = new Set();
function warnOnce(msg) {
  if (_warned.has(msg)) return;
  _warned.add(msg);
  console.warn(`[studio] WARNING: ${msg}`);
}

const VIRTUAL_ARRAY_RAMP_KEYS = {
  scaleMin: ['scale', 0], scaleMax: ['scale', 1],
  rotateMin: ['rotate', 0], rotateMax: ['rotate', 1],
  alphaMin: ['alpha', 0], alphaMax: ['alpha', 1],
};

export const MOTION_PRESETS = {
  drift: {
    describe: 'displacement + noiseSpeed sweep — the field drifts through the flow noise',
    build: (lp) => ({
      displacement: [lp.displacement || 0, (lp.displacement || 0) + 70],
      noiseSpeed: [lp.noiseSpeed ?? 0.5, (lp.noiseSpeed ?? 0.5) + 4],
    }),
  },
  bloom: {
    describe: 'scale + count grow across the clip, like the composition inflating',
    build: (lp) => ({
      scaleMax: [lp.scale[1], lp.scale[1] * 1.8],
      count: [lp.count, Math.round(lp.count * 1.35)],
    }),
  },
  churn: {
    describe: 'jitter + rotation range widen — a chaotic spin-up',
    build: (lp) => ({
      jitter: [lp.jitter, lp.jitter + 55],
      rotateMin: [lp.rotate[0] * 0.15, lp.rotate[0]],
      rotateMax: [lp.rotate[1] * 0.15, lp.rotate[1]],
    }),
  },
  swarm: {
    describe: 'K4 particle bake step count advances across the clip (swarm/hype modes only)',
    build: () => ({ bakeSteps: [0, 420] }),
  },
  none: {
    describe: 'no preset motion (breath LFO only, or a hand-written --ramp)',
    build: () => ({}),
  },
  auto: {
    describe: 'drift, or swarm-settle when the layer mode is swarm/hype',
    build: (lp) => (lp.mode === 'swarm' || lp.mode === 'hype'
      ? MOTION_PRESETS.swarm.build(lp)
      : MOTION_PRESETS.drift.build(lp)),
  },
};

export function resolveMotionRamp(motion, layoutParams, ramp) {
  const preset = motion && motion !== 'none' ? MOTION_PRESETS[motion] : null;
  if (!preset) return ramp || null;
  const presetRamp = preset.build(layoutParams);
  return ramp ? { ...presetRamp, ...ramp } : presetRamp;
}

function applyRamp(layoutParams, ramp, progress, bakeSteps) {
  let steps = bakeSteps;
  if (!ramp) return steps;
  for (const [k, [a, b]] of Object.entries(ramp)) {
    const v = a + (b - a) * progress;
    if (k === 'bakeSteps') { steps = Math.round(v); continue; }
    const virtual = VIRTUAL_ARRAY_RAMP_KEYS[k];
    if (virtual) {
      const [arrKey, idx] = virtual;
      layoutParams[arrKey] = [...layoutParams[arrKey]];
      layoutParams[arrKey][idx] = v;
    } else {
      layoutParams[k] = v;
    }
  }
  return steps;
}

export function resolveLayers(doc, { caps, ramp = null, motion = null, progress = 0, bakeSteps = 180 }) {
  const weightOverrides = doc.assetWeightOverrides || {};
  const snapshots = doc.layerSnapshots || {};
  const layers = Array.isArray(doc.layers) && doc.layers.length
    ? doc.layers
    : [{ id: '__single', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }];

  return layers
    .filter((l) => l.visible !== false)
    .map((layer) => {
      // FX layers hold no content — they wrap the accumulated stack below in
      // a filter group. Resolved here as a marker; renderSvg folds them in.
      if (isFxLayer(layer)) {
        return { id: layer.id, isFx: true, layer, layerOpacity: layer.layerOpacity ?? 1 };
      }
      const isActive = layer.id === '__single' || layer.id === doc.activeLayerId;
      const src = isActive ? topLevelSource(doc) : (snapshots[layer.id] || topLevelSource(doc));

      const layoutParams = { ...DEFAULT_LAYOUT_PARAMS, ...(src.layoutParams || {}) };
      const resolvedRamp = resolveMotionRamp(motion, layoutParams, ramp);
      const layerBakeSteps = applyRamp(layoutParams, resolvedRamp, progress, bakeSteps);

      const palette = resolvePalette(src.paletteId || 'praystation', src.paletteOverrides || null);
      const enabled = src.enabledAssets;
      const activeAssets = ASSETS
        .filter((a) => !enabled || enabled[a.id])
        .map((a) => (weightOverrides[a.id] ? { ...a, weight: weightOverrides[a.id] } : a));

      const isSwarm = layoutParams.mode === 'swarm' || layoutParams.mode === 'hype';
      const items = isSwarm
        ? bakeSwarmItems({
          seed: src.seed >>> 0,
          count: Math.min(layoutParams.particleCount || 150, caps.maxParticles),
          // #167 — the quality cap gates contact breed() population growth.
          maxParticles: caps.maxParticles,
          layoutParams,
          activeAssets,
          palette,
          canvasW: CANVAS_W,
          canvasH: CANVAS_H,
          steps: layerBakeSteps,
        })
        : buildPlacements({
          layoutParams,
          seed: src.seed >>> 0,
          activeAssets,
          palette,
          caGrid: src.caGrid ?? null,
          caps,
          canvasW: CANVAS_W,
          canvasH: CANVAS_H,
        }).items;

      return {
        id: layer.id,
        layoutParams,
        palette,
        items,
        safeCount: clampCount(layoutParams.count, layoutParams.mirror, caps),
        layerBlendMode: layer.layerBlendMode || 'normal',
        layerOpacity: layer.layerOpacity ?? 1,
        // Exposed for the repro report (#106): a swarm still is only
        // reproducible if you know how many steps it was baked for.
        bakeSteps: layerBakeSteps,
      };
    });
}

export function renderSvg(doc, opts = {}) {
  const {
    time = 0, progress = 0, ramp = null, motion = null, uncapped = false,
    width = null, height = null, background = null,
  } = opts;

  const caps = getRenderCaps(doc.quality || 'balanced', uncapped);
  const layers = resolveLayers(doc, { caps, ramp, motion, progress, bakeSteps: opts.bakeSteps ?? 180 });

  const lifeDrift = layers[0]?.layoutParams?.lifeDrift ?? 0.35;
  const breathScale = 1 + Math.sin(time * 0.8) * 0.012 * lifeDrift;
  const breathRot = Math.sin(time * 0.35) * 0.6 * lifeDrift;

  const symbols = new Map();
  const symbolId = (assetId, ink, accent) => {
    const key = `${assetId}|${ink}|${accent}`;
    let id = symbols.get(key);
    if (!id) {
      id = `s${symbols.size}`;
      symbols.set(key, id);
    }
    return id;
  };

  const hueFilters = new Map();
  const body = [];

  // -- FX layers -----------------------------------------------------------
  // Same fold as the live CanvasPanel (buildLayerStack), in string form.
  // #192: no FX culling anywhere — effects compile at full fidelity from
  // the tier's turbulenceOctaves budget. (This module is the dev-only parity
  // reference now; shipped stills come from the GPU path.)
  const fxCtx = {
    octaves: caps.turbulenceOctaves ?? 3,
    primBudget: caps.maxFilterPrimitives ?? Infinity,
  };
  const fxFilters = new Map(); // layerId -> <filter> string
  {
    let n = 0;
    const maxFx = caps.maxFxLayers ?? Infinity;
    for (const L of layers) {
      if (!L.isFx) continue;
      if (n < maxFx) {
        const f = fxFilterStringForLayer(L.layer, fxCtx);
        if (f) fxFilters.set(L.id, f);
      }
      n += 1;
    }
  }
  let acc = [];
  const pushAcc = (fxLayer) => {
    if (acc.length === 0) return;
    if (fxLayer && fxFilters.has(fxLayer.id)) {
      const op = fxLayer.layerOpacity !== 1 ? ` opacity="${n(fxLayer.layerOpacity)}"` : '';
      body.push(`<g filter="url(#${fxFilterId(fxLayer.id)})"${op}>${acc.join('\n')}</g>`);
    } else {
      body.push(...acc);
    }
    acc = [];
  };

  for (const L of layers) {
    if (L.isFx) { pushAcc(L.layer); continue; }
    const lp = L.layoutParams;
    const showGloss = shouldRenderGloss(doc.quality || 'balanced', lp.shading, L.items.length);
    const itemBlend = blend(lp.blendMode);

    const style = ['isolation:isolate'];
    const lb = blend(L.layerBlendMode);
    if (lb) style.push(`mix-blend-mode:${lb}`);

    const attrs = [`style="${style.join(';')}"`];
    if (L.layerOpacity !== 1) attrs.push(`opacity="${n(L.layerOpacity)}"`);
    if (lp.hueRotate) {
      const deg = n(lp.hueRotate);
      if (!hueFilters.has(deg)) hueFilters.set(deg, `h${hueFilters.size}`);
      attrs.push(`filter="url(#${hueFilters.get(deg)})"`);
    }

    const parts = [`<g ${attrs.join(' ')}>`];
    for (const item of L.items) {
      if (!item.assetId || !ASSET_BY_ID.has(item.assetId)) continue;
      const sx = item._mirrored ? -item.scale : item.scale;
      const sid = symbolId(item.assetId, safePaint(item.color), safePaint(item.accent || item.color));
      const t = `translate(${n(item.x)},${n(item.y)}) rotate(${n(item.rotation)}) `
        + `scale(${n(sx)},${n(item.scale)}) translate(${-HALF},${-HALF})`;
      const g = [`<g transform="${t}" opacity="${n(item.alpha / 100)}"`];
      if (itemBlend) g.push(` style="mix-blend-mode:${itemBlend}"`);
      g.push('>');
      g.push(`<use href="#${sid}" width="${ASSET_SIZE}" height="${ASSET_SIZE}"/>`);
      if (showGloss) {
        const gid = symbolId(item.assetId, 'url(#kc-gloss-grad)', 'url(#kc-gloss-grad)');
        g.push(`<use href="#${gid}" width="${ASSET_SIZE}" height="${ASSET_SIZE}" style="mix-blend-mode:soft-light"/>`);
      }
      g.push('</g>');
      parts.push(g.join(''));
    }
    parts.push('</g>');
    acc.push(parts.join('\n'));
  }
  pushAcc(null);

  const defs = [
    '<radialGradient id="kc-gloss-grad" cx="35%" cy="30%" r="70%">'
    + '<stop offset="0%" stop-color="#fff" stop-opacity="0.9"/>'
    + '<stop offset="60%" stop-color="#fff" stop-opacity="0.25"/>'
    + '<stop offset="100%" stop-color="#fff" stop-opacity="0"/>'
    + '</radialGradient>',
  ];
  for (const [deg, id] of hueFilters) {
    defs.push(`<filter id="${id}" color-interpolation-filters="sRGB" x="-20%" y="-20%" width="140%" height="140%">`
      + `<feColorMatrix type="hueRotate" values="${deg}"/></filter>`);
  }
  for (const [, f] of fxFilters) defs.push(f);
  for (const [key, id] of symbols) {
    const [assetId, ink, accent] = key.split('|');
    const svg = ASSET_BY_ID.get(assetId).svg
      .replace(/var\(--ink[^)]*\)/g, ink)
      .replace(/var\(--accent[^)]*\)/g, accent);
    defs.push(`<symbol id="${id}" viewBox="0 0 ${ASSET_SIZE} ${ASSET_SIZE}" overflow="visible">${svg}</symbol>`);
  }

  const bg = background === 'none' ? null : (background || layers[0]?.palette?.bg || '#000000');
  const W = width || CANVAS_W;
  const H = height || CANVAS_H;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" `
    + `width="${W}" height="${H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" preserveAspectRatio="xMidYMid meet">`,
    `<defs>${defs.join('')}</defs>`,
    bg ? `<rect x="${-CANVAS_W * 2}" y="${-CANVAS_H * 2}" width="${CANVAS_W * 5}" height="${CANVAS_H * 5}" fill="${safePaint(bg)}"/>` : '',
    `<g transform="translate(${CANVAS_W / 2},${CANVAS_H / 2}) rotate(${n(breathRot)}) scale(${n(breathScale)}) translate(${-CANVAS_W / 2},${-CANVAS_H / 2})" style="isolation:isolate">`,
    ...body,
    '</g>',
    '</svg>',
  ].filter(Boolean).join('\n');
}

export function loadProject(path) {
  const parsed = parseProject(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.ok) throw new Error(`${path}: ${parsed.error}`);
  const doc = parsed.doc;
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (raw.caGrid) doc.caGrid = raw.caGrid;
  return doc;
}

function parseArgs(argv) {
  const out = { _: [], ramp: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    if (key === 'uncapped') { out.uncapped = true; continue; }
    if (key === 'emit-normalized') { out.emitNormalized = true; continue; }
    const v = argv[++i];
    if (key === 'ramp') {
      const m = /^([A-Za-z0-9_]+)=(-?[\d.]+):(-?[\d.]+)$/.exec(v);
      if (!m) throw new Error(`bad --ramp "${v}", expected name=from:to`);
      (out.ramp ??= {})[m[1]] = [Number(m[2]), Number(m[3])];
    } else out[key] = v;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.motion === 'list') {
    console.log('motion presets (--motion <name>):');
    for (const [name, def] of Object.entries(MOTION_PRESETS)) {
      console.log(`  ${name.padEnd(8)} ${def.describe}`);
    }
    process.exit(0);
  }
  if (!args._[0]) {
    console.error('usage: node studio/render.mjs <project.json> [--out f.svg] [--width N --height N]\n'
      + '       [--background #rrggbb|none] [--seed N] [--time SEC] [--progress 0..1]\n'
      + '       [--ramp param=from:to ...] [--motion name|list] [--uncapped]\n'
      + '       [--emit-normalized]  print the sanitized project as JSON and exit');
    process.exit(2);
  }
  const doc = loadProject(args._[0]);
  // The repro report (#106 item 4): everything needed to explain, later, how
  // this edition was produced — and in particular every place the renderer
  // silently substituted something. studio.py embeds it in the sidecar.
  //
  // It describes the render that HAPPENED, not the JSON that was requested.
  // Those differ whenever a project is out of bounds, which is exactly when a
  // sidecar that echoes the request is worse than useless.
  if (args.emitNormalized) {
    const caps = getRenderCaps(doc.quality || 'balanced', !!args.uncapped);
    const layers = resolveLayers(doc, {
      caps, ramp: args.ramp, motion: args.motion || null, progress: 0,
      bakeSteps: args.bakeSteps ? Number(args.bakeSteps) : 180,
    });
    // Record substitutions rather than just the requested value: resvg has no
    // plus-lighter, so an offline still legitimately differs from the live
    // canvas here and the sidecar should say so (#96).
    const substitutions = [];
    const noteBlend = (where, requested) => {
      const used = blend(requested);
      if (requested && requested !== 'normal' && used !== requested) {
        substitutions.push({ where, requested, used, reason: 'not supported by resvg' });
      }
    };
    for (const L of layers) {
      noteBlend(`layer:${L.id}:item`, L.layoutParams?.blendMode);
      noteBlend(`layer:${L.id}:layer`, L.layerBlendMode);
    }
    process.stdout.write(JSON.stringify({
      kernelVersion: KERNEL_VERSION,
      seed: doc.seed,
      paletteId: doc.paletteId,
      quality: doc.quality || 'balanced',
      uncapped: !!args.uncapped,
      caps,
      layoutParams: doc.layoutParams,
      layerSnapshots: doc.layerSnapshots || null,
      activeLayerId: doc.activeLayerId || null,
      layers: layers.map((L) => ({
        id: L.id,
        mode: L.layoutParams?.mode,
        safeCount: L.safeCount,
        items: Array.isArray(L.items) ? L.items.length : null,
        bakeSteps: L.bakeSteps ?? null,
        blendMode: L.layoutParams?.blendMode ?? 'normal',
        layerBlendMode: L.layerBlendMode ?? 'normal',
        layerOpacity: L.layerOpacity ?? 1,
      })),
      substitutions,
      blendFallbackTable: BLEND_FALLBACK,
    }, null, 2));
    process.exit(0);
  }
  if (args.seed != null) doc.seed = Number(args.seed) >>> 0;
  const svg = renderSvg(doc, {
    time: Number(args.time || 0),
    progress: Number(args.progress || 0),
    ramp: args.ramp,
    motion: args.motion || null,
    uncapped: !!args.uncapped,
    width: args.width ? Number(args.width) : null,
    height: args.height ? Number(args.height) : null,
    background: args.background || null,
  });
  if (args.out) writeFileSync(args.out, svg);
  else process.stdout.write(svg);
}
