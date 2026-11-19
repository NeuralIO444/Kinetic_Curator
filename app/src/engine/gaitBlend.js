// engine/gaitBlend.js — #2329 follow-up (Matt, 2026-11-18 18:53 PT, ruling 1): "ease over 1 beat".
//
// A gait swap used to land in one frame: the QUEEN's idle → performing jumped every driver amount at once, and the
// drop back to `still` turned a moving construct into its flat tile mid-pose. Now each swap CROSS-FADES the driver
// amounts over GAIT_EASE_BEATS beat (the gait's own beat clock, gait-spec ruling 6), and the drop to `still` eases
// the amounts to 0 — the pose settles to rest — before the construct returns to its exact flat tile.
//
// THE FOLD is the one piece of state, per wearer (the stamp's target, a construct tile's asset id):
//   w  what the frame input's stamp (`input.gaits`) asked for last frame: [gaitId, bpm]
//   f  a fade in progress: { to, from, t0, bpm } — `to` the gait id it eases toward (null = still), `from` the mix it
//      started from (a plain gait-shaped object: where the amounts WERE, so a swap mid-fade starts from where the
//      pose is, never from a jump), `t0` the beat it started on, `bpm` the tempo its beat counts in
// It lives in the resolver and rides the resolver snapshot (gl/liveResolve.mjs `gaitBlend`), so a take — the
// snapshot plus the input log — replays every fade exactly. The stamp itself is unchanged.
//
// THE CONTRACT:
//   · Hard gate. No stamp and an empty fold → step() returns null (the stage sees no gait at all: today's frame).
//   · Steady state is the stamp, exactly: once a fade completes the wearer wears the stamped Canon record itself (the
//     same object gaitsOfStamp returns), so a gait that has stood for a beat poses exactly as before this fold.
//   · Continuous. A fade's mix at its start is the pose's amounts that frame; the ease (inOutCubic) leaves and lands
//     with zero slope; a fade to still ends with every amount 0 — the rest pose — and the next frame is the tile.
//
// Pure apart from the fold. No clock, no random: time is the kineme driver clock the resolver passes in.
import { GAIT_ROLES, GAIT_DEFAULT_BPM } from './gait.js';
import { gaitsOfStamp } from './gaitAssign.js';
import { canonGaitById } from '../data/canon/gaits.js';
import { easeOf } from './gaitBreakup.js';
import { getKinemeDriver } from './kineme.js';

/** Beats a gait swap (and the drop to still) cross-fades over. Matt's ruling: one beat. */
export const GAIT_EASE_BEATS = 1;
/** The ease of the cross-fade: zero slope at both ends, so the amounts never kink. */
export const GAIT_EASE = 'inOutCubic';
/** The most wearers the fold keeps (a stage has far fewer constructs; this only bounds a hostile snapshot). */
export const BLEND_MAX_WEARERS = 256;

const GAIT_ID_RE = /^gait:[0-9a-f]{16}$/;
const TARGET_MAX = 64;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const tempoOf = (bpm) => (fin(bpm) && bpm > 0 ? bpm : GAIT_DEFAULT_BPM);
const beatAt = (driverSec, bpm) => ((fin(driverSec) ? driverSec : 0) * tempoOf(bpm)) / 60;

/** A gait's driver amounts as { role: { id: amount } } (absent roles and zero amounts read as 0). */
function amountsOf(g) {
  const out = {};
  for (const role of GAIT_ROLES) {
    const r = g && isObj(g.roles) ? g.roles[role] : null;
    const m = {};
    for (const d of (r && r.drivers) || []) if (d && typeof d.id === 'string' && fin(d.amount)) m[d.id] = d.amount;
    out[role] = m;
  }
  return out;
}

