/**
 * Vortex-particle fluid (#970, slice 1) — the water under the trails.
 *
 * Gamito / Lopes / Gomes 1995: vortons carry circulation, a fixed-iteration
 * damped Jacobi solve recovers the stream function, velocity is the curl of
 * that stream. Curtis et al. 1997 is the watercolor vocabulary; pigment
 * itself lands in #1811 — two compartments (suspended / deposited) in this
 * state, mixed by Kubelka-Munk (gl/pigmentKM.mjs), stepped in Curtis's
 * order (MoveWater → MovePigment → TransferPigment) inside stepVortex.
 * #1812 adds the drying signature on top of the deposit: an accrued
 * edge-darkening plane (pigEdge), updated in the step from the deposited
 * density's gradient and the wetness's fall through the damp band, and
 * applied where the deposited layer's reflectance is computed
 * (packPigmentDeposited) — no drying state machine, by the issue's word.
 * #1876 fixes the grid-dots defect in the stamp/transport model itself:
 * a mark stamps water + pigment over its drawn footprint (the instance
 * quad, scaled by instance scale — see stampFootprint), conserving the
 * stamp's total load, and the suspended compartment diffuses laterally
 * inside MovePigment, so a wash forms at rest instead of settling as one
 * saturated dot per mark. The diffusion mixes only the worked film —
 * pairs touching a cell a stamp touched since the last step — so a wash
 * that is only drying strands its pigment exactly as #1812's doctrine
 * has it. The deposited layer still never moves laterally; instances
 * that carry no scale keep the pre-#1876 point splat exactly (the field
 * cannot know their size).
 *
 * Pure JS. No GL imports. Slice 2 (blocked on the ACCUM row, #961–#968)
 * uploads `velocityTex` as an *added* advect offset on the existing feed
 * shader, scaled by `advectGain(wetness)`. It must not replace the static
 * curl-noise lookup, and it must not bind the texture when `wetnessStep` is
 * 0 — that is how WETNESS = 0 stays pixel-identical.
 *
 * Thread: step this next to `attachVelocities` on the worker. Freeze skips
 * the step and leaves the last velocity (and the wet mask) bound — dropping
 * them to zero would pop the flow on resume.
 *
 * Stills (#1815, superseding the old live-only doctrine): a still has
 * no gesture history, so it REHEARSES the field instead — the export
 * path runs the wet-frame service for a fixed warm-up of K = 90 steps
 * over the project's instances at project-state positions/motion
 * (gl/wetWarmup.mjs), and the still renders with the field that
 * rehearsal builds: same seed + instances + K → byte-identical field →
 * byte-identical wet contribution. The readout names it ("wet:
 * warm-up K=90"). No gesture-history pretence; WETNESS = 0 skips the
 * warm-up entirely and exports exactly as before. The SVG fallback
 * diverges by signed record: mask absent → static blend
 * (parity/corpus.mjs KNOWN_DIVERGENCES).
 *
 * Determinism (#806): fixed dt = 1/60, fixed Jacobi count, splat in
 * `layer|key` order (the same key attachVelocities uses), vortex *pairs*
 * not monopoles, speed capped at SMEAR_MAX_SPEED, seeded RNG for ambient
 * emission. The CPU golden does not cover the feed hook — slice 2 hashes
 * the velocity texture.
 */

import { registerCostTier } from './costTiers.mjs';
import { SMEAR_MAX_SPEED } from './velocitySmear.mjs';
import { mkRng } from '../engine/prng.js';
import { hexToRgb255Strict } from '../engine/colorHex.mjs';
import { kmConstantsForRgb, mixColorsRgb, mixturePigmentColor, sanitizeRgb } from './pigmentKM.mjs';

// Tier 1: sheds with the accum chain once the feed hook exists. Slice 1 does
// not import this from renderer.mjs, so the governor's EXPECTED_TIER1 list
// stays the 8 ACCUM passes until slice 2 adds a measurement and the id.
// #1810: timeMs is now a MEASURED step cost (sandbox node, scripted session
// at the vorton cap, median of batch medians — see docs/review/1810/), no
// longer the selfcheck budget it admitted to being before. The #1695
// device-harness confirmation on real hardware remains a separate gate.
// #1811: re-registered on the pigment build — timeMs is the measured
// PIGMENT-LIVE step (the sim's worst case, the #1810 convention), and
// memoryBytes now counts the whole state: the #1810 formula omitted the
// wet pair and the vorton scratch; the ledger below is the full count.
registerCostTier('gl/vortex', {
  tier: 1,
  // 9 grid planes (omega, psi, psiNext, vx, vy, wet, wetNext + the #1812
  // edge-accrual plane and its wet-snapshot scratch) + the three #1811
  // pigment RGBA arrays + vorton ring and its scratch + the #1876
  // worked-film byte plane (wetWork).
  memoryBytes: 128 * 128 * 4 * 9 + 128 * 128 * 16 * 3 + 4096 * 16 * 2 + 128 * 128,
  timeMs: 6.6,
  notes:
    '#970 vortex-particle core at #1810 resolution: 128×128 Poisson (20 Jacobi) + ≤4096 vortons, CPU, fixed dt; #1811 adds the two pigment compartments (Kubelka-Munk, gl/pigmentKM.mjs) stepped in Curtis order; #1812 accrues edge darkening on the deposit inside the same step (A/B on the #1811 session: +~0.3 ms/step vs the #1811 build, inside this figure — docs/review/1812/); #1876 stamps over the instance footprint and diffuses suspended pigment in the worked film (same-session A/B on the #1811 bench: +0.3–0.5 ms/frame vs the pre-#1876 build, scaled marks the dearer variant — inside this figure, docs/review/1876/). timeMs = measured sandbox step with pigment live across ~58% of the field (two runs, medians 6.93 / 6.28 ms, median of batch medians, docs/review/1811/); the pigment-absent step is unchanged at ~2.1–2.7 ms (docs/review/1810/). Device-harness verification pending (#1695). The velocity texture rides the existing feed as an offset (never a replacement). Stills consume the same field via the #1815 warm-up (gl/wetWarmup.mjs).',
});

// #1810 (Matt's ruling from the wet-engine eval): one field, one resolution —
// 128 sim, fewer solver iterations. VORTEX_MAX re-derived with the grid:
// emitted-pair density per cell stays in the band the 64-grid tuning lived
// in (2048/64² = 0.5/cell → 4096/128² = 0.25/cell at the cap), pinned by the
// measured cost gate in docs/review/1810/, not by taste.
export const VORTEX_GRID = 128;
export const VORTEX_MAX = 4096;
export const VORTEX_JACOBI = 20;
export const VORTEX_DT = 1 / 60;
export const VORTEX_RELAX = 2 / 3;
export const VORTEX_DECAY = 0.985;
export const VORTEX_WET_DRY = 0.992;
export const VORTEX_PAIR_SEP = 24;
export const VORTEX_GAMMA_PER_SPEED = 8;
export const VORTEX_GAMMA_FLOOR = 1e-4;
// #1811 pigment constants (Curtis-lite, pinned — feel quantities Matt
// judges by eye, like the wet constants above; derivations and measured
// behaviour in docs/review/1811/).
export const PIGMENT_LOAD = 0.6; // suspended density per unit wet stamp
export const PIGMENT_SETTLE = 0.02; // per-step settled fraction at ρ = 1
export const PIGMENT_LIFT = 0.05; // per-step lifted fraction at wet = 1, ω = 0
// #1812 edge-darkening constants (pinned — a recipe constant, not a
// panel slider, per the issue; feel quantities Matt judges by eye, like
// the constants above; measured behaviour in docs/review/1812/).
export const EDGE_DARKEN_K = 1.35; // accrued excess per unit deposited-density gradient, per full damp-band dry
export const EDGE_DARKEN_CAP = 2; // accrued excess cap — displayed density never exceeds (1 + CAP) × deposited
export const EDGE_BAND_LO = 0.05; // damp-band floor — WET_REGIMES' damp threshold (gl/wetFrame.mjs)
export const EDGE_BAND_HI = 0.35; // damp-band ceiling — WET_REGIMES' wet threshold
// #1876 footprint + diffusion constants (pinned — recipe constants like
// the ones above; measured behaviour in docs/review/1876/). The grid-dots
// defect: stamps were points, so a wash at rest was a lattice of deposit
// dots. Two halves to the fix — the stamp gains the mark's area, and the
// suspended compartment gains a rest transport:
//   STAMP_FOOTPRINT_HALF — the drawn quad spans 199.5 asset units
//     centred on the instance (gl/shaders.mjs QUAD_VS: au ∈
//     [-49.75, 149.75], centred on the 100-box), so a mark's semi-axis
//     on an axis is 99.75 × |instance scale| scene units. The field
//     knows the quad, not the asset's ink bbox — the quad is the
//     coverage the renderer itself draws.
//   PIGMENT_DIFFUSE — per-step pairwise exchange fraction between
//     neighbouring suspended cells (explicit diffusion, stable well
//     under the 0.25 limit), gated to the worked film (wetWork).
//     Suspended only: the deposited layer's no-lateral-move rule is
//     by design and stands. The value is measured, not guessed
//     (docs/review/1876/): at the 51.4-unit scene pitch with stamps
//     landing every step, footprint stamps alone leave the
//     centre/midpoint deposit ratio at ~2.1; 0.002 closes it to ~1.3
//     (the drifting control is ~1.2); 0.003 already overshoots below
//     1 — the transfer stage's lift gradient (lift ∝ wet²) sorts
//     suspended pigment toward dry cells faster than the wash can
//     level, and past the middle the lattice returns as rings and
//     corner sinks. Moving-mark wash character (drift ratio, radial
//     profile, totals) stays in its before bands at 0.002.
export const STAMP_FOOTPRINT_HALF = 99.75; // quad semi-axis per unit instance scale, scene units
export const PIGMENT_DIFFUSE = 0.002; // suspended-pigment neighbour exchange per step

