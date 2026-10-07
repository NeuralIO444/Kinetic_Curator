// patternShuffle.js — the live DROP gate for PATTERN tracks (#1100).
//
// SHUFFLE writes a new seed. With DROP off it lands in the same frame. With DROP on it waits for the next
// BAR (4 beats at the BEAT clock's BPM) so the new pattern lands on the beat. The decision is the pure
// state machine in pattern/shuffleGate.js (proven by motion.selfcheck); this file only holds the pending
// gates and feeds them the loop clock.
//
// Time is LOOP time (the mirror App.jsx keeps in loopClock.ms), never wall time: a frozen loop, a slow
// render or a batch pause holds the pending shuffle, and it fires once on thaw. Pending state is not a
// project field: it is a moment in the performance, so it is not saved, not undoable, not in a recipe.
import { useStore } from './store.js';
import { loopClock } from '../gl/loopClock.js';
import { createShuffleGate, requestShuffle, tickShuffle } from '../pattern/shuffleGate.js';

const gates = new Map(); // layer id -> pending gate (present ONLY while a shuffle is armed)
const listeners = new Set();
let timer = null;
let snapshot = new Set(); // pending ids, replaced on every change (what useSyncExternalStore reads)

const notify = () => { snapshot = new Set(gates.keys()); listeners.forEach((f) => f()); };

// The poll runs only while something is pending. rAF in the browser; a timer elsewhere (node selfchecks).
const raf = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));
const caf = (h) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(h) : clearTimeout(h));

function schedule() {
  if (timer != null || gates.size === 0) return;
  timer = raf(() => { timer = null; tickPatternShuffles(); schedule(); });
}

function fire(id) {
  gates.delete(id);
  useStore.getState().shufflePattern(id);
}

/** SHUFFLE was pressed on a PATTERN track. */
export function requestPatternShuffle(id) {
  const s = useStore.getState();
  const layer = s.layers.find((l) => l.id === id && l.type === 'pattern');
  if (!layer) return;
  const r = requestShuffle(gates.get(id) ?? createShuffleGate(), { drop: layer.pattern?.drop === true, bpm: s.beatBpm, loopMs: loopClock.ms });
  if (r.fire) fire(id); else gates.set(id, r.gate);
  notify();
  schedule();
}

/** One poll. Exported so a selfcheck can drive the loop clock by hand. */
export function tickPatternShuffles() {
  if (gates.size === 0) return;
  const s = useStore.getState();
  let changed = false;
  for (const [id, gate] of [...gates]) {
    const layer = s.layers.find((l) => l.id === id && l.type === 'pattern');
    if (!layer) { gates.delete(id); changed = true; continue; } // the track went away: nothing to land on
    const r = tickShuffle(gate, { drop: layer.pattern?.drop === true, bpm: s.beatBpm, loopMs: loopClock.ms });
    if (r.fire) { fire(id); changed = true; } else if (r.gate !== gate) { gates.set(id, r.gate); }
  }
  if (changed) notify();
}

export const isShufflePending = (id) => gates.has(id);
export const subscribePending = (f) => { listeners.add(f); return () => listeners.delete(f); };
export const pendingSnapshot = () => snapshot;

/** Test hook: forget every pending shuffle and stop polling. */
export function resetPatternShuffle() {
  gates.clear(); if (timer != null) { caf(timer); timer = null; } notify();
}
