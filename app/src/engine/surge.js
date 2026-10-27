// surge.js — travel kinemes P3 (#1576): SURGE, the z-approach driver.
//
// ══ SEPARABILITY BOUNDARY (the issue's kill criterion, structural) ══
// This module is the WHOLE of surge. If surge reads as a cheap zoom
// gimmick in the room, it comes out and parallax ships alone — so surge
// lives here, in its own file, with NO tendrils into the P1/P2 core:
// kineme.js (FLOW/PATH) never imports this file and is not modified by
// this stage; parallaxDrift.js never imports it either. The removal
// surface is exactly: this file, its selfcheck suite + manifest line,
// the surge pass in buildPlacements.js, the surge store + input thread
// in liveResolve.mjs, the two recipe keys' surge half in
// data/layout-modes.js, the surge RangeRow in DavisPanel.jsx, the
// surge term of the governor hook's travelActive, and the census
// surge fixture. Q3 adds exactly one more thread: the Queen's stamp
// (the curation layer's M9 mechanic + the Director host + liveLoop's
// surgeTrigger input thread). Nothing else knows surge exists.
//
// ── The contract (issue #1576) ────────────────────────────────────────
// SURGE is a z-approach driver: on its envelope a mark's z rises
// 0→1→0 and the presentation reads z as scale-up + slight rise +
// alpha sharpening, then releases the mark home. z is a DRIVER
// CHANNEL, not a placement rewrite — exactly like the kineme drivers
// (breath/drift/pulse fold deltas into the stage-C channels), surge
// folds z into scale / y / alpha at placement time, and the packer
// (gl/renderer.mjs packInstanceData) packs those folded values. The
// pure read is surgeZRead() below; placements, materials and the
// governor are otherwise untouched (the governor wiring is the shared
// travel shed, cut 1.6 — see the shed law below).
//
// ANTICIPATION IS MANDATORY (the classic anime timing law, Matt
// 2026-10-14): the envelope first settles AWAY — z dips NEGATIVE (the
// mark shrinks slightly, sinks slightly, softens) — before it
// approaches. A surge that starts at full speed is a bug; the suite
// measures the dip (depth + the zero-crossing step) on every run.
//
// ── Q3 — THE TRIGGER IS THE QUEEN'S CALL (ruled 2026-10-20) ────────
// What fires a surge is a TASTE CALL stamped by the curation layer
// (Matt, on #1576): when a new keep lands, the Queen judges it against
// her kept-taste anchor and stamps a demand if it lands near what the
// artist already keeps (the curation layer's M9 mechanic, hosted by
// the Director; liveLoop stamps it on the frame's resolver input).
// Nobody else stamps it — no beat wiring, no perform control,
// no panel — and the stamp never renders (KC-1 DS rule 10): it is data
// in the recorded input stream, so a take that surged replays the
// surge exactly. This module still takes the trigger as an INPUT
// SIGNAL (ctx.surge.trigger, a 0..1 demand handed in per frame by the
// resolver): on every frame she does not call it reads 0 and the
// machinery is INERT, bit-identical to pre-P3. The AMOUNT is ruled
// (the Directors motion-group control, #1574's comment) and is recipe
// data: layoutParams.transportSurge. Selfchecks drive the machinery
// with synthetic trigger envelopes, and with the Queen's own stamp
// computed from fixture ledgers (suite sections G–J).
//
// ── Replay law (inherited, binding) ────────────────────────────────
// Envelope state is resolver-owned (createSurgeStore, one per
// resolver, keyed by scene + seed — the travel store's pattern) and
// advances ONLY on the locked spine-A step (TRAVEL_STEP_SEC), banked
// from the frame time the resolver hands in. Nothing reads a clock or
// a random source: same seed + same frame/trigger input sequence =
// same frames, bit for bit.
//
// ── Shed law (P1's cut 1.6, shared) ─────────────────────────────────
// When the governor's travel shed is on, surge DIES: the envelope is
// killed mid-flight, z reads 0, marks present home in z, and triggers
// are ignored (a trigger held through the shed does not edge-fire on
// restore — prevTrig tracks it). No settle, no frozen mid-surge pose:
// the still behaviour, honestly.
import { TRAVEL_STEP_SEC, TRAVEL_MAX_STEPS } from './kineme.js';
import { registerCostTier } from './kernel/costRegistry.mjs';

