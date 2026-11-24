// useWatchdogSpaceResume — ruling 2 of #2481 (Matt, 2026-11-24):
// while PERF PAUSED is up, Space is a GLOBAL resume — from anywhere in
// the app except a text field.
//
// Why a dedicated hook instead of the existing Space toggle: the toggle
// (App's useHotkeys map) is a bubble-phase window listener that shares
// one handler for pause and resume and stands down whenever focus sits
// in a form control; whether a given press reaches it depends on the
// focused element and on nothing between the element and window eating
// the event. The pill's tooltip has always promised "Press space … to
// resume" — this hook makes that promise true by construction for the
// paused state:
//
// - a CAPTURE-phase listener on window sees the keydown before any
//   control does, so focus on a panel button (the stress session's
//   case) can no longer swallow or repurpose the press;
// - when the pure decision (state/watchdogLaw.mjs shouldSpaceResume)
//   claims the press, the event is stopped and defaulted, so the
//   focused button is not also activated on keyup and the normal
//   toggle does not fire a second, competing dispatch;
// - the resume goes through applyAction's SET_RUNNING — the exact
//   #264 manual-resume path RUN and the old Space took — so the stop
//   clears, the restore is logged for the flap detector, and the
//   #2481 grace deadline arms, all identically.
//
// When no watchdog stop is up, this hook does nothing at all: Space
// keeps its normal toggle meaning, untouched.

import { useEffect } from 'react';
import { useStore } from '../state/store.js';
import { applyAction } from '../state/applyAction.js';
import * as A from '../state/actions.js';
import { shouldSpaceResume } from '../state/watchdogLaw.mjs';

export function useWatchdogSpaceResume() {
  useEffect(() => {
    const onKey = (e) => {
      const s = useStore.getState();
      const watchdogStopped = !!s.slowRender && s.slowRenderSource === 'watchdog';
      if (
        !shouldSpaceResume({
          key: e.key,
          repeat: e.repeat,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          watchdogStopped,
          target: e.target,
        })
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      applyAction({ type: A.SET_RUNNING, payload: true });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
