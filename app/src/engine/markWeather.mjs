// markWeather.mjs — #1627 S1: mark-born weather (the fine read, alive).
//
// ══ DISAMBIGUATION (binding) ════════════════════════════════════════
// This "weather" is MOTES BORN FROM THE MARKS. It is NOT the #1183
// WEATHER dial (haze-as-air, engine/weatherAir.mjs — an FX layer's
// haze fading the marks under it). Nothing here reads the dial, the
// FX stack, or weatherAir; the two weathers share a word and nothing
// else. This module's registry id is 'weather/mark-motes'.
//
// ── What spawns, from what the engine already measures ──────────────
// Four sources, each a measured signal the caller hands in per frame
// (the resolver owns the measurements; this module owns the motes):
//   beam     the sun's highlight/spec pool (data/light.js: the ONE
//            sun, its spec × intensity): marks inside the beam radius
//            shed motes that live in the beam and DIE IN SHADOW — a
//            mote advected out of the beam fades within a few steps.
//   pressure density-pressure peaks: the dish density field
//            (engine/dishDensity.mjs, #1538's measured form) at or
//            above PRESSURE_PEAK_SHARE under a mark — the mark puffs.
//   trail    traveling marks (travel P1–P3): a mark carrying travel
//            stretch (deformAmt > 0, the #1575 stamp) or sitting far
//            from its home (caller-supplied homes) sheds trail motes.
//   contact  dish contacts: caller-supplied contact points with an
//            energy (the dish pass's own events) puff where they land.
// A source the caller does not supply spawns nothing. No source is
// invented here: if the engine doesn't measure it today, it is not
// a spawn criterion (the fork is recorded in the staging report).
//
// ── Laws (all suite-proven, engine/markWeather.selfcheck.mjs) ──────
// · Seeded and deterministic (creatures-spec §2): mote state is
//   resolver-owned (createMarkWeatherStore, keyed by scene + seed),
//   advances ONLY on the locked spine-A step (TRAVEL_STEP_SEC) banked
//   from caller-supplied frame time, and every spawn roll is a hash
//   of (seed, step, kind, source index). No clock, no Math.random:
//   same seed + same input sequence = same motes, bit for bit.
// · Derived state is NEVER saved: the store is ephemeral resolver
//   state like the travel/surge stores; nothing here touches a
//   recipe, a layout param, or a document. NO new recipe keys.
// · Advected by the existing FLOW field (gl/flowField.mjs — the
//   project-seed curl table the trail already rides), sampled
//   bilinearly, plus a slight rise for beam motes.
// · Capped per device class (data/quality.js MARK_WEATHER_CAPS,
//   read through markWeatherCapForDevice — never hard-coded here).
//   The cap sheds the OLDEST motes first: the newest weather is the
//   weather nearest the marks that just made it.
// · Governor-budgeted and FIRST in the shed order (governorCuts cut
//   1.4, ahead of creature count 1.5 and travel 1.6): when the shed
//   input is on, every mote dies on the step it arrives and nothing
//   spawns — weather clears, honestly logged by the governor's event
//   log like every cut. Removal is clean by construction: this file,
//   its selfcheck + manifest line, the governor rung, and the store
//   overlay are the whole surface (see the staging report).
import { TRAVEL_STEP_SEC, TRAVEL_MAX_STEPS } from './kineme.js';
import { createNoise } from './noise.js';
import { buildFlowField, sampleFlowField } from '../gl/flowField.mjs';
import { dishDensityShare } from './dishDensity.mjs';
import { markWeatherCapForDevice } from '../data/quality.js';
import { registerCostTier } from './kernel/costRegistry.mjs';

