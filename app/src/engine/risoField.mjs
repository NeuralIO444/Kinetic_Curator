// risoField.mjs — RISO icon fields (#2008): Martens-style dense fields of composed
// icons with cluster-disperse BREATHING.
//
// The deal is pure and seeded: a grid of icon placements (the specimen sheet),
// each placement assigned to its nearest seeded cluster centre. The breathing is
// a Davis behaviour — continuous, time-based — in the kineme drivers' shape:
//   - ANCHORED: at time 0 every displacement is exactly 0, so a still of the field
//     is the dealt field, byte for byte (the evaluateKineme anchor law).
//   - DRIVEN: the caller hands in the standing driver's level (0..1 — audio, voice
//     MIX, the performer's drive; this module owns no driver of its own). The level
//     is SMOOTHED toward its target with time constant BREATH_RELAX_TAU_SEC, so a
//     driver that steps or drops eases instead of snapping.
//   - RELAXES, NEVER FREEZES (#721): when the driver drops to zero the level decays
//     toward BREATH_FLOOR — never to zero — and the phase keeps advancing on the
//     field's own clock, so the field keeps breathing gently rather than freezing
//     mid-gesture. A dropped driver relaxes the field; it never stops it.
//
// Pure: no clock reads, no Math.random, no module state. The breath state is a
// plain { level, tSec } the caller carries frame to frame.

import { mkRng } from './prng.js';
import { hashU32 } from './kernel/rng.js';
import { risoIconId, RISO_CANON_SEED, RISO_ICON_SET_SIZE } from './risoGrammar.mjs';

/** Cluster centres a dealt field gathers around. */
export const RISO_CLUSTER_COUNT = 5;
/** Breathing rate, cycles per second at full drive. */
export const BREATH_HZ = 0.11;
/** Pull toward (positive) / push from (negative) the cluster centre, as a
 *  fraction of the placement's distance to it. The anchored sine difference
 *  (sin(ωt+φ) − sin(φ)) peaks at 2, so peak displacement is 2 × this fraction. */
export const BREATH_PULL = 0.32;
/** The floor the drive level relaxes toward when the driver drops — never zero. */
export const BREATH_FLOOR = 0.15;
/** Time constant (seconds) of the level's ease toward its target. */
export const BREATH_RELAX_TAU_SEC = 2.5;
/** Per-cluster phase spread, radians — clusters breathe out of step, like weather. */
export const BREATH_PHASE_SPREAD = 1.7;
/** Default field canvas, in scene units (the placement canvas convention). */
export const RISO_FIELD_W = 1000;
export const RISO_FIELD_H = 700;

const clamp01 = (v) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : 0);

/**
 * Deal a field. Deterministic in (seed, count, w, h).
 * @returns {{ seed:number, clusters:Array<{x,y}>, placements:Array }}
 *   placements carry { key, assetId, iconIndex, x, y, scale, rotation, cluster }
 *   — the buildPlacements item shape, so the stamp machinery consumes them as marks.
 */
export function dealRisoField({ seed = RISO_CANON_SEED, count = 120, w = RISO_FIELD_W, h = RISO_FIELD_H } = {}) {
  const s = seed >>> 0 || RISO_CANON_SEED;
  const n = Math.max(1, Math.min(2000, count | 0));
  const W = Math.max(1, Number(w) || RISO_FIELD_W);
  const H = Math.max(1, Number(h) || RISO_FIELD_H);
  const rng = mkRng(hashU32(s, 'riso-field', 0) || 1);
  const clusters = Array.from({ length: RISO_CLUSTER_COUNT }, () => ({
    x: W * (0.18 + rng() * 0.64),
    y: H * (0.18 + rng() * 0.64),
  }));
  // Dense grid deal (Martens specimen sheet): near-square cells, seeded jitter
  // inside the cell, icon + scale + rotation drawn from the same stream in order.
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * (W / H))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cw = W / cols;
  const ch = H / rows;
  const placements = [];
  for (let i = 0; i < n; i++) {
    const gx = i % cols;
    const gy = Math.floor(i / cols);
    const x = (gx + 0.5) * cw + (rng() - 0.5) * cw * 0.44;
    const y = (gy + 0.5) * ch + (rng() - 0.5) * ch * 0.44;
    const iconIndex = Math.floor(rng() * RISO_ICON_SET_SIZE);
    const scale = 0.55 + rng() * 0.75;
    const rotation = Math.floor(rng() * 4) * 90;
    let cluster = 0;
    let best = Infinity;
    for (let c = 0; c < clusters.length; c++) {
      const d = (x - clusters[c].x) ** 2 + (y - clusters[c].y) ** 2;
      if (d < best) {
        best = d;
        cluster = c;
      }
    }
    placements.push({
      key: `riso:${i}`,
      assetId: risoIconId(s, iconIndex),
      iconIndex,
      x,
      y,
      scale,
      rotation,
      cluster,
    });
  }
  return { seed: s, clusters, placements };
}

/** A fresh breath state: level at the floor, clock at zero (the anchored rest). */
export function createBreathState() {
  return { level: BREATH_FLOOR, tSec: 0 };
}

/**
 * Advance the breath state by dtSec toward the driver's current level. The level
 * eases exponentially (time constant BREATH_RELAX_TAU_SEC) toward
 * FLOOR + (1 - FLOOR) * driver, so full drive approaches 1 and a dropped driver
 * approaches the floor — asymptotically, never snapping, never reaching zero.
 * Mutates and returns `state`.
 */
export function stepBreath(state, dtSec, driver) {
  const dt = Math.max(0, Number(dtSec) || 0);
  const target = BREATH_FLOOR + (1 - BREATH_FLOOR) * clamp01(driver);
  const k = 1 - Math.exp(-dt / BREATH_RELAX_TAU_SEC);
  state.level += (target - state.level) * k;
  state.tSec += dt;
  return state;
}

/**
 * The field's positions at the breath state's current time. Each placement is
 * pulled toward (inhale) or pushed from (exhale) its cluster centre by
 * BREATH_PULL * level * (sin(ωt + φc) − sin(φc)) of its distance to the centre —
 * the anchored form: exactly zero displacement at t = 0 for every cluster phase.
 * Returns fresh { x, y } per placement, in deal order; the field is never mutated.
 */
export function breatheFieldAt(field, state) {
  const t = Math.max(0, Number(state && state.tSec) || 0);
  const level = state && Number.isFinite(Number(state.level)) ? Number(state.level) : BREATH_FLOOR;
  const w = 2 * Math.PI * BREATH_HZ;
  return field.placements.map((p) => {
    const c = field.clusters[p.cluster];
    const phase = p.cluster * BREATH_PHASE_SPREAD;
    const f = BREATH_PULL * level * (Math.sin(w * t + phase) - Math.sin(phase));
    return { x: p.x + (c.x - p.x) * f, y: p.y + (c.y - p.y) * f };
  });
}