/**
 * Integer gate for the feed hook. 0 or 1 — never a float compare.
 * @param {number} wetness
 * @returns {0|1}
 */
export function wetnessStep(wetness) {
  const w = Number(wetness);
  if (!Number.isFinite(w) || w <= 0) return 0;
  return 1;
}

/**
 * Scale for the *added* advect offset. Exactly 0 when the integer gate is
 * 0, so a dry frame cannot move the feed lookup.
 * @param {number} wetness 0..1
 * @returns {number}
 */
export function advectGain(wetness) {
  if (wetnessStep(wetness) === 0) return 0;
  const w = Number(wetness);
  return w > 1 ? 1 : w;
}

/**
 * @param {{seed?: number, width?: number, height?: number}} [opts]
 */
export function createVortex(opts = {}) {
  const n = VORTEX_GRID;
  const cells = n * n;
  const width = Number.isFinite(opts.width) && opts.width > 0 ? opts.width : 1000;
  const height = Number.isFinite(opts.height) && opts.height > 0 ? opts.height : 700;
  const seed = Number(opts.seed) | 0 || 970;
  return {
    n,
    width,
    height,
    h: width / (n - 1),
    hy: height / (n - 1),
    pairSep: VORTEX_PAIR_SEP,
    gammaPerSpeed: VORTEX_GAMMA_PER_SPEED,
    omega: new Float32Array(cells),
    psi: new Float32Array(cells),
    psiNext: new Float32Array(cells),
    vx: new Float32Array(cells),
    vy: new Float32Array(cells),
    wet: new Float32Array(cells),
    wetNext: new Float32Array(cells),
    // #1811 pigment compartments, RGBA-density at field resolution:
    // rgb = density-weighted colour (premultiplied), a = total density.
    // A cell's pigment colour is rgb/a; its KM character derives from
    // that colour by the one pure function (gl/pigmentKM.mjs), so the
    // compartments store no per-pigment approximations. Suspended rides
    // the water and can lift/settle; deposited never moves laterally —
    // it only gains by settling and loses by lift (transferPigment).
    pigS: new Float32Array(cells * 4),
    pigSN: new Float32Array(cells * 4),
    pigD: new Float32Array(cells * 4),
    // #1812: accrued edge darkening per cell — the excess multiplier the
    // deposited layer's display density carries (displayed density =
    // deposited × (1 + pigEdge)). Drying history is field state (the
    // issue's parity requirement): it accrues in the step from measured
    // gradient + measured drying, rides this state object, and is zero
    // until a deposit has actually dried through the damp band.
    pigEdge: new Float32Array(cells),
    // Wetness at the start of the running step (post-stamp, pre-advect)
    // — the falling test's memory. Scratch: only read by the edge stage
    // inside the same step that wrote it.
    _wetPrev: new Float32Array(cells),
    // #1876: cells a stamp has touched since the last completed step —
    // the worked film. Suspended diffusion (diffuseSuspended) mixes
    // only pairs touching a worked cell: pigment mixes in a film that
    // is being laid and worked, while a film that is only drying
    // strands its pigment where it lies (#1812's doctrine — the dry
    // has no transport). Set by every stamp applier, cleared by
    // stepVortex at the end of the step that consumed it.
    wetWork: new Uint8Array(cells),
    // Set by the first pigment stamp; until then the step skips the
    // pigment stages outright, so a pigment-free session's field is
    // byte-identical to the pre-#1811 sim (the no-op acceptance).
    pigmentLive: false,
    // The occupied region [i0, j0, i1, j1) of the two compartments —
    // maintained by stamping (expands), MovePigment (expands by the
    // backtrace margin, shrinks by rescan) — so the pigment stages
    // iterate the wash, not the whole field. Null while both
    // compartments are empty. A conservative superset, always: cells
    // outside it hold exactly zero in both compartments.
    pigBox: null,
    // ring, insertion order: x, y, gamma, age. head is the next write.
    vortons: new Float32Array(VORTEX_MAX * 4),
    head: 0,
    count: 0,
    rng: mkRng(seed),
    seed,
    steps: 0,
    held: false,
    _scratch: new Float32Array(VORTEX_MAX * 4),
  };
}

function pushVorton(state, x, y, gamma) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(gamma)) return;
  const i = state.head;
  const o = i * 4;
  state.vortons[o] = x;
  state.vortons[o + 1] = y;
  state.vortons[o + 2] = gamma;
  state.vortons[o + 3] = 0;
  state.head = (state.head + 1) % VORTEX_MAX;
  if (state.count < VORTEX_MAX) state.count += 1;
}

function stampWet(state, x, y, amount) {
  const { n, width, height, wet } = state;
  if (x < 0 || y < 0 || x > width || y > height) return;
  const gx = (x / width) * (n - 1);
  const gy = (y / height) * (n - 1);
  const i0 = gx | 0;
  const j0 = gy | 0;
  const tx = gx - i0;
  const ty = gy - j0;
  const a = amount > 1 ? 1 : amount;
  const w00 = (1 - tx) * (1 - ty) * a;
  const w10 = tx * (1 - ty) * a;
  const w01 = (1 - tx) * ty * a;
  const w11 = tx * ty * a;
  const i1 = i0 + 1 < n ? i0 + 1 : i0;
  const j1 = j0 + 1 < n ? j0 + 1 : j0;
  wet[j0 * n + i0] = Math.min(1, wet[j0 * n + i0] + w00);
  wet[j0 * n + i1] = Math.min(1, wet[j0 * n + i1] + w10);
  wet[j1 * n + i0] = Math.min(1, wet[j1 * n + i0] + w01);
  wet[j1 * n + i1] = Math.min(1, wet[j1 * n + i1] + w11);
  const work = state.wetWork;
  work[j0 * n + i0] = 1;
  work[j0 * n + i1] = 1;
  work[j1 * n + i0] = 1;
  work[j1 * n + i1] = 1;
}

/**
 * #1841 (slice B of #1809) — the dish's contact stamps: the presses
 * the contact passes recorded while the dish stepped, as
 * { x, y, amount } in scene coordinates. Each lands as a plain wet
 * stamp (the same bilinear splat the marks use, worked-film marks
 * included): a contact deposits the wet the pair already carries —
 * the recording side (engine/dishMedium.mjs) scales the amount by
 * the pair's sampled wetness, so a dry contact stamps nothing and
 * no water is created. Absent/empty is the pre-#1841 frame, bit for
 * bit. Returns the number of stamps applied.
 */