/** The envelope's full life, in locked steps: 96 steps = 1.6 s. */
export const SURGE_STEPS = 96;
/** How deep the anticipation settle goes, in z (negative = away). */
export const SURGE_ANTICIPATION_Z = -0.22;

// Envelope phase joints (fractions of SURGE_STEPS): anticipation
// settles away, the approach snaps through its middle and decelerates
// into the peak (held extremes: slope → 0 at the peak and at home),
// the peak holds, then the release eases home.
const ANTICIP_END = 0.18;
const PEAK_AT = 0.55;
const HOLD_END = 0.7;

const easeInOutCubic = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const smoothstep = (u) => u * u * (3 - 2 * u);

/**
 * The surge envelope: z as a pure function of phase (0..1 across the
 * envelope's life). Outside [0, 1) the envelope is over: z = 0.
 *   phase [0, ANTICIP_END)  anticipation — z eases 0 → SURGE_ANTICIPATION_Z
 *   phase [ANTICIP_END, PEAK_AT)  approach — z eases the dip → +1
 *   phase [PEAK_AT, HOLD_END)     the peak holds at +1
 *   phase [HOLD_END, 1)           release — z eases +1 → 0 (0 exactly at 1)
 */
export function surgeEnvelope(phase) {
  const p = Number(phase);
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return 0;
  if (p < ANTICIP_END) return SURGE_ANTICIPATION_Z * smoothstep(p / ANTICIP_END);
  if (p < PEAK_AT) {
    const u = (p - ANTICIP_END) / (PEAK_AT - ANTICIP_END);
    return SURGE_ANTICIPATION_Z + (1 - SURGE_ANTICIPATION_Z) * easeInOutCubic(u);
  }
  if (p < HOLD_END) return 1;
  return 1 - smoothstep((p - HOLD_END) / (1 - HOLD_END));
}

/** z → presentation: the packer read, as pure data. z = 0 is identity. */
export const SURGE_SCALE_PER_Z = 0.55; // z +1 → 1.55× scale; the dip → ~0.88×
export const SURGE_RISE_PX_PER_Z = 26; // z +1 → 26 px rise (up = −y); the dip sinks ~5.7 px
export const SURGE_ALPHA_PER_Z = 0.45; // z +1 → alpha lerps 45% of its headroom toward 100 (sharper); the dip softens

/**
 * The z read: how one mark's z becomes its presented scale / rise /
 * alpha. Returns { scaleMul, risePx, alphaLerp } — the applier scales
 * by scaleMul, lifts by risePx (y −= risePx), and moves alpha by
 * alphaLerp of its headroom toward 100 (a negative lerp, from a
 * negative z, moves it away — the settle softens as it shrinks).
 */
export function surgeZRead(z) {
  const v = Number(z) || 0;
  return {
    scaleMul: 1 + SURGE_SCALE_PER_Z * v,
    risePx: SURGE_RISE_PX_PER_Z * v,
    alphaLerp: SURGE_ALPHA_PER_Z * v,
  };
}

/**
 * The surge store: one per resolver (the caller owns it; buildPlacements
 * never allocates one). scenes: sceneId → { seed, acc, steps, envStart,
 * strength, prevTrig }. envStart is the step count the live envelope
 * started at (−1 = idle); strength is the trigger demand that fired it.
 * A scene whose seed changes starts over — the envelope belongs to the
 * seed that dealt the homes (the travel store's law).
 */
export function createSurgeStore() {
  return { scenes: new Map() };
}

