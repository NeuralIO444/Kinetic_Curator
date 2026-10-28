// mindConduct.js — #1483 trio audio direction, stage 1: what the trio may do to the audio show. Pure, fail-closed.
//
//   Davis conducts: he proposes one edit to the route table (add / remove / retarget / depth), inside the target's clamps
//   and the 16-route cap, and it lands on a phrase boundary (4 bars), at most one per phrase.
//   LOIS judges: a show that stays pinned and flat is a failed show (BURN), and Davis re-rolls to the next preset.
//   The artist is sovereign: a target the artist touched this session is owned, and a proposal against it is dropped.
//   Boldness is tier-gated (the engagement tier, Mind 3): tier 1 makes no route edits.
//   Stage 2: he may also re-tune the spectrum marks on the CONTENT strata (STIMULI -> SPECTRUM: which frequency a mark
//   listens by, and how much it scales / displaces / colours by it) — the `spectrum` op, same gate, same phrase, same
//   sovereignty (moving a marks dial by hand owns it), tier 3 and up.
//
// Nothing here touches the bus, the clock or the store. mindContract validates a reply's `route`; mindRules asks
// davisRoute / flatShow; the live driver (a later PR) applies what passes the gate and records the delta.
import { ROUTE_INPUTS, ROUTE_TARGETS, MAX_ROUTES } from '../gl/audioRoutes.mjs';
import { routeDepthRange } from '../data/audioRoutes.js';

export const PHRASE_BARS = 4;
export const ROUTE_OPS = Object.freeze(['add', 'remove', 'retarget', 'depth', 'spectrum']);
/**
 * Which ops each engagement tier may make (Mind 3 tiers: t1 faces only · t2 depth nudges · t3 add/retarget · t4 all).
 * Stage 2's `spectrum` op re-tunes how the marks listen — a structural change like a retarget, so tier 3 and up.
 */
export const TIER_OPS = Object.freeze({
  t1: Object.freeze([]),
  t2: Object.freeze(['depth']),
  t3: Object.freeze(['depth', 'add', 'retarget', 'spectrum']),
  t4: Object.freeze(['depth', 'add', 'retarget', 'remove', 'spectrum']),
});

// ── stage 2: the spectrum marks (gl/spectrumMarks.mjs) ──────────────────────────────────────────────────────────────
/** The marks' dials, by the name a `spectrum` op uses -> the layout key the STIMULI -> SPECTRUM panel moves. */
export const SPECTRUM_PARAMS = Object.freeze({
  map: 'spectrumMap',
  scale: 'spectrumScale',
  displace: 'spectrumDisplace',
  colour: 'spectrumColour',
});
/** How many listening maps there are (INDEX, ANGLE, POSITION, HASH — gl/spectrumMarks.mjs SPECTRUM_MAPS). */
export const SPECTRUM_MAP_COUNT = 4;
const SPECTRUM_MAP_NAMES = Object.freeze(['INDEX', 'ANGLE', 'POSITION', 'HASH']);
/** The sovereignty target a `spectrum` op touches (owned when the artist moves that dial by hand). */
export const spectrumTarget = (key) => `spectrum.${key}`;
const spectrumValue = (key, v) => {
  if (!Number.isFinite(v)) return null;
  if (key === 'map') return Number.isInteger(v) && v >= 0 && v < SPECTRUM_MAP_COUNT ? v : null;
  return v >= 0 && v <= 1 ? Math.round(v * 1000) / 1000 : null;
};
/** A persona backs off for this many bars once the artist has reverted its edits BACKOFF_REVERTS times. */
export const BACKOFF_REVERTS = 3;
export const BACKOFF_BARS = 32;
/** The rules backend keeps at most this many routes of its own in the table. */
export const DAVIS_MAX_ROUTES = 3;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasTarget = (t) => typeof t === 'string' && Object.prototype.hasOwnProperty.call(ROUTE_TARGETS, t);
// a route target, or (stage 2) a spectrum-marks dial: both can be owned by the artist's hand
const isOwnable = (t) =>
  hasTarget(t) || (typeof t === 'string' && Object.keys(SPECTRUM_PARAMS).some((k) => t === `spectrum.${k}`));
