// app/src/engine/beastBuilder.js — #1866 BEAST S3: the drawn beast.
//
// A third pin-hosted creature builder, beside the moth (engine/creature.js)
// and the dish creature (engine/dishCreature.js), with the same append
// contract. The S2 solver's joints become a DRAWING: bars as strokes
// between joints, joints as nodes — flat stamp items through the same item
// path every creature uses (the renderer never learns a beast exists).
// The body is assets: bars are `line_solid_01`, nodes are `dot_single_01`,
// coloured from the top layer's palette and dressed by the same ground
// treatment the marks obey, so the beast sits in the picture.
//
// The beast WALKS IN PLACE at its pin: the crank turns, the full gait
// (stance and swing) plays, and the body honestly does not travel —
// travelling is S4 (#1867), and the pin is not pretending otherwise.
//
// Geometry (measured against the shipped solver, wild type): the leg
// hangs toward negative y; stance sits at the foot curve's lowest band
// (evaluateGenome's stanceMean); as θ rises the stance foot travels +x.
// The canvas mapping is screen = origin + (lx, −ly) · unitPx, and a
// right-facing beast runs its crank BACKWARDS (θ decreases with driver
// time) so the stance foot strokes backward under the body. The foot's
// stance height is stationary against the ground line by the linkage's
// own geometry — no glide, no foot-skate, nothing scripted.
//
// Determinism: joint positions come only from the S2 leaf (pure). The
// crank angle is an analytic function of the layer's driver clock (the
// anchored kineme floor both families read — never wall time) and the
// host's declared phase; the builder counts every resolver frame like
// the moth. A recorded take replays the same pose at the same frame.
//
// Hosting rides ONE new resolver input field, input.beastHosts, parallel
// to dishPins: entry i is null/absent (no beast) or a host record
//   { measures, drive?, phase? }
// measures are the S1 relative Jansen measures (a..m + legCount + scale +
// optional phase0..phaseN per-leg phases); drive is the crank-rate
// multiplier (the DRIVE-gene rate, range of the genome's drive genes);
// phase is the crank's phase offset in turns. Absent field — every take
// recorded before this slice — the builder appends nothing and the stage
// is byte-identical. A pin the dish creature hosts grows no beast
// (allocation exclusivity, the moth's own rule). An infeasible genome is
// a stillbirth (S2's gate): the builder draws nothing for it, ever —
// feasibility precedes drawing, and the gait score never gates anything.

import { solvePose, evaluateGenome } from './jansenSolver.js';
import { MEASURE_IDS, MEASURE_RANGES, JANSEN_RELATIVE } from './jansenMeasures.js';
import { expressGenome } from './creatureGenome.js';
import { groundTreatment } from './creature.js';

export const BEAST = Object.freeze({
  barAsset: 'line_solid_01', // a solid line, x∈[6,94] at y=50, stroke 4 (asset units)
  nodeAsset: 'dot_single_01', // a filled circle, r=14 at the centre (asset units)
  barSpanUnits: 88, // the bar asset's drawn span (94 − 6)
  barStrokeUnits: 4, // the bar asset's stroke width
  nodeSpanUnits: 28, // the node asset's drawn diameter (2 × r=14)
  barThickUnits: 0.075, // bar thickness, in solver units
  beamThickUnits: 0.11, // the body beam is the stoutest bar
  jointDiamUnits: 0.15, // node diameter at a linkage joint, solver units
  hubDiamUnits: 0.21, // node diameter at the crank hub (O)
  footDiamUnits: 0.23, // node diameter at the foot (F)
  pxPerUnit: 46, // canvas px per absolute solver unit (before grow-in)
  legSpacingUnits: 0.85, // crank-centre spacing along the beam, solver units (× genome scale)
  crankHz: 0.18, // crank revolutions per driver second at drive 1
  growFrames: 45, // resolver frames from spore to full size (the moth's number)
  driveRange: Object.freeze({ min: 0.25, max: 2 }), // the genome's drive-gene range
});

const TAU = Math.PI * 2;

/** The 12 bars of one leg, as [name, from, to] over the leg-frame points
 *  O (crank centre), G (frame pivot), J1..J5, F (foot) — the solver's own
 *  construction order: crank m · frame (a, l) · the ten moving bars b..k. */
export const BEAST_BARS = Object.freeze([
  ['crank', 'O', 'J1'],
  ['frame', 'O', 'G'],
  ['b', 'G', 'J2'],
  ['j', 'J1', 'J2'],
  ['e', 'J2', 'J3'],
  ['d', 'G', 'J3'],
  ['k', 'J1', 'J4'],
  ['c', 'G', 'J4'],
  ['f', 'J3', 'J5'],
  ['g', 'J4', 'J5'],
  ['i', 'J4', 'F'],
  ['h', 'J5', 'F'],
]);

