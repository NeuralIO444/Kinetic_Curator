// engine/gaitBreakup.js — #2330 (GAIT M4; docs/design/gait-spec.md ruling 3): the field decides WHEN a construct
// breaks up; the gait it wears decides HOW.
//
// THE SIGNAL (Matt's ruling on #2330, 2026-11-18): the ferrofluid's density is the field's "strong here". A construct
// whose own cell is over MATTER_DENSITY_FLOOR with a magnet standing and PULL above 0 — i.e. markDriftDelta(fluidDrift,
// x, y) is not null, read from the recorded fluid (input.dishFluidCells / the JS kernel) under input.dishFluidMarks —
// releases its pieces. When that cell goes quiet the pieces rejoin.
//
// THE HOW (the gait record, engine/gait.js):
//   release.order    leaf-first | root-first | together — the depth rank that releases first
//   release.stagger  beats between ranks
//   release.scatter  drift (a slow curling wander), burst (out from the tile's centre), follow-flow (along the fluid's
//                    own lean at the piece: markDriftDelta)
//   rejoin.ease / rejoin.beats / rejoin.path   retrace (back along the way out) | direct (a straight line) | arc
//
// THE FOLD is the one piece of state: per wearer, `out` (releasing / released, since beat t0) or `back` (rejoining,
// since beat t0). It lives in the resolver and rides the resolver snapshot (gl/liveResolve.mjs `gaitBreak`), so a take
// — the snapshot plus the input log — replays it exactly. Everything else here is a pure function of (the fold, the
// beat, the pieces, the field), with no clock and no Math.random: the one seeded draw (a drift piece's heading) rides
// the registered 'gait-scatter' channel.
//
// THE CONTRACT:
//   · Continuous. out → back starts the rejoin from where each piece IS; back → out (the field returns mid-rejoin)
//     releases again from where each piece is. No piece ever jumps.
//   · Exact. A rejoin that completes drops the wearer from the fold, and its pieces get NO offset at all — their
//     marks come back as the very objects they went in as. So the rest pose (the tile, or the gait's own pose) is
//     exact, never "nearly".
//   · Hierarchy, dealt > pieces > forces: a piece never grows, travels at most a modest fraction of its tile's own
//     size (SCATTER_FRAC), and reads a little quieter while it is out (PIECE_QUIET); the force is seen only through
//     the pieces it moves.
import { hashU01 } from './kernel/rng.js';
import { markDriftDelta, DRIFT_MAX_PX } from './dishFluidDrift.mjs';
import { ATTACH_BOX } from './assetAttach.js';
import { GAIT_EASES, GAIT_PATHS, GAIT_RELEASE_ORDERS, GAIT_SCATTERS, GAIT_DEFAULT_BPM } from './gait.js';

/** The string channel a drift piece's heading rides (registered in kernel/rng.js STRING_CHANNEL_GROUPS). */
export const BREAK_CHANNEL = 'gait-scatter';
/** Beats a released piece takes to travel out to its scatter (taste: modest). */
export const BREAK_OUT_BEATS = 1;
/** How far a piece travels at full release, as a fraction of its tile's drawn size (taste: modest). */
export const SCATTER_FRAC = Object.freeze({ drift: 0.18, burst: 0.3, 'follow-flow': 0.25 });
/** Radians a drift piece's heading turns over its run out (so `retrace` and `direct` differ). */
export const DRIFT_CURL = 0.6;
/** An `arc` rejoin bows sideways by this fraction of the piece's distance home, at its middle. */
export const ARC_BULGE = 0.35;
/** A piece at full scatter draws at this much of its tile's alpha: pieces are quieter than the dealt whole. */
export const PIECE_QUIET = 0.85;
/** The most wearers the fold keeps (a stage has far fewer constructs; this only bounds a hostile snapshot). */
export const BREAK_MAX_WEARERS = 256;

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// ── the schedule (pure) ─────────────────────────────────────────────────────────────────────────────────────────────

/** The gait's eases (GAIT_EASES), u in [0, 1] → [0, 1] (outBack overshoots on the way). Unknown = linear. */
export function easeOf(name, u) {
  const t = clamp01(u);
  if (t === 0 || t === 1) return t; // exact ends (outBack's polynomial leaves float dust at 0)
  switch (name) {
    case 'outCubic':
      return 1 - (1 - t) ** 3;
    case 'inOutCubic':
      return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    case 'outBack': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
    }
    default:
      return t;
  }
}