const hasInput = (i) => typeof i === 'string' && ROUTE_INPUTS.includes(i);
// out of range is malformed, not clamped: an untrusted reply that says 90 has told us something is wrong
const depthIn = (target, d) => {
  if (!Number.isFinite(d)) return null;
  const { min, max } = routeDepthRange(target);
  return d >= min && d <= max ? d : null;
};

/**
 * A route edit as a clean object, or null when malformed. `undefined` in -> `undefined` out (nothing said).
 *   { op:'add', input, target, depth } · { op:'remove', input, target } · { op:'retarget', input, from, to } ·
 *   { op:'depth', input, target, depth } · stage 2: { op:'spectrum', key: map|scale|displace|colour, value }
 *   (map an integer 0..3, an amount 0..1)
 */
export function validateRouteOp(raw) {
  if (raw === undefined) return undefined;
  if (raw === null) return null; // an explicit "no edit": the caller treats null as nothing, never as malformed
  if (isObj(raw) && raw.op === 'spectrum') {
    const key = Object.prototype.hasOwnProperty.call(SPECTRUM_PARAMS, raw.key) ? raw.key : null;
    // a number only: Number(null) / Number('') / Number(true) would pass as 0 / 0 / 1
    const value = key && typeof raw.value === 'number' ? spectrumValue(key, raw.value) : null;
    return value === null ? false : { op: 'spectrum', key, value };
  }
  if (!isObj(raw) || !ROUTE_OPS.includes(raw.op) || !hasInput(raw.input)) return false;
  if (raw.op === 'retarget')
    return hasTarget(raw.from) && hasTarget(raw.to) && raw.from !== raw.to
      ? { op: 'retarget', input: raw.input, from: raw.from, to: raw.to }
      : false;
  if (!hasTarget(raw.target)) return false;
  if (raw.op === 'remove') return { op: 'remove', input: raw.input, target: raw.target };
  const depth = depthIn(raw.target, Number(raw.depth));
  return depth === null ? false : { op: raw.op, input: raw.input, target: raw.target, depth };
}

/** The targets an edit would touch (for the sovereignty check). */
export function opTargets(op) {
  if (!op) return [];
  if (op.op === 'spectrum') return [spectrumTarget(op.key)];
  return op.op === 'retarget' ? [op.from, op.to] : [op.target];
}

const pairIndex = (table, input, target) => table.findIndex((r) => r && r.input === input && r.target === target);

/**
 * Apply one edit to a table. Pure. Returns { routes, delta } or null when it cannot apply (a missing or duplicate pair, a
 * full table). `delta` is what a take records: { op, before, after } where before/after are the affected route or null.
 */
export function applyRouteOp(table, op, by = null) {
  if (!Array.isArray(table) || !op) return null;
  // a row keeps its tag (`by`) unless this edit is the one that makes it Davis's
  const routes = table.map((r) => ({
    input: r.input,
    target: r.target,
    depth: r.depth,
    ...(r.by ? { by: r.by } : {}),
  }));
  const mark = (row) => (by ? { ...row, by } : row);
  if (op.op === 'add') {
    if (routes.length >= MAX_ROUTES || pairIndex(routes, op.input, op.target) >= 0) return null;
    const after = mark({ input: op.input, target: op.target, depth: op.depth });
    routes.push(after);
    return { routes, delta: { op: 'add', before: null, after } };
  }
  if (op.op === 'remove') {
    const i = pairIndex(routes, op.input, op.target);
    if (i < 0) return null;
    const [before] = routes.splice(i, 1);
    return { routes, delta: { op: 'remove', before, after: null } };
  }
  if (op.op === 'retarget') {
    const i = pairIndex(routes, op.input, op.from);
    if (i < 0 || pairIndex(routes, op.input, op.to) >= 0) return null;
    const before = { ...routes[i] };
    const { min, max } = routeDepthRange(op.to);
    routes[i] = mark({ input: op.input, target: op.to, depth: Math.min(max, Math.max(min, routes[i].depth)) }); // the new target's own ceiling
    return { routes, delta: { op: 'retarget', before, after: routes[i] } };
  }
  if (op.op === 'depth') {
    const i = pairIndex(routes, op.input, op.target);
    if (i < 0) return null;
    const before = { ...routes[i] };
    routes[i] = mark({ ...routes[i], depth: op.depth });
    return { routes, delta: { op: 'depth', before, after: routes[i] } };
  }
  return null;
}