/**
 * The cross-fade of two gaits at eased progress e (0 → `a`, 1 → `b`). Either may be null (= still: every amount 0).
 * The result is gait-shaped (roles, cascade, release, rejoin) — what engine/gait.js evaluateGait and the break-up read.
 * Structure (release, rejoin) is the destination's, or the source's when easing to still; cascade is blended.
 */
export function mixGaits(a, b, e) {
  const A = amountsOf(a);
  const B = amountsOf(b);
  const roles = {};
  for (const role of GAIT_ROLES) {
    const ids = [...new Set([...Object.keys(A[role]), ...Object.keys(B[role])])].sort();
    if (!ids.length) continue;
    roles[role] = {
      drivers: ids.map((id) => ({ id, amount: (A[role][id] || 0) * (1 - e) + (B[role][id] || 0) * e })),
    };
  }
  const ca = a && fin(a.cascade) ? a.cascade : null;
  const cb = b && fin(b.cascade) ? b.cascade : null;
  const cascade = ca === null ? (cb ?? 0) : cb === null ? ca : ca * (1 - e) + cb * e;
  const shape = b || a;
  return {
    roles,
    cascade,
    ...(shape && isObj(shape.release) ? { release: { ...shape.release } } : {}),
    ...(shape && isObj(shape.rejoin) ? { rejoin: { ...shape.rejoin } } : {}),
  };
}

function checkMix(m) {
  if (m === null) return true;
  if (!isObj(m) || !isObj(m.roles) || !fin(m.cascade)) return false;
  for (const role of Object.keys(m.roles)) {
    if (!GAIT_ROLES.includes(role)) return false;
    const r = m.roles[role];
    if (!isObj(r) || !Array.isArray(r.drivers) || r.drivers.length > 16) return false;
    for (const d of r.drivers)
      if (!isObj(d) || typeof d.id !== 'string' || !getKinemeDriver(d.id) || !fin(d.amount) || d.amount < 0)
        return false;
  }
  if (m.release !== undefined && !isObj(m.release)) return false;
  if (m.rejoin !== undefined && !isObj(m.rejoin)) return false;
  return true;
}

/** Is this a well-formed fold snapshot? (Fail-closed: a recorded snapshot must never throw the resolver.) */
export function checkBlendSnapshot(snap) {
  if (!isObj(snap) || !isObj(snap.w) || !isObj(snap.f)) return false;
  const tk = (k) => typeof k === 'string' && k.length > 0 && k.length <= TARGET_MAX;
  const wk = Object.keys(snap.w);
  const fk = Object.keys(snap.f);
  if (wk.length > BLEND_MAX_WEARERS || fk.length > BLEND_MAX_WEARERS) return false;
  for (const k of wk) {
    const v = snap.w[k];
    if (!tk(k) || !Array.isArray(v) || v.length !== 2 || !GAIT_ID_RE.test(v[0]) || !fin(v[1]) || !(v[1] > 0))
      return false;
  }
  for (const k of fk) {
    const e = snap.f[k];
    if (!tk(k) || !isObj(e)) return false;
    if (!(e.to === null || (typeof e.to === 'string' && GAIT_ID_RE.test(e.to)))) return false;
    if (!fin(e.t0) || !fin(e.bpm) || !(e.bpm > 0) || !checkMix(e.from)) return false;
  }
  return true;
}

const copy = (v) => JSON.parse(JSON.stringify(v));

/**
 * The fold. step(stamp, driverSec) once per frame, BEFORE any layer deals its constructs, returns what each wearer
 * wears this frame: a Map target → { gait, bpm } (the stage's input; engine/gaitStage.js gaitStageOptionsFor), or null
 * when no wearer wears anything (the hard gate).
 */