export function stampDishContacts(state, stamps) {
  if (!stamps || !stamps.length) return 0;
  let applied = 0;
  for (let k = 0; k < stamps.length; k++) {
    const s = stamps[k];
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.amount) || !(s.amount > 0)) continue;
    stampWet(state, s.x, s.y, s.amount);
    applied += 1;
  }
  return applied;
}

/**
 * The stamp's face profile (#1876): full weight across the quad's face,
 * a cosine falloff across the outer fifth of each semi-axis — the
 * coverage a stamp makes, flat where it touches and soft only at its
 * edge. Centre-peaked kernels (biweight ellipse / square, feathered
 * top-hat) were measured against this one and rejected: they starve
 * the quad's own rim and corners, and under the transfer stage's lift
 * gradient the deposit re-forms the lattice as mounds or rim rings
 * instead of a wash (docs/review/1876/).
 */
function stampFace(t) {
  const a = Math.abs(t);
  if (a <= 0.8) return 1;
  return 0.5 + 0.5 * Math.cos((Math.PI * (a - 0.8)) / 0.2);
}

/**
 * #1876 — the footprint distribution of one mark's stamp: the cells the
 * mark's drawn quad covers, with normalised kernel weights (the weights
 * sum to 1, so a stamp delivers exactly its point-stamp load, spread
 * over the footprint — conservation is the normalisation). The kernel
 * is the separable stampFace profile over the quad's local frame.
 * Rotation is the contract's degrees-clockwise (sceneContract), the
 * same convention the quad shader draws with.
 *
 * Returns null when the instance carries no usable scale, or when both
 * semi-axes fit inside one field cell — in both cases the point splat
 * is the finer instrument and the caller takes the pre-#1876 path
 * byte-for-byte. (The live contract always carries scaleX/scaleY;
 * scale-less instances are tests and legacy callers, whose size the
 * field cannot know.) Deterministic: fixed cell order, no RNG.
 * @param {ReturnType<typeof createVortex>} state
 * @param {object} it the instance (x, y, scaleX/scaleY or scale, rotation)
 * @returns {{cells: Array<[number, number]>, i0: number, j0: number, i1: number, j1: number}|null}
 *   cells are [cellIndex, normalisedWeight]; the box is [i0, j0, i1, j1).
 */

function stampFootprint(state, it) {
  const { n, width, height, h, hy } = state;
  const sxRaw = Number.isFinite(it.scaleX) ? it.scaleX : it.scale;
  const syRaw = Number.isFinite(it.scaleY) ? it.scaleY : sxRaw;
  if (!Number.isFinite(sxRaw) || !Number.isFinite(syRaw)) return null;
  const ax = STAMP_FOOTPRINT_HALF * Math.abs(sxRaw);
  const ay = STAMP_FOOTPRINT_HALF * Math.abs(syRaw);
  if (!(ax > 0) || !(ay > 0)) return null;
  if (ax <= h && ay <= hy) return null; // sub-cell mark: the point splat is finer
  const rot = Number.isFinite(it.rotation) ? (it.rotation * Math.PI) / 180 : 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  // The rotated quad's scene-axis half extents (the stamp's bbox).
  const ex = ax * Math.abs(cos) + ay * Math.abs(sin);
  const ey = ax * Math.abs(sin) + ay * Math.abs(cos);
  const gxScale = (n - 1) / width;
  const gyScale = (n - 1) / height;
  const i0 = Math.max(0, Math.floor((it.x - ex) * gxScale));
  const i1 = Math.min(n, Math.ceil((it.x + ex) * gxScale) + 1);
  const j0 = Math.max(0, Math.floor((it.y - ey) * gyScale));
  const j1 = Math.min(n, Math.ceil((it.y + ey) * gyScale) + 1);
  const cells = [];
  let sum = 0;
  for (let j = j0; j < j1; j++) {
    const dy = j * hy - it.y;
    for (let i = i0; i < i1; i++) {
      const dx = i * h - it.x;
      // Scene offset → the quad's local frame (inverse of the drawn
      // clockwise rotation), normalised by the semi-axes.
      const u = (cos * dx + sin * dy) / ax;
      const v = (-sin * dx + cos * dy) / ay;
      if (Math.abs(u) >= 1 || Math.abs(v) >= 1) continue;
      const w = stampFace(u) * stampFace(v);
      cells.push([j * n + i, w]);
      sum += w;
    }
  }
  if (!(sum > 0) || cells.length === 0) return null;
  for (const c of cells) c[1] /= sum;
  return { cells, i0, j0, i1, j1 };
}

/** Footprint water: the stamp's total add is the point stamp's,
 * spread over the footprint; the mask still saturates per cell. */
function stampWetFootprint(state, fp, amount) {
  const { wet, wetWork } = state;
  const a = amount > 1 ? 1 : amount;
  for (const [cell, w] of fp.cells) {
    const add = a * w;
    if (add <= 0) continue;
    wet[cell] = Math.min(1, wet[cell] + add);
    wetWork[cell] = 1;
  }
}

/** Footprint pigment: the same total load as the point stamp, blended
 * per cell over the footprint; the occupied box grows to the stamp. */
function stampPigmentFootprint(state, fp, rgb, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const { pigS } = state;
  const col = sanitizeRgb(rgb);
  for (const [cell, w] of fp.cells) {
    if (w <= 0) continue;
    blendPigmentCell(pigS, cell * 4, col, amount * w);
    state.wetWork[cell] = 1;
  }
  state.pigmentLive = true;
  const box = state.pigBox;
  if (!box) state.pigBox = [fp.i0, fp.j0, fp.i1, fp.j1];
  else {
    if (fp.i0 < box[0]) box[0] = fp.i0;
    if (fp.j0 < box[1]) box[1] = fp.j0;
    if (fp.i1 > box[2]) box[2] = fp.i1;
    if (fp.j1 > box[3]) box[3] = fp.j1;
  }
}

/**
 * Blend `add` density of colour `rgb` into one compartment cell
 * (offset o). Pigments that meet in a cell mix by Kubelka-Munk, not by
 * averaging: the stored colour becomes the mixture's own pigment
 * colour (its R∞ colour — density rides separately in alpha, so a
 * thin wash and a thick one hold the same pigment identity). The
 * same-colour fast path keeps repeated palette stamps exact.
 */
function blendPigmentCell(arr, o, rgb, add) {
  const tot = arr[o + 3];
  if (tot <= 0) {
    arr[o] = rgb[0] * add;
    arr[o + 1] = rgb[1] * add;
    arr[o + 2] = rgb[2] * add;
    arr[o + 3] = add;
    return;
  }
  const cur = [arr[o] / tot, arr[o + 1] / tot, arr[o + 2] / tot];
  const same = Math.abs(cur[0] - rgb[0]) < 1e-6 && Math.abs(cur[1] - rgb[1]) < 1e-6 && Math.abs(cur[2] - rgb[2]) < 1e-6;
  const col = same
    ? cur
    : mixturePigmentColor([
        { rgb: cur, c: tot },
        { rgb, c: add },
      ]) || cur;
  const nt = tot + add;
  arr[o] = col[0] * nt;
  arr[o + 1] = col[1] * nt;
  arr[o + 2] = col[2] * nt;
  arr[o + 3] = nt;
}

/**
 * Stamp suspended pigment at a scene point — the same bilinear footprint
 * as stampWet, but pigment blends ADD (the inkwash asymmetry the issue
 * names: water saturates, colour accumulates). Lands in suspension;
 * settling into the paper is transferPigment's work.
 * @param {ReturnType<typeof createVortex>} state
 * @param {[number, number, number]} rgb sRGB 0..1
 */
