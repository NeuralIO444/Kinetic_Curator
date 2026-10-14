// miner.mjs — #1506 (Look Explorer E2): the miner.
//
// Spec: docs/research/look-explorer-spec-2026-10-13.md §3/§5/§8. The
// miner sweeps the instrument's full look space headlessly — layouts ×
// casts dealt DIRECTLY (dealCast, no scorer shortlist — the funnel is
// the disease, §1) × palettes × parameter weather × persona-profile
// corners — bakes every sample to a still through the bake path (stills
// = live: the same buildPlacements / bakeParticles drivers the golden
// harness fingerprints), measures each bake in recipeFeatures space
// (FEATURES_VERSION untouched — the miner consumes the substrate, it
// does not redefine it) plus render statistics, and selects finalists
// by farthest-point: distance from the keeps corpus primary, pairwise
// distance inside the batch secondary. The output is a SPREAD, not a
// ranking — no score is ever attached to a candidate.
//
// Laws held (spec §7):
//   - Determinism: a run is a pure function of (runSeed, samplerConfig).
//     One mulberry32 stream per run, fixed draw order, no Math.random,
//     no wall clock anywhere in this module (the run tool measures
//     elapsed time outside it).
//   - Sampler honesty: samples are drawn, never repaired. A sample that
//     cannot bake is discarded and logged with its reason.
//   - Coverage by guarantee: per-category quotas for the families E1a
//     proved the tray starves, enforced by anchored dealing at sample
//     time AND a quota-repair pass at selection time, so the finalists
//     carry them BY CONSTRUCTION (acceptance, #1506).
//   - Taste learns from kept renders only: the miner reads the keeps
//     corpus (distance substrate) and writes nothing to it. Crowning
//     is E3's act, a human's.
//   - Nothing auto-saves: runMiner returns data; only the run tool
//     (scripts/exploreRun.mjs) writes a run folder, where the caller
//     points it.
//
// E4 (#1508) extends the run, additively: a run may aim at one named
// prospecting corner (default: the E2 rotation), Davis's state steers
// the dealing wildness (default: silent = the same 0.5 stream), and
// LOIS judges the finalists' renders after selection (loisJudge.mjs)
// — verdicts with provenance on the records + a verdicts ledger from
// the run tool. The default run is byte-identical to E2's.
import { createHash } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import { ASSETS } from '../data/assets/index.js';
import { PALETTES, resolvePalette } from '../data/palettes.js';
import {
  DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams,
} from '../data/layout-modes.js';
import { STUB_VOICES } from '../data/voices.js';
import { getQualityCaps } from '../data/quality.js';
import { buildPlacements } from '../engine/buildPlacements.js';
import { bakeParticles } from '../engine/kernel/bake/index.js';
import { RANDOMIZABLE_KEYS, randomizeKey } from '../state/paramUtils.js';
import { dealCast, castSizeFor, rollDice, wildnessForDavis } from './dice.js';
import { createPersonaScorer } from './diceScorer.js';
import { judgeRender, loisVerdictRow } from './loisJudge.mjs';
import { applyRenderProfile, getRenderProfile, RENDER_PROFILE_IDS } from './renderProfiles.js';
import { recipeFeatures } from './recipeFeatures.js';
import { mulberry32 } from './coverageReport.mjs';

export { mulberry32 };
export const MINER_SEED = 0x1506;

const W = 1000;
const H = 700;
const CAPS = getQualityCaps('high');
const byId = new Map(ASSETS.map((a) => [a.id, a]));
const WILDERNESS = 0.5; // Davis silent — the dice's own honest middle
const byCategory = new Map();
for (const a of ASSETS) {
  const list = byCategory.get(a.category) || [];
  list.push(a);
  byCategory.set(a.category, list);
}

// ── the quota set ───────────────────────────────────────────────────
// The families E1a's census (#1504, seed 0x1504, 600 rolls + 8-seed
// sweep) proved the shipped tray starves: radial 1/26 in the tray,
// crystalline 2/12, floral 2/15, biosynthetic 1/12 — while the dealer
// proposes all of them. These get guaranteed passage: anchored
// dealing in the sampler, quota repair in selection, and a proof in
// every run report.
export const STARVED_CATEGORIES = ['radial', 'crystalline', 'floral', 'biosynthetic'];

// E1b finding F2 (#1505): these ten text stamps draw ONLY when a
// monospace font reaches the rasterizer. They stay in the sampling
// pool like every other asset (never silently excluded); the miner
// accounts for them by measuring ink twice — font-less (the E1b
// sweep's protocol, the primary statistic) and with system fonts —
// and flagging every candidate whose cast carries one.
export const FONT_CONTINGENT_IDS = new Set([
  'stamp_num_04', 'stamp_num_05',
  'stamp_glyph_01', 'stamp_glyph_02', 'stamp_glyph_03', 'stamp_glyph_04',
  'stamp_glyph_05', 'stamp_glyph_06',
  'stamp_arrow_01', 'stamp_letter_02',
]);

// Sampling rotation: the open wilderness plus one corner per persona
// render profile (renderProfiles.js — biased subspaces: the profile's
// own palette, its parameter biases, its forces).
export const CORNERS = ['wilderness', ...RENDER_PROFILE_IDS];

