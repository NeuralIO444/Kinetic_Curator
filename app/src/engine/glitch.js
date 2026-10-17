// engine/glitch.js — Phase 2 creature system, slice S8: the GLITCH, the data creature. Render-side rules only.
//
// Matt's definition, locked 2026-10-16: the glitch is an asset-formed body whose MATERIAL corrupts. (Matrix
// rain was rejected — a field, not an animal.) So the corruption lives here, in the material/render path, and
// NEVER in the skeleton: bones stay true (engine/skeleton.js is untouched by this module and unaware of it),
// and a corrupted frame is a pure function of (seed, creatureId, frame index, band) — replay it anywhere, it
// lands byte-identical; drop the band and the body returns to byte-exact truth.
//
// Ruling 3 (Matt, 2026-10-16): corruption IS the glitch's band response. Tighten corrupts, Relax restores.
// The mapping (corruptionAmount) keys off the same Tighten bar S5's poses use (0.72): at or below it there is
// no corruption at all — Normal and Relax are both truth — and above it corruption grows quadratically to
// full at band 1, in density (how many strips slip) as well as magnitude.
//
// The operators, all on the finished item stream the creature builder emits (the composite's atoms today):
//   - STRIP SLIP: the body is cut into horizontal strips in creature-local space; each strip's items shift
//     along the local X axis by a seeded per-strip, per-frame amount. A strip's gate draw decides whether it
//     slips at all this frame, so corruption thickens as the amount grows.
//   - MIRROR-SEAM DRIFT: items left of the seam (the creature's mirror axis) shift one way along local X,
//     items right of it the other — the two mirrored halves drift apart (or cross) at the seam, seeded per
//     frame. An item's side is its geometry, not its name: an item centred on the seam does not drift.
//   - CHANNEL SPLIT: the material surfaces (body + wings — not the halo, whose colour is the ground's, and
//     not the scales, where a split reads as noise) grow two ghost copies, offset ±split along local X, in
//     channel-isolated colours (red-only, blue-only) at reduced alpha: the classic RGB fringe.
//   - HATCH SORTING: the creature's fine marks (the plumage — S3's fan parts, successor to the scatter
//     scales; S4's hatch marks when that pass lands)
//     are re-sorted among their own slots in the draw order by seeded swaps, their count graded by amount.
//     At zero swaps the order is the untouched order.
//
// Every draw is hashU01 on the registered 'glitch' channel, indexed by a hash of (creatureId, frame, part) —
// no sequential stream, no clock, no unseeded chance, so draw order can never leak across frames or creatures.
// The 'glitch' channel rides the SPATIAL seed-offset group (kernel/rng.js): the corruption displaces the
// creature's material, so re-rolling SPATIAL re-rolls the pattern; re-rolling colour does not touch it (the
// channel split is derived from the item's own colours, never a colour choice).
//
// Integration points for the stack (marked, per the staging brief):
//   - BAND SOURCE: the builder reads a per-pin band from the resolver input (`input.dishGlitch`), supplied by
//     nothing today. S5 owns the band reader (hysteresis in one place, #1636); when it lands, it feeds this
//     field and the glitch starts answering the room. Until then the wiring is a gate: no band, no corruption,
//     and every pre-S8 golden holds byte-identical.
//   - SKINNING (S2): the warp deforms wing stamps into a mesh; when it lands, strip slip can move mesh
//     vertices per strip instead of whole stamps. The params this module emits (per-strip slip, seam, split)
//     are the same numbers a vertex path would consume.
//   - COMPOSITE (S4): the engraving pass's hatch marks join the hatch-sorting set by carrying 'marks#' in
//     their item keys, the house scatter-path convention this module keys on; a shader composite can take
//     split/seam as per-type uniforms instead — the values are computed here either way.
import { hashU01 } from './kernel/rng.js';
import { fnv1a } from './skeleton.js';
import { TIGHTEN_ABOVE } from '../curator/stress.js';