/** The tag a route row carries when Davis made or changed it (the MATRIX shows it; touching the row clears it). */
export const DAVIS_TAG = 'davis';

/** One line for the persona feed: what an edit is, in the route table's own words. */
export function describeOp(op) {
  if (!op || typeof op !== 'object') return '';
  const d = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : '?');
  if (op.op === 'add') return `+ ${op.input} > ${op.target} ${d(op.depth)}`;
  if (op.op === 'remove') return `- ${op.input} > ${op.target}`;
  if (op.op === 'retarget') return `${op.input}: ${op.from} > ${op.to}`;
  if (op.op === 'depth') return `${op.input} > ${op.target} depth ${d(op.depth)}`;
  if (op.op === 'spectrum')
    return op.key === 'map'
      ? `marks listen by ${SPECTRUM_MAP_NAMES[op.value] ?? '?'}`
      : `marks ${op.key} ${d(op.value)}`;
  return '';
}

/** The next bar a proposal made at `bar` may land on: the phrase boundary at or after it. */
export function landingBar(bar) {
  if (!Number.isInteger(bar)) return null;
  const r = ((bar % PHRASE_BARS) + PHRASE_BARS) % PHRASE_BARS;
  return r === 0 ? bar : bar + (PHRASE_BARS - r);
}

export const phraseOf = (bar) => Math.floor(bar / PHRASE_BARS);

// ── Davis's rules-backend presets ────────────────────────────────────────────────────────────────────────────────────
// Today the mids and treble bands drive nothing by default, so wiring them somewhere musical is his opening job. Each
// candidate is a route to ADD; `bpm` (optional) is the tempo range it suits. Depths are inside every target's range
// (the selfcheck proves it). Deterministic: no clock, no random.
// `bold` (0..1, #1483 "how hot") is how daring a move is: light colour/glow/alpha wiring is safe (0..0.3), moving the
// marks' size and hue is bolder (0.5..0.6), squashing them and driving the motion clock is daring (0.7..1). The
// conducting temperature orders his tries by it; LOIS's brake caps it.
export const PRESETS = Object.freeze({
  low: Object.freeze([
    { input: 'band.mids', target: 'render.glow', depth: 0.3, bold: 0 },
    { input: 'band.air', target: 'render.breath', depth: 0.04, bold: 0.2 },
    { input: 'band.pres', target: 'render.alpha', depth: 6, bold: 0.1 },
  ]),
  mid: Object.freeze([
    { input: 'band.mids', target: 'render.scale', depth: 0.15, bold: 0.5 },
    { input: 'band.pres', target: 'render.glow', depth: 0.4, bold: 0.2 },
    { input: 'band.air', target: 'color.hue', depth: 20, bold: 0.6 },
    { input: 'band.edge', target: 'clock.kinemeRate', depth: 0.6, bpm: [100, 220], bold: 0.8 },
  ]),
  high: Object.freeze([
    { input: 'band.edge', target: 'render.squash', depth: 0.3, bold: 0.7 },
    { input: 'band.air', target: 'clock.kinemeRate', depth: 1, bpm: [110, 220], bold: 0.9 },
    { input: 'band.pres', target: 'render.scale', depth: 0.25, bold: 0.5 },
    { input: 'band.mids', target: 'clock.kinemeRate', depth: 1.5, bpm: [100, 220], bold: 1 },
    { input: 'band.air', target: 'render.glow', depth: 0.5, bold: 0.3 },
  ]),
});
export const ENERGY_LEVELS = Object.freeze(['low', 'mid', 'high']);

