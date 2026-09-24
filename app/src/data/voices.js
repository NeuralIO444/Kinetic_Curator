// Mode personas (#280) — curated voices for the instrument.
//
// A voice is a COMPLETE state: palette, full layout params, an FX chain
// description, and asset selection. Loading a chip always lands somewhere
// beautiful; the performer's hands take it from there.
//
// Three flagships are fully voiced. The remaining modes are stubs — their
// chips keep the current mode-switch behavior until they are voiced later.
//
// Voice state shape:
//   {
//     params:  { ...DEFAULT_LAYOUT_PARAMS, ...overrides },  // complete
//     palette: { bg, ink, swatches[8] },                    // complete
//     fx:      { grain 0..1, vignette, posterize, edge, glow 0..1, contrast },
//     assets:  'all' | { [assetId]: boolean },
//   }
//
// Motion knobs: `jitter` is placement-static (baked once per layout, it cannot
// shimmer); `lifeDrift` is the per-frame shimmer/breath scale (liveLoop) — tune
// a chip's liveliness with lifeDrift, not jitter.
//
// The fx chain is authored data: glow/fade/tunnel/prism ride on the
// accumulation params the live engine already understands (accumulationOptics
// etc.), so those ARE wired. Grain / vignette / posterize / edge / contrast
// are declarative for now — captured, interpolated through MIX, and ready
// for the global post-pass when it lands.

import {
  DEFAULT_LAYOUT_PARAMS,
  PARAM_SPEC,
  MODE_IDS,
  validateLayoutParams,
} from './layout-modes.js';
import { normalizeHex, resolvePalette } from './palettes.js';

/** Swatch slots per voice palette — matches the 8-slot catalog shape. */
export const VOICE_SWATCH_COUNT = 8;

/** Default FX chain — photographic-neutral. */
export const DEFAULT_FX = {
  grain: 0,
  vignette: false,
  posterize: false,
  edge: false,
  glow: 0,
  contrast: 1.0,
};

/** Cycle a short accent list out to 8 swatch slots. */
function swatches8(colors) {
  const clean = colors.map((c) => normalizeHex(c) || '#888888');
  const out = [];
  for (let i = 0; i < VOICE_SWATCH_COUNT; i++) out.push(clean[i % clean.length]);
  return out;
}

/**
 * The three flagship voices. `blendSeconds` is the voice's signature MIX
 * length — Night Migration blends long, Chrome Parade cuts on the beat,
 * Deep Water dissolves over ten seconds.
 */