// Particle modes bake through bakeParticles, everything else through
// buildPlacements — the census's two drivers (censusReport place /
// swarmBake), unchanged. The sampler's layout axis is the dice's
// STUB_VOICES (no particle mode among them today); the branch exists
// so the bake contract covers the full MODE_IDS space honestly.
export const LIVE_MODES = new Set(['swarm', 'hype', 'murmuration']);
const SWARM_STEPS = 240; // census swarmBake precedent

// ── sampler ─────────────────────────────────────────────────────────
/**
 * Draw one batch from a single seeded stream. Draw order is fixed per
 * sample (corner and anchor come from the sample INDEX, never the
 * stream, so strata stay balanced at any batch size):
 *   layout → seed → cast size → cast deals → palette (wilderness
 *   only) → parameter weather (wilderness) or profile biases (corner).
 * Anchored samples (every third, anchors cycling the starved set)
 * deal two slots from the anchor category's own pool through dealCast
 * itself, then the rest from the full library — every slot of every
 * cast is dealCast output; there is no scorer anywhere in this file.
 *
 * E4 (#1508): a run may AIM at one named corner (`corner` — every
 * sample is dealt in it; the default null keeps the E2 rotation), and
 * Davis steers the run's spread: `davisCode` sets the dealing
 * wildness through the dice's own wildnessForDavis (UGLY 1.0 sifts
 * wide, FLOW 0.2 stays close; null = Davis silent = the honest 0.5
 * middle this sampler always used — the default stream is unchanged).
 */
export function sampleBatch({
  runSeed = MINER_SEED, batchSize = 240, corner = null, davisCode = null,
} = {}) {
  if (corner !== null && !CORNERS.includes(corner)) {
    throw new Error(`unknown corner: ${corner} (corners: ${CORNERS.join(', ')})`);
  }
  const wildness = wildnessForDavis(davisCode ?? null);
  const rng = mulberry32(runSeed);
  const samples = [];
  for (let i = 0; i < batchSize; i++) {
    const sampleCorner = corner ?? CORNERS[i % CORNERS.length];
    const anchor = i % 3 === 2
      ? STARVED_CATEGORIES[Math.floor(i / 3) % STARVED_CATEGORIES.length]
      : null;
    const layoutId = STUB_VOICES[Math.floor(rng() * STUB_VOICES.length)].id;
    const seed = Math.floor(rng() * 0x7fffffff);
    const size = castSizeFor(layoutId, rng, wildness);
    let cast;
    if (anchor) {
      const anchorIds = dealCast(byCategory.get(anchor) || [], Math.min(2, size), rng, wildness, []);
      const rest = dealCast(ASSETS, size, rng, wildness, []);
      cast = [...new Set([...anchorIds, ...rest])];
    } else {
      cast = dealCast(ASSETS, size, rng, wildness, []);
    }
    let paletteId;
    let params = { ...DEFAULT_LAYOUT_PARAMS, mode: layoutId };
    if (sampleCorner === 'wilderness') {
      paletteId = PALETTES[Math.floor(rng() * PALETTES.length)].id;
      for (const key of RANDOMIZABLE_KEYS) params[key] = randomizeKey(key, rng);
    } else {
      paletteId = getRenderProfile(sampleCorner).paletteId;
      params = applyRenderProfile(params, sampleCorner, rng);
    }
    samples.push({
      index: i,
      corner: sampleCorner,
      anchor,
      layoutId,
      paletteId,
      cast,
      seed,
      seedOffsets: {},
      layoutParams: normalizeLayoutParams(params),
    });
  }
  return samples;
}

// ── bake ────────────────────────────────────────────────────────────
const BAKE_FIELDS = ['assetId', 'x', 'y', 'rotation', 'scale', 'alpha', 'color'];
const r4 = (v) => Math.round((Number(v) || 0) * 1e4) / 1e4;

/** The golden harness's still-equality notion (censusReport): sha256
 * over canonical item tuples. Two bakes with equal fingerprints are
 * the same still. */
export function fingerprintItems(items) {
  const rows = (items || []).map((it) => BAKE_FIELDS.map((f) => (f === 'assetId' ? it[f] : r4(it[f]))).join(','));
  return createHash('sha256').update(rows.join('\n')).digest('hex');
}

/**
 * Bake one sample to placement items through the still pipeline.
 * Returns { ok: true, items, bakePath, fingerprint } or
 * { ok: false, reason } — a sample that cannot bake is DISCARDED with
 * its reason logged by the caller, never repaired into existence.
 */