// Resolver mid-session snapshot (#1367, #1715): the store is accumulative, so a take beginning mid-session must carry
// it. Each scene is a flat record of finite numbers (seed, acc, steps, envStart, strength, prevTrig); emitted in insertion order, exact.
const SURGE_FIELDS = ['seed', 'acc', 'steps', 'envStart', 'strength', 'prevTrig'];
export function snapshotSurgeStore(store) {
  const scenes = [];
  if (store && store.scenes instanceof Map)
    for (const [id, sc] of store.scenes) scenes.push([id, SURGE_FIELDS.map((f) => sc[f])]);
  return { v: 1, scenes };
}
export function checkSurgeStoreSnapshot(snap) {
  if (!snap || typeof snap !== 'object' || snap.v !== 1 || !Array.isArray(snap.scenes)) return false;
  for (const e of snap.scenes) {
    if (
      !Array.isArray(e) ||
      e.length !== 2 ||
      typeof e[0] !== 'string' ||
      !Array.isArray(e[1]) ||
      e[1].length !== SURGE_FIELDS.length
    )
      return false;
    if (!e[1].every((v) => Number.isFinite(v))) return false;
  }
  return true;
}
export function restoreSurgeStore(store, snap) {
  if (!store || !(store.scenes instanceof Map) || !checkSurgeStoreSnapshot(snap)) return false;
  store.scenes.clear();
  for (const [id, vals] of snap.scenes) {
    const sc = {};
    SURGE_FIELDS.forEach((f, i) => {
      sc[f] = vals[i];
    });
    store.scenes.set(id, sc);
  }
  return true;
}

/** Drop scenes the document no longer has (liveResolve's prune law). */
export function pruneSurgeStore(store, keepSceneIds) {
  if (!store || !(store.scenes instanceof Map)) return;
  for (const k of [...store.scenes.keys()]) if (!keepSceneIds.has(k)) store.scenes.delete(k);
}

/** A scene's envelope record for tests/debug, or null when it never surged. */
export function surgeSceneSnapshot(store, sceneId) {
  const sc = store && store.scenes instanceof Map ? store.scenes.get(sceneId) : null;
  if (!sc) return null;
  const active = sc.envStart >= 0;
  const phaseSteps = active ? sc.steps - sc.envStart : 0;
  return {
    seed: sc.seed,
    steps: sc.steps,
    active,
    phaseSteps,
    strength: sc.strength,
    envZ: active ? surgeEnvelope(phaseSteps / SURGE_STEPS) : 0,
  };
}

const SURGE_BASE_Y = new WeakMap();

