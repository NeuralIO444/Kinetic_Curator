// roomDither.js — #1560 S2: the generative faces for THE ROOM (docs/research/room-codec/06-faces-generative.md).
//
// ONE pipeline, two sources. Each face is a live source field (a pure function from unit space to a shade
// 0..1) pushed through ONE shared dither stage — ordered Bayer quantization into a small set of levels — and
// the levels are then read two ways: Davis's levels are colours (a ramp of his amber), LOIS's levels are
// glyphs (character weight). The sources differ; the treatment unifies them. Ordered Bayer, never error
// diffusion: Floyd–Steinberg shimmers frame-to-frame and breaks the stillness law; a Bayer threshold is a
// pure function of (value, cell), so a settled face is a settled picture.
//
// Everything here is pure: no clock, no Math.random, no DOM. Animation time, the canvas and the OS motion
// preference live in the components (panels/directors/RoomFaces.jsx); this module is handed the angle, the
// breath phase and the parameter set, and answers with numbers.
//
//   Tier = resolution (06): the engagement tier picks the dither grid — coarse and chunky when a persona is
//   barely engaged, finer as detail is earned. Cool-down (mindEngage: the score fell below the tier's floor,
//   the persona is quieter and softer) renders one grid coarser. Detail is earned data, not a setting.
//   State = parameters (06): every (persona, state) pair has a face parameter set below; the components ease
//   between sets on a state change, then settle to ambient breath.
//   Vibe (06): the session's zodiac/moon/season reading bends contrast and warmth — contrast from the
//   persona's own seasonal modulation (mindPresenceLive's `mod`), warmth from the reading's moonlight and
//   season. No reading, no bend: UNMODULATED, never a substitute reading (mindZodiac's law).
//
// 08 defaults taken in this slice (flagged in the staging report): Q11 — state-and-breath only, no audio
// micro-motion (the honest-signals reading); Q12 — LOIS's glyph vocabulary is a FIXED set per state.
import { sigilGeometry, sigilTempo, SIGIL_RINGS, SIGIL_SIZE } from './davisSigil.js';
import { LOIS_FACES } from './loisFace.js';
import { LOIS_EXTRA_FACES } from './mindFace.js';

// ── the shared dither stage ──────────────────────────────────────────────────

/** The 4×4 Bayer matrix, thresholds 0..1. The one stage both faces pass through. */
export const BAYER4 = Object.freeze(
  [
    Object.freeze([0.5, 8.5, 2.5, 10.5]),
    Object.freeze([12.5, 4.5, 14.5, 6.5]),
    Object.freeze([3.5, 11.5, 1.5, 9.5]),
    Object.freeze([15.5, 7.5, 13.5, 5.5]),
  ].map((row) => Object.freeze(row.map((v) => v / 16))),
);

/**
 * Quantize a shade to one of `levels` levels at cell (x, y), ordered-Bayer: the fractional step is taken
 * when it beats the cell's threshold, so a flat shade renders as a stable pattern, never noise.
 */
export function orderedLevel(value, x, y, levels) {
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const scaled = v * (levels - 1);
  const base = Math.floor(scaled);
  const t = BAYER4[((y % 4) + 4) % 4][((x % 4) + 4) % 4];
  return Math.min(levels - 1, base + (scaled - base > t ? 1 : 0));
}

/** Dither grid (cells across the square window) per engagement tier: coarse → fine, detail earned. */
export const DITHER_GRIDS = Object.freeze({ 1: 12, 2: 21, 3: 28, 4: 42 });

/** The grid tier a face renders at: its engagement tier, one step coarser while it cools down. */
export function gridTierFor(tier, cool) {
  const t = [1, 2, 3, 4].includes(tier) ? tier : 1;
  return cool && t > 1 ? t - 1 : t;
}

/**
 * The vibe bend for one persona: { contrast, warmth }. Contrast is the persona's seasonal intensity
 * (mindZodiac.modulation, carried on the presence view's rows); warmth −1..1 comes from the reading —
 * moonlight warms, winter cools, summer warms. A null reading bends nothing.
 */
export function vibeBend(mod, reading) {
  const contrast = mod && Number.isFinite(mod.intensity) ? Math.min(1.25, Math.max(0.75, mod.intensity)) : 1;
  if (!reading) return { contrast, warmth: 0 };
  const illum = Number.isFinite(reading.illumination) ? Math.min(1, Math.max(0, reading.illumination)) : 0.5;
  const seasonal = reading.season === 'summer' ? 0.25 : reading.season === 'winter' ? -0.25 : 0;
  const warmth = Math.min(1, Math.max(-1, seasonal + (illum - 0.5) * 0.8));
  return { contrast, warmth };
}