export function bakeSample(sample) {
  const castRecords = [];
  for (const id of sample.cast || []) {
    const rec = byId.get(id);
    if (!rec) return { ok: false, reason: `unknown-asset:${id}` };
    castRecords.push(rec);
  }
  if (!castRecords.length) return { ok: false, reason: 'empty-cast' };
  const lp = sample.layoutParams;
  const palette = resolvePalette(sample.paletteId, null, []);
  try {
    let items;
    let bakePath;
    if (LIVE_MODES.has(lp.mode)) {
      items = bakeParticles({
        seed: sample.seed, count: lp.particleCount, layoutParams: lp,
        activeAssets: castRecords, palette, canvasW: W, canvasH: H,
        steps: SWARM_STEPS, maxParticles: lp.particleCount,
      });
      bakePath = 'particles';
    } else {
      ({ items } = buildPlacements({
        layoutParams: lp, seed: sample.seed, activeAssets: castRecords,
        palette, caps: CAPS, canvasW: W, canvasH: H, seedOffsets: sample.seedOffsets || {},
      }));
      bakePath = 'placements';
    }
    if (!items || !items.length) return { ok: false, reason: 'no-items' };
    return { ok: true, items, bakePath, fingerprint: fingerprintItems(items) };
  } catch (err) {
    return { ok: false, reason: `bake-threw:${String(err && err.message || err).slice(0, 120)}` };
  }
}

// ── still composition + render statistics ───────────────────────────
const INK_RE = /var\(--ink[^)]*\)/g;
const ACCENT_RE = /var\(--accent[^)]*\)/g;
const num = (v) => Math.round((Number(v) || 0) * 100) / 100;

/**
 * Compose placement items into the still's SVG — the parity
 * renderer's transform math (studio/render.mjs: translate → rotate →
 * scale → center the 100-unit asset box; opacity = alpha/100; ink /
 * accent substituted per item), minus the retired export layer's FX
 * (gloss, grain, hue filters): the still is the composed placement
 * raster the bake path produces, which is what "stills = live" means
 * at the level the golden harness can fingerprint. One divergence,
 * recorded: per-axis scaleY is honored where placements carry it
 * (the parity renderer predates it and scales uniformly).
 */
export function composeStillSvg(items, palette, { withBg = true } = {}) {
  const symbols = new Map();
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
  ];
  if (withBg) parts.push(`<rect width="${W}" height="${H}" fill="${palette.bg}"/>`);
  const body = [];
  for (const item of items || []) {
    if (!item.assetId || !byId.has(item.assetId)) continue;
    const color = item.color || palette.ink || '#000000';
    const accent = item.accent || color;
    const key = `${item.assetId}|${color}|${accent}`;
    if (!symbols.has(key)) {
      const svg = byId.get(item.assetId).svg
        .replace(INK_RE, color)
        .replace(ACCENT_RE, accent);
      symbols.set(key, `<symbol id="s${symbols.size}" viewBox="0 0 100 100" overflow="visible">${svg}</symbol>`);
    }
    const sx = item._mirrored ? -item.scale : item.scale;
    const sy = Number.isFinite(item.scaleY) ? item.scaleY : item.scale;
    const t = `translate(${num(item.x)},${num(item.y)}) rotate(${num(item.rotation)}) `
      + `scale(${num(sx)},${num(sy)}) translate(-50,-50)`;
    body.push(`<g transform="${t}" opacity="${num((item.alpha ?? 100) / 100)}"><use href="#s${[...symbols.keys()].indexOf(key)}" width="100" height="100"/></g>`);
  }
  parts.push(`<defs>${[...symbols.values()].join('')}</defs>`, ...body, '</svg>');
  return parts.join('\n');
}

function rasterize(svg, { fonts = false, width = W } = {}) {
  const resvg = new Resvg(svg, {
    ...(fonts ? {} : { font: { loadSystemFonts: false } }),
    fitTo: { mode: 'width', value: width },
  });
  const rendered = resvg.render();
  return { pixels: rendered.pixels, width: rendered.width, height: rendered.height, png: rendered.asPng() };
}

const cubeCache = new Map();
function nearestColorCube(colors) {
  const key = colors.map((c) => c.hex).join('|');
  let cube = cubeCache.get(key);
  if (cube) return cube;
  cube = new Uint8Array(32 * 32 * 32);
  for (let r5 = 0; r5 < 32; r5++) {
    for (let g5 = 0; g5 < 32; g5++) {
      for (let b5 = 0; b5 < 32; b5++) {
        const r = r5 * 8 + 4; const g = g5 * 8 + 4; const b = b5 * 8 + 4;
        let best = 0; let bestD = Infinity;
        for (let c = 0; c < colors.length; c++) {
          const [cr, cg, cb] = colors[c].rgb;
          const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
          if (d < bestD) { bestD = d; best = c; }
        }
        cube[(r5 << 10) | (g5 << 5) | b5] = best;
      }
    }
  }
  cubeCache.set(key, cube);
  return cube;
}

const hexRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Render statistics for one bake. Ink is measured on a transparent
 * raster (alpha > 0), TWICE: font-less (E1b's sweep protocol — the
 * primary figure) and with system fonts, so a cast carrying one of
 * the ten font-contingent text stamps accounts for its ink honestly
 * instead of reading as an empty look. Palette histogram = each
 * pixel assigned to the nearest of the resolved palette's own colors
 * (bg + swatches). Luminance from the composed (with-bg) raster.
 * Stats rasters render at half width — coverage / histogram /
 * luminance are scale-stable; the saved still renders full-size.
 */
