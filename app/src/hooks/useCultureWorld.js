import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';
import {
  createCultureWorld,
  advanceCultureWorld,
  setStandingCultureWorld,
  standingCultureWorld,
  castCultureTake,
} from '../engine/cultureWorld.mjs';

// CULTURE Phase 0 — the app shell's seam for the dish gate (state.cultureDish, carried by
// the project document only while on). While the gate is ON, the shell owns one CULTURE
// world and feeds it accumulated frame time from rAF; the world's own scheduler turns
// that into fixed 120 Hz steps (engine/cultureWorld.mjs). While the gate is OFF — the
// default, and every project that predates the gate — this hook creates nothing, starts
// no rAF, and costs nothing: the stage is exactly the stage it was. A seed change rebuilds
// the world — the Lab casts fresh each take (spec §4 Q2): no standing zoo survives it.
//
// Phase 5A — citizens immigrate THROUGH this gate: a world born here is cast at birth
// (castCultureTake — the Lab's door), so the first citizen lives in the dish only while
// the gate is on. Nothing is drawn: the world has no render path yet.
//
// The effect's body is runCultureShell, exported so the gate is pinned by a selfcheck
// (hooks/useCultureWorld.selfcheck.mjs) — the hook only hands it the store's gate.

/**
 * The shell's one effect, as a pure-ish function of (gate, seed, host): gate OFF → no world, no
 * cast, no frame request, the standing world cleared; gate ON → a fresh world, cast at birth,
 * registered as standing and fed from the host's frame clock. `host` supplies
 * requestAnimationFrame / cancelAnimationFrame (the window's, in the app) and an optional
 * `onWorld(world | null)` the hook uses to keep its ref. Returns the cleanup (or undefined).
 */
export function runCultureShell(on, seed, host) {
  const onWorld = host.onWorld || (() => {});
  if (on !== true) {
    onWorld(null);
    setStandingCultureWorld(null);
    return undefined;
  }
  const world = createCultureWorld({ seed });
  castCultureTake(world);
  onWorld(world);
  setStandingCultureWorld(world);
  let raf = 0;
  let last = null;
  const tick = (now) => {
    if (last !== null) advanceCultureWorld(world, Math.max(0, (now - last) / 1000));
    last = now;
    raf = host.requestAnimationFrame(tick);
  };
  raf = host.requestAnimationFrame(tick);
  return () => {
    host.cancelAnimationFrame(raf);
    // Clear only what is still this world's: a newer world, once registered, stays standing.
    if (standingCultureWorld() === world) {
      onWorld(null);
      setStandingCultureWorld(null);
    }
  };
}

export function useCultureWorld() {
  const on = useStore((s) => s.cultureDish === true);
  const seed = useStore((s) => s.seed);
  const ref = useRef(null);

  useEffect(
    () =>
      runCultureShell(on, seed, {
        requestAnimationFrame: (f) => requestAnimationFrame(f),
        cancelAnimationFrame: (id) => cancelAnimationFrame(id),
        onWorld: (w) => {
          ref.current = w;
        },
      }),
    [on, seed],
  );

  return ref;
}