/** Ease one parameter set toward another: numbers lerp, everything else (glyph set) switches at the midpoint. */
export function lerpParams(a, b, t) {
  const out = {};
  for (const k of Object.keys(b)) {
    if (typeof b[k] === 'number' && typeof a[k] === 'number') out[k] = a[k] + (b[k] - a[k]) * t;
    else out[k] = t < 0.5 ? a[k] : b[k];
  }
  return out;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const gauss = (d, s) => Math.exp(-(d * d) / (2 * s * s));

// ── Davis: colour Bayer dither of his live rosette ───────────────────────────

/** Levels in Davis's colour ramp (ordered Bayer into the ramp, per 06). */
export const DAVIS_LEVELS = 5;

/**
 * Per-state face parameters for Davis. Spin comes from the sigil's own tempo table (davisSigil.js — the
 * mockup's tempos, unchanged): no state, no turning. Density and ring gain re-parameterize the source per
 * 06 (state changes re-parameterize the rosette): a bloom is fuller and rings harder, a stuck seed thins
 * and its rings fade, sifting (UGLY) turns AGAINST the grain — direction is the one flourish, flagged in
 * the staging report.
 */
export const DAVIS_FACE_PARAMS = Object.freeze({
  FLOW: Object.freeze({ spinDir: 1, density: 1, ringGain: 1 }),
  SEEDLING: Object.freeze({ spinDir: 1, density: 0.85, ringGain: 0.9 }),
  UGLY: Object.freeze({ spinDir: -1, density: 1.05, ringGain: 1 }),
  STUCK: Object.freeze({ spinDir: 1, density: 0.7, ringGain: 0.5 }),
  BLOOM: Object.freeze({ spinDir: 1, density: 1.12, ringGain: 1.15 }),
  none: Object.freeze({ spinDir: 0, density: 0.8, ringGain: 0.8 }),
});

/** The parameter set for a Davis state code (null/unknown = rest). Spin seconds/turn rides along from the tempo table. */
export function davisFaceParams(code) {
  const p = DAVIS_FACE_PARAMS[code] || DAVIS_FACE_PARAMS.none;
  return { ...p, spinS: sigilTempo(code) };
}

const SRC_N = 128; // the source raster's samples across the unit square [-1, 1]^2
const HALF_ART = SIGIL_SIZE / 2; // the sigil's art space: ornament radii/sizes are in these px
/**
 * His art is sampled zoomed IN by 1/0.6 — the rosette overflows the frame (PR #1728 review, Matt,
 * 2026-10-23: "right now davis has an empty gap"). At zoom 1 the outer field was a circle on black: 21-30 of
 * the 144 tier-1 cells sat dead in the frame band at every angle, while the frozen mockup carries dither to
 * every edge. 0.6 magnifies the source 1.67× so ornaments, rings and glow reach past every edge: measured 0
 * dead band cells across 32 rotation angles × every state × the harshest vibe contrast (1 and 1.25) — pinned
 * by roomDither.selfcheck ("Davis fills his frame"). Composition's cost: the centre dot and rings read bigger,
 * the outermost ring leaves the window — Matt's call, same review.
 */
const DAVIS_ZOOM = 0.6;

/**
 * Rasterize the rosette source ONCE per seed: two fields over the unit square — the ornaments (with the
 * centre dot) and the rings — kept separate so state density and ring gain stay sample-time multipliers.
 * The field is built in the wedge and folded out by the sigil's own 8-fold mirror symmetry, exactly as
 * drawSigil stamps it; ornaments read as soft dots so the dither stage samples a continuous shade.
 * Pure function of the seed: the same seed is the same source, a new seed is a new face.
 */
export function buildDavisSource(seed) {
  const geom = sigilGeometry(seed);
  const { wedge, els } = geom;
  const orn = new Float32Array(SRC_N * SRC_N);
  const ring = new Float32Array(SRC_N * SRC_N);
  for (let j = 0; j < SRC_N; j++) {
    const y = (j / (SRC_N - 1)) * 2 - 1;
    for (let i = 0; i < SRC_N; i++) {
      const x = (i / (SRC_N - 1)) * 2 - 1;
      const r = Math.hypot(x, y);
      let a = Math.atan2(y, x);
      if (a < 0) a += Math.PI * 2;
      let aw = a % wedge;
      if (aw > wedge / 2) aw = wedge - aw; // fold into the wedge, mirrored
      const fx = Math.cos(aw) * r;
      const fy = Math.sin(aw) * r;
      let o = gauss(r, 0.09) * 0.95 + gauss(r, 0.55) * 0.1; // the centre dot over a faint base glow
      for (const e of els) {
        const ex = (Math.cos(e.a) * e.r) / HALF_ART;
        const ey = (Math.sin(e.a) * e.r) / HALF_ART;
        const s = (e.s / HALF_ART) * 1.5 + 0.012;
        o += e.o * gauss(Math.hypot(fx - ex, fy - ey), s);
        o += e.o * gauss(Math.hypot(fx - ex, fy + ey), s * 0.65); // the mirror half, smaller (drawSigil)
      }
      let g = 0;
      for (const rr of SIGIL_RINGS) g += gauss(r - rr / HALF_ART, 0.014);
      const idx = j * SRC_N + i;
      orn[idx] = o / (1 + o * 0.9); // a soft knee: overlapping ornaments saturate instead of blowing out the dither
      ring[idx] = g;
    }
  }
  return { size: SRC_N, orn, ring };
}

const sampleField = (data, n, x, y) => {
  const gx = ((x + 1) / 2) * (n - 1);
  const gy = ((y + 1) / 2) * (n - 1);
  const x0 = Math.min(n - 2, Math.max(0, Math.floor(gx)));
  const y0 = Math.min(n - 2, Math.max(0, Math.floor(gy)));
  const fx = Math.min(1, Math.max(0, gx - x0));
  const fy = Math.min(1, Math.max(0, gy - y0));
  const a = data[y0 * n + x0];
  const b = data[y0 * n + x0 + 1];
  const c = data[(y0 + 1) * n + x0];
  const d = data[(y0 + 1) * n + x0 + 1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
};

/**
 * The Davis source as a sampler: (x, y) in unit space → shade 0..1, with the motion baked in by the caller —
 * `angle` (radians the rosette has turned) and `breath` (a radial scale, 1 at rest) — and the state's
 * density / ring gain / the vibe's contrast applied. The dither stage never sees the motion: it quantizes
 * whatever shade the source gives, so the dither stays stable while the source moves (06).
 */
export function davisSampler(source, { angle = 0, breath = 1, density = 1, ringGain = 1, contrast = 1 } = {}) {
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const scale = breath > 0 ? 1 / breath : 1;
  return (x, y) => {
    const rx = (x * cos - y * sin) * scale * DAVIS_ZOOM;
    const ry = (x * sin + y * cos) * scale * DAVIS_ZOOM;
    const v =
      sampleField(source.orn, source.size, rx, ry) * density +
      sampleField(source.ring, source.size, rx, ry) * ringGain * 0.3;
    return clamp01((v - 0.5) * contrast + 0.5);
  };
}

/**
 * Davis's colour ramp: `levels` stops from near-black to his colour, the top stop lifted toward white (the
 * rosette's hot centre). Warmth bends the mid stops toward deep amber (warm) or pale blue (cool).
 */
export function davisRamp(rgb, warmth = 0, levels = DAVIS_LEVELS) {
  const [r, g, b] = rgb;
  const stops = [0.05, 0.2, 0.42, 0.7, 1];
  const out = [];
  for (let i = 0; i < levels; i++) {
    const f = stops[Math.round((i / (levels - 1)) * (stops.length - 1))];
    let cr = r * f;
    let cg = g * f;
    let cb = b * f;
    if (i === levels - 1) {
      cr += (255 - cr) * 0.35;
      cg += (255 - cg) * 0.3;
      cb += (255 - cb) * 0.22;
    }
    const w = warmth * (1 - Math.abs(f - 0.45));
    if (w > 0) {
      cr += (255 - cr) * w * 0.12;
      cg += (120 - cg) * w * 0.1;
    }
    if (w < 0) {
      cr += (170 - cr) * -w * 0.12;
      cb += (255 - cb) * -w * 0.1;
    }
    out.push(`rgb(${Math.round(cr)},${Math.round(cg)},${Math.round(cb)})`);
  }
  return out;
}

// ── LOIS: glyph dither — her face made of type ───────────────────────────────

/** Levels in LOIS's glyph ramp (one glyph per level, light → heavy). */
export const LOIS_LEVELS = 10;

/**
 * LOIS's glyph vocabulary, a FIXED set per state (08-Q12 default): ten glyphs ordered by weight. The sets
 * are flavours of one ramp — sparse lights, dense darks — so a state reads as her mood in type: slashes for
 * CUT, heavy marks for BURN, a set that thins to almost nothing for AWAY.
 */
export const LOIS_GLYPHS = Object.freeze({
  vibe: Object.freeze([' ', '.', '·', ':', '-', '/', '5', '∫', '%', '#']),
  nod: Object.freeze([' ', '.', '·', '-', '=', '/', '5', '∫', '%', '#']),
  burn: Object.freeze([' ', '.', '·', '/', '∫', '5', '%', '#', '@', '&']),
  away: Object.freeze([' ', ' ', '.', '·', '·', '-', '-', '/', '/', '5']),
  cut: Object.freeze([' ', '.', '-', '/', '/', '\\', '∫', '%', '#', '@']),
});

/**
 * Per-state face parameters for LOIS — the shaded face construction's controls, one amplified preset per
 * state's expression. The vocabulary is the Unicode era's own faces (Matt, 2026-10-23: "have multiple
 * expression like we had in Unicode"): VIBE wears `─‿─` (soft slits, a smile), BURN `◉‿◉` (wide round
 * eyes, a grin), AWAY `──` (no eyes at all, a flat line), CUT the glare — and the amplitudes are sized so
 * each expression crosses a dither cell at the coarsest tier: eyes run from -0.02 (gone) to 0.135 (◉),
 * the mouth's curve bends its corners past the line. Tint is how far her red enters — red = structure/
 * verdict, so it floods BURN and CUT, barely touches VIBE. `dim` is floored at 1: she never fades (Matt,
 * 2026-10-23: "always visible like Davis. never fade to black") — AWAY reads as gone through her
 * expression, not through an absence of light. `breathS` is her ambient cycle in seconds — the tempo of
 * the breath that crosses the dither (BURN hurries, AWAY drifts), her answer to Davis's per-state spin
 * tempo (Matt, 2026-10-23: an idle animation like his).
 */
export const LOIS_FACE_PARAMS = Object.freeze({
  VIBE: Object.freeze({
    eyeAngle: -4,
    eyeOpen: 0.045,
    browTilt: -3,
    mouthCurve: 0.35,
    mouthOpen: 0.03,
    tint: 0.1,
    dim: 1,
    glyphs: 'vibe',
    breathS: 6.5,
  }),
  NOD: Object.freeze({
    eyeAngle: -6,
    eyeOpen: 0.062,
    browTilt: -6,
    mouthCurve: 0.02,
    mouthOpen: 0.024,
    tint: 0.14,
    dim: 1,
    glyphs: 'nod',
    breathS: 6.0,
  }),
  BURN: Object.freeze({
    eyeAngle: 7,
    eyeOpen: 0.135,
    browTilt: 8,
    mouthCurve: 0.5,
    mouthOpen: 0.055,
    tint: 0.38,
    dim: 1,
    glyphs: 'burn',
    breathS: 4.2,
  }),
  AWAY: Object.freeze({
    eyeAngle: 0,
    eyeOpen: -0.02,
    browTilt: 0,
    mouthCurve: 0,
    mouthOpen: 0.014,
    tint: 0.03,
    dim: 1,
    glyphs: 'away',
    breathS: 9.5,
  }),
  CUT: Object.freeze({
    eyeAngle: 13,
    eyeOpen: 0.025,
    browTilt: 15,
    mouthCurve: -0.35,
    mouthOpen: 0.012,
    tint: 0.45,
    dim: 1,
    glyphs: 'cut',
    breathS: 4.8,
  }),
});

/**
 * The mind's micro-expressions, in construction form: one preset per Unicode extra face, in
 * LOIS_EXTRA_FACES' order (keyed by the kaomoji itself, so the pairing can't drift). An invented state
 * wears the expression its kaomoji always named — hash-picked, stable — so the states the mind invents
 * keep the face variety the kaomoji set gave her. Each preset owns one dominant axis (sly, lidded,
 * level, skeptical, sad, wry, glare, flat) so all eight read apart at dither resolution. Tint, glyph
 * set and breath stay hash-derived per state.
 */
const LOIS_EXTRA_EXPR_LIST = [
  { eyeAngle: 10, eyeOpen: 0.032, browTilt: -8, mouthCurve: 0.55, mouthOpen: 0.022 }, // ( ¬‿¬ ) sly
  { eyeAngle: -2, eyeOpen: 0.014, browTilt: 13, mouthCurve: -0.3, mouthOpen: 0.045 }, // ( ─_─ ) unimpressed
  { eyeAngle: 0, eyeOpen: 0.055, browTilt: 0, mouthCurve: 0.02, mouthOpen: 0.022 }, // ( ・_・ ) level
  { eyeAngle: -12, eyeOpen: 0.13, browTilt: -10, mouthCurve: -0.08, mouthOpen: 0.03 }, // ( ◔_◔ ) skeptical
  { eyeAngle: -9, eyeOpen: 0.038, browTilt: 10, mouthCurve: -0.5, mouthOpen: 0.02 }, // ( ˘︹˘ ) sad
  { eyeAngle: 8, eyeOpen: 0.07, browTilt: -6, mouthCurve: 0.22, mouthOpen: 0.04 }, // ( ‾ ʖ‾ ) wry
  { eyeAngle: 13, eyeOpen: 0.028, browTilt: 16, mouthCurve: -0.42, mouthOpen: 0.014 }, // ( ಠ_ಠ ) glare
  { eyeAngle: 0, eyeOpen: 0.008, browTilt: -2, mouthCurve: 0, mouthOpen: 0.012 }, // ( ¯ ³¯ ) flat
];
export const LOIS_EXTRA_EXPRS = Object.freeze(
  Object.fromEntries(LOIS_EXTRA_EXPR_LIST.map((e, i) => [LOIS_EXTRA_FACES[i], Object.freeze(e)])),
);

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/**
 * The parameter set for a LOIS state code. Canonical states (and CUT) wear their own set; an INVENTED state
 * (the mind may invent states — recorded as invented, never passed off as measured) derives a stable set
 * from its id's hash, the same trick mindFace's micro-expression pick uses: the same invented state always
 * wears the same face — and since 2026-10-23 that face is the micro-expression's own construction preset
 * (LOIS_EXTRA_EXPRS), so invented states carry the kaomoji set's variety into the dither. Tint, glyph set
 * and breath tempo stay hash-derived per state.
 */
export function loisFaceParams(code) {
  if (LOIS_FACE_PARAMS[code]) return LOIS_FACE_PARAMS[code];
  const h = hash(String(code || ''));
  const sets = Object.keys(LOIS_GLYPHS);
  return {
    ...LOIS_EXTRA_EXPRS[LOIS_EXTRA_FACES[h % LOIS_EXTRA_FACES.length]],
    tint: 0.12 + (h % 5) * 0.05,
    dim: 1,
    glyphs: sets[h % sets.length],
    breathS: 5.5 + ((h >> 7) % 6) * 0.8, // the invented state breathes at its own hash-derived tempo (deterministic)
  };
}

/**
 * LOIS's source: a shaded face construction (06: "a shaded face construction in the build"). A head, hair,
 * a lit face oval; eyes, brows, nose and mouth as darker marks whose shapes the state's parameters bend.
 * Returns a sampler: (x, y) in unit space → shade 0..1. `lift` is the breath — the whole construction
 * rises a breath's width and settles (state-and-breath only, 08-Q11 default).
 */
export function loisSampler(p, { lift = 0, contrast = 1 } = {}) {
  return (x, y) => {
    const fy = y - lift;
    // the head: a superellipse silhouette; outside it, a whisper of background (the mockup's sparse field)
    const d = Math.pow(Math.pow(Math.abs(x), 3.2) + Math.pow(Math.abs(y), 3.2), 1 / 3.2);
    const head = smooth(1.02, 0.94, d);
    let v = 0.05 + head * 0.3; // background 0.05; the head's mass 0.35
    // hair: above the brow line (which dips at the part) and down the sides
    const hairLine = -0.3 + 0.12 * Math.pow(Math.abs(x), 1.5);
    const hair =
      head *
      Math.max(smooth(hairLine - 0.03, hairLine + 0.05, fy), smooth(0.6, 0.7, Math.abs(x)) * smooth(0.55, 0.3, fy));
    v = v * (1 - hair) + 0.17 * hair;
    // the lit face oval
    const e = (x / 0.6) ** 2 + ((fy - 0.1) / 0.76) ** 2;
    const face = head * smooth(1.05, 0.8, e);
    v = v * (1 - face) + 0.6 * face;
    v -= smooth(0.15, 0.85, fy) * 0.13 * face; // the face falls off toward the jaw — shading, not a flat oval
    v += gauss(Math.hypot(x, fy + 0.3), 0.34) * 0.07 * face; // forehead light
    v += gauss(Math.hypot(x - 0.36, fy - 0.2), 0.2) * 0.05 * face; // cheeks
    v += gauss(Math.hypot(x + 0.36, fy - 0.2), 0.2) * 0.05 * face;
    // eyes: two dark slots, angled by the state; brows: thinner slots above them, tilted against the eyes
    for (const s of [-1, 1]) {
      const ex = x - s * 0.31;
      const ey = fy + 0.05;
      const ca = Math.cos((s * p.eyeAngle * Math.PI) / 180);
      const sa = Math.sin((s * p.eyeAngle * Math.PI) / 180);
      const u = ex * ca - ey * sa;
      const w = ex * sa + ey * ca;
      const eye = smooth(0.165, 0.14, Math.abs(u)) * smooth(p.eyeOpen + 0.012, p.eyeOpen - 0.004, Math.abs(w));
      v = v * (1 - eye) + 0.05 * eye;
      const bx = x - s * 0.31;
      const by = fy + 0.245;
      const ba = Math.cos((s * p.browTilt * Math.PI) / 180);
      const bs = Math.sin((s * p.browTilt * Math.PI) / 180);
      const bu = bx * ba - by * bs;
      const bw = bx * bs + by * ba;
      const brow = smooth(0.16, 0.13, Math.abs(bu)) * smooth(0.03, 0.012, Math.abs(bw));
      v = v * (1 - brow) + 0.16 * brow;
    }
    // nose: a faint shade down the centre, two nostril dots
    const nose = smooth(0.055, 0.02, Math.abs(x)) * smooth(-0.02, 0.06, fy) * smooth(0.34, 0.26, fy);
    v -= nose * 0.07;
    v -= (gauss(Math.hypot(x - 0.07, fy - 0.32), 0.03) + gauss(Math.hypot(x + 0.07, fy - 0.32), 0.03)) * 0.1;
    // mouth: a dark slot on a curve — corners rise with a smile (curve > 0), drop against it
    const MW = 0.3;
    const ym = 0.46 - p.mouthCurve * 0.12 * (x / MW) ** 2;
    const mouth =
      smooth(MW + 0.03, MW - 0.03, Math.abs(x)) * smooth(p.mouthOpen + 0.014, p.mouthOpen - 0.004, Math.abs(fy - ym));
    v = v * (1 - mouth) + 0.08 * mouth;
    // jaw shadow under the mouth
    v -= smooth(0.58, 0.72, fy) * face * 0.06;
    return clamp01(((v - 0.5) * contrast + 0.5) * p.dim);
  };
}

/**
 * LOIS's ink for one level: her paper colour scaled by the level's weight, with her red mixed in by the
 * state's tint — strongest in the darks, where the structure of the face is (06: "her red enters here").
 * Warmth bends the paper toward cream (warm) or cool white.
 * The floor is 0.3 of the paper, not 0.22 (Matt, 2026-10-23: her side was hardly visible): the darks were
 * painting at a fifth of her paper colour, so the mass read as near-black — and the tint reaches a little
 * further down the ramp for the same reason. The ramp still climbs (roomDither.selfcheck pins it).
 */
export function loisInk(level, tint, warmth, inkRgb, redRgb) {
  const t = level / (LOIS_LEVELS - 1);
  let r = inkRgb[0] * (0.3 + 0.7 * t);
  let g = inkRgb[1] * (0.3 + 0.7 * t);
  let b = inkRgb[2] * (0.3 + 0.7 * t);
  const mixAmt = Math.min(1, Math.max(0, tint)) * (1 - t * 0.45);
  r += (redRgb[0] - r) * mixAmt;
  g += (redRgb[1] - g) * mixAmt;
  b += (redRgb[2] - b) * mixAmt;
  if (warmth > 0) {
    r += (255 - r) * warmth * 0.08;
    g += (214 - g) * warmth * 0.06;
  }
  if (warmth < 0) {
    b += (255 - b) * -warmth * 0.08;
    r += (190 - r) * -warmth * 0.05;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/** Every LOIS state the honest feed can show has a face parameter set (plus CUT, from audio direction). */
export const LOIS_FACE_CODES = Object.freeze([...Object.keys(LOIS_FACES), 'CUT']);