export function renderStats(items, palette) {
  const STAT_W = 500;
  const svgClear = composeStillSvg(items, palette, { withBg: false });
  const svgFull = composeStillSvg(items, palette, { withBg: true });
  const clearFast = rasterize(svgClear, { fonts: false, width: STAT_W });
  const clearFonts = rasterize(svgClear, { fonts: true, width: STAT_W });
  const full = rasterize(svgFull, { fonts: false, width: STAT_W });
  const inkOf = (r) => {
    let n = 0;
    for (let i = 3; i < r.pixels.length; i += 4) if (r.pixels[i] > 0) n++;
    return n / (r.width * r.height);
  };
  const colors = [palette.bg, ...(palette.swatches || [])]
    .map((hex) => ({ hex, rgb: hexRgb(hex) }))
    .filter((c) => c.rgb);
  const counts = new Array(colors.length).fill(0);
  const hueBins = new Array(12).fill(0);
  let hueTotal = 0;
  // Nearest-palette-color lookup over a 32³ RGB cube, built once per
  // palette — the per-pixel scan over ~38 palette colors was the
  // suite's hot loop. Cube cells take the color nearest their center,
  // so assignments differ from the exact scan only within one cell.
  const cube = nearestColorCube(colors);
  const lumBins = new Array(256).fill(0);
  let lumTotal = 0;
  const px = full.pixels;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]; const g = px[i + 1]; const b = px[i + 2];
    counts[cube[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)]]++;
    lumBins[Math.round((0.299 * r + 0.587 * g + 0.114 * b))]++;
    lumTotal++;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    if (max - min > 24) { // saturated enough to have a hue worth binning
      let h;
      if (max === r) h = ((g - b) / (max - min)) % 6;
      else if (max === g) h = (b - r) / (max - min) + 2;
      else h = (r - g) / (max - min) + 4;
      hueBins[Math.min(11, Math.max(0, Math.floor(((h * 60 + 360) % 360) / 30)))]++;
      hueTotal++;
    }
  }
  const lumMean = lumBins.reduce((s, n, v) => s + n * v, 0) / Math.max(1, lumTotal) / 255;
  const q = (p) => {
    const target = p * lumTotal;
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += lumBins[v]; if (acc >= target) return v / 255; }
    return 1;
  };
  const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
  return {
    inkCoverage: round(inkOf(clearFast)),
    inkCoverageWithFonts: round(inkOf(clearFonts)),
    paletteHistogram: colors.map((c, i) => ({ hex: c.hex, share: round(counts[i] / (full.width * full.height)) })),
    hueHistogram: hueBins.map((n) => round(hueTotal ? n / hueTotal : 0)),
    luminance: {
      mean: round(lumMean),
      p10: round(q(0.1)),
      p90: round(q(0.9)),
      spread: round(q(0.9) - q(0.1)),
    },
  };
}

/** The saved still: full-size PNG of the composed bake, fonts on (the
 * picture as the instrument would show it). */
export function renderStillPng(items, palette) {
  return rasterize(composeStillSvg(items, palette, { withBg: true }), { fonts: true, width: W }).png;
}

/** SHA-256 of a rendered PNG buffer — the parity spot-check compares
 * a finalist's saved still against a fresh re-render by this hash. */
export function stillHash(pngBuffer) {
  return createHash('sha256').update(pngBuffer).digest('hex');
}

// ── measurement + distance ──────────────────────────────────────────
/** recipeFeatures over a miner recipe. FEATURES_VERSION is the
 * substrate's own law (recipeFeatures.js) — consumed, never changed. */
export function featuresOf({ layoutParams, paletteId, cast }) {
  return recipeFeatures({ layoutParams, paletteId, assets: cast });
}

/** Features of a keep-shaped record (#1140), read as tolerantly as
 * keepsCoverage reads the ledger: config.layout / config.palette.id /
 * config.assets, absent stays absent. Null when the record carries
 * nothing featurizable. */
export function featuresOfKeep(record) {
  const cfg = record?.config;
  if (!cfg || typeof cfg !== 'object') return null;
  return recipeFeatures({
    layoutParams: cfg.layout || {},
    paletteId: cfg.palette?.id ?? null,
    assets: Array.isArray(cfg.assets) ? cfg.assets : null,
  });
}

const CATEGORICALS = [
  'system', 'symmetry', 'behave', 'blend', 'paletteShift', 'palette',
  'accum', 'mirror', 'bleed', 'overlap', 'bodies', 'density', 'scale',
];

const jaccardDistance = (a, b) => {
  const A = new Set(a || []); const B = new Set(b || []);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return 1 - inter / (A.size + B.size - inter);
};

/**
 * Distance in recipeFeatures space — the novelty metric (spec §3.3:
 * "novelty is measured in this space"). Mean of four 0..1 terms,
 * each computed only when both sides carry it: categorical mismatch
 * fraction, cast Jaccard distance, cast-category Jaccard distance,
 * numerics RMS difference. Render statistics are measured and
 * reported, but selection runs on this feature distance alone — the
 * spec's substrate law, kept literal (ambiguity noted in the staging
 * report: §3 lists render stats under measurement, §3.3 names the
 * feature space as the distance substrate).
 */
