// audioRoutes.mjs — the audio → render routes, in one place (#613).
//
// The live loop (liveLoop.mjs) turns the shaped audio envelope into scale,
// alpha, breath and glow. The STIMULI modulation matrix shows those same
// routes live. Both call this function, so the panel can never drift from
// what renders. Pure; the math is exactly the loop's pre-#613 inline code.
//
// #790 (assignable matrix), engine first: the routes are now data — a flat table
// of { input, target, depth } evaluated by evaluateRoutes(). DEFAULT_ROUTES is
// today's hardcoded set; while no table is passed (routes == null) the loop runs
// the ORIGINAL inline math below, bit for bit, so nothing moves until a table is
// assigned. A table evaluates to the same numbers within float rounding
// (audioRoutes.selfcheck pins both).
//
// Routes today (mid and treble drive nothing — the matrix says so):
//   SCALE  ← beat · 0.38 · scaleMod  +  (bass · 0.55 + level · 0.35) · 0.28   (× depth)
//   ALPHA  ← beat · 18 · alphaMod                                            (× depth)
//   BREATH ← beat · 0.035                                                    (× depth)
//   GLOW   ← min(1, beat · 0.8 + level · 0.4)                                (× depth)


// ── vocabulary ───────────────────────────────────────────────────────────
/** Coarse inputs come from the shaped audio; band.* from the meter tap (PR3). */
export const COARSE_INPUTS = Object.freeze(['beat', 'level', 'bass', 'mid', 'treble']);
export const BAND_INPUTS = Object.freeze(['band.sub', 'band.bass', 'band.mud', 'band.mids', 'band.edge', 'band.pres', 'band.air']);
export const ROUTE_INPUTS = Object.freeze([...COARSE_INPUTS, ...BAND_INPUTS]);

/**
 * Targets, dotted so MIDI learn (#617) can address the same ids. Only the four
 * that are safe per-frame today, plus color.hue (#790); squash / kineme /
 * accum / sun follow, one PR each. `clamp` bounds the OUTPUT (ACCUM-class
 * targets must stay finite). glow is the DOM frame glow (box-shadow), not a
 * GL glow. (render.hue is the #803 engine id; color.hue is the shipped #790
 * target id — both feed the same hue output.)
 */
export const ROUTE_TARGETS = Object.freeze({
  'render.scale': Object.freeze({ clamp: [0.5, 3] }),
  'render.alpha': Object.freeze({ clamp: [0, 60] }),
  'render.breath': Object.freeze({ clamp: [0, 0.2] }),
  'render.glow': Object.freeze({ clamp: [0, 1] }),
  'render.hue': Object.freeze({ clamp: [-180, 180] }),
  'color.hue': Object.freeze({ clamp: [-180, 180] }), // #790: shipped hue target id
  'render.squash': Object.freeze({ clamp: [0, 1] }),
  'render.kineme': Object.freeze({ clamp: [0, 4] }),
  'render.accum': Object.freeze({ clamp: [0, 40] }),
  'render.sun': Object.freeze({ clamp: [0, 1] }),
});

/** Most routes a table may hold. */
export const MAX_ROUTES = 16;

/** Today's hardcoded routes as a table. depth is in the target's natural units. */
export const DEFAULT_ROUTES = Object.freeze([
  { input: 'beat', target: 'render.scale', depth: 0.38 },
  { input: 'bass', target: 'render.scale', depth: 0.55 * 0.28 },
  { input: 'level', target: 'render.scale', depth: 0.35 * 0.28 },
  { input: 'beat', target: 'render.alpha', depth: 18 },
  { input: 'beat', target: 'render.breath', depth: 0.035 },
  { input: 'beat', target: 'render.glow', depth: 0.8 },
  { input: 'level', target: 'render.glow', depth: 0.4 },
].map(Object.freeze));

// ── table evaluation ─────────────────────────────────────────────────────
const num = (v) => (Number.isFinite(v) ? v : 0);
const READ = {
  beat: (a) => num(a?.beatPulse),
  level: (a) => num(a?.rms),
  bass: (a) => num(a?.bass),
  mid: (a) => num(a?.mid),
  treble: (a) => num(a?.treble),
};
for (const id of BAND_INPUTS) {
  const key = id.slice(5);
  READ[id] = (_a, bands) => num(bands?.[key]);
}

// Compile once per table reference (edits make a new array, so the cache can
// never go stale): flat arrays, no per-frame allocation in the hot path.
const compiled = new WeakMap();
function compile(routes) {
  let c = compiled.get(routes);
  if (c) return c;
  const usable = routes.filter((r) => r && READ[r.input] && ROUTE_TARGETS[r.target] && Number.isFinite(r.depth)).slice(0, MAX_ROUTES);
  c = {
    read: usable.map((r) => READ[r.input]),
    target: usable.map((r) => r.target),
    depth: usable.map((r) => r.depth),
    // the legacy quirk, preserved: SCALE-mod scales only the beat → scale term
    beatScale: usable.map((r) => r.input === 'beat' && r.target === 'render.scale'),
    usesBands: usable.some((r) => r.input.startsWith('band.')),
    n: usable.length,
  };
  compiled.set(routes, c);
  return c;
}

const clampTo = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/** True when the table reads any band.* input (the loop only feeds bands then). */
export function routesUseBands(routes) {
  return Array.isArray(routes) && compile(routes).usesBands;
}