export const BEAST_NODES = Object.freeze(['O', 'G', 'J1', 'J2', 'J3', 'J4', 'J5', 'F']);

const clamp = (v, r) => Math.min(r.max, Math.max(r.min, v));

/**
 * Clamp anything to a valid relative measure set. Every bar id is filled
 * from the wild type when missing or non-finite, then clamped to its
 * legal range (MEASURE_RANGES — k's ±2% tripwire included); legCount is a
 * whole number in range; per-leg phaseN keys are clamped to 0..1. Returns
 * null when `raw` is not an object at all.
 */
export function sanitizeMeasures(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const id of MEASURE_IDS) {
    const v = Number.isFinite(raw[id]) ? raw[id] : JANSEN_RELATIVE[id];
    out[id] = clamp(v, MEASURE_RANGES[id]);
  }
  const lc = Number.isFinite(raw.legCount) ? Math.round(raw.legCount) : 12;
  out.legCount = clamp(lc, MEASURE_RANGES.legCount);
  out.scale = clamp(Number.isFinite(raw.scale) ? raw.scale : 1, MEASURE_RANGES.scale);
  for (let i = 0; i < out.legCount; i++) {
    const key = `phase${i}`;
    if (Number.isFinite(raw[key])) out[key] = clamp(raw[key], MEASURE_RANGES.phase);
  }
  return out;
}

/** A genome's beast host record, or null when it carries no full measure
 *  set. The seam the creature-record slices (#1849/#1852) build on: the
 *  genome expresses its measures (S1), and a complete set is a host. */
export function beastHostFromGenome(genome, ageFrames = 0) {
  const expressed = expressGenome(genome, ageFrames);
  const measures = sanitizeMeasures(expressed && expressed.measures);
  if (!measures) return null;
  if (!MEASURE_IDS.every((id) => Number.isFinite(expressed.measures[id]))) return null;
  return { measures, drive: 1, phase: 0 };
}

function normalizeHost(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const measures = sanitizeMeasures(raw.measures);
  if (!measures) return null;
  const drive = clamp(Number.isFinite(raw.drive) ? raw.drive : 1, BEAST.driveRange);
  const phase = Number.isFinite(raw.phase) ? ((raw.phase % 1) + 1) % 1 : 0;
  return { measures, drive, phase };
}

/** The measures' fingerprint for the feasibility cache + per-pin identity. */
function measuresKey(m) {
  const parts = MEASURE_IDS.map((id) => m[id].toFixed(4));
  parts.push(String(m.legCount), m.scale.toFixed(4));
  for (let i = 0; i < m.legCount; i++) parts.push((m[`phase${i}`] ?? i / m.legCount).toFixed(4));
  return parts.join('/');
}

/** One leg's points in its own frame (absolute solver units): the solver's
 *  joints plus the frame points it keeps internal — O at the origin, G at
 *  (−a, −l) — recomputed from the same lengths. Null when the pose fails. */
export function legPoints(measures, theta, scale = 1) {
  const pose = solvePose(measures, theta, scale);
  if (!pose || !pose.ok) return null;
  const a = (measures.a ?? 1) * scale;
  const l = (measures.l ?? JANSEN_RELATIVE.l) * scale;
  return { O: { x: 0, y: 0 }, G: { x: -a, y: -l }, ...pose.joints };
}

/**
 * The pose-level drawing of ONE leg (the S3 stub's shape, completed):
 * all 12 bars as endpoint pairs and all 8 nodes, in leg-frame solver
 * units, rotated by `heading` (radians, leg frame). The builder below is
 * built on this; trails (S5) and suites read it directly.
 */
export function buildBeastPose(measures, theta, scale = 1, heading = 0) {
  const pts = legPoints(measures, theta, scale);
  if (!pts) return null;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const rot = (p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });
  const out = {};
  for (const name of BEAST_NODES) out[name] = rot(pts[name]);
  return {
    bars: BEAST_BARS.map(([name, from, to]) => ({ name, from: out[from], to: out[to] })),
    joints: out,
    foot: out.F,
  };
}

/** Advance crank. Rate from drive; returns new theta. (Kept from the stub;
 *  the builder itself reads the anchored driver clock, never a dt.) */
export function stepCrank(theta, rate, dt) {
  return (theta + rate * dt) % TAU;
}

const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);

/** How colourful a #rrggbb is (the moth's measure, kept local as both
 *  families keep it): max channel minus min channel. Else 0. */