export function featureDistance(fa, fb) {
  if (!fa || !fb) return 1;
  const terms = [];
  let miss = 0; let compared = 0;
  for (const k of CATEGORICALS) {
    if (fa[k] === undefined || fb[k] === undefined) continue;
    compared++;
    if (fa[k] !== fb[k]) miss++;
  }
  if (compared) terms.push(miss / compared);
  if (Array.isArray(fa.cast) && Array.isArray(fb.cast)) terms.push(jaccardDistance(fa.cast, fb.cast));
  if (Array.isArray(fa.castCategories) && Array.isArray(fb.castCategories)) {
    terms.push(jaccardDistance(fa.castCategories, fb.castCategories));
  }
  const na = fa.num || {}; const nb = fb.num || {};
  const keys = [...new Set([...Object.keys(na), ...Object.keys(nb)])];
  if (keys.length) {
    let s = 0;
    for (const k of keys) s += ((na[k] ?? 0) - (nb[k] ?? 0)) ** 2;
    terms.push(Math.sqrt(s / keys.length));
  }
  return terms.length ? terms.reduce((x, y) => x + y, 0) / terms.length : 1;
}

/** Render-statistic distance (reporting only): ink, luminance shape,
 * hue distribution — palette-independent, so it compares across
 * palettes. */
export function renderDistance(sa, sb) {
  if (!sa || !sb) return 1;
  const terms = [
    Math.abs(sa.inkCoverage - sb.inkCoverage),
    Math.abs(sa.luminance.mean - sb.luminance.mean),
    Math.abs(sa.luminance.spread - sb.luminance.spread),
  ];
  let l1 = 0;
  for (let i = 0; i < 12; i++) l1 += Math.abs((sa.hueHistogram[i] || 0) - (sb.hueHistogram[i] || 0));
  terms.push(l1 / 2);
  return terms.reduce((x, y) => x + y, 0) / terms.length;
}

export function meanPairwise(items, dist) {
  if (!items || items.length < 2) return 0;
  let s = 0; let n = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) { s += dist(items[i], items[j]); n++; }
  }
  return n ? s / n : 0;
}

// ── selection ───────────────────────────────────────────────────────
const castCategoriesOf = (cast) => new Set(
  (cast || []).map((id) => byId.get(id)?.category).filter(Boolean),
);

/**
 * Farthest-point selection (spec §3.4): the first finalist is the
 * candidate most distant from the keeps corpus; each next is the one
 * most distant from everything already picked (keeps ∪ picked). With
 * an empty corpus the first pick is the candidate with the greatest
 * mean distance to the whole batch. Ties break to the lowest sample
 * index — deterministic. Output order is pick order (the spread's
 * construction order), NOT a ranking: no score is attached.
 *
 * Quota repair: if a starved category is absent from the picked
 * casts, the most redundant non-sole-carrier finalist is swapped for
 * the unpicked carrier that sits farthest from the picked set. The
 * batch guarantees carriers exist (anchored dealing); if every
 * carrier was discarded at bake, the proof reports the failure
 * honestly instead of papering over it.
 */
export function selectFinalists(baked, keepsFeatures, { finalistCount = 12 } = {}) {
  const pool = [...baked];
  const distToKeeps = (c) => (keepsFeatures.length
    ? Math.min(...keepsFeatures.map((kf) => featureDistance(c.features, kf)))
    : Infinity);
  const minDistTo = (c, set) => (set.length
    ? Math.min(...set.map((o) => featureDistance(c.features, o.features)))
    : Infinity);
  const novelty = (c, picked) => Math.min(distToKeeps(c), minDistTo(c, picked));

  const picked = [];
  const remaining = new Set(pool);
  while (picked.length < Math.min(finalistCount, pool.length) && remaining.size) {
    let best = null; let bestScore = -Infinity;
    for (const c of remaining) {
      let score;
      if (!picked.length && !keepsFeatures.length) {
        score = pool.reduce((s, o) => s + (o === c ? 0 : featureDistance(c.features, o.features)), 0)
          / Math.max(1, pool.length - 1);
      } else {
        score = novelty(c, picked);
      }
      if (score > bestScore || (score === bestScore && best && c.sample.index < best.sample.index)) {
        best = c; bestScore = score;
      }
    }
    picked.push(best);
    remaining.delete(best);
  }

  // quota repair
  const repairs = [];
  const carries = (c, cat) => castCategoriesOf(c.sample.cast).has(cat);
  for (const cat of STARVED_CATEGORIES) {
    if (picked.some((c) => carries(c, cat))) continue;
    const carriers = [...remaining].filter((c) => carries(c, cat));
    if (!carriers.length) continue; // proof below reports the miss
    let swap = null; let swapScore = -Infinity;
    for (const c of carriers) {
      const s = novelty(c, picked);
      if (s > swapScore) { swap = c; swapScore = s; }
    }
    // victim: the picked finalist whose absence costs the spread
    // least (smallest distance to the rest), never a sole carrier of
    // another required category.
    let victim = null; let victimScore = Infinity;
    for (const c of picked) {
      const soleCarrier = STARVED_CATEGORIES.some(
        (other) => other !== cat && carries(c, other) && !picked.some((o) => o !== c && carries(o, other)),
      );
      if (soleCarrier) continue;
      const s = minDistTo(c, picked.filter((o) => o !== c));
      if (s < victimScore) { victim = c; victimScore = s; }
    }
    if (swap && victim) {
      picked[picked.indexOf(victim)] = swap;
      remaining.delete(swap);
      remaining.add(victim);
      repairs.push({ category: cat, in: swap.sample.index, out: victim.sample.index });
    }
  }

  const finalCats = new Set();
  for (const c of picked) for (const cat of castCategoriesOf(c.sample.cast)) finalCats.add(cat);
  const quota = {
    required: [...STARVED_CATEGORIES],
    perCategory: Object.fromEntries(STARVED_CATEGORIES.map((cat) => [cat, {
      // anchoredSamples / inBatch are batch-level counts — runMiner
      // fills them in from the full sampled batch (selection sees
      // only the baked pool).
      anchoredSamples: 0,
      inBatch: 0,
      inFinalists: picked.filter((c) => carries(c, cat)).length,
      present: finalCats.has(cat),
    }])),
    repairs,
    pass: STARVED_CATEGORIES.every((cat) => finalCats.has(cat)),
  };
  return { finalists: picked, quota };
}

