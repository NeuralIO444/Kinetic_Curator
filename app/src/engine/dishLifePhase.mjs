// dishLifePhase.mjs — DISH LIFE slice 3a (#1923): the idle-pickup phase. Pure state machine, no DOM, no clock.
//
// The performer composes; when their hands leave, the composition becomes the seed of a culture
// that grows on the loop clock; any touch ends it. Compose → culture → (harvest, slice 4) → compose.
// This module owns WHEN the culture exists and WHICH generation it is on. It owns no rendering,
// no listeners and no timers: the live loop hands it the loop-clock time and the finished marks
// (wiring is slice 3d), so the phase is a pure function of what it is handed and replays exactly.
//
// The #1923 integration contract, as enforced here:
//   IDLE ONLY     the phase wakes only after `idleMs` with no touch, never by deal or by schedule.
//                 touch() from ANY source (pointer, key, MIDI, audio above a floor) ends it at once.
//   OFF MEANS OFF while disabled, or never woken, tick() returns immediately: no culture, no allocation,
//                 no per-frame work.
//   REPLAYABLE    a wake records { wakeMs, seed, rule, cols, rows, ... }; cultureAt(record, ...) rebuilds the
//                 exact generation for any loop time from that record alone.
//   SHEDDABLE     tick() takes the governor's shed level: 1 trickles one generation per tick, 2 holds the culture
//                 where it is (nothing stepped, nothing allocated) so the frame never suffers for it.
//   LOCKS         bedrock rides in with the wake (and may be replaced while growing); colonies flow around it.
//   LOOP-CLOCK    generation = floor((now − wake) × tempo) — steps are caught up from the clock, bounded per
//                 tick; a slow frame never changes WHICH culture happens, only how soon it is drawn.

import { createCulture, stepCulture, CULTURE_RULE, setBedrock } from './dishLife.mjs';
import { seedFromMarks } from './dishLifeSeed.mjs';

/** Hands off this long and the culture wakes (a feel parameter; ruled default). */
export const IDLE_MS = 8000;
/** Generations per second on the loop clock (the issue: ~6–10; slower reads as nothing, faster as blur). */
export const GENS_PER_SEC = 8;
/** The arc's length: the bloom is roughly generations 5–40 and the rule matures into a maze by ~60–100. */
export const MAX_GENS = 60;
/** Most generations stepped in one tick, by governor shed level 0/1/2: catch up, trickle, hold. */
export const SHED_STEPS = Object.freeze([4, 1, 0]);
/** Audio input at or above this level (0..1) counts as a touch; below it the room is quiet. */
export const AUDIO_TOUCH_LEVEL = 0.25;

export const TOUCH_SOURCES = Object.freeze(['pointer', 'key', 'midi', 'audio']);

const finite = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Generation a culture woken at wakeMs has reached at loop time nowMs. Pure; the replay law. */
export function generationAt(wakeMs, nowMs, gps = GENS_PER_SEC, maxGens = MAX_GENS) {
  const dt = nowMs - wakeMs;
  if (!(dt > 0)) return 0;
  return Math.min(maxGens, Math.floor((dt / 1000) * gps));
}

/**
 * Rebuild the culture of a recorded wake at loop time nowMs — from the record and the seed marks alone.
 * The take records { wakeMs, rule, cols, rows, canvasW, canvasH, band? } and the marks it was dealt; this is
 * how a replay reaches the exact same generation the live performance showed.
 */
export function cultureAt(record, items, nowMs, { bedrock = null } = {}) {
  const seed = seedFromMarks(items, record);
  const c = createCulture({
    cols: record.cols,
    rows: record.rows,
    rule: record.rule,
    mask: record.mask || null,
    bedrock,
    seed: seed.cells,
  });
  const gen = generationAt(record.wakeMs, nowMs, record.gps, record.maxGens);
  for (let g = 0; g < gen; g++) stepCulture(c);
  return c;
}

/**
 * Create the phase. Options are feel parameters; `enabled:false` is the off switch.
 */