/**
 * #1483 "how hot" (Matt 2026-10-16): the conducting lean is a TEMPERATURE ON PROPOSAL BOLDNESS — cool = safe, proven
 * moves; hot = daring picks. Davis is the wild man (Matt 2026-10-27): every move stays in his reach at any heat, and
 * the temperature only ORDERS his tries — cool, the safer moves of his level come first; hot, the daring ones do. The
 * order is by bands of distance from the heat (BOLD_BAND wide); the seed rotates inside a band.
 */
export const BOLD_BAND = 0.5;
const clampUnit = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
/** How far down his order a candidate sits for a heat (0 = tried first). An unrated candidate counts as daring. */
export const boldBand = (bold, heat) =>
  Math.max(0, Math.floor(Math.abs((Number.isFinite(bold) ? bold : 1) - clampUnit(heat)) / BOLD_BAND - 1e-9));
/**
 * LOIS's brake (Matt 2026-10-27: she is the cautious one). When the artist has been passing a lot (her keep-rate read,
 * flatBias, at or over BRAKE_AT), she holds Davis to the safe moves — bold at most BRAKE_MAX — until keeps come back.
 */
export const BRAKE_AT = 0.5;
export const BRAKE_MAX = 0.4;

/**
 * Davis's rules-backend conducting. Pure.
 * @param show  the context's `show` block (mindContext): { energy, bpm, silent, routes:[{input,target,depth}], owned:[], flatBars, ... }
 * @param seed  the decision seed (document seed x bar), so the same dish conducts the same way
 * @param heat  0..1, the conducting temperature: it orders his tries inside the level (boldBand) — never what is in reach.
 *              What is in reach narrows only on LOIS's brake (`show.brake`: the safe moves, bold <= BRAKE_MAX).
 * @returns an add op (or, on a flat show, a retarget of one of his own rows), or null (nothing worth doing: silence, a full
 *          table, he already holds his few, every candidate already wired or owned)
 */
export function davisRoute(show, seed = 0, heat = 0) {
  if (!show || show.silent) return null;
  const level = ENERGY_LEVELS.includes(show.energy) ? show.energy : 'mid';
  const table = Array.isArray(show.routes) ? show.routes : [];
  if (table.length >= MAX_ROUTES) return null;
  const owned = new Set(Array.isArray(show.owned) ? show.owned : []);
  const bpm = Number.isFinite(show.bpm) ? show.bpm : null;
  const fits = (c) => !c.bpm || bpm === null || (bpm >= c.bpm[0] && bpm <= c.bpm[1]);
  // a flat show re-rolls as soon as LOIS has read it flat (the flatness window is itself a phrase), and again for every
  // further phrase it stays flat: each moves to the next preset level, then wraps
  const rerolls = Math.ceil(Math.max(0, Number(show.flatBars) || 0) / PHRASE_BARS);
  const order = ENERGY_LEVELS.indexOf(level);
  const pool = [];
  for (let k = 0; k < ENERGY_LEVELS.length; k++) {
    const lvl = ENERGY_LEVELS[(order + rerolls + k) % ENERGY_LEVELS.length];
    for (const c of PRESETS[lvl]) if (fits(c)) pool.push(c);
  }
  const start = pool.length
    ? (seed >>> 0) % Math.min(pool.length, PRESETS[ENERGY_LEVELS[(order + rerolls) % 3]].length)
    : 0;
  // the temperature orders his tries: his level first (energy decides it), then the band of boldness nearest the heat,
  // then the seed's rotation. LOIS's brake is the only thing that takes a move out of reach.
  const lead = PRESETS[ENERGY_LEVELS[(order + rerolls) % 3]].filter(fits).length;
  const braked = show.brake === true;
  const tries = pool
    .map((c, i) => ({
      c,
      lvl: i < lead ? 0 : 1,
      band: boldBand(c.bold, heat),
      rot: (i - start + pool.length) % pool.length,
    }))
    .filter((t) => !braked || (Number.isFinite(t.c.bold) ? t.c.bold : 1) <= BRAKE_MAX)
    .sort((a, b) => a.lvl - b.lvl || a.band - b.band || a.rot - b.rot)
    .map((t) => t.c);
  const mine = table.filter((r) => r && r.by === DAVIS_TAG);
  // a flat show with a route of his: move it somewhere else (one move, no pile-up)
  if (rerolls > 0 && mine.length > 0) {
    const m = mine[0];
    for (const c of tries) {
      if (
        c.target === m.target ||
        owned.has(c.target) ||
        owned.has(m.target) ||
        pairIndex(table, m.input, c.target) >= 0
      )
        continue;
      return { op: 'retarget', input: m.input, from: m.target, to: c.target };
    }
    return null;
  }
  if (mine.length >= DAVIS_MAX_ROUTES) return null; // he conducts with a few, he does not fill the table
  for (const c of tries) {
    if (owned.has(c.target) || pairIndex(table, c.input, c.target) >= 0) continue;
    return { op: 'add', input: c.input, target: c.target, depth: c.depth };
  }
  return null;
}