// ── the dice tray, as the comparison baseline ───────────────────────
/**
 * What the shipped dice would surface, featurized for comparison:
 * rollDice finalists (the REAL tray — persona scorer, Davis silent,
 * exactly E1a's protocol) evaluated as the recipes a crown actually
 * applies: mode + cast onto the instrument's default state (a crown
 * changes nothing else — palette and parameter weather stay wherever
 * they were). K finalists pooled across rolls.
 */
export function diceTrayFeatures(k, { seed = MINER_SEED ^ 0xd1ce } = {}) {
  const scorer = createPersonaScorer({ assetsById: byId });
  const rng = mulberry32(seed);
  const out = [];
  while (out.length < k) {
    const r = rollDice({ assets: ASSETS, rng, davisCode: null, scorer, crowns: [] });
    for (const f of r.finalists) {
      out.push(recipeFeatures({
        layoutParams: normalizeLayoutParams({ mode: f.layoutId }),
        paletteId: null,
        assets: f.assetIds,
      }));
      if (out.length >= k) break;
    }
  }
  return out;
}

// ── candidate records + the run ─────────────────────────────────────
/** The candidate record: the #1140 keep shape, plus provenance.
 * Crown-time / session facts (timestamp, keptAt, context, bands) are
 * ABSENT — absent stays absent; they are written by the crown act
 * (E3) from the live session, never invented by the miner, and their
 * absence is what keeps a run a pure function of its seed. */
export function candidateRecord(sample, runId) {
  return {
    seed: sample.seed,
    seedOffsets: { ...(sample.seedOffsets || {}) },
    config: {
      layout: sample.layoutParams,
      palette: { id: sample.paletteId },
      assets: [...new Set(sample.cast)].sort(),
    },
    provenance: {
      source: 'explorer',
      run: runId,
      corner: sample.corner,
      axes: {
        layout: sample.layoutId,
        palette: sample.paletteId,
        castSize: sample.cast.length,
        ...(sample.anchor ? { anchor: sample.anchor } : {}),
      },
    },
  };
}

export function runIdFor({
  runSeed = MINER_SEED, batchSize = 240, finalistCount = 12, corner = null, davisCode = null,
} = {}) {
  const base = `xpl-${runSeed.toString(16)}-${batchSize}-${finalistCount}`;
  // E4: an aimed run names its corner (and Davis's state) in its id —
  // the default rotation run keeps the E2 id exactly.
  return base + (corner ? `-${corner}` : '') + (davisCode ? `-${String(davisCode).toLowerCase()}` : '');
}

/**
 * One mining run, end to end: sample → bake (discard + log failures)
 * → measure → select. Pure in (runSeed, batchSize, finalistCount,
 * keeps): same inputs, same run — fingerprints, stats, finalists and
 * report numbers all reproduce exactly.
 */