function clamp01(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/**
 * Stage-C applier for SURGE: advance the scene's envelope on the locked
 * step clock, then fold each mark's z into scale / y / alpha. Called
 * last in buildPlacements (after rhythm, drivers, nudge, transport and
 * parallax drift), so z composes on the presented placement.
 *
 * ctx: { seed, surge: {
 *   amount,   // 0..1 — recipe data (layoutParams.transportSurge); <= 0 is identity
 *   store,    // createSurgeStore() — caller-owned, required
 *   sceneId,  // the scene identity half of the state key
 *   frameMs,  // spine-A frame time to bank (0 on a held frame)
 *   shed,     // governor travel shed: the envelope dies, marks present home
 *   trigger,  // 0..1 demand — the Queen's stamp (Q3); 0/absent = inert
 * } }
 *
 * Returns an undo restoring the cached y positions, or null when z is
 * 0 for the whole scene (channels untouched). still[k] marks (the
 * artist's per-asset pin) never surge: their z stays 0.
 *
 * Trigger law: a rising edge (trigger > 0 after <= 0) while idle starts
 * ONE envelope at the demand's strength; a trigger during flight is
 * ignored (no retrigger, no queue) and a held trigger fires once.
 */
export function applySurge(soa, ctx, still = null) {
  if (!soa || !ctx) return null;
  const sg = ctx.surge;
  if (!sg || !sg.store || !(sg.store.scenes instanceof Map)) return null;
  const amount = clamp01(sg.amount);
  if (!(amount > 0)) return null;
  const seed = ctx.seed | 0;
  const sceneId = String(sg.sceneId ?? '');
  let sc = sg.store.scenes.get(sceneId);
  if (!sc) {
    sc = { seed, acc: 0, steps: 0, envStart: -1, strength: 0, prevTrig: 0 };
    sg.store.scenes.set(sceneId, sc);
  } else if (sc.seed !== seed) {
    sc.seed = seed;
    sc.acc = 0;
    sc.steps = 0;
    sc.envStart = -1;
    sc.strength = 0;
    sc.prevTrig = 0;
  }
  const trig = clamp01(sg.trigger);

  // The shed kills the envelope where it stands and swallows the
  // trigger (prevTrig tracks it, so a held trigger cannot edge-fire
  // the moment pressure clears). The clock does not bank shed time.
  if (sg.shed) {
    sc.envStart = -1;
    sc.strength = 0;
    sc.prevTrig = trig;
    return null;
  }

  // Rising edge at the CURRENT step count, before this frame's steps
  // bank: an envelope fired on this frame is already dipping on it.
  if (sc.envStart < 0 && trig > 0 && sc.prevTrig <= 0) {
    sc.envStart = sc.steps;
    sc.strength = trig;
  }
  sc.prevTrig = trig;

  // Fixed-step banking on the spine-A clock (the travel store's law:
  // spend whole steps, never bank a spiral of death).
  const frameMs = Number(sg.frameMs);
  if (Number.isFinite(frameMs) && frameMs > 0) sc.acc += frameMs * 0.001;
  let stepsDue = Math.floor(sc.acc / TRAVEL_STEP_SEC);
  if (stepsDue > TRAVEL_MAX_STEPS) stepsDue = TRAVEL_MAX_STEPS;
  if (stepsDue > 0) {
    sc.acc -= stepsDue * TRAVEL_STEP_SEC;
    if (sc.acc > TRAVEL_STEP_SEC) sc.acc = 0;
    sc.steps += stepsDue;
  }

  if (sc.envStart < 0) return null;
  const phaseSteps = sc.steps - sc.envStart;
  if (phaseSteps >= SURGE_STEPS) {
    sc.envStart = -1;
    sc.strength = 0;
    return null;
  }
  const z = surgeEnvelope(phaseSteps / SURGE_STEPS) * amount * sc.strength;
  if (z === 0) return null;

  const read = surgeZRead(z);
  const n = soa.n | 0;
  let base = SURGE_BASE_Y.get(soa);
  if (!base || base.y.length < n) {
    base = { y: new Float64Array(n) };
    SURGE_BASE_Y.set(soa, base);
  }
  for (let k = 0; k < n; k++) base.y[k] = soa.y[k];
  for (let k = 0; k < n; k++) {
    if (still && still[k]) continue;
    soa.scale[k] *= read.scaleMul;
    soa.scaleY[k] *= read.scaleMul;
    soa.y[k] -= read.risePx;
    const a = soa.alpha[k] + (100 - soa.alpha[k]) * read.alphaLerp;
    soa.alpha[k] = a < 0 ? 0 : a > 100 ? 100 : a;
  }
  return () => {
    for (let k = 0; k < n; k++) soa.y[k] = base.y[k];
  };
}

// The surge pass's declared cost (the governor thesis: no module runs
// undeclared). Tier 0 — structural, never shed by the effect ladder: the
// pass adds NO GPU pass, shader or FBO (its marks ride the structural
// item pass), and it sheds by the governor's own travel rung
// (hooks/governorCuts.js cut 1.6), the travel/flow doctrine. timeMs is
// the MEASURED resolver-CPU figure: applySurge at the 800-mark cap, one
// locked step + present at the envelope's peak, median of 7 runs × 200
// calls, sandbox node 2026-10-20 — engine/surge.selfcheck.mjs
// re-measures it on every run and prints it. Sandbox-indicative only;
// real hardware authoritative.
registerCostTier('travel/surge', {
  tier: 0,
  memoryBytes: 0,
  timeMs: 0.01,
  notes:
    "#1576 P3 — SURGE: step-clocked z envelope folded into scale/rise/alpha on the resolver CPU; no GPU pass (marks ride the structural item pass). timeMs MEASURED sandbox CPU at the 800-mark cap (see block comment); sheds by the governor travel cut (1.6), never the effect ladder. The trigger is the Queen's stamp (Q3: the curation layer's M9 call, stamped by liveLoop on input.surgeTrigger) — inert on every frame she does not call.",
});