function chroma(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return 0;
  const v = parseInt(m[1], 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  return Math.max(...c) - Math.min(...c);
}

/**
 * The builder the resolver owns. `append(input, entries, pool)` adds the
 * beasts to the TOP content layer's items. With no host on a formed pin
 * it does nothing at all (byte-identical stage).
 */
export function createBeastBuilder() {
  const ages = []; // frames each pin's beast has been hosted (grow-in)
  const keys = []; // the measures fingerprint each pin's age belongs to
  const infoCache = new Map(); // fingerprint -> { feasible, stanceMean } (derived, never snapshotted)
  let frame = 0; // the builder's own frame count: advances once per append, hosted or not
  let frameFeet = []; // the last appended frame's feet, per pin: { x, y, feet: [{x, y}...], theta } | null

  const infoFor = (measures) => {
    const key = measuresKey(measures);
    let info = infoCache.get(key);
    if (!info) {
      const ev = evaluateGenome(measures, measures.scale);
      info = { feasible: !!ev.feasible, stanceMean: ev.feasible ? ev.stanceMean : 0 };
      infoCache.set(key, info);
    }
    return info;
  };

  return {
    append(input, entries, pool, motionFor = null, groundFor = null) {
      frame += 1; // every resolver frame counts, even one that appends nothing
      frameFeet = [];
      const pins = input && input.dishPins;
      const formed = input && input.dishFormed;
      const hosts = input && input.beastHosts;
      if (!Array.isArray(pins) || !Array.isArray(formed) || !Array.isArray(hosts) || !formed.some(Boolean)) {
        if (ages.length) ages.length = 0;
        if (keys.length) keys.length = 0;
        return;
      }
      let top = null;
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e && !e.isFx && !e.isPattern && Array.isArray(e.items)) {
          top = e;
          break;
        }
      }
      if (!top) return;
      const swatches = (top.palette && top.palette.swatches) || [];
      const sw = (i) =>
        swatches.length ? swatches[((i % swatches.length) + swatches.length) % swatches.length] : '#ffffff';
      const pal = top.palette || {};
      const ink = typeof pal.ink === 'string' ? pal.ink : sw(0);
      // joints take the most vivid swatch (the moth's ranking), feet the next
      const ranked = swatches
        .map((c, n) => ({ c, n }))
        .sort((a, b) => chroma(b.c) - chroma(a.c) || a.n - b.n)
        .map((e) => e.c);
      const pick = (r) => ranked[Math.min(ranked.length - 1, Math.max(0, r))] || ink;
      // the layer's living-motion context (null when held / reduced motion):
      // the crank reads its driver clock — the anchored floor the band paces.
      const motion = input.reducedMotion || typeof motionFor !== 'function' ? null : motionFor(top);
      const driverSec = motion && Number.isFinite(motion.driverSec) ? motion.driverSec : 0;
      const ground = typeof groundFor === 'function' ? groundFor(top) : null;
      const extra = [];
      for (let i = 0; i < pins.length; i++) {
        const pin = pins[i];
        const host = normalizeHost(hosts[i]);
        if (
          !formed[i] ||
          (input.dishHosted && input.dishHosted[i]) ||
          !host ||
          !pin ||
          !Number.isFinite(pin.x) ||
          !Number.isFinite(pin.y)
        ) {
          ages[i] = 0;
          keys[i] = null;
          frameFeet[i] = null;
          continue;
        }
        const key = measuresKey(host.measures);
        if (keys[i] !== key) {
          keys[i] = key;
          ages[i] = 0; // a different animal at this pin: it hatches again
        }
        const info = infoFor(host.measures);
        if (!info.feasible) {
          // a stillbirth: the gate is S2's, applied before any item exists
          ages[i] = 0;
          frameFeet[i] = null;
          continue;
        }
        ages[i] = (ages[i] || 0) + 1;
        const g = Math.max(0.02, easeOut(Math.min(1, ages[i] / BEAST.growFrames)));
        const unitPx = BEAST.pxPerUnit * g;
        const m = host.measures;
        const scale = m.scale;
        // the ground beneath the PIN (its home), like the moth: the ground's
        // own offset + recolour, so the beast dresses for the room it stands in
        const gt = groundTreatment(ground, pin.x, pin.y, i, input.seed, input.seedOffsets || null);
        const ox = pin.x + gt.dx;
        const oy = pin.y + gt.dy + info.stanceMean * unitPx; // stanceMean < 0: the crank line rides above the pin
        const [barColor] = gt.recolor(ink, pick(0));
        const [jointColor] = gt.recolor(pick(0), ink);
        const [footColor] = gt.recolor(pick(1), ink);
        const n = m.legCount;
        const spacing = BEAST.legSpacingUnits * scale * unitPx;
        const legOrigin = (li) => ({ x: ox + (li - (n - 1) / 2) * spacing, y: oy });
        const toScreen = (o, p) => ({ x: o.x + p.x * unitPx, y: o.y - p.y * unitPx });
        const barItem = (from, to, thickUnits, color, keyName) => {
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const len = Math.hypot(dx, dy);
          return {
            x: (from.x + to.x) / 2,
            y: (from.y + to.y) / 2,
            scale: len / BEAST.barSpanUnits,
            scaleY: (thickUnits * unitPx) / BEAST.barStrokeUnits,
            rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
            alpha: 100,
            assetId: BEAST.barAsset,
            color,
            accent: color,
            key: keyName,
            zTier: 0,
            seedOffset: 0,
            glass: false,
            _creature: true,
          };
        };
        const nodeItem = (p, diamUnits, color, keyName) => ({
          x: p.x,
          y: p.y,
          scale: (diamUnits * unitPx) / BEAST.nodeSpanUnits,
          scaleY: (diamUnits * unitPx) / BEAST.nodeSpanUnits,
          rotation: 0,
          alpha: 100,
          assetId: BEAST.nodeAsset,
          color,
          accent: color,
          key: keyName,
          zTier: 0,
          seedOffset: 0,
          glass: false,
          _creature: true,
        });
        const mine = [];
        const feet = [];
        let theta0 = 0;
        // the body beam first (under the legs): one bar through every crank centre
        if (n > 1) {
          mine.push(
            barItem(legOrigin(0), legOrigin(n - 1), BEAST.beamThickUnits, barColor, `creature:${i}:beast:beam`),
          );
        }
        for (let li = 0; li < n; li++) {
          const legPhase = Number.isFinite(m[`phase${li}`]) ? m[`phase${li}`] : li / n;
          // the crank runs backwards (θ falls as driver time rises) so the
          // stance foot strokes backward under a right-facing body
          const theta = TAU * (host.phase + legPhase - BEAST.crankHz * host.drive * driverSec);
          if (li === 0) theta0 = theta;
          const pts = legPoints(m, theta, scale);
          if (!pts) continue; // a pose the 360-step gate passed but this angle fails: skip the leg, never crash
          const o = legOrigin(li);
          const screen = {};
          for (const name of BEAST_NODES) screen[name] = toScreen(o, pts[name]);
          for (const [barName, from, to] of BEAST_BARS) {
            mine.push(
              barItem(
                screen[from],
                screen[to],
                BEAST.barThickUnits,
                barColor,
                `creature:${i}:beast${li}:bar:${barName}`,
              ),
            );
          }
          for (const name of BEAST_NODES) {
            const isFoot = name === 'F';
            const isHub = name === 'O';
            mine.push(
              nodeItem(
                screen[name],
                isFoot ? BEAST.footDiamUnits : isHub ? BEAST.hubDiamUnits : BEAST.jointDiamUnits,
                isFoot ? footColor : isHub ? barColor : jointColor,
                `creature:${i}:beast${li}:node:${name}`,
              ),
            );
          }
          feet.push(screen.F);
        }
        frameFeet[i] = feet.length ? { x: pin.x, y: pin.y, feet, theta: theta0 } : null;
        extra.push(...mine);
      }
      ages.length = pins.length;
      keys.length = pins.length;
      frameFeet.length = pins.length;
      if (extra.length) top.items = [...top.items, ...extra];
    },
    /** The last appended frame's feet in screen space, per pin (null where
     *  no beast stands) — the debug/suite read of the gait, like the moth's
     *  lastSkeletons. */
    lastFeet() {
      return frameFeet;
    },
    // The builder's accumulative state: per-pin grow-in ages, the measures
    // fingerprint each age belongs to (a restored take must not hatch a
    // grown beast again), and its own frame count. The feasibility cache
    // is derived — recomputed from the measures, never snapshotted.
    snapshotState() {
      return { ages: [...ages], keys: [...keys], frame };
    },
    restoreState(s) {
      if (
        !s ||
        !Array.isArray(s.ages) ||
        !Array.isArray(s.keys) ||
        s.ages.length !== s.keys.length ||
        !Number.isInteger(s.frame) ||
        s.frame < 0
      )
        return false;
      if (!s.ages.every(Number.isFinite)) return false;
      if (!s.keys.every((k) => k === null || typeof k === 'string')) return false;
      ages.length = 0;
      ages.push(...s.ages);
      keys.length = 0;
      keys.push(...s.keys);
      frame = s.frame;
      return true;
    },
    dispose() {
      ages.length = 0;
      keys.length = 0;
      infoCache.clear();
      frameFeet = [];
      frame = 0;
    },
  };
}
