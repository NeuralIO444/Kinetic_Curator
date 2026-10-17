// leanLive.js — #1640: the live driver of the dial lean. The Queen's validated lean — answered for by the Mind
// contract and, until now, applied nowhere — moves two dials, and only in silence, when nobody is playing:
//
//   - mind:decision (persona queen)      the lean: { wetness?, evolve? }, contract-validated before it reaches the bus
//   - audio:silenceStart                 her window opens
//   - clock:bar                          a phrase boundary (every PHRASE_BARS): one bounded step per dial (queenLean M8,
//                                        hosted by director.leanDialSteps), her mark showing while a dial moves
//   - layout:param (accumulationWetness) / davis:evolve
//                                        any write that is not her own step (cause 'lean') is a hand on a dial — the
//                                        artist's, a preset's, a voice's — and it wins: she releases BOTH dials until
//                                        the silence ends or the input changes (paceLive's hand-silence, unchanged)
//   - audio:silenceEnd / audio:input     the window closes / a new piece: a released lean may start again
//
// The writes travel the same pipes a hand uses (wireEventBus turns layout:param into SET_LAYOUT_PARAM and
// davis:evolve into SET_EVOLVE_INTERVAL), so they are recorded like any other move and replay exactly.
// Determinism: nothing here reads a clock or a die — a step is a pure function of the events and the dial
// values, so a recorded lean replays to the same dial values. The mark (curator/swayView.mjs) is the only
// sign of it: visible while a dial is moving, absent otherwise.
import { on, emit, Events } from '../composition/eventBus.js';
import { leanDialSteps } from './director.js';
import { setDialMagnitude } from './swayView.mjs';
import { PHRASE_BARS } from './paceLive.js';

/** What the mark reads while she is leaning (the largest remaining pull; never below a visible hand — paceLive's shape). */
const markFor = (pull) => Math.min(1, Math.max(0.4, pull));

/**
 * @param getWetness        () => the WETNESS dial now (layoutParams.accumulationWetness)
 * @param getEvolveInterval () => the EVOLVE interval now, ms
 * @param context           () => { keeps, allowance } the ledger and the room's allowance, read at the phrase
 * @returns stop()
 */
export function startLean({ getWetness, getEvolveInterval, context }) {
  let lean = null; // the latest validated lean from her decisions: { wetness?, evolve? }, or null
  let silent = false; // inside an audio silence window
  let silenced = false; // a hand took a dial: released until the window closes or the input changes
  const stop = [];

  stop.push(on(Events.MIND_DECISION, (p) => {
    if (!p || p.persona !== 'queen' || !p.reply || typeof p.reply !== 'object') return;
    lean = p.reply.lean && typeof p.reply.lean === 'object' ? p.reply.lean : null;
  }));
  stop.push(on(Events.AUDIO_SILENCE_START, () => { silent = true; }));
  stop.push(on(Events.AUDIO_SILENCE_END, () => { silent = false; silenced = false; setDialMagnitude(0); }));
  stop.push(on(Events.AUDIO_INPUT, () => { silenced = false; lean = null; setDialMagnitude(0); }));
  // anything that is not her own step is a hand on the dial: it wins, on either dial, for both
  stop.push(on(Events.LAYOUT_PARAM, (p, meta) => {
    if (meta && meta.cause === 'lean') return;
    if (!p || p.key !== 'accumulationWetness') return;
    silenced = true; setDialMagnitude(0);
  }));
  stop.push(on(Events.DAVIS_EVOLVE, (p, meta) => {
    if (meta && meta.cause === 'lean') return;
    if (!p || p.interval === undefined) return;
    silenced = true; setDialMagnitude(0);
  }));
  stop.push(on(Events.CLOCK_BAR, (p) => {
    if (!p || p.bar % PHRASE_BARS !== 0) return;
    if (!silent || silenced || !lean) { setDialMagnitude(0); return; }
    let ctx;
    try { ctx = context() || {}; } catch { ctx = {}; }
    const wetness = getWetness();
    const evolveInterval = getEvolveInterval();
    const steps = leanDialSteps({ lean, wetness, evolveInterval, keeps: ctx.keeps, allowance: ctx.allowance });
    if (steps.wetness === null && steps.evolveInterval === null) { setDialMagnitude(0); return; }
    setDialMagnitude(markFor(steps.pull));
    if (steps.wetness !== null) emit(Events.LAYOUT_PARAM, { key: 'accumulationWetness', value: steps.wetness }, { cause: 'lean' });
    if (steps.evolveInterval !== null) emit(Events.DAVIS_EVOLVE, { interval: steps.evolveInterval }, { cause: 'lean' });
  }));

  return () => { for (const off of stop) off(); setDialMagnitude(0); };
}
