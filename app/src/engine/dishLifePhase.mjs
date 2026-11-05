// dishLifePhase.mjs — DISH LIFE slice 3a/3c (#1923): the idle-pickup CLOCK. Pure state machine, no DOM, no clock of its own.
//
// The performer composes; when their hands leave, the composition becomes the seed of a culture
// that grows on the loop clock; any touch ends it. This module owns WHEN the culture exists and
// WHICH generation it should be on — and nothing else. It holds no culture: the resolver does
// (engine/dishLifeStage.mjs), because the resolver is the pure function of the recorded input
// stream, so the live loop stamps this clock's decision on the frame input and a take replays the
// culture exactly. No rendering, no listeners, no timers: the loop hands in loop-clock time.
//
// The #1923 integration contract, as enforced here:
//   IDLE ONLY     wakes only after `idleMs` with no touch, never by deal or by schedule. touch() from ANY
//                 source (pointer, key, MIDI, audio above a floor) ends it at once.
//   OFF MEANS OFF while disabled, or never woken, tick() returns immediately: no work, no allocation.
//   LOOP-CLOCK    generation = floor((now − wake) × tempo), capped at maxGens (the arc ends before the maze).
//   REPLAYABLE    the wake moment is the whole record the clock contributes: the loop stamps it on the input.
//   SHEDDABLE     the governor's shed level rides the same stamp; the stage trickles / holds the culture.

/** Hands off this long and the culture wakes (a feel parameter; ruled default). */
export const IDLE_MS = 8000;
/** Generations per second on the loop clock (the issue: ~6–10; slower reads as nothing, faster as blur). */
export const GENS_PER_SEC = 8;
/** The arc's length: the bloom is roughly generations 5–40 and the rule matures into a maze by ~60–100. */
export const MAX_GENS = 60;
/** Audio input at or above this level (0..1) counts as a touch; below it the room is quiet. */
export const AUDIO_TOUCH_LEVEL = 0.25;

export const TOUCH_SOURCES = Object.freeze(['pointer', 'key', 'midi', 'audio']);

const finite = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Generation a culture woken at wakeMs should have reached at loop time nowMs. Pure; the replay law. */
export function generationAt(wakeMs, nowMs, gps = GENS_PER_SEC, maxGens = MAX_GENS) {
  const dt = nowMs - wakeMs;
  if (!(dt > 0)) return 0;
  return Math.min(maxGens, Math.floor((dt / 1000) * gps));
}

/** Create the clock. Options are feel parameters; `enabled:false` is the off switch. */
export function createDishLifePhase({
  enabled = true,
  idleMs = IDLE_MS,
  gps = GENS_PER_SEC,
  maxGens = MAX_GENS,
  audioLevel = AUDIO_TOUCH_LEVEL,
} = {}) {
  const p = {
    enabled: !!enabled,
    idleMs: Math.max(0, finite(idleMs, IDLE_MS)),
    gps: Math.max(0, finite(gps, GENS_PER_SEC)),
    maxGens: Math.max(1, Math.floor(finite(maxGens, MAX_GENS))),
    audioLevel,
    status: 'asleep', // asleep | growing | settled
    lastTouchMs: null,
    wakeMs: null,
    ended: 0, // how many wakes were ended by a touch (telemetry)
  };

  /** A touch from `source` at loop time nowMs. Ends a running culture; always restarts the idle count. */
  function touch(nowMs, source = 'pointer', level = 1) {
    if (!TOUCH_SOURCES.includes(source)) return { ended: false, ignored: true };
    if (source === 'audio' && !(level >= p.audioLevel)) return { ended: false, ignored: true };
    p.lastTouchMs = nowMs;
    if (p.status === 'asleep') return { ended: false };
    const wakeMs = p.wakeMs;
    p.status = 'asleep';
    p.wakeMs = null;
    p.ended++;
    return { ended: true, wakeMs };
  }

  const view = () => ({
    status: p.status,
    wakeMs: p.wakeMs,
    gen: p.status === 'asleep' ? 0 : p.status === 'settled' ? p.maxGens : 0,
  });

  /**
   * One loop tick. `hasMarks` says there is a composition to seed from (an empty stage never wakes).
   * Returns { status, wakeMs, gen } — gen is the TARGET generation on the loop clock; wakeMs is null while asleep.
   */
  function tick(nowMs, { hasMarks = true } = {}) {
    if (!p.enabled) return view();
    if (p.status === 'asleep') {
      // never touched yet: the clock starts at the first tick, so a freshly loaded page does not wake at once
      if (p.lastTouchMs == null) p.lastTouchMs = nowMs;
      if (nowMs - p.lastTouchMs < p.idleMs || !hasMarks) return view();
      p.wakeMs = nowMs;
      p.status = 'growing';
    }
    const gen = generationAt(p.wakeMs, nowMs, p.gps, p.maxGens);
    if (gen >= p.maxGens) p.status = 'settled';
    return { status: p.status, wakeMs: p.wakeMs, gen };
  }

  return {
    touch,
    tick,
    get status() {
      return p.status;
    },
    get wakeMs() {
      return p.wakeMs;
    },
    get endedCount() {
      return p.ended;
    },
    setEnabled(on) {
      p.enabled = !!on;
      if (!p.enabled && p.status !== 'asleep') {
        p.status = 'asleep';
        p.wakeMs = null;
      }
    },
  };
}