export function runMiner({
  runSeed = MINER_SEED, batchSize = 240, finalistCount = 12, keeps = [],
  corner = null, davisCode = null,
} = {}) {
  const runId = runIdFor({ runSeed, batchSize, finalistCount, corner, davisCode });
  const samples = sampleBatch({ runSeed, batchSize, corner, davisCode });
  const baked = [];
  const discards = [];
  for (const sample of samples) {
    const bake = bakeSample(sample);
    if (!bake.ok) {
      discards.push({ index: sample.index, corner: sample.corner, layout: sample.layoutId, reason: bake.reason });
      continue;
    }
    const palette = resolvePalette(sample.paletteId, null, []);
    baked.push({
      sample,
      bakePath: bake.bakePath,
      fingerprint: bake.fingerprint,
      items: bake.items,
      features: featuresOf({
        layoutParams: sample.layoutParams, paletteId: sample.paletteId, cast: sample.cast,
      }),
      stats: renderStats(bake.items, palette),
      fontContingent: sample.cast.some((id) => FONT_CONTINGENT_IDS.has(id)),
      record: candidateRecord(sample, runId),
    });
  }
  const keepsFeatures = (keeps || []).map(featuresOfKeep).filter(Boolean);
  const { finalists, quota } = selectFinalists(baked, keepsFeatures, { finalistCount });

  // E4 (#1508): LOIS judges the finalists' RENDERS. The verdict is a
  // pure function of the bake's measured stats + recipe features
  // (loisJudge.mjs), attached to the finalist and its record — the
  // same record object candidates.json and finalists.json serialize,
  // so the tray's join still sees one record. Verdicts steer nothing:
  // selection already happened, by distance alone (spec §3.4).
  for (const f of finalists) {
    const v = judgeRender({
      features: f.features, stats: f.stats,
      fingerprint: f.fingerprint, fontContingent: f.fontContingent,
    });
    f.loisVerdict = v;
    f.statsProvenance = v.statsProvenance;
    f.record.loisVerdict = v;
    f.record.statsProvenance = v.statsProvenance;
  }
  const verdicts = finalists.map((f) => loisVerdictRow(runId, f)).filter(Boolean);

  // coverage rows: library / batch (sampled casts) / baked / finalists
  const catRow = (test) => ({
    inLibrary: ASSETS.filter(test).length,
    inBatch: samples.filter((s) => s.cast.some((id) => test(byId.get(id)))).length,
    inBaked: baked.filter((c) => c.sample.cast.some((id) => test(byId.get(id)))).length,
    inFinalists: finalists.filter((c) => c.sample.cast.some((id) => test(byId.get(id)))).length,
  });
  const categories = [...new Set(ASSETS.map((a) => a.category))]
    .sort()
    .map((name) => ({ name, ...catRow((a) => a && a.category === name) }));
  const packs = [{ name: 'haeckel', ...catRow((a) => a && a.id.startsWith('hae')) }];

  // quota proof, stated over the full sampled batch (selectFinalists
  // sees only the baked pool; the anchor counts belong to the batch)
  for (const cat of STARVED_CATEGORIES) {
    quota.perCategory[cat].anchoredSamples = samples.filter((s) => s.anchor === cat).length;
    quota.perCategory[cat].inBatch = samples.filter(
      (s) => s.cast.some((id) => byId.get(id)?.category === cat),
    ).length;
  }

  const tray = diceTrayFeatures(finalists.length, { seed: runSeed ^ 0xd1ce });
  const spread = {
    finalistsFeature: +meanPairwise(finalists, (a, b) => featureDistance(a.features, b.features)).toFixed(4),
    trayFeature: +meanPairwise(tray, (a, b) => featureDistance(a, b)).toFixed(4),
    finalistsRender: +meanPairwise(finalists, (a, b) => renderDistance(a.stats, b.stats)).toFixed(4),
    traySize: tray.length,
  };

  // E4: this run's yield by corner (spec §6 at run scale — the
  // accrual across runs lives in prospecting.yieldAccrual).
  const ybc = new Map();
  const ybRow = (c) => {
    if (!ybc.has(c)) ybc.set(c, { corner: c, candidates: 0, finalists: 0, loisKeeps: 0, loisPasses: 0 });
    return ybc.get(c);
  };
  for (const c of baked) ybRow(c.sample.corner).candidates++;
  for (const f of finalists) {
    const r = ybRow(f.sample.corner);
    r.finalists++;
    if (f.loisVerdict?.verdict === 'keep') r.loisKeeps++;
    if (f.loisVerdict?.verdict === 'pass') r.loisPasses++;
  }
  const yieldByCorner = [...ybc.values()].sort(
    (a, b) => b.finalists - a.finalists || a.corner.localeCompare(b.corner),
  );

  return {
    runId,
    config: {
      runSeed, batchSize, finalistCount, keepsCorpus: keepsFeatures.length,
      corner: corner ?? 'rotation',
      davisCode: davisCode ?? null,
      wildness: wildnessForDavis(davisCode ?? null),
    },
    samples,
    baked,
    discards,
    finalists,
    verdicts,
    quota,
    report: {
      yield: {
        sampled: samples.length,
        baked: baked.length,
        discarded: discards.length,
        discardReasons: discards.reduce((m, d) => ({ ...m, [d.reason]: (m[d.reason] || 0) + 1 }), {}),
        finalists: finalists.length,
      },
      coverage: { categories, packs },
      quota,
      spread,
      fontContingent: {
        inBatch: samples.filter((s) => s.cast.some((id) => FONT_CONTINGENT_IDS.has(id))).length,
        inFinalists: finalists.filter((c) => c.fontContingent).length,
      },
      keepsNote: keepsFeatures.length
        ? `novelty measured against ${keepsFeatures.length} keep record(s) handed to the run`
        : 'keeps corpus EMPTY in this run — novelty is pairwise-only (the production '
          + 'ledger kc:keeps:v1 is browser-local and absent headlessly; hand the run '
          + 'tool a ledger export to measure against the real corpus)',
      lois: {
        judge: 'lois-render-v1',
        judged: finalists.length,
        keeps: finalists.filter((f) => f.loisVerdict?.verdict === 'keep').length,
        passes: finalists.filter((f) => f.loisVerdict?.verdict === 'pass').length,
      },
      yieldByCorner,
    },
  };
}