export function stampPigment(state, x, y, rgb, amount) {
  const { n, width, height, pigS } = state;
  if (!Number.isFinite(amount) || amount <= 0) return;
  if (x < 0 || y < 0 || x > width || y > height) return;
  const col = sanitizeRgb(rgb);
  const gx = (x / width) * (n - 1);
  const gy = (y / height) * (n - 1);
  const i0 = gx | 0;
  const j0 = gy | 0;
  const tx = gx - i0;
  const ty = gy - j0;
  const i1 = i0 + 1 < n ? i0 + 1 : i0;
  const j1 = j0 + 1 < n ? j0 + 1 : j0;
  const cells = [
    [j0 * n + i0, (1 - tx) * (1 - ty)],
    [j0 * n + i1, tx * (1 - ty)],
    [j1 * n + i0, (1 - tx) * ty],
    [j1 * n + i1, tx * ty],
  ];
  for (const [cell, w] of cells) {
    if (w <= 0) continue;
    blendPigmentCell(pigS, cell * 4, col, amount * w);
    state.wetWork[cell] = 1;
  }
  state.pigmentLive = true;
  const box = state.pigBox;
  if (!box) state.pigBox = [i0, j0, i1 + 1, j1 + 1];
  else {
    if (i0 < box[0]) box[0] = i0;
    if (j0 < box[1]) box[1] = j0;
    if (i1 + 1 > box[2]) box[2] = i1 + 1;
    if (j1 + 1 > box[3]) box[3] = j1 + 1;
  }
}

/**
 * The pigment colour a mark carries, if any: an `rgb` triple on the
 * instance, or its `tint` hex (the live contract's ink). Unparseable or
 * absent → null (the mark stamps water only, as before #1811).
 */
function instancePigmentRgb(it) {
  if (Array.isArray(it.rgb) && it.rgb.length >= 3) return sanitizeRgb(it.rgb);
  if (typeof it.tint === 'string') {
    const p = hexToRgb255Strict(it.tint);
    if (p) return [p[0] / 255, p[1] / 255, p[2] / 255];
  }
  return null;
}

/**
 * Shed a vortex pair per moving mark, in `layer|key` order. Stationary
 * marks still stamp the wet mask (paint landed) but shed nothing.
 * Does not mutate instance order.
 * @param {ReturnType<typeof createVortex>} state
 * @param {Array<{layer?: string, key?: string, x: number, y: number, vx?: number, vy?: number}>} instances
 * @returns {number} vortons emitted
 */
export function emitFromInstances(state, instances) {
  if (!instances || !instances.length) return 0;
  const order = new Array(instances.length);
  for (let i = 0; i < instances.length; i++) order[i] = i;
  order.sort((a, b) => {
    const ka = `${instances[a].layer}|${instances[a].key}`;
    const kb = `${instances[b].layer}|${instances[b].key}`;
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return a - b;
  });
  let emitted = 0;
  for (let k = 0; k < order.length; k++) {
    const it = instances[order[k]];
    if (!Number.isFinite(it.x) || !Number.isFinite(it.y)) continue;
    let vx = Number(it.vx);
    let vy = Number(it.vy);
    if (!Number.isFinite(vx)) vx = 0;
    if (!Number.isFinite(vy)) vy = 0;
    let speed = Math.hypot(vx, vy);
    const stampAmt = speed > 1 ? Math.min(1, speed / 40) : 0.35;
    // #1876: a mark stamps over the footprint it draws — its quad,
    // scaled by instance scale — with the point stamp's total load.
    // Scale-less instances keep the point splat (their size is unknown
    // to the field; every pinned session below is one of those).
    const fp = stampFootprint(state, it);
    if (fp) stampWetFootprint(state, fp, stampAmt);
    else stampWet(state, it.x, it.y, stampAmt);
    // #1811: a mark carrying a colour stamps its pigment on the same
    // footprint — colour arrives wherever paint lands.
    const pigRgb = instancePigmentRgb(it);
    if (pigRgb) {
      if (fp) stampPigmentFootprint(state, fp, pigRgb, stampAmt * PIGMENT_LOAD);
      else stampPigment(state, it.x, it.y, pigRgb, stampAmt * PIGMENT_LOAD);
    }
    if (speed < 1e-4) continue;
    if (speed > SMEAR_MAX_SPEED) {
      const f = SMEAR_MAX_SPEED / speed;
      vx *= f;
      vy *= f;
      speed = SMEAR_MAX_SPEED;
    }
    const inv = 1 / speed;
    const px = -vy * inv;
    const py = vx * inv;
    const half = state.pairSep * 0.5;
    const gamma = state.gammaPerSpeed * speed;
    // + then −, perpendicular to motion: a pair, not a monopole.
    pushVorton(state, it.x + px * half, it.y + py * half, gamma);
    pushVorton(state, it.x - px * half, it.y - py * half, -gamma);
    emitted += 2;
  }
  return emitted;
}

/**
 * Slice 4 wires MOTION/BEHAVE here. Seeded so a golden can pin it; not
 * called by the feed in slice 1.
 * @param {ReturnType<typeof createVortex>} state
 * @param {number} [pairs]
 */
export function emitAmbient(state, pairs = 4) {
  const n = pairs | 0;
  const rng = state.rng;
  for (let i = 0; i < n; i++) {
    const x = rng() * state.width;
    const y = rng() * state.height;
    const ang = rng() * Math.PI * 2;
    const gamma = 0.4 + rng() * 0.6;
    const c = Math.cos(ang) * state.pairSep * 0.5;
    const s = Math.sin(ang) * state.pairSep * 0.5;
    pushVorton(state, x + c, y + s, gamma);
    pushVorton(state, x - c, y - s, -gamma);
  }
  return n * 2;
}

/** Behave → ambient pair pattern. Unknown names fall back to cruise. */
const AMBIENT = {
  cruise: { pairs: 1, gamma: 0.35, pattern: 'drift' },
  flock: { pairs: 2, gamma: 0.45, pattern: 'shear' },
  orbit: { pairs: 2, gamma: 0.55, pattern: 'orbit' },
  scatter: { pairs: 3, gamma: 0.5, pattern: 'out' },
  mold: { pairs: 1, gamma: 0.25, pattern: 'drift' },
  levy: { pairs: 1, gamma: 0.3, pattern: 'stride' },
  lorenz: { pairs: 2, gamma: 0.4, pattern: 'orbit' },
  seek: { pairs: 1, gamma: 0.4, pattern: 'in' },
  flee: { pairs: 1, gamma: 0.5, pattern: 'out' },
};

/**
 * Slice 4. MOTION (wind / breath / flap) and BEHAVE seed ambient pairs.
 * Quieter than a gesture. Seeded, so the same behave and seed match.
 * @param {ReturnType<typeof createVortex>} state
 * @param {{behave?: string, motion?: number}} [opts]
 */
export function emitAmbientFrom(state, { behave = 'cruise', motion = 0 } = {}) {
  const spec = AMBIENT[behave] || AMBIENT.cruise;
  const m = Number.isFinite(Number(motion)) ? Math.min(1, Math.max(0, Number(motion))) : 0;
  const pairs = spec.pairs + (m > 0.5 ? 1 : 0);
  const gamma = spec.gamma * (0.65 + 0.7 * m);
  const rng = state.rng;
  const cx = state.width * 0.5;
  const cy = state.height * 0.5;
  const reach = Math.min(state.width, state.height);
  for (let i = 0; i < pairs; i++) {
    let x;
    let y;
    let ang;
    if (spec.pattern === 'orbit' || spec.pattern === 'in' || spec.pattern === 'out') {
      const t = rng() * Math.PI * 2;
      const rad = (0.22 + rng() * 0.28) * reach;
      x = cx + Math.cos(t) * rad;
      y = cy + Math.sin(t) * rad;
      ang = spec.pattern === 'in' ? t + Math.PI : spec.pattern === 'out' ? t : t + Math.PI / 2;
    } else if (spec.pattern === 'shear') {
      x = rng() * state.width;
      y = (0.3 + i * 0.25) * state.height;
      ang = 0;
    } else {
      x = rng() * state.width;
      y = rng() * state.height;
      ang = rng() * Math.PI * 2;
    }
    const c = Math.cos(ang) * state.pairSep * 0.5;
    const s = Math.sin(ang) * state.pairSep * 0.5;
    pushVorton(state, x + c, y + s, gamma);
    pushVorton(state, x - c, y - s, -gamma);
  }
  return pairs * 2;
}