export const GLITCH = Object.freeze({
  /** The Tighten bar: at or below it, no corruption. IMPORTED from curator/stress.js — the one
   *  declaration of the bar, shared with S5's pose mapping, so the glitch can never start
   *  corrupting at a different bar than the moth withers at. Never a local literal. */
  tightenAt: TIGHTEN_ABOVE,
  /** Height of one horizontal strip, in scene px of creature-local Y. */
  stripH: 13,
  /** The largest strip slip at full corruption, scene px along local X. */
  maxSlipPx: 16,
  /** The largest per-half seam drift at full corruption, scene px along local X. */
  maxSeamPx: 10,
  /** The largest channel-split offset at full corruption, scene px along local X. */
  maxSplitPx: 7,
  /** A ghost copy's alpha, as a fraction of its source item's. */
  ghostAlpha: 0.6,
});

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const finite = (v, d) => (Number.isFinite(v) ? v : d);

/**
 * The band mapping — ruling 3 as a function. band is the room's 0..1 band scalar (the formation/pose scale:
 * Relax < 0.28, Normal between, Tighten > 0.72). Returns the corruption amount 0..1: exactly 0 at or below
 * the Tighten bar (and for any missing/non-finite band — no signal, no corruption), then quadratic to 1 at
 * band 1, so corruption creeps at the bar and blooms at full Tighten.
 */
export function corruptionAmount(band) {
  if (!Number.isFinite(band)) return 0;
  const x = clamp01((band - GLITCH.tightenAt) / (1 - GLITCH.tightenAt));
  return x * x;
}

/** One seeded draw for one part of one frame of one creature. Index-keyed: no stream order to leak. */
const draw = (seed, creatureId, frameIndex, part, seedOffsets) =>
  hashU01(seed, 'glitch', fnv1a(`${creatureId}@${frameIndex}:${part}`), seedOffsets);

/**
 * One frame of corruption for one creature. Pure in (seed, creatureId, frameIndex, band).
 * Returns null when the amount is 0 — the caller then emits the creature's items untouched, which is what
 * makes Relax (and every non-glitch frame) byte-identical to the uncorrupted path by construction.
 */
export function glitchFrame({ seed = 0, creatureId = 'c0', frameIndex = 0, band = NaN, seedOffsets = null } = {}) {
  const amount = corruptionAmount(band);
  if (amount <= 0) return null;
  const f = Math.floor(finite(frameIndex, 0));
  const seam = (draw(seed, creatureId, f, 'seam', seedOffsets) * 2 - 1) * GLITCH.maxSeamPx * amount;
  const split = GLITCH.maxSplitPx * amount * (0.4 + 0.6 * draw(seed, creatureId, f, 'split', seedOffsets));
  return { amount, seam, split, seed, creatureId, frameIndex: f, seedOffsets };
}

/** Whether the strip slips this frame, and by how much (scene px along local X; sign included). */
function stripSlip(gf, strip) {
  const gate = draw(gf.seed, gf.creatureId, gf.frameIndex, `stripGate${strip}`, gf.seedOffsets);
  if (gate >= gf.amount) return 0; // density is graded by amount: fewer strips slip as corruption thins
  const mag = draw(gf.seed, gf.creatureId, gf.frameIndex, `strip${strip}`, gf.seedOffsets);
  return (mag * 2 - 1) * GLITCH.maxSlipPx * gf.amount;
}

/** #rrggbb with two channels zeroed (the fringe colours). Anything else passes through unchanged. */
function isolateChannel(hex, keep) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const c = { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  const out = (keep === 'r' ? c.r : 0) * 65536 + (keep === 'g' ? c.g : 0) * 256 + (keep === 'b' ? c.b : 0);
  return `#${out.toString(16).padStart(6, '0')}`;
}

const isHalo = (it) => typeof it.key === 'string' && it.key.includes(':halo:');
// The hatch class — the creature's fine marks, which sort among themselves and never split:
// the scatter scales' `marks#` keys, and (since S3 replaced the scatter with fans) the fan
// plumage's `/fan…` keys — plate, feathers, chevrons, leaf are surface marks, as the scales were.
const isHatch = (it) => typeof it.key === 'string' && (it.key.includes('marks#') || it.key.includes('/fan'));