export const FLAGSHIP_VOICES = [
  {
    id: 'swarm',
    name: 'SWARM',
    title: 'Night Migration',
    vibe: 'Starlings over a marsh at dusk — ten thousand wings, one mind.',
    glyph: 'swarm',
    blendSeconds: 4,
    palette: {
      bg: '#0A0E1A',
      ink: '#F8FAFC',
      swatches: swatches8(['#22D3EE', '#F59E0B', '#E879F9', '#F8FAFC']),
    },
    params: {
      mode: 'swarm',
      count: 420,
      scale: [0.3, 1.1],
      rotate: [-180, 180],
      alpha: [60, 100],
      zTiers: 4,
      jitter: 24,
      density: 78,
      bleed: false,
      mirror: false,
      overlap: true,
      blendMode: 'screen',
      hueRotate: 0,
      paletteShift: 'auto',
      accumulation: true,
      accumulationFade: 16, // ~0.94 keep → half-life frames
      accumulationOptics: 0.35,
      accumulationTunnel: 0.15,
      accumulationPrism: 0,
      noiseFreq: 0.005,
      noiseSpeed: 0.5,
      displacement: 0,
      particleCount: 280,
      swarmCohesion: 0.6, // slider max — past this the flock is one blob (#272)
      gravityWells: 2.5,
      damping: 0.95,
      body: 3,
      flap: 0.35,
      tight: 0.55,
      wind: 1,
      symmetry: 'none',
      behave: 'flock',
      contactRadius: 0,
      contactRestitution: 0.5,
      contactRepel: 0,
      contactMode: 'none',
      collideMask: 0xffffffff,
      audioModDepth: 0.65,
      audioScaleMod: 0.45,
      audioAlphaMod: 0.25,
      lifeDrift: 0.35,
    },
    fx: { grain: 0.6, vignette: true, posterize: false, edge: false, glow: 0.35, contrast: 1.0 },
    assets: 'all',
  },
  {
    id: 'hype',
    name: 'HYPE',
    title: 'Chrome Parade',
    vibe: 'Rave flyer meets TE product launch — bold graphic moth organisms, unapologetic color on black.',
    glyph: 'hype',
    blendSeconds: 0.8,
    palette: {
      bg: '#000000',
      ink: '#FFE600',
      swatches: swatches8(['#FF2D78', '#00E5FF', '#FFE600', '#7C3AED']),
    },
    params: {
      mode: 'hype',
      count: 90,
      scale: [1.2, 2.6],
      rotate: [-70, 70],
      alpha: [85, 100],
      zTiers: 3,
      jitter: 30,
      density: 70,
      bleed: false,
      mirror: false,
      overlap: true,
      blendMode: 'screen',
      hueRotate: 0,
      paletteShift: 'band',
      accumulation: true,
      accumulationFade: 3, // short punchy trails — cuts on the beat
      accumulationOptics: 0.5,
      accumulationTunnel: 0,
      accumulationPrism: 0,
      noiseFreq: 0.005,
      noiseSpeed: 0.5,
      displacement: 0,
      particleCount: 90,
      swarmCohesion: 0.3,
      gravityWells: 0.5,
      damping: 0.97,
      body: 6,
      flap: 0.85,
      tight: 0.7,
      wind: 1.5,
      symmetry: 'bilateral',
      behave: 'scatter',
      contactRadius: 0,
      contactRestitution: 0.5,
      contactRepel: 0,
      contactMode: 'none',
      collideMask: 0xffffffff,
      audioModDepth: 0.8,
      audioScaleMod: 0.6,
      audioAlphaMod: 0.3,
      lifeDrift: 0.3, // #515: was 0.5 — read as rattle, not pulse
    },
    fx: { grain: 0, vignette: false, posterize: true, edge: true, glow: 0.5, contrast: 1.25 },
    assets: 'all',
  },
  {
    id: 'murmuration',
    name: 'MURM',
    title: 'Deep Water',
    vibe: 'Oceanic drift — slow ribbons of light in dark water. The ambient set.',
    glyph: 'deep',
    blendSeconds: 10,
    palette: {
      bg: '#02121A',
      ink: '#A5F3FC',
      swatches: swatches8(['#0EA5E9', '#2DD4BF', '#A5F3FC', '#134E4A']),
    },
    params: {
      mode: 'murmuration',
      count: 320,
      scale: [0.4, 1.0],
      rotate: [-180, 180],
      alpha: [35, 70],
      zTiers: 5,
      jitter: 20,
      density: 75,
      bleed: false,
      mirror: false,
      overlap: true,
      blendMode: 'screen',
      hueRotate: 0,
      paletteShift: 'split',
      accumulation: true,
      accumulationFade: 24, // ~0.96 keep → half-life frames; trails are the subject
      accumulationOptics: 0.25,
      accumulationTunnel: 0.6,
      accumulationPrism: 0.4,
      noiseFreq: 0.005,
      noiseSpeed: 0.3,
      displacement: 0,
      particleCount: 220,
      swarmCohesion: 0.5,
      gravityWells: 0.8,
      damping: 0.99,
      body: 3,
      flap: 0.3,
      tight: 0.5,
      wind: 0.6,
      symmetry: 'none',
      behave: 'flock',
      contactRadius: 0,
      contactRestitution: 0.5,
      contactRepel: 0,
      contactMode: 'none',
      collideMask: 0xffffffff,
      audioModDepth: 0.5,
      audioScaleMod: 0.35,
      audioAlphaMod: 0.2,
      lifeDrift: 0.15,
    },
    fx: { grain: 0.3, vignette: true, posterize: false, edge: false, glow: 0.25, contrast: 1.0 },
    assets: 'all',
  },
];