// ── the readable run report ─────────────────────────────────────────
export function formatMinerReport(run) {
  const L = [];
  const r = run.report;
  L.push(`LOOK EXPLORER — MINER RUN ${run.runId} (#1506)`);
  L.push(`config: seed 0x${run.config.runSeed.toString(16)} · batch ${run.config.batchSize} · finalists ${run.config.finalistCount} · keeps corpus ${run.config.keepsCorpus}`
    + (run.config.corner && run.config.corner !== 'rotation' ? ` · corner ${run.config.corner}` : '')
    + (run.config.davisCode ? ` · davis ${run.config.davisCode} (wildness ${run.config.wildness})` : ''));
  L.push('');
  L.push(`YIELD: sampled ${r.yield.sampled} · baked ${r.yield.baked} · discarded ${r.yield.discarded} · finalists ${r.yield.finalists}`);
  if (r.yield.discarded) {
    L.push(`  discard reasons: ${Object.entries(r.yield.discardReasons).map(([k, v]) => `${k} ×${v}`).join(' · ')}`);
  }
  L.push('');
  L.push('COVERAGE (samples whose cast carries the category):');
  for (const c of r.coverage.categories) {
    L.push(`  ${c.name.padEnd(14)} library ${String(c.inLibrary).padStart(3)} · batch ${String(c.inBatch).padStart(3)} · baked ${String(c.inBaked).padStart(3)} · finalists ${c.inFinalists}`);
  }
  for (const p of r.coverage.packs) {
    L.push(`  pack:${p.name.padEnd(9)} library ${String(p.inLibrary).padStart(3)} · batch ${String(p.inBatch).padStart(3)} · baked ${String(p.inBaked).padStart(3)} · finalists ${p.inFinalists}`);
  }
  L.push('');
  L.push(`QUOTA PROOF (starved families, E1a evidence): ${r.quota.pass ? 'PASS' : 'FAIL'}`);
  for (const cat of r.quota.required) {
    const q = r.quota.perCategory[cat];
    L.push(`  ${cat.padEnd(14)} anchored samples ${q.anchoredSamples} · in batch ${q.inBatch} · in finalists ${q.inFinalists}`);
  }
  if (r.quota.repairs.length) {
    L.push(`  selection repairs: ${r.quota.repairs.map((x) => `${x.category}: sample ${x.in} in, sample ${x.out} out`).join(' · ')}`);
  }
  L.push('');
  L.push(`SPREAD (mean pairwise feature distance, 0..1): finalists ${r.spread.finalistsFeature} vs dice tray ${r.spread.trayFeature} (tray of ${r.spread.traySize}, same protocol as E1a)`);
  L.push(`  finalists render-statistic spread: ${r.spread.finalistsRender}`);
  L.push('');
  L.push(`FONT-CONTINGENT TEXT STAMPS: ${r.fontContingent.inBatch} sampled casts carry one · ${r.fontContingent.inFinalists} among finalists`);
  L.push('  ink is reported twice for every candidate (inkCoverage font-less = E1b protocol; inkCoverageWithFonts = system fonts on). A font-less bake reads these stamps blank; they are never excluded from sampling.');
  L.push('');
  L.push(`KEEPS: ${r.keepsNote}`);
  L.push('');
  if (r.lois) {
    L.push(`LOIS JUDGES RENDERS (${r.lois.judge}): ${r.lois.judged} finalists judged from their bakes · keeps ${r.lois.keeps} · passes ${r.lois.passes}`);
    L.push('  verdicts are recorded in verdicts.jsonl with provenance + the measured stats they rest on; they steer nothing — selection above ran on distance alone.');
    L.push('');
  }
  if (r.yieldByCorner) {
    L.push('YIELD BY CORNER (this run):');
    for (const row of r.yieldByCorner) {
      L.push(`  ${row.corner.padEnd(12)} mined ${String(row.candidates).padStart(3)} · finalists ${row.finalists} · LOIS keep ${row.loisKeeps} / pass ${row.loisPasses}`);
    }
    L.push('');
  }
  L.push('FINALISTS (pick order — a spread, not a ranking):');
  for (const f of run.finalists) {
    const s = f.sample;
    const lois = f.loisVerdict
      ? ` · LOIS ${f.loisVerdict.verdict}${f.loisVerdict.verdict === 'pass'
        ? ` (failed: ${f.loisVerdict.checks.filter((c) => !c.ok).map((c) => c.key).join(', ')})`
        : ''}`
      : '';
    L.push(`  sample ${String(s.index).padStart(3)} · ${s.corner}${s.anchor ? ` (anchor ${s.anchor})` : ''} · ${s.layoutId} · ${s.paletteId} · cast ${s.cast.length} · ink ${f.stats.inkCoverage}${f.fontContingent ? ' · font-contingent cast' : ''} · bake ${f.fingerprint.slice(0, 12)}…${lois}`);
  }
  return L.join('\n');
}