export function createGaitBlend() {
  let worn = new Map(); // target → [gaitId, bpm]
  let fades = new Map(); // target → { to, from, t0, bpm }

  /** What `target` wears at beat clock `driverSec` under the fold as it stands (no state change): a gait or null. */
  function wearing(target, driverSec) {
    const f = fades.get(target);
    if (f) {
      const u = (beatAt(driverSec, f.bpm) - f.t0) / GAIT_EASE_BEATS;
      if (u < 1) return mixGaits(f.from, f.to ? canonGaitById(f.to) : null, easeOf(GAIT_EASE, u < 0 ? 0 : u));
    }
    const w = worn.get(target);
    return w ? canonGaitById(w[0]) : null;
  }

  function step(stamp, driverSec) {
    const want = gaitsOfStamp(stamp); // target → the stamped (moving) Canon record
    if (!want && !worn.size && !fades.size) return null; // the hard gate: nothing worn, nothing easing
    const bpm = isObj(stamp) && fin(stamp.bpm) && stamp.bpm > 0 ? stamp.bpm : null;
    const targets = new Set([...worn.keys(), ...fades.keys(), ...(want ? want.keys() : [])]);
    const order = [...targets].sort();
    // 1. a swap starts a fade from what the wearer wears NOW (mid-fade included), toward what the stamp asks
    for (const target of order) {
      const w = want ? want.get(target) || null : null;
      const prev = worn.get(target) || null;
      if ((w ? w.id : null) === (prev ? prev[0] : null)) continue;
      const tempo = bpm ?? (prev ? prev[1] : null) ?? fades.get(target)?.bpm ?? GAIT_DEFAULT_BPM;
      const from = wearing(target, driverSec);
      fades.set(target, {
        to: w ? w.id : null,
        from: from ? copy(from) : null,
        t0: beatAt(driverSec, tempo),
        bpm: tempo,
      });
      if (w) worn.set(target, [w.id, tempo]);
      else worn.delete(target);
    }
    // 2. what each wears this frame; a finished fade leaves the fold (the wearer then wears the stamp's record itself)
    const out = new Map();
    for (const target of order) {
      const f = fades.get(target);
      if (f) {
        const t = beatAt(driverSec, f.bpm);
        if (t < f.t0) f.t0 = t; // the clock stepped back (a reset): the fade restarts here rather than stalling
        const u = (t - f.t0) / GAIT_EASE_BEATS;
        if (u < 1) {
          out.set(target, {
            gait: mixGaits(f.from, f.to ? canonGaitById(f.to) : null, easeOf(GAIT_EASE, u)),
            bpm: f.bpm,
          });
          continue;
        }
        fades.delete(target); // home: a fade to still ends at amount 0 — the wearer is its tile from this frame on
      }
      const w = want ? want.get(target) : null;
      if (w) {
        const bw = worn.get(target);
        out.set(target, { gait: w, bpm: bpm ?? (bw ? bw[1] : GAIT_DEFAULT_BPM) });
        if (bw && bpm !== null && bw[1] !== bpm) worn.set(target, [bw[0], bpm]);
      }
    }
    return out.size ? out : null;
  }

  return {
    step,
    /** Wearers easing right now (a readout for suites). */
    get fading() {
      return fades.size;
    },
    get size() {
      return worn.size + fades.size;
    },
    /** JSON-safe snapshot, or null when the fold is empty (the resolver snapshot then carries no key). */
    snapshot() {
      if (!worn.size && !fades.size) return null;
      const w = {};
      for (const k of [...worn.keys()].sort()) w[k] = worn.get(k).slice();
      const f = {};
      for (const k of [...fades.keys()].sort()) f[k] = copy(fades.get(k));
      return { w, f };
    },
    /** Restore a snapshot() (absent / malformed = an empty fold, as a fresh resolver's). */
    restore(snap) {
      worn = new Map();
      fades = new Map();
      if (!checkBlendSnapshot(snap)) return;
      for (const k of Object.keys(snap.w)) worn.set(k, snap.w[k].slice());
      for (const k of Object.keys(snap.f)) fades.set(k, copy(snap.f[k]));
    },
    reset() {
      worn = new Map();
      fades = new Map();
    },
  };
}