/** How a scatter eases out: a burst snaps out, a drift and a flow ease in and out. */
const OUT_EASE = Object.freeze({ drift: 'inOutCubic', burst: 'outCubic', 'follow-flow': 'inOutCubic' });

/**
 * Each piece's release rank from its depth: leaf-first ranks the deepest 0, root-first the root 0, together all 0.
 * A piece releases `rank × stagger` beats after the field arrives.
 */
export function releaseRanks(depths, order) {
  let max = 0;
  for (const d of depths) if (d > max) max = d;
  return depths.map((d) => (order === 'together' ? 0 : order === 'root-first' ? d : max - d));
}

/** The structure a break needs, read off a gait (sanitized defaults for anything missing). */
export function breakStructure(gait, bpm) {
  const rel = isObj(gait?.release) ? gait.release : {};
  const rej = isObj(gait?.rejoin) ? gait.rejoin : {};
  return {
    order: GAIT_RELEASE_ORDERS.includes(rel.order) ? rel.order : GAIT_RELEASE_ORDERS[0],
    stagger: fin(rel.stagger) && rel.stagger > 0 ? rel.stagger : 0,
    scatter: GAIT_SCATTERS.includes(rel.scatter) ? rel.scatter : GAIT_SCATTERS[0],
    ease: GAIT_EASES.includes(rej.ease) ? rej.ease : GAIT_EASES[0],
    beats: fin(rej.beats) && rej.beats > 0 ? rej.beats : 1,
    path: GAIT_PATHS.includes(rej.path) ? rej.path : GAIT_PATHS[0],
    bpm: fin(bpm) && bpm > 0 ? bpm : GAIT_DEFAULT_BPM,
  };
}

/** A piece's raw release progress (0..1) at beat t: it starts `delay` beats after t0 and runs BREAK_OUT_BEATS. */
export const releaseProgress = (t, t0, delay) => clamp01((t - t0 - delay) / BREAK_OUT_BEATS);

/**
 * The way out, P(g): where a piece is (offset from rest, stage px) at raw progress g along its scatter. P(0) = 0.
 *   v       the piece's scatter vector: drift → its heading (unit), burst → out from the tile's centre (unit),
 *           follow-flow → the fluid's lean at the piece / DRIFT_MAX_PX (length ≤ 1)
 *   L       the scatter length (SCATTER_FRAC × the tile's size)
 */
export function outPath(scatter, g, v, L) {
  const h = easeOf(OUT_EASE[scatter] || 'linear', g) * L;
  if (scatter === 'drift') {
    const a = DRIFT_CURL * clamp01(g);
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: h * (v.x * c - v.y * s), y: h * (v.x * s + v.y * c) };
  }
  return { x: h * v.x, y: h * v.y };
}

/** Out: from the piece's start offset d (0 for a fresh release) toward its scatter. Continuous at g = 0 (= d). */
export function outOffset(scatter, g, v, L, d) {
  const p = outPath(scatter, g, v, L);
  if (!d) return p;
  const k = 1 - easeOf(OUT_EASE[scatter] || 'linear', g);
  return { x: p.x + d.x * k, y: p.y + d.y * k };
}

/**
 * Back: the offset u of the way through a rejoin (u in [0, 1)), from where the piece was when the field left (raw
 * progress gEnd, start offset d). e = the rejoin's ease. At u = 0 every path is the out offset (no jump); as u → 1 every
 * path → 0. The caller never evaluates u ≥ 1: a finished rejoin has no offset at all (exact).
 */
export function backOffset(s, u, v, L, gEnd, d) {
  const e = easeOf(s.ease, u);
  if (s.path === 'retrace') {
    const g = gEnd * (1 - e); // back along the way out (outBack's overshoot runs the path a hair past home)
    const p = outPath(s.scatter, g < 0 ? 0 : g, v, L);
    if (!d) return g < 0 ? { x: p.x * (1 - e), y: p.y * (1 - e) } : p;
    const k = (1 - easeOf(OUT_EASE[s.scatter] || 'linear', g < 0 ? 0 : g)) * (1 - e);
    return { x: p.x + d.x * k, y: p.y + d.y * k };
  }
  const c = outOffset(s.scatter, gEnd, v, L, d);
  const k = 1 - e;
  if (s.path === 'arc') {
    const b = ARC_BULGE * Math.sin(Math.PI * clamp01(e));
    return { x: c.x * k - c.y * b, y: c.y * k + c.x * b };
  }
  return { x: c.x * k, y: c.y * k };
}