/** 0..1 from the motion knobs. Wind is 0..3, the others 0..1. */
export function motionAmount(layout) {
  const lp = layout || {};
  const wind = Math.min(1, Math.max(0, (Number(lp.wind) || 0) / 3));
  const breath = Math.min(1, Math.max(0, Number(lp.breath) || 0));
  const flap = Math.min(1, Math.max(0, Number(lp.flap) || 0));
  return Math.max(wind, breath, flap);
}

function splat(state) {
  const { n, omega, vortons, width, height, h, hy } = state;
  omega.fill(0);
  const area = h * hy;
  const start = (state.head - state.count + VORTEX_MAX) % VORTEX_MAX;
  for (let k = 0; k < state.count; k++) {
    const i = (start + k) % VORTEX_MAX;
    const o = i * 4;
    const gamma = vortons[o + 2];
    if (gamma === 0) continue;
    const x = vortons[o];
    const y = vortons[o + 1];
    if (x < 0 || y < 0 || x > width || y > height) continue;
    const gx = (x / width) * (n - 1);
    const gy = (y / height) * (n - 1);
    const i0 = gx | 0;
    const j0 = gy | 0;
    const tx = gx - i0;
    const ty = gy - j0;
    const dens = gamma / area;
    const i1 = i0 + 1 < n ? i0 + 1 : i0;
    const j1 = j0 + 1 < n ? j0 + 1 : j0;
    omega[j0 * n + i0] += (1 - tx) * (1 - ty) * dens;
    omega[j0 * n + i1] += tx * (1 - ty) * dens;
    omega[j1 * n + i0] += (1 - tx) * ty * dens;
    omega[j1 * n + i1] += tx * ty * dens;
  }
}

function poisson(state) {
  const { n, omega, psi, psiNext } = state;
  const h2 = state.h * state.hy;
  const relax = VORTEX_RELAX;
  const keep = 1 - relax;
  const jac = relax * 0.25;
  psi.fill(0);
  psiNext.fill(0);
  let read = psi;
  let write = psiNext;
  for (let iter = 0; iter < VORTEX_JACOBI; iter++) {
    for (let j = 1; j < n - 1; j++) {
      const row = j * n;
      const up = (j - 1) * n;
      const dn = (j + 1) * n;
      for (let i = 1; i < n - 1; i++) {
        const nb = read[row + i - 1] + read[row + i + 1] + read[up + i] + read[dn + i];
        const next = nb + h2 * omega[row + i];
        write[row + i] = keep * read[row + i] + jac * next;
      }
    }
    const swap = read;
    read = write;
    write = swap;
  }
  if (read !== psi) psi.set(read);
}

function velocityFromPsi(state) {
  const { n, psi, vx, vy, h, hy } = state;
  vx.fill(0);
  vy.fill(0);
  const inv2hx = 1 / (2 * h);
  const inv2hy = 1 / (2 * hy);
  for (let j = 1; j < n - 1; j++) {
    const row = j * n;
    const up = (j - 1) * n;
    const dn = (j + 1) * n;
    for (let i = 1; i < n - 1; i++) {
      // u = ∂ψ/∂y, v = −∂ψ/∂x
      vx[row + i] = (psi[dn + i] - psi[up + i]) * inv2hy;
      vy[row + i] = -(psi[row + i + 1] - psi[row + i - 1]) * inv2hx;
    }
  }
}

function sampleV(state, x, y) {
  const { n, width, height, vx, vy } = state;
  const gx = (x / width) * (n - 1);
  const gy = (y / height) * (n - 1);
  const i0 = Math.max(0, Math.min(n - 2, gx | 0));
  const j0 = Math.max(0, Math.min(n - 2, gy | 0));
  const tx = gx - i0;
  const ty = gy - j0;
  const i1 = i0 + 1;
  const j1 = j0 + 1;
  const row0 = j0 * n;
  const row1 = j1 * n;
  const u =
    (1 - tx) * (1 - ty) * vx[row0 + i0] +
    tx * (1 - ty) * vx[row0 + i1] +
    (1 - tx) * ty * vx[row1 + i0] +
    tx * ty * vx[row1 + i1];
  const v =
    (1 - tx) * (1 - ty) * vy[row0 + i0] +
    tx * (1 - ty) * vy[row0 + i1] +
    (1 - tx) * ty * vy[row1 + i0] +
    tx * ty * vy[row1 + i1];
  return [u, v];
}

/**
 * Semi-Lagrangian advection of the wet mask through this frame's velocity
 * field, then the multiplicative dry. #998: the mask used to fade in place,
 * so the edge rims and granulation gating it drives read as frozen
 * splotches. Now blooms drift, stretch, and swirl with the fluid.
 *
 * `disp` scales the backtrace displacement (scene units per unit velocity).
 * The live path passes the wet amount, so the mask moves at the same rate
 * as the feed shader's wet UV offset (tuv += (v/32) * amount*32/w — the w
 * cancels, leaving v*amount). Deterministic: fixed order, no RNG. Freeze
 * skips this (stepVortex returns early), so a held frame keeps the last mask.
 * @param {ReturnType<typeof createVortex>} state
 * @param {number} [disp]
 */
function advectWet(state, disp = 1) {
  const { n, wet, wetNext, vx, vy, width, height, h, hy } = state;
  const dry = VORTEX_WET_DRY;
  const gxScale = (n - 1) / width;
  const gyScale = (n - 1) / height;
  for (let j = 0; j < n; j++) {
    const y = j * hy;
    for (let i = 0; i < n; i++) {
      const x = i * h;
      const k = j * n + i;
      // Backtrace through the velocity field, scaled so the mask keeps pace
      // with the feed shader's wet offset.
      let xb = x - vx[k] * disp;
      let yb = y - vy[k] * disp;
      if (xb < 0) xb = 0;
      else if (xb > width) xb = width;
      if (yb < 0) yb = 0;
      else if (yb > height) yb = height;
      let i0 = (xb * gxScale) | 0;
      let j0 = (yb * gyScale) | 0;
      if (i0 < 0) i0 = 0;
      else if (i0 > n - 2) i0 = n - 2;
      if (j0 < 0) j0 = 0;
      else if (j0 > n - 2) j0 = n - 2;
      const tx = xb * gxScale - i0;
      const ty = yb * gyScale - j0;
      const i1 = i0 + 1;
      const j1 = j0 + 1;
      const r0 = j0 * n;
      const r1 = j1 * n;
      wetNext[k] =
        ((wet[r0 + i0] * (1 - tx) + wet[r0 + i1] * tx) * (1 - ty) +
          (wet[r1 + i0] * (1 - tx) + wet[r1 + i1] * tx) * ty) *
        dry;
    }
  }
  wet.set(wetNext);
}

function advect(state, disp) {
  const { vortons, width, height, wet } = state;
  const dt = VORTEX_DT;
  const start = (state.head - state.count + VORTEX_MAX) % VORTEX_MAX;
  // Compact survivors back into insertion order, starting at index 0.
  const scratch = state._scratch;
  let kept = 0;
  for (let k = 0; k < state.count; k++) {
    const i = (start + k) % VORTEX_MAX;
    const o = i * 4;
    let gamma = vortons[o + 2] * VORTEX_DECAY;
    if (Math.abs(gamma) < VORTEX_GAMMA_FLOOR) continue;
    const [u, v] = sampleV(state, vortons[o], vortons[o + 1]);
    const x = vortons[o] + u * dt;
    const y = vortons[o + 1] + v * dt;
    if (x < 0 || y < 0 || x > width || y > height) continue;
    const d = kept * 4;
    scratch[d] = x;
    scratch[d + 1] = y;
    scratch[d + 2] = gamma;
    scratch[d + 3] = vortons[o + 3] + 1;
    kept += 1;
  }
  vortons.set(scratch.subarray(0, kept * 4));
  state.head = kept % VORTEX_MAX;
  state.count = kept;
  advectWet(state, disp);
}

