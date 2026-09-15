#!/usr/bin/env node
// studio/render.mjs — project JSON -> standalone SVG, offline.
//
// This is the ONLY place geometry is evaluated, and it evaluates it by
// importing the app's real kernel (buildPlacements). Nothing here
// reimplements placement math; see docs/BACKEND_V2_PLAN.md §2.1.
//
// Mirrors app/src/panels/CanvasPanel.jsx + panels/canvas/Layer.jsx, with two
// deliberate translations for resvg (which has no CSS custom properties):
//   --ink / --accent  -> baked into a deduped <symbol> per (asset, ink, accent)
//   filter:hue-rotate -> <feColorMatrix type="hueRotate">

import { readFileSync, writeFileSync } from 'node:fs';
import { ASSETS } from '../app/src/data/assets/index.js';
import { buildPlacements, clampCount } from '../app/src/engine/buildPlacements.js';
import { bakeSwarmItems } from '../app/src/engine/kernel/bake/index.js';
import { resolvePalette } from '../app/src/data/palettes.js';
import { getRenderCaps, shouldRenderGloss } from '../app/src/data/quality.js';
import { DEFAULT_LAYOUT_PARAMS } from '../app/src/data/layout-modes.js';
import { parseProject } from '../app/src/state/projectDocument.js';

// Must match app/src/hooks/useCanvasViewport.js
export const CANVAS_W = 1000;
export const CANVAS_H = 700;
const ASSET_SIZE = 100;
const HALF = ASSET_SIZE / 2;

const ASSET_BY_ID = new Map(ASSETS.map((a) => [a.id, a]));

// resvg/SVG2 has no `plus-lighter`; screen is the nearest supported mode.
const BLEND_FALLBACK = { 'plus-lighter': 'screen' };

const n = (v) => Math.round((Number(v) || 0) * 1000) / 1000;

