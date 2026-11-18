// gaitLive.js — #2329 (GAIT M3; gait-spec ruling 4): the QUEEN picks each wearer's gait once a phrase.
//
//   - audio:energy { level }            the envelope (low | mid | high, with hysteresis): what she reads
//   - audio:silenceStart / silenceEnd   silence is `still`
//   - audio:input { source }            a new piece: the old reading is forgotten
//   - clock:bar                         a phrase boundary (every PHRASE_BARS): her picks land, one GAIT_ASSIGN per
//                                       wearer whose wanted default changed (engine/gaitAssign.js queenPicks)
//
// She picks only among the wearer's own Canon defaults (still / idle / performing; data/canon/gaits.js), never a
// locked wearer, and she is muted while a take plays (the take's recorded stamp and rows speak). DAVIS mutations are
// a later slice. Determinism: nothing here reads a clock or a die — a pick is a pure function of the events heard and
// the assignments standing at the phrase.
import { on, Events } from '../composition/eventBus.js';
import { queenPicks } from '../engine/gaitAssign.js';
import { PHRASE_BARS } from './paceLive.js';

/**
 * @param getTargets     () => the wearers on stage (construct tile ids)
 * @param styleOf        (target) => its Canon style id, or null
 * @param getAssignments () => the standing map (state.gaitAssignments)
 * @param assign         (event) => void — the store's assignGait (it applies the lock rule again: a lock always wins)
 * @param isReplaying    () => true while a take plays
 * @returns stop()
 */
export function startGaitPick({ getTargets, styleOf, getAssignments, assign, isReplaying = () => false }) {
  let energy = null;
  let silent = false;
  const stop = [];
  stop.push(
    on(Events.AUDIO_ENERGY, (p) => {
      if (p && (p.level === 'low' || p.level === 'mid' || p.level === 'high')) energy = p.level;
    }),
  );
  stop.push(
    on(Events.AUDIO_SILENCE_START, () => {
      silent = true;
    }),
  );
  stop.push(
    on(Events.AUDIO_SILENCE_END, () => {
      silent = false;
    }),
  );
  stop.push(
    on(Events.AUDIO_INPUT, () => {
      energy = null;
      silent = false;
    }),
  );
  stop.push(
    on(Events.CLOCK_BAR, (p) => {
      if (!p || !Number.isInteger(p.bar) || p.bar % PHRASE_BARS !== 0) return;
      if (isReplaying()) return;
      let targets;
      let assignments;
      try {
        targets = getTargets() || [];
        assignments = getAssignments() || {};
      } catch {
        return;
      }
      for (const e of queenPicks({ assignments, targets, styleOf, energy, silent })) assign(e);
    }),
  );
  return () => {
    for (const off of stop) off();
  };
}