/**
 * Stub voices — vibe direction only, voiced later. Chips keep the current
 * bare mode-switch behavior. `id` is the layout mode id.
 */
export const STUB_VOICES = [
  { id: 'random',     name: 'random',    glyph: 'rand',   vibe: 'Static Bloom: channel-surfing between accidents. Confetti TV.' },
  { id: 'grid',       name: 'grid',      glyph: 'grid',   vibe: 'Control Room: brutalist order. Swiss grid, every node in its cell.' },
  { id: 'fibonacci',  name: 'fibonacci', glyph: 'phi',    vibe: 'Nautilus: golden-spiral growth. Sacred geometry, slow reveal.' },
  { id: 'radial',     name: 'radial',    glyph: 'rad',    vibe: 'Radar: sonar pings and target locks. Military calm.' },
  { id: 'noise',      name: 'noise warp', glyph: 'noise',  vibe: 'Bad Reception: warped broadcast, signal decay. Analog horror.' },
  { id: 'stratified', name: 'stratified', glyph: 'strat', vibe: 'Sediment: geological layers. Deep time, compressed.' },
  { id: 'flow',       name: 'flow',      glyph: 'flow',   vibe: 'River: current lines drifting downstream. Hydrology.' },
  { id: 'rails',      name: 'rails',     glyph: 'rail',   vibe: 'Transit Map: commuter lines, schedule adherence. Urban systems.' },
  { id: 'layers',     name: 'layers',    glyph: 'z',      vibe: 'Z-Stack: depth slices, parallax archaeology. Core samples.' },
  { id: 'ca',         name: 'cellular',  glyph: 'ca',     vibe: 'Petri Dish: cellular colonies on agar. Wet biology.' },
  { id: 'orbit',      name: 'orbit',     glyph: 'orbit',  vibe: 'Planetarium: gravitational ballet. Moons and patience.' },
  { id: 'abacus',     name: 'abacus',    glyph: 'abacus', vibe: 'Counting House: beads on wires. Arithmetic made visible.' },
];

export const FLAGSHIP_VOICE_IDS = FLAGSHIP_VOICES.map((v) => v.id);

/** Resolve a voice definition to a complete, validated voice state. */
export function resolveVoiceState(def) {
  const { params: safe } = validateLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, ...(def.params || {}) });
  const pal = def.palette || {};
  return {
    params: safe,
    palette: {
      bg: normalizeHex(pal.bg) || '#0a0a0a',
      ink: normalizeHex(pal.ink) || '#f0f0e8',
      swatches: swatches8(Array.isArray(pal.swatches) && pal.swatches.length ? pal.swatches : ['#888888']),
    },
    fx: sanitizeFx(def.fx),
    assets: def.assets === 'all' ? 'all' : { ...(def.assets || {}) },
    blendSeconds: Number.isFinite(def.blendSeconds) && def.blendSeconds > 0 ? def.blendSeconds : 2,
  };
}

/** Clamp a raw fx block to the known shape. */
export function sanitizeFx(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const num01 = (v, d) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : d);
  return {
    grain: num01(r.grain, DEFAULT_FX.grain),
    vignette: !!r.vignette,
    posterize: !!r.posterize,
    edge: !!r.edge,
    glow: num01(r.glow, DEFAULT_FX.glow),
    contrast: Number.isFinite(Number(r.contrast)) ? Math.min(3, Math.max(0.25, Number(r.contrast))) : DEFAULT_FX.contrast,
  };
}

// ── MIX interpolation ─────────────────────────────────────────────────────
// Numbers and numeric arrays lerp; enums/booleans (and anything else) switch
// at the midpoint — the classic dissolve point. Int-bounded params round.

