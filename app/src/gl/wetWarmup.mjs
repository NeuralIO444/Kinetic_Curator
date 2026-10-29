/**
 * wetWarmup.mjs — #1815: warm-up exports, the wet field's stills contract.
 *
 * The wet field used to be live-only (the old header on vortex.mjs): a
 * still has no gesture history, so an export could never carry the field
 * a live session builds. Matt's ruling (WET_ENGINE §5, decision 3)
 * supersedes that doctrine: stills gain the field by REHEARSING it.
 * Before rendering, the export path runs the wet-frame service
 * (wetFrame.mjs) for a fixed warm-up of K steps over the project's
 * instances at their project-state positions and motion — the same
 * noteWetFrame inputs the live loop builds from the layout — at a fixed
 * dt. Same seed + same instances + same K → byte-identical field →
 * byte-identical wet contribution to the still. There is no gesture-
 * history pretence: the warm-up is derived from project state alone,
 * and K is a recipe constant (below) that every wet export names in its
 * readout — "wet: warm-up K=90" — derived and shown, never hidden.
 *
 * What warms up is the whole served field: the velocity pack, the
 * wetness mask, and — since #1811/#1812 are field state — the pigment
 * deposit WITH its edge darkening already accrued during the drying
 * steps. The still consumes the packs exactly as the live path does
 * (the ACCUM recipe's wet/pigment terms, then the #1813 wet-look pass
 * over the finished frame, formula-for-formula the live pass — the
 * renderer applies it from the display state this module assembles).
 * Nothing is re-applied: edge darkening lives in the pack, once.
 *
 * WETNESS = 0: warmUpWetField returns null and the caller renders
 * exactly as before this slice — byte-identical, no service birth,
 * no cost. (The sim's gate is binary: any wetness > 0 steps, the
 * regime table shapes how much — the warm-up follows the same gate.)
 *
 * SVG fallback: the SVG renderer has no mask to read. Its divergence is
 * documented and signed, not a failure: "mask absent → static blend"
 * (recorded in the parity harness, parity/corpus.mjs
 * KNOWN_DIVERGENCES). The parity corpus keeps WETNESS at 0, so the
 * SVG/GL sweep is untouched by this slice.
 *
 * Cost: the warm-up runs on the export path only, bounded by
 * WET_WARMUP_CEILING_MS at the shipped 128-grid constants — asserted
 * with a timing log in wetWarmup.selfcheck.
 */
import { WET_REGIMES, createWetFrameService } from './wetFrame.mjs';
import { wetnessStep, motionAmount } from './vortex.mjs';
import { wetGroundFromCss } from './wetLook.mjs';

/**
 * The warm-up length: 90 fixed steps of the wet-frame service — 1.5 s
 * of field time at the sim's fixed dt. Long enough for stamps to
 * advect, spread and start drying (edge darkening accrues as cells
 * cross the damp band); short enough to stay far under the ceiling.
 * A recipe constant beside the other WET constants — NOT a layout
 * param (the replay-divergence trap: exports derive it, projects
 * never carry it).
 */
export const WET_WARMUP_STEPS = 90;

/**
 * The pinned warm-up cost ceiling: K steps at the 128-grid constants
 * must complete under 2 s on the studio machine. The still-path
 * selfcheck times the warm-up and asserts against this bound.
 */
export const WET_WARMUP_CEILING_MS = 2000;

/** The readout every wet export prints: derived, shown, never hidden. */
export const WET_WARMUP_READOUT = `wet: warm-up K=${WET_WARMUP_STEPS}`;

/**
 * Run the warm-up: K identical service frames over the given instances.
 * Returns the final served field ({ wetStep, wetGain, wetAmount,
 * wetVel, wetMask, pigStep, pigDep }) extended with { steps, readout },
 * or null when the project is dry (wetnessStep 0) — the caller then
 * renders exactly as it did before #1815. A fresh service per warm-up:
 * no state survives between exports, which is what makes the result a
 * pure function of (seed, instances, wetness, behave, motion, K).
 */