// ── stage 2: Davis re-tunes the spectrum marks ──────────────────────────────────────────────────────────────────
/** The amount he turns on first, by the energy of the show: quiet shows colour, busy ones push the marks around. */
export const SPECTRUM_OPENERS = Object.freeze({
  low: Object.freeze({ key: 'colour', value: 0.35 }),
  mid: Object.freeze({ key: 'scale', value: 0.3 }),
  high: Object.freeze({ key: 'displace', value: 0.4 }),
});
/**
 * Davis's rules-backend move on the spectrum marks. Pure. Only asked when the route table has nothing for him (davisRoute
 * returned null), so stage 1's conducting is unchanged; one edit a phrase either way (the conductor's ledger).
 *   - marks off (every amount 0): turn one amount on — SPECTRUM_OPENERS[energy] — unless that dial is owned
 *   - a flat show with the marks on: re-roll how they listen (the next map, past the owned and the current one)
 *   - otherwise nothing: he does not fiddle with marks that are working
 * @param show  the `show` block, with `marks: { map, scale, displace, colour }` (absent = no marks to tune: null)
 * @returns a `spectrum` op or null
 */
export function davisSpectrum(show, seed = 0) {
  if (!show || show.silent || !isObj(show.marks)) return null;
  const m = show.marks;
  const owned = new Set(Array.isArray(show.owned) ? show.owned : []);
  const amounts = ['scale', 'displace', 'colour'];
  const on = amounts.some((k) => Number(m[k]) > 0);
  if (!on) {
    const level = ENERGY_LEVELS.includes(show.energy) ? show.energy : 'mid';
    const pick = SPECTRUM_OPENERS[level];
    return owned.has(spectrumTarget(pick.key)) ? null : { op: 'spectrum', key: pick.key, value: pick.value };
  }
  const flat = Number(show.flatBars) > 0;
  if (!flat || owned.has(spectrumTarget('map'))) return null;
  const cur = Number.isInteger(m.map) && m.map >= 0 && m.map < SPECTRUM_MAP_COUNT ? m.map : 0;
  // the next map along, offset by the seed so the same dish re-rolls the same way; never the one already listening
  const step = 1 + ((seed >>> 0) % (SPECTRUM_MAP_COUNT - 1));
  return { op: 'spectrum', key: 'map', value: (cur + step) % SPECTRUM_MAP_COUNT };
}

// ── LOIS: is the show flat? ─────────────────────────────────────────────────────────────────────────────────────────
/** How hard the keep-rate may move LOIS's flat-show threshold: +/- this share of it (0.5 = from half to one and a half). */
export const FLAT_BIAS_SWING = 0.5;
/** A keep for about one roll in seven is the rate she reads as "happy with what is happening". */
const HAPPY_KEEP_RATE = 0.15;
/** Fewer rolls than this is not enough to read a rate from: the bias eases in. */
const BIAS_FULL_AT_ROLLS = 8;