const INT_KEYS = new Set(
  Object.entries(PARAM_SPEC).filter(([, spec]) => spec.int).map(([k]) => k),
);

function isNumArray(v) {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

function lerpParamValue(from, to, t) {
  if (typeof from === 'number' && typeof to === 'number') return from + (to - from) * t;
  if (isNumArray(from) && isNumArray(to) && from.length === to.length) {
    return from.map((f, i) => f + (to[i] - f) * t);
  }
  // Spine E: stop snapping enums at 0.5. At t=0 return `from`; for t>0 return `to`
  // so the live target renders while the held outgoing frame dissolves over it.
  return t <= 0 ? from : (to !== undefined ? to : from);
}

function lerpHex(a, b, t) {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return t < 0.5 ? a : b;
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Blend two complete voice states. t=0 → from, t=1 → to. The palette
 * crossfades color-by-color; the params crossfade continuously. Enums and
 * assets take the target for t>0 while the loop's GPU hold dissolves the old frame.
 */
export function mixVoiceState(from, to, t) {
  const tc = Math.min(1, Math.max(0, t));
  const params = {};
  const keys = new Set([...Object.keys(from.params || {}), ...Object.keys(to.params || {})]);
  for (const k of keys) {
    let v = lerpParamValue(from.params?.[k], to.params?.[k], tc);
    if (INT_KEYS.has(k) && typeof v === 'number') v = Math.round(v);
    params[k] = v;
  }
  const n = Math.max(from.palette?.swatches?.length || 0, to.palette?.swatches?.length || 0, 1);
  const swatches = [];
  for (let i = 0; i < n; i++) {
    swatches.push(lerpHex(
      from.palette?.swatches?.[i] ?? from.palette?.swatches?.[0] ?? '#888888',
      to.palette?.swatches?.[i] ?? to.palette?.swatches?.[0] ?? '#888888',
      tc,
    ));
  }
  const fx = {};
  for (const k of Object.keys(DEFAULT_FX)) {
    const f = from.fx?.[k];
    const o = to.fx?.[k];
    fx[k] = (typeof f === 'number' && typeof o === 'number') ? f + (o - f) * tc : (tc <= 0 ? f : (o !== undefined ? o : f));
  }
  return {
    params,
    palette: {
      bg: lerpHex(from.palette?.bg || '#000000', to.palette?.bg || '#000000', tc),
      ink: lerpHex(from.palette?.ink || '#ffffff', to.palette?.ink || '#ffffff', tc),
      swatches,
    },
    fx,
    assets: tc <= 0 ? from.assets : (to.assets || from.assets),
    blendSeconds: to.blendSeconds ?? from.blendSeconds ?? 2,
  };
}

/**
 * The render-effective state for one frame: when a voice MIX is in flight,
 * the live loop reads the interpolated state instead of the raw store.
 * Palette comes back as overrides over the current catalog id so
 * resolvePalette keeps working unchanged.
 */
/**
 * Snapshot stops across one MIX. Color feeds the texture atlas (comboKey =
 * asset+ink+accent, #265), which bakes literal hex into pixels; count/
 * particleCount reshape which and how many assets get placed. Either one
 * changing invalidates the atlas, and the live loop holds the last frame
 * while it rebakes — measured on this instrument mid-mix at full per-frame
 * precision: ~85% of frames stall (median 15fps, spikes to 220ms) versus a
 * clean 60fps idle, because color and count both drift every single frame.
 * See docs/ORGANIC_MOTION.md §2.5 — same finding, independently.
 *
 * Stepping the params/palette the resolver sees to a bounded number of
 * snapshots turns that into a handful of brief holds instead of a
 * near-constant freeze. It still reads as evolution, not a jump cut: swarm/
 * hype physics, breathing, and audio-reactivity keep running live at 60fps
 * within each held snapshot — only the MIX's own target position pauses
 * between stops. Step COUNT scales with the mix's own duration (a flat
 * count would make HYPE's 0.8s signature cut choppy or MURM's 10s dissolve
 * needlessly rebake-prone) — ~6 rebakes/second of blend, clamped so a very
 * short or very long mix still gets a sane number of stops. Measured with
 * this: stalls drop from ~85% of frames to under 10%, median frame time
 * back to the clean-idle 16.6ms.
 *
 * This is the pragmatic fix, not the ideal one — ORGANIC_MOTION.md's "keep
 * drawing motion on existing combos while new ones bake" would give fully
 * continuous color with zero freeze, at the cost of the render pipeline
 * tolerating a stale/incomplete atlas (today renderer.mjs throws on a
 * missing cell). Left for that follow-up; this fix needs no pipeline
 * changes and is fully reversible by deleting this function's body.
 */
const MIX_STEPS_PER_SECOND = 6;
const MIX_STEPS_MIN = 3;
const MIX_STEPS_MAX = 40;

function mixStepCount(durationMs) {
  const seconds = Math.max(0.1, (Number(durationMs) || 2000) / 1000);
  return Math.min(MIX_STEPS_MAX, Math.max(MIX_STEPS_MIN, Math.round(seconds * MIX_STEPS_PER_SECOND)));
}

export function resolveLiveRenderState(s) {
  const mix = s.voiceMix;
  if (!mix || !mix.from || !mix.to) {
    return {
      layoutParams: s.layoutParams,
      paletteId: s.paletteId,
      paletteOverrides: s.paletteOverrides,
    };
  }
  const t = mix.t ?? 0;
  const steps = mixStepCount(mix.durationMs);
  const stepT = Math.round(t * steps) / steps;
  const mStep = mixVoiceState(mix.from, mix.to, stepT);
  // Spine D: smooth color lerp at 60fps (stills baker unaffected)
  const mSmooth = mixVoiceState(mix.from, mix.to, t);
  return {
    layoutParams: mStep.params,
    paletteId: s.paletteId,
    paletteOverrides: {
      bg: mSmooth.palette.bg,
      ink: mSmooth.palette.ink,
      swatches: mSmooth.palette.swatches,
    },
  };
}

/** Snapshot the current live state as a complete voice state (capture / mix-from). */
export function captureLiveVoiceState(s) {
  const mix = s.voiceMix;
  let params;
  let palette;
  let fx;
  if (mix && mix.from && mix.to) {
    const m = mixVoiceState(mix.from, mix.to, mix.t ?? 0);
    params = m.params;
    palette = m.palette;
    fx = m.fx;
  } else {
    params = { ...s.layoutParams };
    const p = resolvePalette(s.paletteId, s.paletteOverrides, s.userPalettes);
    palette = { bg: p.bg, ink: p.ink, swatches: [...p.swatches] };
    fx = {
      ...DEFAULT_FX,
      glow: Number.isFinite(Number(params.accumulationOptics)) ? Number(params.accumulationOptics) : 0,
    };
  }
  const enabled = s.enabledAssets || {};
  const ids = Object.keys(enabled);
  const allOn = ids.length > 0 && ids.every((id) => !!enabled[id]);
  return {
    params: validateLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, ...params }).params,
    palette: {
      bg: normalizeHex(palette.bg) || '#0a0a0a',
      ink: normalizeHex(palette.ink) || '#f0f0e8',
      swatches: swatches8(palette.swatches && palette.swatches.length ? palette.swatches : ['#888888']),
    },
    fx: sanitizeFx(fx),
    assets: allOn ? 'all' : { ...enabled },
    blendSeconds: 2,
  };
}

/** True when a mode id has a curated flagship voice. */
export function isFlagshipVoiceId(id) {
  return FLAGSHIP_VOICE_IDS.includes(id);
}

/** All mode ids that appear as chips (flagships + stubs). */
export function voiceChipModeIds() {
  return [...FLAGSHIP_VOICE_IDS, ...STUB_VOICES.map((v) => v.id)];
}

// Re-exported for the selfcheck without pulling the store in.
export { MODE_IDS };
