// dishPigment.mjs — petri dish B3 (#1412): pigment exchange. The law
// lives here; particles.js takes call sites only (the B1/B2 pattern —
// one writer per law, see dishDeform.mjs / dishCoalesce.mjs). Spec:
// docs/research/petri-dish-physics-scope-2026-10-12.md §5; issue #1412.
//
// On SUSTAINED contact, each body's colour leans toward the other's —
// GROUND lean's mechanism (#1370) made dynamic and mutual. The pairs
// are B2's coalescing pairs (dishCoalesce.mjs): the trade is weighted
// by the pair's merge factor, so a glancing touch trades nothing and
// a fully merged pair trades at the full rate. Family is B2's family
// (the stratum): dwell is fed only by the per-system contact pass, so
// cross-strata pairs never trade in v1 — the same same-family scope
// B2 flagged for Matt's review.
//
// The law, end to end:
//
//   STATE — the trade moves the engine's one pigment working copy,
//   `leakRgb` (#287: "the drifting working copy of the agent's
//   pigment"). #287's leak drifts it toward the neighbourhood average;
//   this module trades it pairwise between two bodies in contact.
//   One working copy, two honest forces — never a second store that
//   could disagree with the first.
//
//   RATE — per step, each body closes a fraction
//   k = (1 − exp(−PIGMENT_RATE_PER_SEC · dt)) × mergeFactor of the
//   remaining gap to its partner. The exponential form IS the rate
//   cap: at full merge a body closes at most PIGMENT_RATE_PER_SEC of
//   the gap per second, so two colonies measurably converge over ~60 s
//   of contact and can never snap. The trade is SYMMETRIC by
//   construction: one delta is computed from the pre-step snapshot
//   and applied +d to one body, −d to the other, so the pair's mean
//   colour is conserved exactly and neither body can overshoot the
//   other (the gap shrinks monotonically, its sign never flips).
//
//   HISTORY — a body removed from contact keeps its earned colour:
//   nothing here ever decays the working copy back toward the palette.
//   The trade is history, not a shader trick. And the trade itself
//   crosses only an actual touch (the feed's near-touch test): a
//   separated pair's draining dwell fades B2's membrane, but no
//   pigment crosses a gap. Earned colour reaches
//   the visible column by WRITE-BACK, on the #287 discipline: the
//   quantized hex (4 bits per channel, the atlas-churn guard) is
//   written to color[] only when it actually changes.
//
//   PALETTE — when update() re-deals color[] from a new swatch set,
//   syncDishPigment re-seeds the working copy from the new colours:
//   earned pigment belongs to the palette that earned it, and the new
//   palette takes over (color[]'s own rule at the re-deal site).
//
//   DETERMINISM — no randomness, no wall-clock: the trade is a pure
//   function of (seed, params, steps) through the dwell tracker, so
//   the same seed reproduces the same trade and bake equals live.
//   The trade writes colour state only — no position, velocity, or
//   mass — so physics is bit-identical with exchange on or off
//   (pinned in dishPigment.selfcheck.mjs).
//
//   STILLNESS — under reduced-motion the trade does not accrue. The
//   dish holds (spec §7), and pigment has no rest state to settle
//   into: trading underneath the stillness would repaint bodies the
//   moment it lifted — exactly the pop B1's law forbids. Un-stilling
//   resumes the trade from the colours as they stand.
//
//   GOVERNOR — cost tier 2, deform's rung (spec §7 ladder: FX
//   finishes first, then deform + exchange, then radius fidelity and
//   body counts). The shed (dishPigmentShed in sceneContract.js:
//   perfTier1 on AND quality at performance) reaches the step
//   spread-only via layoutParams.pigmentShed and stops the trade;
//   colour already earned is history and stays — a shed never
//   repaints a body. Stills and exports carry no governor state, so
//   their bakes never shed and trade exactly as the live dish did.
//
//   SWITCH — like deform and coalescence there is no artist knob:
//   exchange follows contacts. The engine takes an update-level
//   `pigment: false` (spread-only) that silences the step and the
//   palette sync; the byte-identity tests drive it.

import { registerCostTier } from '../gl/costTiers.mjs';
import { coalescePairs, COALESCE_TOUCH } from './dishCoalesce.mjs';
import { contactBodyRadius } from './dishRadius.mjs';

registerCostTier('engine/dish-pigment', {
  tier: 2,
  memoryBytes: 0,
  timeMs: 0.02,
  notes: '#1412 petri dish B3: pigment exchange. A few flops per coalescing pair per step on the pigment working copy, plus a quantized write-back only when a traded body\u2019s hex actually changes. No passes, no textures. Tier 2 — sheds with deform when perfTier1 is on and quality has stepped to performance (dishPigmentShed); the shed stops the trade, earned colour stays.',
});

/** Share of the remaining colour gap a fully-merged body closes per
 *  second (the rate cap). Mutual, so a pair's gap closes at twice
 *  this: ~63% in 10 s of full contact, ~99.7% in 60 s. */