/**
 * LOIS's keep-rate read, in -1..+1. Pure. Keeping a lot (a high keep rate) is -1: she loosens, and lets a steady show
 * ride. Rolling past frame after frame without keeping (passes pile up) is +1: she tightens, and calls it flat sooner.
 * No rolls, or only a few, is near 0: there is nothing to read yet.
 * @param keeps keeps in the recent window
 * @param rolls rolls in the same window (a pass is a roll nobody kept)
 */
export function flatBias({ keeps, rolls } = {}) {
  const r = Number.isFinite(rolls) && rolls > 0 ? rolls : 0;
  if (r === 0) return 0;
  const k = Number.isFinite(keeps) && keeps > 0 ? Math.min(keeps, r) : 0;
  const rate = k / r;
  const lean = Math.max(-1, Math.min(1, (HAPPY_KEEP_RATE - rate) / HAPPY_KEEP_RATE)); // 0 keeps: +1; at 0.3 or more: -1
  return lean * Math.min(1, r / BIAS_FULL_AT_ROLLS);
}

/**
 * The show is flat when the sound is on and the picture has nothing to move with. LOIS reads it two ways:
 *   - stage 2 (#1483), the spectrum, when every bar of the window carried one (the show block's `spectrum`):
 *       HELD  the spectrum barely travelled bar to bar all phrase (mean flux under FLUX_HELD — a drone, a held chord,
 *             a loop that never changes colour), or
 *       NOISE it stayed a wall of noise all phrase (mean spectral flatness over NOISE_FLAT — no structure to follow);
 *   - stage 1, the seven bands, otherwise: every band stopped moving (spread under eps) or all pinned near the top.
 * Silence is not a failed show. Pure state machine fed one sample a bar. The keep-rate bias moves BOTH "how still is
 * still" thresholds the same way (setBias), never the noise wall.
 */
/** Mean bar-to-bar spectrum flux (showSpectrum's 0..1 unit) under which a phrase reads as held. A first value. */
export const FLUX_HELD = 0.05;
/** Mean spectral flatness (1 = white noise) over which a phrase reads as a wall of noise. A first value. */
export const NOISE_FLAT = 0.9;

export function createFlatness({ windowBars = PHRASE_BARS, eps = 0.03, minLevel = 0.05, pinned = 0.92 } = {}) {
  const rows = [];
  const specs = []; // one per row: { flux, flatness } or null (that bar carried no spectrum)
  let flatBars = 0;
  let scale = 1; // the keep-rate bias, as a factor on the "still" thresholds
  let lastWhy = null; // 'held' | 'noise' | 'still' | 'pinned' | null
  const unit = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  const specOf = (sp) =>
    sp && Number.isFinite(sp.flux) && Number.isFinite(sp.flatness)
      ? { flux: unit(sp.flux), flatness: unit(sp.flatness) }
      : null;
  const reading = () => {
    if (rows.length === 0) return { level: 0, spread: 0, full: false, source: null };
    const n = rows[0].length;
    let level = 0;
    let spread = 0;
    for (let b = 0; b < n; b++) {
      let mean = 0;
      for (const r of rows) mean += r[b];
      mean /= rows.length;
      let v = 0;
      for (const r of rows) v += (r[b] - mean) * (r[b] - mean);
      level += mean;
      spread += Math.sqrt(v / rows.length);
    }
    const out = { level: level / n, spread: spread / n, full: rows.length >= windowBars, source: 'bands' };
    if (specs.length && specs.every(Boolean)) {
      out.source = 'spectrum';
      out.flux = specs.reduce((a, s) => a + s.flux, 0) / specs.length;
      out.flatness = specs.reduce((a, s) => a + s.flatness, 0) / specs.length;
    }
    return out;
  };
  return {
    /**
     * One sample per bar: an array of band levels (any length), or null for no audio (clears the run); and, from
     * stage 2, that bar's spectrum summary { flux, flatness } (or null: this bar is judged on the bands).
     */
    push(bands, spectrum = null) {
      if (!Array.isArray(bands) || bands.length === 0) {
        rows.length = 0;
        specs.length = 0;
        flatBars = 0;
        lastWhy = null;
        return false;
      }
      rows.push(bands.map(unit));
      specs.push(specOf(spectrum));
      if (rows.length > windowBars) {
        rows.shift();
        specs.shift();
      }
      const r = reading();
      let why = null;
      if (r.full && r.level >= minLevel) {
        if (r.source === 'spectrum') {
          if (r.flux < FLUX_HELD * scale) why = 'held';
          else if (r.flatness > NOISE_FLAT) why = 'noise';
        } else if (r.spread < eps * scale) why = 'still';
        else if (r.level > pinned) why = 'pinned';
      }
      lastWhy = why;
      flatBars = why ? flatBars + 1 : 0;
      return why !== null;
    },
    flatBars: () => flatBars,
    /** Why the last bar read flat ('held' | 'noise' on the spectrum, 'still' | 'pinned' on the bands), or null. */
    why: () => lastWhy,
    /** LOIS's keep-rate read (flatBias): -1 loosens (how still it must be falls), +1 tightens (a livelier show is called flat). */
    setBias(b) {
      scale = 1 + FLAT_BIAS_SWING * (Number.isFinite(b) ? Math.max(-1, Math.min(1, b)) : 0);
    },
    /** The "still" threshold now, as moved by the bias: the spectrum's flux bar when it is judging, else the bands' spread. */
    threshold: () => (reading().source === 'spectrum' ? FLUX_HELD : eps) * scale,
    reading,
    reset() {
      rows.length = 0;
      specs.length = 0;
      flatBars = 0;
      lastWhy = null;
    },
  };
}