/** Evaluate a route table. Same four outputs as the legacy path. */
export function evaluateRoutes(a, { depth, scaleMod, alphaMod }, routes, bands = null) {
  const c = compile(routes);
  let scale = 0, alpha = 0, breath = 0, glow = 0, hue = 0, squash = 0, kinemeRate = 0, accum = 0, sun = 0;
  for (let i = 0; i < c.n; i++) {
    const v = c.read[i](a, bands) * c.depth[i];
    switch (c.target[i]) {
      case 'render.scale': scale += c.beatScale[i] ? v * scaleMod : v; break;
      case 'render.alpha': alpha += v; break;
      case 'render.breath': breath += v; break;
      case 'render.glow': glow += v; break;
      case 'render.hue':
      case 'color.hue': hue += v; break;
      case 'render.squash': squash += v; break;
      case 'render.kineme': kinemeRate += v; break;
      case 'render.accum': accum += v; break;
      case 'render.sun': sun += v; break;
      default: break;
    }
  }
  const out = {
    scaleMul: clampTo(1 + scale * depth, ROUTE_TARGETS['render.scale'].clamp),
    alphaBoost: clampTo(alpha * alphaMod * depth, ROUTE_TARGETS['render.alpha'].clamp),
    breathAudio: clampTo(breath * depth, ROUTE_TARGETS['render.breath'].clamp),
    glow: clampTo(Math.min(1, glow) * depth, ROUTE_TARGETS['render.glow'].clamp),
  };
  const used = new Set(c.target);
  if (used.has('render.hue') || used.has('color.hue')) out.hue = clampTo(hue * depth, ROUTE_TARGETS['color.hue'].clamp);
  if (used.has('render.squash')) out.squash = clampTo(squash * depth, ROUTE_TARGETS['render.squash'].clamp);
  if (used.has('render.kineme')) out.kineme = clampTo(kinemeRate * depth, ROUTE_TARGETS['render.kineme'].clamp);
  if (used.has('render.accum')) out.accum = clampTo(accum * depth, ROUTE_TARGETS['render.accum'].clamp);
  if (used.has('render.sun')) out.sun = clampTo(sun * depth, ROUTE_TARGETS['render.sun'].clamp);
  return out;
}

/**
 * @param {{bass:number, rms:number, beatPulse:number}} a shaped audio
 * @param {{depth:number, scaleMod:number, alphaMod:number}} p
 * @param {Array|null} [routes] a route table, or null = today's routes (the
 *   original inline math, untouched — the parity path)
 * @param {object|null} [bands] live meter bands { sub, bass, mud, mids, edge, pres, air }
 * @returns {{scaleMul:number, alphaBoost:number, breathAudio:number, glow:number}}
 */
export function audioRoutes(a, { depth, scaleMod, alphaMod }, routes = null, bands = null) {
  if (Array.isArray(routes)) return evaluateRoutes(a, { depth, scaleMod, alphaMod }, routes, bands);
  return {
    scaleMul: 1 + (
      a.beatPulse * 0.38 * scaleMod +
      (a.bass * 0.55 + a.rms * 0.35) * 0.28
    ) * depth,
    alphaBoost: a.beatPulse * 18 * alphaMod * depth,
    breathAudio: a.beatPulse * 0.035 * depth,
    glow: Math.min(1, a.beatPulse * 0.8 + a.rms * 0.4) * depth,
  };
}

/**
 * Matrix rows: one per (input → target) term. `depth` is the route's raw
 * gain (the knob side); `live` is what that term contributes right now.
 * Audio off → every live value is 0 (idle, never a frozen ghost).
 * Inputs with no route (mid, treble) are listed with target null.
 *
 * With a route table (#790) there is one row per usable route instead: the
 * same effective-gain convention (route depth × the target's modifier ×
 * master depth), and the rows still sum to what evaluateRoutes renders.
 */
export function audioMatrixRows(a, { depth, scaleMod, alphaMod }, enabled = true, routes = null, bands = null) {
  const on = enabled ? 1 : 0;
  if (Array.isArray(routes)) {
    const usable = routes.filter((r) => r && READ[r.input] && ROUTE_TARGETS[r.target] && Number.isFinite(r.depth)).slice(0, MAX_ROUTES);
    return usable.map((r) => {
      const mod = r.target === 'render.alpha' ? alphaMod : (r.input === 'beat' && r.target === 'render.scale' ? scaleMod : 1);
      const gain = r.depth * mod * depth;
      const label = r.input.startsWith('band.') ? `BAND ${r.input.slice(5).toUpperCase()}` : r.input.toUpperCase();
      return { input: label, target: r.target.split('.').pop(), depth: gain, live: READ[r.input](a, bands) * on * gain, inputId: r.input, targetId: r.target };
    });
  }
  const beat = (a?.beatPulse || 0) * on;
  const bass = (a?.bass || 0) * on;
  const level = (a?.rms || 0) * on;
  const row = (input, target, gain, value) => ({ input, target, depth: gain, live: value * gain });
  return [
    row('BEAT', 'scale', 0.38 * scaleMod * depth, beat),
    row('BASS', 'scale', 0.55 * 0.28 * depth, bass),
    row('LEVEL', 'scale', 0.35 * 0.28 * depth, level),
    row('BEAT', 'alpha', 18 * alphaMod * depth, beat),
    row('BEAT', 'breath', 0.035 * depth, beat),
    row('BEAT', 'glow', 0.8 * depth, beat),
    row('LEVEL', 'glow', 0.4 * depth, level),
    { input: 'MID', target: null, depth: 0, live: 0 },
    { input: 'TREBLE', target: null, depth: 0, live: 0 },
  ];
}
