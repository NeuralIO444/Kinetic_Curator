// breakLive.js — #2116 assemble: the live driver of the break-up trigger. It only RECORDS decisions: it bumps the store's
// monotone trigger counters (breakSeq); the loop's fold (engine/motionCore/breakTrigger.js) stamps them on the kineme clock.
//
//   - kinetic:tap, layout:preset, layout:curate   a new Look landing           -> bump 'in' (a settle: the pieces start displaced)
//   - a Book chapter landing                      kineticLanding.seq changes   -> bump 'in'
//   - audio:onset { strength }                    a strong hit                 -> bump 'out' (a scatter), at most one per bar
//   - clock:bar { bar }                           the next downbeat after one  -> bump 'in' (they reassemble)
//
// A keep is not a trigger. Nothing here reads a clock: bars come from clock:bar and a restart (the bar number going
// backwards) starts the count again and settles anything left out.
import { on, Events } from '../composition/eventBus.js';
import { BREAK_ONSET_STRENGTH } from '../data/kinemes.js';

/**
 * @param bump          (which: 'out' | 'in') => void   records one trigger (the store's bumpBreak)
 * @param watchLanding  (cb) => unsubscribe              calls cb whenever a Book chapter lands (kineticLanding.seq moves)
 * @returns stop()
 */
export function startBreak({ bump, watchLanding }) {
  let bar = null; // the last downbeat seen (0-based), null until the clock has ticked
  let scatterBar = null; // the bar the last scatter flew out in
  let pending = false; // a scatter is out and no downbeat has settled it yet
  const stop = [];
  const settle = () => {
    pending = false;
    bump('in');
  };

  stop.push(on(Events.KINETIC_TAP, settle));
  stop.push(on(Events.LAYOUT_PRESET, settle));
  stop.push(on(Events.LAYOUT_CURATE, settle));
  if (typeof watchLanding === 'function') stop.push(watchLanding(settle));
  stop.push(
    on(Events.AUDIO_ONSET, (p) => {
      const strength = Number(p && p.strength);
      if (!(strength >= BREAK_ONSET_STRENGTH)) return;
      if (bar !== null && scatterBar === bar) return; // one scatter per bar
      scatterBar = bar;
      pending = true;
      bump('out');
    }),
  );
  stop.push(
    on(Events.CLOCK_BAR, (p) => {
      const b = Number(p && p.bar);
      if (!Number.isFinite(b)) return;
      if (bar !== null && b < bar) {
        // the clock restarted: the count starts again and nothing is left out
        scatterBar = null;
        if (pending) settle();
      } else if (pending && b !== scatterBar) {
        settle(); // the next downbeat
      }
      bar = b;
    }),
  );
  return () => stop.forEach((f) => typeof f === 'function' && f());
}