/** Beam radius as a share of the canvas's shorter side. */
export const BEAM_RADIUS_SHARE = 0.38;
/** Dish-density share at or above which a mark's cell is a pressure peak. */
export const PRESSURE_PEAK_SHARE = 0.75;
/** A mark this far (px) from its home counts as traveling, stretch or not. */
export const TRAIL_HOME_PX = 6;
/** Beam motes die this many locked steps after leaving the beam. */
export const SHADOW_GRACE_STEPS = 6;
/** Mote lifetimes, in locked steps, by kind. */
export const MOTE_LIFE_STEPS = Object.freeze({ beam: 150, pressure: 70, trail: 45, contact: 55 });
/** Advection speed: FLOW-field units → px per locked step. */
export const MOTE_FLOW_PX = 0.55;
/** Beam motes rise this many px per locked step (they live in light). */
export const BEAM_RISE_PX = 0.22;

/** The weather store: one per resolver (the caller owns it). */
export function createMarkWeatherStore() {
  return { scenes: new Map() };
}

/** Drop scenes the document no longer has (the travel store's prune law). */
export function pruneMarkWeatherStore(store, keepSceneIds) {
  if (!store || !(store.scenes instanceof Map)) return;
  for (const k of [...store.scenes.keys()]) if (!keepSceneIds.has(k)) store.scenes.delete(k);
}

/** A scene's mote record for tests/debug, or null when it never stormed. */
export function markWeatherSnapshot(store, sceneId) {
  const sc = store && store.scenes instanceof Map ? store.scenes.get(String(sceneId ?? '')) : null;
  if (!sc) return null;
  return {
    seed: sc.seed,
    steps: sc.steps,
    motes: sc.motes.map((m) => ({ ...m })),
    counts: sc.motes.reduce((acc, m) => { acc[m.kind] = (acc[m.kind] || 0) + 1; return acc; }, {}),
  };
}

// Deterministic spawn rolls: a hash of the roll's full identity, in
// the census hash01 idiom. Same identity → same roll, forever.
function hash01(seed, step, kindCode, index) {
  let h = Math.imul((seed | 0) + 0x9e3779b9, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (step | 0) ^ Math.imul(kindCode | 0, 0x27d4eb2d), 0x2545f491) >>> 0;
  h = Math.imul(h ^ (index | 0), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967296;
}
const KIND_CODE = { beam: 1, pressure: 2, trail: 3, contact: 4 };

const clamp01 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
};

function sceneFor(store, sceneId, seed) {
  let sc = store.scenes.get(sceneId);
  if (!sc) {
    sc = { seed, acc: 0, steps: 0, motes: [], field: null, fieldSeed: null };
    store.scenes.set(sceneId, sc);
  } else if (sc.seed !== seed) {
    // The motes belong to the seed that dealt their marks (the travel
    // store's law): a reseed starts the weather over.
    sc.seed = seed; sc.acc = 0; sc.steps = 0; sc.motes = []; sc.field = null; sc.fieldSeed = null;
  }
  return sc;
}

function flowFor(sc, seed) {
  if (sc.field && sc.fieldSeed === seed) return sc.field;
  const field = buildFlowField(createNoise(seed));
  sc.field = field;
  sc.fieldSeed = seed;
  return field;
}

/**
 * Advance a scene's weather and return its live motes.
 *
 * ctx: {
 *   seed, sceneId, frameMs,        // the resolver's frame identity + time
 *   shed,                           // governor cut 1.4: weather clears NOW
 *   ipadClass,                      // device class for the cap
 *   canvasW, canvasH,
 *   items,                          // placed marks [{x, y, deformAmt?}]
 *   homes,                          // optional Map/array index → {x, y}
 *   light,                          // optional sanitized sun (data/light.js)
 *   densityField,                   // optional dish density field (dishDensity.mjs)
 *   contacts,                       // optional [{x, y, energy}]
 * }
 * Returns the scene's mote array (the store's own — treat as read-only):
 * [{ x, y, kind, age, life, alpha, size, shadeSteps }], positions in
 * scene units, alpha 0..1 (the mote's presence, honestly faded at
 * birth, in shadow, and at death — subtle motion always: a mote never
 * pops in or out at full alpha).
 */