/** Only let known-safe paint values reach the output. */
function safePaint(c) {
  const s = String(c || '');
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if (/^url\(#[A-Za-z0-9_-]+\)$/.test(s)) return s;
  return '#000000';
}

function blend(mode) {
  if (!mode || mode === 'normal') return null;
  return BLEND_FALLBACK[mode] || mode;
}

/** The active layer's data lives in the doc's top-level fields. */
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
/** Warn once per message — a 500-edition batch shouldn't print 500 copies. */
function warnOnce(msg) {
  if (_warned.has(msg)) return;
  _warned.add(msg);
  console.warn(`[studio] WARNING: ${msg}`);
}

/** Visible layers in draw order (later = on top), each fully resolved. */
export function resolveLayers(doc, { caps, ramp = null, progress = 0, bakeSteps = 180 }) {
  const weightOverrides = doc.assetWeightOverrides || {};
  const snapshots = doc.layerSnapshots || {};
  const layers = Array.isArray(doc.layers) && doc.layers.length
    ? doc.layers
    : [{ id: '__single', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }];

  return layers
    .filter((l) => l.visible !== false)
    .map((layer) => {
      const isActive = layer.id === '__single' || layer.id === doc.activeLayerId;
      const src = isActive ? topLevelSource(doc) : (snapshots[layer.id] || topLevelSource(doc));

      const layoutParams = { ...DEFAULT_LAYOUT_PARAMS, ...(src.layoutParams || {}) };
      if (ramp) for (const [k, [a, b]] of Object.entries(ramp)) layoutParams[k] = a + (b - a) * progress;

      const palette = resolvePalette(src.paletteId || 'praystation', src.paletteOverrides || null);
      const enabled = src.enabledAssets;
      const activeAssets = ASSETS
        .filter((a) => !enabled || enabled[a.id])
        .map((a) => (weightOverrides[a.id] ? { ...a, weight: weightOverrides[a.id] } : a));

      // swarm/hype are particle dynamics, not a placement function. K4
      // (#63) makes them replayable: seeded init + fixed timestep, so the
      // offline still is reproducible instead of "whatever frame the
      // browser was on".
      const isSwarm = layoutParams.mode === 'swarm' || layoutParams.mode === 'hype';
      const items = isSwarm
        ? bakeSwarmItems({
          seed: src.seed >>> 0,
          count: Math.min(layoutParams.particleCount || 150, caps.maxParticles),
          layoutParams,
          activeAssets,
          palette,
          canvasW: CANVAS_W,
          canvasH: CANVAS_H,
          steps: bakeSteps,
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
      };
    });
}

/**
 * @param {object} doc      parsed project document
 * @param {object} [opts]
 * @param {number} [opts.time]      seconds, drives the breath transform (useCanvasLife)
 * @param {number} [opts.progress]  0..1, drives --ramp interpolation
 * @param {object} [opts.ramp]      { layoutParam: [from, to] }
 * @param {boolean} [opts.uncapped] use FINAL_CAPS instead of the project's quality caps
 * @param {number|null} [opts.width]  output px (default CANVAS_W)
 * @param {number|null} [opts.height]
 * @param {string|null} [opts.background] override; null = active layer's palette bg, 'none' = transparent
 */
export function renderSvg(doc, opts = {}) {
  const {
    time = 0, progress = 0, ramp = null, uncapped = false,
    width = null, height = null, background = null,
  } = opts;

  const caps = getRenderCaps(doc.quality || 'balanced', uncapped);
  const layers = resolveLayers(doc, { caps, ramp, progress, bakeSteps: opts.bakeSteps ?? 180 });

  // Breath — the only continuous motion in the live app without audio.
  // Copied verbatim from useCanvasLife so a t=0 frame is identity.
  const lifeDrift = layers[0]?.layoutParams?.lifeDrift ?? 0.35;
  const breathScale = 1 + Math.sin(time * 0.8) * 0.012 * lifeDrift;
  const breathRot = Math.sin(time * 0.35) * 0.6 * lifeDrift;

  // Dedupe symbols by (asset, ink, accent) — the CSS-var substitution.
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

  for (const L of layers) {
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
    body.push(parts.join('\n'));
  }

  // Symbols are emitted after the body because the (asset, ink, accent) set is
  // only known once every item has been walked.
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
  for (const [key, id] of symbols) {
    const [assetId, ink, accent] = key.split('|');
    const svg = ASSET_BY_ID.get(assetId).svg
      .replace(/var\(--ink[^)]*\)/g, ink)
      .replace(/var\(--accent[^)]*\)/g, accent);
    // overflow:visible — assets are authored to bleed past the 100x100 box.
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
    // Oversized on purpose: the root <svg> clips at the *viewport*, not the
    // viewBox, so this also fills the letterbox bars when --res has a
    // different aspect ratio than the 1000x700 canvas.
    bg ? `<rect x="${-CANVAS_W * 2}" y="${-CANVAS_H * 2}" width="${CANVAS_W * 5}" height="${CANVAS_H * 5}" fill="${safePaint(bg)}"/>` : '',
    `<g transform="translate(${CANVAS_W / 2},${CANVAS_H / 2}) rotate(${n(breathRot)}) scale(${n(breathScale)}) translate(${-CANVAS_W / 2},${-CANVAS_H / 2})" style="isolation:isolate">`,
    ...body,
    '</g>',
    '</svg>',
  ].filter(Boolean).join('\n');
}

/** Load + normalize a project JSON file. */
export function loadProject(path) {
  const parsed = parseProject(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.ok) throw new Error(`${path}: ${parsed.error}`);
  const doc = parsed.doc;
  // parseProject drops caGrid (browser-only runtime state); carry it through.
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (raw.caGrid) doc.caGrid = raw.caGrid;
  return doc;
}

// ── CLI ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { _: [], ramp: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    if (key === 'uncapped') { out.uncapped = true; continue; }
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
  if (!args._[0]) {
    console.error('usage: node studio/render.mjs <project.json> [--out f.svg] [--width N --height N]\n'
      + '       [--background #rrggbb|none] [--seed N] [--time SEC] [--progress 0..1]\n'
      + '       [--ramp param=from:to ...] [--uncapped]');
    process.exit(2);
  }
  const doc = loadProject(args._[0]);
  if (args.seed != null) doc.seed = Number(args.seed) >>> 0;
  const svg = renderSvg(doc, {
    time: Number(args.time || 0),
    progress: Number(args.progress || 0),
    ramp: args.ramp,
    uncapped: !!args.uncapped,
    width: args.width ? Number(args.width) : null,
    height: args.height ? Number(args.height) : null,
    background: args.background || null,
  });
  if (args.out) writeFileSync(args.out, svg);
  else process.stdout.write(svg);
}