/** The alpha factor for a piece `dist` px from rest, L the full scatter: 1 at rest, PIECE_QUIET at full scatter. */
export const quietOf = (dist, L) => (L > 0 ? 1 - (1 - PIECE_QUIET) * clamp01(dist / L) : 1);

function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Each piece's scatter vector (see outPath). `rest` are the piece marks unposed (in piece order), `tile` the tile's
 * mark, `flow` the follow-flow vectors (already chosen by the caller) or null.
 */
export function scatterVectors(scatter, rest, tile, seed, flow) {
  return rest.map((m, k) => {
    if (scatter === 'follow-flow') {
      const f = flow && flow[k];
      return f ? { x: f[0], y: f[1] } : { x: 0, y: 0 };
    }
    let x = m.x - tile.x;
    let y = m.y - tile.y;
    const len = Math.hypot(x, y);
    if (scatter === 'burst' && len > 1e-6) return { x: x / len, y: y / len };
    const a = 2 * Math.PI * hashU01(seed >>> 0, BREAK_CHANNEL, k);
    x = Math.cos(a);
    y = Math.sin(a);
    return { x, y };
  });
}

// ── the fold (the one state) ────────────────────────────────────────────────────────────────────────────────────────

const r6 = (v) => Math.round(v * 1e6) / 1e6;

function checkEntry(e) {
  if (!isObj(e) || (e.m !== 'out' && e.m !== 'back') || !fin(e.t0) || !Number.isInteger(e.n) || e.n < 1) return false;
  const s = e.s;
  if (!isObj(s) || !GAIT_RELEASE_ORDERS.includes(s.order) || !GAIT_SCATTERS.includes(s.scatter)) return false;
  if (!GAIT_EASES.includes(s.ease) || !GAIT_PATHS.includes(s.path)) return false;
  if (!fin(s.stagger) || !fin(s.beats) || !(s.beats > 0) || !fin(s.bpm) || !(s.bpm > 0)) return false;
  const pairs = (a) =>
    a === null ||
    (Array.isArray(a) &&
      a.length === e.n &&
      a.every((p) => Array.isArray(p) && p.length === 2 && fin(p[0]) && fin(p[1])));
  if (!pairs(e.d) || !pairs(e.f)) return false;
  if (e.m === 'back' && !(Array.isArray(e.g) && e.g.length === e.n && e.g.every(fin))) return false;
  return true;
}

/** Is this a well-formed fold snapshot? (Fail-closed: a recorded snapshot must never throw the resolver.) */
export function checkBreakSnapshot(snap) {
  if (!isObj(snap)) return false;
  const keys = Object.keys(snap);
  if (keys.length > BREAK_MAX_WEARERS) return false;
  return keys.every((k) => checkEntry(snap[k]));
}

const copyEntry = (e) => JSON.parse(JSON.stringify(e));

/**
 * The fold: one entry per breaking wearer, keyed by the caller (layer | tile key). JSON-safe.
 *   has(key)            is this wearer breaking up or rejoining (it then counts as `moving`)?
 *   pose(key, a)        advance the wearer one frame and return its piece marks, offset (or the same marks)
 *   sweep(prefix, seen) drop the wearers under `prefix` that did not stand on stage this frame
 *   snapshot / restore / reset / size
 */