export function createDishLifePhase({
  enabled = true,
  idleMs = IDLE_MS,
  gps = GENS_PER_SEC,
  maxGens = MAX_GENS,
  rule = CULTURE_RULE,
  audioLevel = AUDIO_TOUCH_LEVEL,
} = {}) {
  const p = {
    enabled: !!enabled,
    idleMs: Math.max(0, finite(idleMs, IDLE_MS)),
    gps: Math.max(0, finite(gps, GENS_PER_SEC)),
    maxGens: Math.max(1, Math.floor(finite(maxGens, MAX_GENS))),
    rule,
    audioLevel,
    status: 'asleep', // asleep | growing | settled
    lastTouchMs: null,
    culture: null,
    record: null,
    ended: 0, // how many wakes were ended by a touch (telemetry)
  };

  /** A touch from `source` at loop time nowMs. Ends a running culture; always restarts the idle count. */
  function touch(nowMs, source = 'pointer', level = 1) {
    if (!TOUCH_SOURCES.includes(source)) return { ended: false, ignored: true };
    if (source === 'audio' && !(level >= p.audioLevel)) return { ended: false, ignored: true };
    p.lastTouchMs = nowMs;
    if (p.status === 'asleep') return { ended: false };
    const record = p.record;
    p.status = 'asleep';
    p.culture = null;
    p.record = null;
    p.ended++;
    return { ended: true, record };
  }

  /**
   * One loop tick. `ctx` is read only when the phase might wake or is growing:
   *   { items, canvasW, canvasH, cols, rows, mask?, bedrock?, shed? }   (shed: governor level 0|1|2)
   * Returns { status, gen, culture } — culture is null while asleep. Never throws on a thin ctx.
   */
  function tick(nowMs, ctx) {
    if (!p.enabled) return view();
    if (p.status === 'asleep') {
      // never touched yet: the clock starts at the first tick, so a freshly loaded page does not wake at once
      if (p.lastTouchMs == null) p.lastTouchMs = nowMs;
      if (nowMs - p.lastTouchMs < p.idleMs || !ctx || !Array.isArray(ctx.items) || ctx.items.length === 0)
        return view();
      wake(nowMs, ctx);
      return view();
    }
    if (p.status === 'growing') {
      if (ctx && ctx.bedrock !== undefined) setBedrock(p.culture, ctx.bedrock);
      // Shed never changes WHICH generation g looks like (that is the replay law), only how fast the lag to the
      // loop clock closes: level 0 catches up, 1 trickles one generation per tick, 2 holds the culture still.
      const shed = Math.max(0, Math.min(SHED_STEPS.length - 1, finite(ctx && ctx.shed, 0) | 0));
      const target = generationAt(p.record.wakeMs, nowMs, p.gps, p.maxGens);
      const budget = SHED_STEPS[shed];
      for (let steps = 0; p.culture.gen < target && steps < budget; steps++) stepCulture(p.culture);
      if (p.culture.gen >= p.maxGens) p.status = 'settled';
    }
    return view();
  }

  function wake(nowMs, ctx) {
    const cols = Math.max(1, ctx.cols | 0);
    const rows = Math.max(1, ctx.rows | 0);
    p.record = {
      wakeMs: nowMs,
      rule: p.rule,
      cols,
      rows,
      canvasW: ctx.canvasW,
      canvasH: ctx.canvasH,
      gps: p.gps,
      maxGens: p.maxGens,
      mask: ctx.mask || null,
    };
    const seed = seedFromMarks(ctx.items, p.record);
    p.culture = createCulture({
      cols,
      rows,
      rule: p.rule,
      mask: ctx.mask || null,
      bedrock: ctx.bedrock || null,
      seed: seed.cells,
    });
    p.status = 'growing';
  }

  const view = () => ({ status: p.status, gen: p.culture ? p.culture.gen : 0, culture: p.culture });

  return {
    touch,
    tick,
    get status() {
      return p.status;
    },
    get record() {
      return p.record;
    },
    get endedCount() {
      return p.ended;
    },
    setEnabled(on) {
      p.enabled = !!on;
      if (!p.enabled && p.status !== 'asleep') {
        p.status = 'asleep';
        p.culture = null;
        p.record = null;
      }
    },
  };
}