// ── sovereignty, the rate limit and the backoff ──────────────────────────────────────────────────────────────────────
/**
 * The conductor's ledger. Pure state, no clock: every call is told the bar.
 *   touch(targets)          the artist acted on these targets: they are owned for the session
 *   consider(op, {bar,tier}) -> { ok: true, landBar } | { ok: false, reason: 'tier'|'owned'|'cooldown'|'malformed' }
 *                            (a second edit in a phrase is not dropped: it lands on the next boundary)
 *   commit(landBar)          an edit landed in that phrase
 *   revert(bar)              the artist undid / reverted a persona edit: BACKOFF_REVERTS of them start a cool-down
 */
export function createConductor() {
  const owned = new Set();
  const phrases = new Set();
  let reverts = 0;
  let coolUntil = -Infinity;
  return {
    touch(targets) {
      for (const t of Array.isArray(targets) ? targets : [targets]) if (isOwnable(t)) owned.add(t);
    },
    owned: () => [...owned].sort(),
    isOwned: (t) => owned.has(t),
    consider(op, { bar, tier } = {}) {
      if (!op || !ROUTE_OPS.includes(op.op) || !Number.isInteger(bar)) return { ok: false, reason: 'malformed' };
      if (!(TIER_OPS[tier] || []).includes(op.op)) return { ok: false, reason: 'tier' };
      if (bar < coolUntil) return { ok: false, reason: 'cooldown' };
      if (opTargets(op).some((t) => owned.has(t))) return { ok: false, reason: 'owned' };
      // one edit per phrase: a proposal that would land in a phrase that has had its edit waits for the next boundary
      // A request is released on a bar tick, AFTER that bar's own tick has run, so the earliest it can land is the next
      // boundary strictly after it: a request at bar 8 lands at 12, never at 8 (and never one bar late, at 9).
      let landBar = landingBar(bar + 1);
      while (phrases.has(phraseOf(landBar))) landBar += PHRASE_BARS;
      return { ok: true, landBar };
    },
    commit(landBar) {
      if (Number.isInteger(landBar)) phrases.add(phraseOf(landBar));
    },
    revert(bar) {
      reverts++;
      if (reverts >= BACKOFF_REVERTS && Number.isInteger(bar)) {
        coolUntil = bar + BACKOFF_BARS;
        reverts = 0;
      }
    },
    cooling: (bar) => bar < coolUntil,
    reset() {
      owned.clear();
      phrases.clear();
      reverts = 0;
      coolUntil = -Infinity;
    },
  };
}