export function warmUpWetField({
  seed = 0,
  width = 1000,
  height = 700,
  instances = [],
  behave = undefined,
  motion = 0,
  wetness = 0,
  steps = WET_WARMUP_STEPS,
} = {}) {
  if (!(wetnessStep(wetness) > 0)) return null;
  const svc = createWetFrameService();
  let served = null;
  try {
    for (let i = 0; i < steps; i++) {
      served = svc.frame({
        consumers: { warmup: true },
        wetness,
        freeze: false,
        seed,
        width,
        height,
        instances,
        behave,
        motion,
      });
    }
  } finally {
    svc.dispose();
  }
  if (!served || !(served.wetStep > 0)) return null;
  const { wetStep, wetGain, wetAmount, wetVel, wetMask, pigStep, pigDep } = served;
  return {
    wetStep,
    wetGain,
    wetAmount,
    wetVel,
    wetMask,
    pigStep,
    pigDep,
    steps,
    readout: WET_WARMUP_READOUT,
  };
}

/**
 * The layout params a still's field is derived from: the first
 * resolved layer carrying layout params that is not an FX layer
 * (content and pattern layers carry them; a pattern layer's are the
 * pure defaults, so a pattern-only project is dry unless a content
 * layer says otherwise). Mirrors how the entrypoints already take
 * their palette from the resolved layers — one derivation, shared by
 * every still call site so the sites cannot skew.
 */
export function wetLayoutParamsOf(resolvedLayers) {
  const layer = (resolvedLayers || []).find((l) => l && l.layoutParams && !l.isFx);
  return layer ? layer.layoutParams : null;
}

/**
 * Warm up from a built scene contract + the resolved layout params —
 * THE derivation every still entrypoint (renderScene via exportStill,
 * the accumStill sequence) shares: the contract's instances at
 * project state, the contract's canvas as the sim size (the field's
 * authored 1000×700 space), the contract's seed, and the layout's
 * wetness / behave / motion (motionAmount — the same wind/breath/flap
 * read the live loop feeds the service).
 */
export function warmUpForScene({ seed = 0, canvas = null, instances = [], layoutParams = null } = {}) {
  const lp = layoutParams || {};
  return warmUpWetField({
    seed,
    width: canvas && Number.isFinite(canvas.w) ? canvas.w : 1000,
    height: canvas && Number.isFinite(canvas.h) ? canvas.h : 700,
    instances,
    behave: lp.behave,
    motion: motionAmount(lp),
    wetness: Number(lp.accumulationWetness) || 0,
  });
}

const bytesToB64 = (u8) => {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const pack64 = (p) => (p ? { n: p.n, rgba: bytesToB64(p.rgba) } : null);

/**
 * The payload form of a warmed field, as it crosses into the headless
 * page (packs base64, the atlas discipline): the ACCUM recipe terms
 * (wetStep/wetGain/wetAmount/wetVel/wetMask/pigStep/pigDep) plus the
 * #1813 display state for the wet-look pass — the same state shape
 * liveLoop arms via setWetLook ({ mask, amount, bg, damp, full }),
 * with the ground parsed from the still's own background the fade way
 * (wetGroundFromCss) and the regime thresholds from the service table.
 * The harness decodes the packs back to { n, rgba } Uint8Arrays.
 */
export function wetExportPayload(served, bgCss) {
  if (!served) return null;
  return {
    wetStep: served.wetStep,
    wetGain: served.wetGain,
    wetAmount: served.wetAmount,
    wetVel: pack64(served.wetVel),
    wetMask: pack64(served.wetMask),
    pigStep: served.pigStep,
    pigDep: pack64(served.pigDep),
    display: {
      mask: pack64(served.wetMask),
      amount: served.wetAmount,
      bg: wetGroundFromCss(bgCss),
      damp: WET_REGIMES[0].at,
      full: WET_REGIMES[2].at,
    },
    steps: served.steps,
    readout: served.readout,
  };
}

/**
 * FNV-1a over the served packs (velocity, mask, pigment deposit) —
 * the byte-identity probe the selfchecks hash. Two warm-ups with the
 * same hash carry byte-identical fields.
 */
export function hashWetField(served) {
  let h = 0x811c9dc5;
  const mix = (u8) => {
    if (!u8) return;
    for (let i = 0; i < u8.length; i++) {
      h ^= u8[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  if (!served) return h >>> 0;
  mix(served.wetVel && served.wetVel.rgba);
  mix(served.wetMask && served.wetMask.rgba);
  mix(served.pigDep && served.pigDep.rgba);
  return h >>> 0;
}