export function stepMarkWeather(store, ctx) {
  if (!store || !(store.scenes instanceof Map) || !ctx) return [];
  const seed = ctx.seed | 0;
  const sceneId = String(ctx.sceneId ?? '');
  const sc = sceneFor(store, sceneId, seed);
  const W = Number(ctx.canvasW) || 0;
  const H = Number(ctx.canvasH) || 0;

  // The shed: weather dies first, whole, on the step it is shed —
  // and the clock does not bank shed time (the surge law), so a
  // restore never replays a storm that happened off-stage.
  if (ctx.shed) {
    sc.motes = [];
    sc.acc = 0;
    return sc.motes;
  }

  // Fixed-step banking on the spine-A clock (the travel store's law).
  const frameMs = Number(ctx.frameMs);
  if (Number.isFinite(frameMs) && frameMs > 0) sc.acc += frameMs * 0.001;
  let stepsDue = Math.floor(sc.acc / TRAVEL_STEP_SEC);
  if (stepsDue > TRAVEL_MAX_STEPS) stepsDue = TRAVEL_MAX_STEPS;
  if (stepsDue > 0) {
    sc.acc -= stepsDue * TRAVEL_STEP_SEC;
    if (sc.acc > TRAVEL_STEP_SEC) sc.acc = 0;
  }
  if (stepsDue <= 0 || !(W > 0) || !(H > 0)) return sc.motes;

  const items = Array.isArray(ctx.items) ? ctx.items : [];
  const light = ctx.light && typeof ctx.light === 'object' ? ctx.light : null;
  const beamR = BEAM_RADIUS_SHARE * Math.min(W, H);
  const beamStrength = light ? clamp01(light.spec) * clamp01(light.intensity) : 0;
  const field = flowFor(sc, seed);
  const cap = markWeatherCapForDevice(!!ctx.ipadClass);

  for (let s = 0; s < stepsDue; s++) {
    const step = sc.steps;
    // ── spawn (deterministic order: beam, pressure, trail, contact) ──
    const spawn = (kind, x, y, strength) => {
      sc.motes.push({
        x, y, kind,
        age: 0,
        life: MOTE_LIFE_STEPS[kind],
        strength,
        shadeSteps: 0,
        vx: 0, vy: 0,
      });
    };
    if (light && beamStrength > 0) {
      for (let k = 0; k < items.length; k++) {
        const it = items[k];
        if (!it || !Number.isFinite(it.x) || !Number.isFinite(it.y)) continue;
        const d = Math.hypot(it.x - light.x, it.y - light.y);
        if (d > beamR) continue;
        const fall = 1 - d / beamR;
        if (hash01(seed, step, KIND_CODE.beam, k) < 0.10 * beamStrength * fall) {
          spawn('beam', it.x, it.y, beamStrength * fall);
        }
      }
    }
    if (ctx.densityField) {
      for (let k = 0; k < items.length; k++) {
        const it = items[k];
        if (!it || !Number.isFinite(it.x) || !Number.isFinite(it.y)) continue;
        if (dishDensityShare(ctx.densityField, it.x, it.y) < PRESSURE_PEAK_SHARE) continue;
        if (hash01(seed, step, KIND_CODE.pressure, k) < 0.16) {
          spawn('pressure', it.x, it.y, dishDensityShare(ctx.densityField, it.x, it.y));
        }
      }
    }
    {
      const homes = ctx.homes || null;
      for (let k = 0; k < items.length; k++) {
        const it = items[k];
        if (!it || !Number.isFinite(it.x) || !Number.isFinite(it.y)) continue;
        let traveling = (it.deformAmt || 0) > 0;
        if (!traveling && homes) {
          const home = typeof homes.get === 'function' ? homes.get(it.index ?? k) : homes[it.index ?? k];
          if (home && Math.hypot(it.x - home.x, it.y - home.y) > TRAIL_HOME_PX) traveling = true;
        }
        if (!traveling) continue;
        if (hash01(seed, step, KIND_CODE.trail, k) < 0.22) {
          spawn('trail', it.x, it.y, clamp01((it.deformAmt || 0) + 0.3));
        }
      }
    }
    if (Array.isArray(ctx.contacts)) {
      for (let k = 0; k < ctx.contacts.length; k++) {
        const c = ctx.contacts[k];
        if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
        const energy = clamp01(c.energy ?? 0.5);
        if (hash01(seed, step, KIND_CODE.contact, k) < 0.5 * energy + 0.1) {
          spawn('contact', c.x, c.y, energy);
        }
      }
    }

    // ── cap: the oldest weather dies first ──
    if (sc.motes.length > cap) sc.motes.splice(0, sc.motes.length - cap);

    // ── advect + age on the FLOW field ──
    const alive = [];
    for (const m of sc.motes) {
      m.age++;
      const [fx, fy] = sampleFlowField(field, m.x / W, m.y / H);
      m.vx = fx * MOTE_FLOW_PX;
      m.vy = fy * MOTE_FLOW_PX;
      m.x += m.vx;
      m.y += m.vy;
      if (m.kind === 'beam') {
        m.y -= BEAM_RISE_PX;
        // Die in shadow: outside the beam the grace clock runs.
        const inBeam = light && Math.hypot(m.x - light.x, m.y - light.y) <= beamR;
        m.shadeSteps = inBeam ? 0 : m.shadeSteps + 1;
        if (m.shadeSteps > SHADOW_GRACE_STEPS) continue;
      }
      if (m.age >= m.life) continue;
      if (m.x < -8 || m.x > W + 8 || m.y < -8 || m.y > H + 8) continue;
      alive.push(m);
    }
    sc.motes = alive;
    sc.steps++;
  }

  // Presentation alpha: fade in over 6 steps, out over the last 10,
  // and down with shade for beam motes — computed at read time from
  // the mote's own state, never stored back (no accumulation).
  for (const m of sc.motes) {
    const fadeIn = Math.min(1, m.age / 6);
    const fadeOut = Math.min(1, Math.max(0, (m.life - m.age) / 10));
    const shade = m.kind === 'beam' ? Math.max(0, 1 - m.shadeSteps / SHADOW_GRACE_STEPS) : 1;
    m.alpha = +(0.25 + 0.55 * m.strength) * fadeIn * fadeOut * shade;
    m.alpha = +m.alpha.toFixed(4);
    m.size = +(0.8 + 1.6 * m.strength).toFixed(3);
  }
  return sc.motes;
}

// The weather pass's declared cost (the governor thesis: no module
// runs undeclared). Tier 1 in the registry's SEMANTIC sense — shed
// first — with the honest mechanics stated: the ladder rung is the
// governor's own cut 1.4 (hooks/governorCuts.js), ahead of every
// content cut; it is not part of the perfTier1 FX set. timeMs is the
// MEASURED figure from engine/markWeather.selfcheck.mjs (spawn +
// advect at the desktop cap, median of medians, sandbox node —
// re-measured on every run and printed by the suite). No GPU pass:
// motes ride whatever item pass draws them; this module is CPU state.
registerCostTier('weather/mark-motes', {
  tier: 1,
  memoryBytes: 0,
  timeMs: 0.09,
  notes: '#1627 S1 — mark-born motes: seeded step-clocked spawn from measured sources (sun spec pool, dish-density peaks, traveling marks, dish contacts), FLOW-field advection, device-capped (quality.js MARK_WEATHER_CAPS). CPU state only, no GPU pass, never saved. Sheds by governor cut 1.4 — FIRST, ahead of creatures (1.5) and travel (1.6). NOT the #1183 WEATHER dial (haze-as-air) — no shared code or data.',
});