/**
 * Corrupt one creature's finished items. Pure: the input array and its items are never mutated, and with a
 * null frame (or a zero amount) the input is returned as-is — the same array, not a copy of it.
 *
 * @param items  the creature's items, in draw order (halos first, then parts — the builder's order)
 * @param frame  the creature's root in the scene: { cx, cy, rotDeg } — strips and the seam live in the
 *               creature-local frame this defines (local Y down the body, local X across the seam)
 * @param gf     a glitchFrame() result (non-null)
 * @returns a new item array: ghosts woven around their sources, every item slipped/drifted, hatch re-sorted
 */
export function applyGlitch(items, frame, gf) {
  if (!gf || !(gf.amount > 0) || !Array.isArray(items) || items.length === 0) return items;
  const cx = finite(frame && frame.cx, 0);
  const cy = finite(frame && frame.cy, 0);
  const rot = (finite(frame && frame.rotDeg, 0) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  // The local X axis in world terms — every offset here runs along it (across the seam, along the strips).
  const ax = { x: cos, y: sin };

  const out = [];
  for (const it of items) {
    const dx = it.x - cx;
    const dy = it.y - cy;
    const lx = dx * cos + dy * sin; // rotate by -rot: the item's creature-local position
    const ly = -dx * sin + dy * cos;
    const strip = Math.floor(ly / GLITCH.stripH);
    const off = stripSlip(gf, strip) + (lx > 0 ? gf.seam : lx < 0 ? -gf.seam : 0);
    const moved = off === 0 ? it : { ...it, x: it.x + ax.x * off, y: it.y + ax.y * off };
    if (isHalo(it) || isHatch(it) || !(gf.split >= 0.5)) { out.push(moved); continue; }
    const ghost = (sign, keep) => ({
      ...moved,
      x: moved.x + ax.x * gf.split * sign,
      y: moved.y + ax.y * gf.split * sign,
      color: isolateChannel(it.color, keep),
      accent: isolateChannel(it.accent, keep),
      alpha: Math.round(finite(it.alpha, 100) * GLITCH.ghostAlpha),
      key: `${it.key}#g${keep.toUpperCase()}`,
    });
    out.push(ghost(-1, 'b'), moved, ghost(1, 'r'));
  }

  // Hatch sorting: the fine marks trade places among their own slots, a seeded swap count graded by amount.
  const slots = [];
  out.forEach((it, i) => { if (isHatch(it)) slots.push(i); });
  const swaps = Math.round(gf.amount * slots.length);
  for (let s = 0; s < swaps && slots.length > 1; s++) {
    const a = slots[Math.floor(draw(gf.seed, gf.creatureId, gf.frameIndex, `swap${s}a`, gf.seedOffsets) * slots.length)];
    const b = slots[Math.floor(draw(gf.seed, gf.creatureId, gf.frameIndex, `swap${s}b`, gf.seedOffsets) * slots.length)];
    if (a !== b) { const t = out[a]; out[a] = out[b]; out[b] = t; }
  }
  return out;
}

/**
 * A stable hash of an item list: FNV-1a over the canonical item fields, numbers quantised to 1e-4 — the
 * skeletonHash discipline (trig dust cannot split it; any real change does). The parity currency for S8:
 * same seed + band + frame must hash identical on any device, and Relax must hash to the clean list's hash.
 */
export function glitchItemsHash(items) {
  const q = (v) => Math.round(v * 10000) / 10000;
  let s = '';
  for (const it of items || []) {
    s += `${it.key}|${q(it.x)},${q(it.y)}|${q(it.scale)},${q(it.scaleY)}|${q(it.rotation)}|${it.alpha}|${it.color}|${it.accent};`;
  }
  return fnv1a(s).toString(16).padStart(8, '0');
}