/**
 * MovePigment (#1811, Curtis's order: after MoveWater) — suspended
 * pigment rides the same velocity field the wet mask advects through,
 * at the same rate (the field velocity IS the feed shader's wet offset,
 * so the buffer's trails and the pigment they carry travel together).
 * Semi-Lagrangian backtrace of all four density channels; unlike the
 * mask there is no dry factor — pigment does not evaporate, it only
 * settles, lifts, and diffuses numerically at cell boundaries.
 *
 * #1876 adds the second half of the stage: a conservative diffusion of
 * the suspended compartment (diffuseSuspended), which runs whether or
 * not the field flows — it is the wash's rest transport, the term
 * whose absence left a stationary mark's pigment sitting exactly on
 * its stamp cells. The deposited compartment is never diffused.
 *
 * Work is bounded to the occupied box widened by the step's backtrace
 * margin (the farthest any velocity can pull pigment this step), so a
 * wash costs its own area, not the field's. The rescan afterwards
 * re-derives the box from what the move and the standing deposits
 * actually occupy.
 * @param {ReturnType<typeof createVortex>} state
 * @param {number} [disp] the mask's backtrace scale for this step
 */
function movePigment(state, disp = 1) {
  const box = state.pigBox;
  if (!box) return;
  const { n, vx, vy, width, height, h, hy } = state;
  const pigS = state.pigS;
  const pigSN = state.pigSN;
  // Backtrace margin in cells: max |v| · disp in scene units, +1 guard.
  let maxV = 0;
  for (let k = 0; k < n * n; k++) {
    const ax = Math.abs(vx[k]);
    const ay = Math.abs(vy[k]);
    if (ax > maxV) maxV = ax;
    if (ay > maxV) maxV = ay;
  }
  if (maxV === 0 || disp === 0) {
    // No flow: the resample is the identity — but the wash still
    // diffuses at rest (#1876). That is the whole point of the term.
    diffuseSuspended(state);
    return;
  }
  const mx = Math.min(n, Math.ceil((maxV * Math.abs(disp)) / h) + 1);
  const my = Math.min(n, Math.ceil((maxV * Math.abs(disp)) / hy) + 1);
  const iLo = Math.max(0, box[0] - mx);
  const jLo = Math.max(0, box[1] - my);
  const iHi = Math.min(n, box[2] + mx);
  const jHi = Math.min(n, box[3] + my);
  const gxScale = (n - 1) / width;
  const gyScale = (n - 1) / height;
  pigSN.fill(0);
  for (let j = jLo; j < jHi; j++) {
    const y = j * hy;
    for (let i = iLo; i < iHi; i++) {
      const x = i * h;
      const k = j * n + i;
      let xb = x - vx[k] * disp;
      let yb = y - vy[k] * disp;
      if (xb < 0) xb = 0;
      else if (xb > width) xb = width;
      if (yb < 0) yb = 0;
      else if (yb > height) yb = height;
      let i0 = (xb * gxScale) | 0;
      let j0 = (yb * gyScale) | 0;
      if (i0 < 0) i0 = 0;
      else if (i0 > n - 2) i0 = n - 2;
      if (j0 < 0) j0 = 0;
      else if (j0 > n - 2) j0 = n - 2;
      const tx = xb * gxScale - i0;
      const ty = yb * gyScale - j0;
      const i1 = i0 + 1;
      const j1 = j0 + 1;
      const r0 = j0 * n;
      const r1 = j1 * n;
      const o = k * 4;
      for (let ch = 0; ch < 4; ch++) {
        pigSN[o + ch] =
          (pigS[(r0 + i0) * 4 + ch] * (1 - tx) + pigS[(r0 + i1) * 4 + ch] * tx) * (1 - ty) +
          (pigS[(r1 + i0) * 4 + ch] * (1 - tx) + pigS[(r1 + i1) * 4 + ch] * tx) * ty;
      }
    }
  }
  state.pigS = pigSN;
  state.pigSN = pigS;
  // Rescan: the box is what the moved suspension and the standing
  // deposits occupy inside the worked region (outside it, both are
  // zero by the invariant the box maintains).
  const S = state.pigS;
  const D = state.pigD;
  let ni0 = Infinity,
    nj0 = Infinity,
    ni1 = -1,
    nj1 = -1;
  for (let j = jLo; j < jHi; j++) {
    for (let i = iLo; i < iHi; i++) {
      const o = (j * n + i) * 4;
      if (S[o + 3] > 0 || D[o + 3] > 0) {
        if (i < ni0) ni0 = i;
        if (j < nj0) nj0 = j;
        if (i + 1 > ni1) ni1 = i + 1;
        if (j + 1 > nj1) nj1 = j + 1;
      }
    }
  }
  state.pigBox = ni1 < 0 ? null : [ni0, nj0, ni1, nj1];
  diffuseSuspended(state);
}

/**
 * DiffuseSuspended (#1876) — lateral diffusion of the SUSPENDED
 * compartment only: pairwise conservative exchanges between neighbour
 * cells, PIGMENT_DIFFUSE of the difference per step, applied to all
 * four density channels by the same linear operator (colour ratios
 * diffuse with density, so a mixture spreads as itself). Pairwise
 * fluxes cancel exactly, so the stage conserves total suspended
 * pigment (float rounding aside) — it moves pigment, it never creates
 * or destroys it. The deposited compartment is not touched: deposited
 * pigment never moves laterally, by design (#1811's rule stands).
 * The stage mixes only pairs touching a cell a stamp worked since
 * the last step (the wetWork plane): diffusion is the worked film's
 * mixing, and a film that is only drying strands its pigment where
 * it lies — which is what keeps #1812's drying signature intact
 * (steps with no stamps run this stage as a no-op).
 *
 * The work region is the occupied box widened by one cell; exchanges
 * happen only inside it, so the field outside — zero in both
 * compartments by the box invariant — stays zero, and the widened
 * ring is where this step's spread lands. The box is rescanned after,
 * over the same region. pigSN is the delta scratch (the advection
 * stage is done with it by the time this runs).
 * @param {ReturnType<typeof createVortex>} state
 */
function diffuseSuspended(state) {
  const box = state.pigBox;
  if (!box) return;
  const { n, pigS, pigD, wetWork } = state;
  const iLo = Math.max(0, box[0] - 1);
  const jLo = Math.max(0, box[1] - 1);
  const iHi = Math.min(n, box[2] + 1);
  const jHi = Math.min(n, box[3] + 1);
  // The worked-film gate: no stamp has touched the wash's region since
  // the last step → the film is only drying, and a drying film strands
  // its pigment (#1812). The stage is a no-op, box included.
  let worked = false;
  for (let j = jLo; j < jHi && !worked; j++) {
    for (let i = iLo; i < iHi; i++) {
      if (wetWork[j * n + i]) {
        worked = true;
        break;
      }
    }
  }
  if (!worked) return;
  const delta = state.pigSN;
  delta.fill(0);
  const D = PIGMENT_DIFFUSE;
  for (let j = jLo; j < jHi; j++) {
    for (let i = iLo; i < iHi; i++) {
      const cell = j * n + i;
      const o = cell * 4;
      // Each unordered pair once: right and down neighbours. A pair
      // exchanges only when a stamp worked at least one of its cells
      // since the last step — diffusion mixes the film where it is
      // being laid, never across a drying front.
      for (let dir = 0; dir < 2; dir++) {
        const ni = dir === 0 ? i + 1 : i;
        const nj = dir === 0 ? j : j + 1;
        if (ni >= iHi || nj >= jHi) continue;
        const ncell = nj * n + ni;
        if (!wetWork[cell] && !wetWork[ncell]) continue;
        const no = ncell * 4;
        if (pigS[o + 3] === 0 && pigS[no + 3] === 0) continue; // empty pair: no flux
        for (let ch = 0; ch < 4; ch++) {
          const f = D * (pigS[no + ch] - pigS[o + ch]);
          delta[o + ch] += f;
          delta[no + ch] -= f;
        }
      }
    }
  }
  for (let j = jLo; j < jHi; j++) {
    for (let i = iLo; i < iHi; i++) {
      const o = (j * n + i) * 4;
      for (let ch = 0; ch < 4; ch++) pigS[o + ch] += delta[o + ch];
    }
  }
  // Rescan: the box is what both compartments occupy inside the worked
  // region (outside it, both are zero by the invariant).
  let ni0 = Infinity,
    nj0 = Infinity,
    ni1 = -1,
    nj1 = -1;
  for (let j = jLo; j < jHi; j++) {
    for (let i = iLo; i < iHi; i++) {
      const o = (j * n + i) * 4;
      if (pigS[o + 3] > 0 || pigD[o + 3] > 0) {
        if (i < ni0) ni0 = i;
        if (j < nj0) nj0 = j;
        if (i + 1 > ni1) ni1 = i + 1;
        if (j + 1 > nj1) nj1 = j + 1;
      }
    }
  }
  state.pigBox = ni1 < 0 ? null : [ni0, nj0, ni1, nj1];
}