export function createGaitBreakup() {
  const fold = new Map();

  /**
   * @param key  the wearer
   * @param a    { marks, rest, depths, tile, field, gait, bpm, driverSec, seed }
   *   marks     the piece marks to offset (the gait's pose, or the rest pose), in piece order
   *   rest      the piece marks unposed (scatter directions; follow-flow reads the field at each)
   *   depths    each piece's join depth
   *   tile      the tile's mark (x, y, scale)
   *   field     the marks' fluid lean field (fluidDrift) or null — the signal is markDriftDelta at the tile's centre
   *   gait      the gait the wearer wears (a break STARTS only with one); bpm its tempo
   *   driverSec the kineme clock (seconds); seed the layer's seed
   * @returns { marks, active } — the same `marks` when the wearer is not breaking
   */
  function pose(key, a) {
    const n = a.marks.length;
    const tile = a.tile;
    const signal = !!(a.field && markDriftDelta(a.field, tile.x, tile.y));
    let e = fold.get(key);
    if (e && e.n !== n) {
      fold.delete(key); // a different shape under the same key: start over
      e = undefined;
    }
    if (!e) {
      if (!signal || !a.gait) return { marks: a.marks, active: false };
      e = { m: 'out', t0: 0, n, s: breakStructure(a.gait, a.bpm), d: null, f: null };
      e.t0 = r6((a.driverSec * e.s.bpm) / 60);
      fold.set(key, e);
    }
    const s = e.s;
    const t = (a.driverSec * s.bpm) / 60;
    const L = SCATTER_FRAC[s.scatter] * Math.abs(tile.scale) * ATTACH_BOX;
    const wearerSeed = ((a.seed | 0) ^ hash32(key)) >>> 0;
    const ranks = releaseRanks(a.depths, s.order);
    const dOf = (k) => (e.d ? { x: e.d[k][0], y: e.d[k][1] } : null);

    // follow-flow reads the fluid's lean at each piece's rest (the tile's own lean where a piece's cell is quiet);
    // while the field stands it is refreshed every frame, and the last reading is kept for the way back
    if (s.scatter === 'follow-flow' && signal && e.m === 'out') {
      const at = markDriftDelta(a.field, tile.x, tile.y);
      e.f = a.rest.map((m) => {
        const q = markDriftDelta(a.field, m.x, m.y) || at;
        return [r6(q.dx / DRIFT_MAX_PX), r6(q.dy / DRIFT_MAX_PX)];
      });
    }
    const vec = scatterVectors(s.scatter, a.rest, tile, wearerSeed, e.f);
    const delayOf = (k) => (e.d ? 0 : ranks[k] * s.stagger);
    const outAt = (k, tt) => outOffset(s.scatter, releaseProgress(tt, e.t0, delayOf(k)), vec[k], L, dOf(k));

    if (e.m === 'out' && !signal) {
      // the field left: the rejoin starts from where every piece is now
      const g = new Array(n);
      for (let k = 0; k < n; k++) g[k] = r6(releaseProgress(t, e.t0, delayOf(k)));
      e = { m: 'back', t0: r6(t), n, s, d: e.d, f: e.f, g };
      fold.set(key, e);
    } else if (e.m === 'back' && signal) {
      // the field came back mid-rejoin: release again from where every piece is now (no stagger: all are out)
      const u = (t - e.t0) / (s.beats || 1);
      const d = new Array(n);
      for (let k = 0; k < n; k++) {
        const o = backOffset(s, u, vec[k], L, e.g[k], dOf(k));
        d[k] = [r6(o.x), r6(o.y)];
      }
      e = { m: 'out', t0: r6(t), n, s, d, f: e.f };
      fold.set(key, e);
    }

    let offs;
    if (e.m === 'back') {
      const u = (t - e.t0) / s.beats;
      if (u >= 1) {
        fold.delete(key); // home: the rest pose, exactly (no offset is applied at all)
        return { marks: a.marks, active: false };
      }
      offs = a.marks.map((_, k) => backOffset(s, u < 0 ? 0 : u, vec[k], L, e.g[k], dOf(k)));
    } else {
      offs = a.marks.map((_, k) => outAt(k, t));
    }
    const out = a.marks.map((m, k) => {
      const o = offs[k];
      if (o.x === 0 && o.y === 0) return m; // not released yet: untouched
      return { ...m, x: m.x + o.x, y: m.y + o.y, alphaMul: quietOf(Math.hypot(o.x, o.y), L) };
    });
    return { marks: out, active: true };
  }

  return {
    has: (key) => fold.has(key),
    pose,
    sweep(prefix, seen) {
      for (const k of [...fold.keys()]) if (k.startsWith(prefix) && !seen.has(k)) fold.delete(k);
    },
    get size() {
      return fold.size;
    },
    /** JSON-safe snapshot, or null when nothing is breaking (the resolver snapshot then carries no key). */
    snapshot() {
      if (!fold.size) return null;
      const o = {};
      for (const k of [...fold.keys()].sort()) o[k] = copyEntry(fold.get(k));
      return o;
    },
    /** Restore a snapshot() (absent / malformed = an empty fold, as a fresh resolver's). */
    restore(snap) {
      fold.clear();
      if (!checkBreakSnapshot(snap)) return;
      for (const k of Object.keys(snap)) fold.set(k, copyEntry(snap[k]));
    },
    reset() {
      fold.clear();
    },
  };
}