export const PIGMENT_RATE_PER_SEC = 0.05;
/** Write-back quantization step (#287's 4-bit guard: the atlas bakes
 *  once per visible shift, never per frame). */
export const PIGMENT_WRITE_QUANTUM = 16;

const qchan = (v) => Math.min(255, Math.round(Math.min(255, Math.max(0, v)) / PIGMENT_WRITE_QUANTUM) * PIGMENT_WRITE_QUANTUM);

/** The visible hex for a working-copy triple, on the #287 write-back
 *  quantization — the same value #287's cadence would write, so the
 *  two writers of color[] can never fight. */
export function pigmentHex(r, g, b) {
  const h = (v) => qchan(v).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Parse a colour string to [r, g, b] 0..255, or null (fail-closed). */
function parseHex3(color) {
  const m = HEX.exec(String(color ?? ''));
  if (!m) return null;
  let v = m[1];
  if (v.length === 3) v = v.split('').map((c) => c + c).join('');
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Palette re-deal (call site in update(), beside #278's re-resolve):
 * the working copy re-seeds from the freshly dealt colours, so no
 * body trades from — or repaints — the previous palette's pigment.
 */
export function syncDishPigment(sys) {
  if (!sys || sys._pigmentOn === false) return;
  const LEAK = sys.leakRgb;
  for (let i = 0; i < sys.n; i++) {
    const rgb = parseHex3(sys.color[i]);
    if (!rgb) continue; // fail-closed: an unparseable colour keeps its copy
    const o3 = i * 3;
    LEAK[o3] = rgb[0]; LEAK[o3 + 1] = rgb[1]; LEAK[o3 + 2] = rgb[2];
  }
}

/**
 * Advance the exchange by one step: every coalescing pair trades,
 * weighted by its merge factor. Reads the pair state B2's step just
 * composed (dead pairs already purged there); writes the working
 * copy and, on visible change, color[]. Nothing else.
 */
export function stepDishPigment(sys, dtSec, { reducedMotion = false, shed = false } = {}) {
  if (!sys || sys._pigmentOn === false) return;
  if (shed || reducedMotion) return; // shed: the trade stops. Stillness: nothing accrues.
  const pairs = coalescePairs(sys);
  if (pairs.length === 0) return;
  const dt = Number(dtSec);
  if (!(dt > 0)) return;
  const baseK = 1 - Math.exp(-PIGMENT_RATE_PER_SEC * dt);
  if (!(baseK > 0)) return;
  const baseR = sys._layout ? Number(sys._layout.contactRadius) || 0 : 0;
  if (!(baseR > 0)) return; // no contact geometry, no trade (B2's guard)
  const LEAK = sys.leakRgb;
  const ALIVE = sys.alive;
  const traded = new Set();
  for (const { i, j, f } of pairs) {
    if (ALIVE[i] !== 1 || ALIVE[j] !== 1) continue;
    // The trade crosses only an actual touch — the feed's near-touch
    // test (COALESCE_TOUCH). A separated pair's dwell drains on its
    // own schedule (the membrane fades), but no pigment crosses a gap.
    const ri = contactBodyRadius(baseR, sys.scale[i], sys.contactTrim[i]);
    const rj = contactBodyRadius(baseR, sys.scale[j], sys.contactTrim[j]);
    if (!(ri > 0) || !(rj > 0)) continue;
    const dx = sys.x[j] - sys.x[i];
    const dy = sys.y[j] - sys.y[i];
    if (dx * dx + dy * dy > ((ri + rj) * COALESCE_TOUCH) ** 2) continue;
    const io = i * 3; const jo = j * 3;
    // Snapshot both triples: the delta is computed once, from the
    // pre-step state, and applied antisymmetrically (+d / −d) — the
    // pair's mean colour is conserved exactly.
    const ar = LEAK[io]; const ag = LEAK[io + 1]; const ab = LEAK[io + 2];
    const br = LEAK[jo]; const bg = LEAK[jo + 1]; const bb = LEAK[jo + 2];
    const k = baseK * f;
    const dr = (br - ar) * k; const dg = (bg - ag) * k; const db = (bb - ab) * k;
    if (dr === 0 && dg === 0 && db === 0) continue; // converged: nothing to write
    LEAK[io] = ar + dr; LEAK[io + 1] = ag + dg; LEAK[io + 2] = ab + db;
    LEAK[jo] = br - dr; LEAK[jo + 1] = bg - dg; LEAK[jo + 2] = bb - db;
    traded.add(i); traded.add(j);
  }
  // Write-back on the #287 discipline: quantized hex, only on change,
  // so the atlas bakes once per visible shift instead of per frame.
  for (const idx of traded) {
    const o3 = idx * 3;
    const hex = pigmentHex(LEAK[o3], LEAK[o3 + 1], LEAK[o3 + 2]);
    if (hex !== sys.color[idx]) sys.color[idx] = hex;
  }
}