/** The field's paper grain at a cell — the same integer hash family the
 * fade shader's granulation uses, at field resolution. Fixed per cell:
 * the paper does not change between frames. */
function paperGrain(i, j) {
  const hh = Math.imul((i * 1664525 + j) ^ 1013904223, 2246822519) >>> 16;
  return (hh & 65535) / 65535;
}

/**
 * TransferPigment (#1811) — the exchange between the compartments, per
 * cell, from the cell's own pigment character (derived from the colour
 * present, by the one pure function):
 *
 *   settle  suspended → deposited at PIGMENT_SETTLE · ρ, granulated by
 *           γ against the paper grain (pigment catches in the dips).
 *           Deposited pigment never moves laterally again — this stage
 *           and lift are its only doors.
 *   lift    deposited → suspended at PIGMENT_LIFT · wet² · (1 − ω):
 *           fresh water (wetness near 1) re-wets the deposit; a
 *           staining pigment (ω near 1) refuses.
 *
 * Both moves are computed from the stage's starting values and applied
 * together, so a cell's total pigment is conserved by the transfer
 * itself (float rounding aside) — total pigment changes only by
 * stamping and boundary loss, the issue's conservation acceptance.
 * Exported for the wet-frame service's degraded path (stamps land and
 * transfer under the shed; advection is what's shed).
 * @param {ReturnType<typeof createVortex>} state
 */
export function transferPigment(state) {
  if (!state.pigmentLive) return;
  const box = state.pigBox;
  if (!box) return;
  const { n, wet, pigS, pigD } = state;
  for (let j = box[1]; j < box[3]; j++) {
    for (let i = box[0]; i < box[2]; i++) {
      const k = j * n + i;
      const o = k * 4;
      const sTot = pigS[o + 3];
      const dTot = pigD[o + 3];
      if (sTot <= 0 && dTot <= 0) continue;
      let settle = 0;
      if (sTot > 0) {
        const ch = kmConstantsForRgb(pigS[o] / sTot, pigS[o + 1] / sTot, pigS[o + 2] / sTot);
        settle = Math.min(1, PIGMENT_SETTLE * ch.rho * (1 + ch.gamma * (paperGrain(i, j) - 0.5)));
      }
      let lift = 0;
      if (dTot > 0) {
        const chD = kmConstantsForRgb(pigD[o] / dTot, pigD[o + 1] / dTot, pigD[o + 2] / dTot);
        const w = wet[k];
        lift = Math.min(1, PIGMENT_LIFT * w * w * (1 - chD.omega));
      }
      if (settle <= 0 && lift <= 0) continue;
      for (let ch = 0; ch < 4; ch++) {
        const sMove = pigS[o + ch] * settle;
        const lMove = pigD[o + ch] * lift;
        pigS[o + ch] += lMove - sMove;
        pigD[o + ch] += sMove - lMove;
      }
    }
  }
}

/**
 * AccrueEdgeDarkening (#1812) — watercolor's signature without its
 * state machine: as a deposit dries, its displayed density multiplies
 * up near its spatial edges (the coffee-ring read: pinned contact line,
 * edge-fastest evaporation, outward flow — Deegan et al. 1997). No
 * wet/drying/dry states exist here; the accrual is an integral over
 * measured drying:
 *
 *   · A cell accrues only while its wetness is FALLING through the
 *     damp band [EDGE_BAND_LO, EDGE_BAND_HI] — the WET_REGIMES damp
 *     band. A passage kept wet (held above the band, or held level
 *     inside it) does not darken; a passage below the band is done.
 *   · The step's contribution is EDGE_DARKEN_K · |∇d| · (the share of
 *     the band this step's fall traversed), |∇d| the deposited
 *     density's gradient at field resolution. A complete dry through
 *     the whole band therefore accrues ≈ K·|∇d| — the issue's display
 *     formula d′ = d × (1 + k·|∇d|) as the completed-dry limit.
 *   · Rewet and dry again and it accrues again, capped at
 *     EDGE_DARKEN_CAP — real paper darkens slightly more each cycle,
 *     and the cap keeps cycles from cooking edges to black.
 *
 * The darkening is derived from measured gradient + measured drying,
 * never painted by a look; the amount is the pinned recipe constant
 * above. `wetPrev` is the wetness the step started from (stepVortex
 * snapshots it). The wet-frame service's degraded path passes null:
 * there the step's only wet change is the uniform in-place dry, so the
 * previous wetness is the current one divided back through
 * VORTEX_WET_DRY. Exported for that path, like transferPigment.
 * @param {ReturnType<typeof createVortex>} state
 * @param {Float32Array|null} wetPrev
 */
export function accrueEdgeDarkening(state, wetPrev) {
  if (!state.pigmentLive) return;
  const box = state.pigBox;
  if (!box) return;
  const { n, wet, pigD, pigEdge } = state;
  const band = EDGE_BAND_HI - EDGE_BAND_LO;
  const dep = (i, j) => pigD[(j * n + i) * 4 + 3];
  for (let j = box[1]; j < box[3]; j++) {
    for (let i = box[0]; i < box[2]; i++) {
      const k = j * n + i;
      if (pigD[k * 4 + 3] <= 0) continue;
      const prev = wetPrev ? wetPrev[k] : Math.min(1, wet[k] / VORTEX_WET_DRY);
      const cur = wet[k];
      if (prev <= cur) continue; // not falling: no drying, no darkening
      const overlap = Math.min(prev, EDGE_BAND_HI) - Math.max(cur, EDGE_BAND_LO);
      if (overlap <= 0) continue; // the fall never entered the damp band
      const iL = i > 0 ? i - 1 : i;
      const iR = i < n - 1 ? i + 1 : i;
      const jD = j > 0 ? j - 1 : j;
      const jU = j < n - 1 ? j + 1 : j;
      const gx = (dep(iR, j) - dep(iL, j)) * 0.5;
      const gy = (dep(i, jU) - dep(i, jD)) * 0.5;
      const g = Math.hypot(gx, gy);
      if (g <= 0) continue; // the wash's flat interior does not darken
      const next = pigEdge[k] + EDGE_DARKEN_K * g * (overlap / band);
      pigEdge[k] = next > EDGE_DARKEN_CAP ? EDGE_DARKEN_CAP : next;
    }
  }
}

