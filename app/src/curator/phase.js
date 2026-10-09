// phase.js — the instrument knows the phase (#1144, KC-1 DS: honest signals, no timers with opinions).
//
// EXPLORE or REFINE, derived ONLY from what the artist did, never from a clock:
//   -> REFINE   a keep or favourite lands; or three small slider moves in a row (they are settling a look)
//   -> EXPLORE  a new seed; a voice switch; a look (composition) change; a MODIFIER change (mode, behaviour, blend,
//               symmetry: "modifiers set the room, explorers move in it", so changing one redefines the neighbourhood and
//               leaves refine); or one large slider jump (a quarter of the control's range or more)
//   null        nothing has happened yet: unmodulated, exactly yesterday's behaviour
// The phase is sticky: it holds until the opposite action. Nothing here reads Date, a timer or a random number.
//
// Pure: `phaseStep(state, prev, next)` takes two store snapshots and returns the next { phase, small }.
import { PARAM_SPEC } from '../data/layout-modes.js';

export const PHASE_EXPLORE = 'explore';
export const PHASE_REFINE = 'refine';
/** A slider move this fraction of its range or bigger is a jump: it leaves refine. */
export const JUMP_FRACTION = 0.25;
/** This many small slider moves in a row settle a look: they enter refine. */
export const SETTLE_MOVES = 3;
/** Layout keys that set the room rather than move in it. */
export const MODIFIER_KEYS = Object.freeze(['mode', 'behave', 'blendMode', 'symmetry']);

export const NEUTRAL_PHASE = Object.freeze({ phase: null, small: 0 });

const len = (a) => (Array.isArray(a) ? a.length : 0);

/** The size of one numeric layout change as a fraction of that control's range (0 when it has no range or did not move). */
export function moveFraction(key, from, to) {
  const spec = PARAM_SPEC[key];
  if (!spec || !Number.isFinite(from) || !Number.isFinite(to) || from === to) return 0;
  const range = spec.max - spec.min;
  return range > 0 ? Math.abs(to - from) / range : 0;
}

/**
 * One transition. `prev` and `next` are store snapshots (only seed, keeps, favorites, activeVoiceId, voice and
 * layoutParams are read). A keep wins over everything else in the same update: it is a deliberate act.
 */
export function phaseStep(state, prev, next) {
  const cur = state && typeof state === 'object' ? state : NEUTRAL_PHASE;
  if (!prev || !next) return cur;
  if (len(next.keeps) > len(prev.keeps) || len(next.favorites) > len(prev.favorites)) return { phase: PHASE_REFINE, small: 0 };
  if (next.seed !== prev.seed || next.activeVoiceId !== prev.activeVoiceId || next.voice !== prev.voice) return { phase: PHASE_EXPLORE, small: 0 };
  const a = prev.layoutParams || {}; const b = next.layoutParams || {};
  if (a === b) return cur;
  if (a.composition !== b.composition) return { phase: PHASE_EXPLORE, small: 0 };
  for (const k of MODIFIER_KEYS) if (a[k] !== b[k]) return { phase: PHASE_EXPLORE, small: 0 };
  let biggest = 0; let moved = false;
  for (const k of Object.keys(PARAM_SPEC)) {
    const f = moveFraction(k, a[k], b[k]);
    if (f > 0) { moved = true; if (f > biggest) biggest = f; }
  }
  if (!moved) return cur;
  if (biggest >= JUMP_FRACTION) return { phase: PHASE_EXPLORE, small: 0 };
  const small = (cur.small || 0) + 1;
  return small >= SETTLE_MOVES ? { phase: PHASE_REFINE, small: 0 } : { phase: cur.phase, small };
}

// The live phase: a module singleton fed by the store subscription (the established module-singleton pattern).
let live = NEUTRAL_PHASE;
/** 'explore' | 'refine' | null (null = unmodulated). */
export function getPhase() {
  return live.phase;
}
/** Tests only. */
export function resetPhase() {
  live = NEUTRAL_PHASE;
}
/** Wire the phase to the store. Call once (App). `subscribe` is injected so this module stays framework-free. */
export function initPhase(subscribe) {
  subscribe((next, prev) => {
    try {
      live = phaseStep(live, prev, next);
    } catch {
      /* a phase that cannot be read is no phase: the last one stands */
    }
  });
}