/** FNV-1a over the accrued edge-darkening plane, quantized like hashPigment. */
export function hashEdgeDarkening(state) {
  let h = 2166136261;
  const { pigEdge } = state;
  for (let i = 0; i < pigEdge.length; i++) {
    h ^= Math.round(pigEdge[i] * 1e5) | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * One fixed-dt step. Freeze holds velocity, wet mask, and vortons — the
 * last texture stays bound.
 * @param {ReturnType<typeof createVortex>} state
 * @param {{freeze?: boolean, wetAdvect?: number}} [opts] wetAdvect scales the
 * wet-mask backtrace so the mask keeps pace with the feed shader's wet
 * offset (live path passes the wet amount; default 1 is the physical rate).
 */
export function stepVortex(state, opts = {}) {
  if (opts.freeze) {
    state.held = true;
    return state;
  }
  state.held = false;
  // #1812: snapshot the wetness this step starts from (stamps have
  // landed; advection has not run) — the edge stage's falling test
  // compares against it after the water moves. Pigment-live steps only:
  // a pigment-free session's step stays the pre-#1812 code path.
  if (state.pigmentLive) state._wetPrev.set(state.wet);
  splat(state);
  poisson(state);
  velocityFromPsi(state);
  const disp = Number.isFinite(opts.wetAdvect) ? opts.wetAdvect : 1;
  advect(state, disp);
  // #1811: Curtis's order — MoveWater (above) → MovePigment →
  // TransferPigment. Skipped outright until the first pigment stamp,
  // which is what keeps pigment-free sessions byte-identical.
  if (state.pigmentLive) {
    movePigment(state, disp);
    transferPigment(state);
    accrueEdgeDarkening(state, state._wetPrev);
  }
  // #1876: the step has consumed the stamps that landed since the last
  // one — the worked-film marks reset for the next step's stamps.
  state.wetWork.fill(0);
  state.steps += 1;
  return state;
}

/** FNV-1a over the velocity field, quantized so the golden is stable. */
export function hashVelocity(state) {
  let h = 2166136261;
  const { vx, vy } = state;
  for (let i = 0; i < vx.length; i++) {
    h ^= Math.round(vx[i] * 1e5) | 0;
    h = Math.imul(h, 16777619);
    h ^= Math.round(vy[i] * 1e5) | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** RG float velocity, ready for the slice-2 texture upload. Not bound at wetness 0. */
export function velocityTex(state) {
  return { vx: state.vx, vy: state.vy, n: state.n };
}

/** Scene units that pack to the ends of the velocity texture. */
export const VORTEX_VEL_PACK = 32;

function packByte(t) {
  return Math.max(0, Math.min(255, Math.round(t * 255)));
}

/**
 * RG velocity for the feed hook. Centered at 128. LINEAR upload so the
 * grid field bilinear-upsamples. Not bound when wetnessStep is 0.
 * @param {ReturnType<typeof createVortex>} state
 */
export function packVelocity(state, pack = VORTEX_VEL_PACK) {
  const n = state.n;
  const rgba = new Uint8Array(n * n * 4);
  const { vx, vy } = state;
  for (let i = 0; i < n * n; i++) {
    rgba[i * 4] = packByte((vx[i] / pack) * 0.5 + 0.5);
    rgba[i * 4 + 1] = packByte((vy[i] / pack) * 0.5 + 0.5);
    rgba[i * 4 + 3] = 255;
  }
  return { n, rgba, pack };
}

/** FNV-1a over both pigment compartments, quantized like hashVelocity. */
export function hashPigment(state) {
  let h = 2166136261;
  for (const arr of [state.pigS, state.pigD]) {
    for (let i = 0; i < arr.length; i++) {
      h ^= Math.round(arr[i] * 1e5) | 0;
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

/**
 * #1811 — the deposited layer as ACCUM reads it: per cell, rgb = the
 * KM-computed reflectance of the deposited mixture at its deposited
 * density (finite-layer Kubelka-Munk over the paper — mixColorsRgb of
 * the cell's colour at its total), a = deposited density (clamped).
 * A cell with no deposit reads exactly (1, 1, 1, 0) — bare paper — so
 * absorption by this pack is a no-op wherever nothing has settled.
 * This pack is also the backstage stain read (the dish's only pigment
 * consumption in #1811); computing it is per-frame work only when a
 * consumer asks the service for the field.
 *
 * #1812: the density the reflectance is computed at — and the alpha —
 * is the DISPLAY density: deposited × (1 + pigEdge), the accrued edge
 * darkening. Where nothing has dried through the damp band pigEdge is
 * 0 and this pack is byte-identical to the #1811 pack.
 */
export function packPigmentDeposited(state) {
  const n = state.n;
  const rgba = new Uint8Array(n * n * 4);
  const { pigD, pigEdge } = state;
  for (let k = 0; k < n * n; k++) {
    const o = k * 4;
    const tot = pigD[o + 3];
    if (tot <= 0) {
      rgba[o] = 255;
      rgba[o + 1] = 255;
      rgba[o + 2] = 255;
      rgba[o + 3] = 0;
      continue;
    }
    const disp = tot * (1 + pigEdge[k]);
    rgba[o + 3] = packByte(Math.min(1, disp));
    const refl = mixColorsRgb([{ rgb: [pigD[o] / tot, pigD[o + 1] / tot, pigD[o + 2] / tot], c: disp }]);
    rgba[o] = packByte(refl[0]);
    rgba[o + 1] = packByte(refl[1]);
    rgba[o + 2] = packByte(refl[2]);
  }
  return { n, rgba };
}

/** R wet mask, 0..1. LINEAR upload — nearest would read as blocks. */
export function packWet(state) {
  const n = state.n;
  const rgba = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    rgba[i * 4] = packByte(state.wet[i]);
    rgba[i * 4 + 3] = 255;
  }
  return { n, rgba };
}

/** FNV-1a over the packed RG velocity. Slice 2 hashes the texture, not just the field. */
export function hashPacked(packed) {
  let h = 2166136261;
  const b = packed.rgba;
  for (let i = 0; i < b.length; i += 4) {
    h ^= b[i];
    h = Math.imul(h, 16777619);
    h ^= b[i + 1];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The slot protocol's lifetime rule (#1809): the field is created on
 * first use and reset ONLY on seed/size change — never on a consumer's
 * toggle or a session fault. Shared by noteWetFrame and the wet-frame
 * service (gl/wetFrame.mjs) so every path owns the field by exactly the
 * same rule. Returns the live state.
 * @param {{vortex: object|null, seed?: number, width?: number, height?: number}} slot caller-owned `{ vortex }`
 */
export function ensureVortex(slot, { seed, width, height } = {}) {
  const w = width > 0 ? width : 1000;
  const h = height > 0 ? height : 700;
  const s = Number(seed) | 0 || 970;
  if (!slot.vortex || slot.seed !== s || slot.width !== w || slot.height !== h) {
    slot.vortex = createVortex({ seed: s, width: w, height: h });
    slot.seed = s;
    slot.width = w;
    slot.height = h;
  }
  return slot.vortex;
}

/**
 * One live frame of the wet hook. Freeze holds the last field (do not
 * zero it — resume would pop). Wetness 0 does not step and returns a
 * gain of exactly 0 so the feed hook does not bind the texture.
 * `slot` is caller-owned `{ vortex }`.
 */
export function noteWetFrame(slot, { wetness, freeze, seed, width, height, instances, behave, motion, stamps }) {
  const step = wetnessStep(wetness);
  if (step === 0)
    return { wetStep: 0, wetGain: 0, wetAmount: 0, wetVel: null, wetMask: null, pigStep: 0, pigDep: null };
  const w = width > 0 ? width : 1000;
  ensureVortex(slot, { seed, width, height });
  if (freeze) {
    // #1841 — a frozen transport holds the field, but the dish's
    // contact stamps still land: bodies press the film even while
    // the water cannot flow. They sit where they were pressed until
    // the transport moves again (the freeze step below is a pure
    // hold — no drying, no advection).
    stampDishContacts(slot.vortex, stamps);
    stepVortex(slot.vortex, { freeze: true });
  } else {
    emitFromInstances(slot.vortex, instances || []);
    // #1841 — the dish's contact stamps (slice B of #1809): the
    // presses the contact passes recorded this frame, applied with
    // the marks' own stamps, before the step moves any water.
    stampDishContacts(slot.vortex, stamps);
    emitAmbientFrom(slot.vortex, { behave, motion });
    // #998: the wet mask advects at the same rate as the feed shader's wet
    // offset, so the splotch rims travel with the smeared trails.
    stepVortex(slot.vortex, { wetAdvect: advectGain(wetness) });
  }
  const amount = advectGain(wetness);
  // #1811: pigment publishes beside the field, under the same discipline
  // as the velocity — present only when the field holds pigment, and a
  // frozen frame publishes the standing deposits (absorption must not
  // pop when the transport holds).
  const pigLive = !!slot.vortex.pigmentLive;
  return {
    wetStep: 1,
    wetGain: amount * (VORTEX_VEL_PACK / w),
    wetAmount: amount,
    wetVel: packVelocity(slot.vortex),
    wetMask: packWet(slot.vortex),
    pigStep: pigLive ? 1 : 0,
    pigDep: pigLive ? packPigmentDeposited(slot.vortex) : null,
  };
}
