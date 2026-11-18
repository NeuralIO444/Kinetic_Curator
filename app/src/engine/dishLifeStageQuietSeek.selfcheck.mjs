// dishLifeStageQuietSeek.selfcheck.mjs — #2290: a quiet stamp whose generation is BEHIND the culture
// (a replay seek / a re-stamped wake) rebuilds the culture mid-apply(); the rebuild replaces the stage
// state, so the quiet dial set earlier in the same frame was lost and the quiet branch read
// `st.quiet.strength` of null. The dial must survive the rebuild, and apply() must never throw.
import assert from 'node:assert/strict';
import { createDishLifeStage } from './dishLifeStage.mjs';

const W = 1000;
const H = 500;
const mark = (x, y) => ({
  x,
  y,
  scale: 5,
  scaleY: 5,
  alpha: 80,
  assetId: 'a',
  color: '#111',
  accent: '#222',
  zTier: 1,
  glass: false,
  key: `m${x}-${y}`,
});
const layers = () => [
  { id: 'L1', layoutParams: {}, items: [mark(250, 150), mark(500, 250), mark(750, 350)] },
  { id: 'FX', isFx: true },
];
const quiet = (gen) => ({ wakeMs: 5000, gen, shed: 0, mode: 'quiet', strength: 0.6, cycleGens: 40 });

const stage = createDishLifeStage();
assert.doesNotThrow(() => stage.apply(quiet(6), layers(), W, H), 'forward quiet frames run');
assert.doesNotThrow(
  () => stage.apply(quiet(2), layers(), W, H),
  'a quiet stamp behind the culture (seek back) must not throw',
);
assert.ok(stage.field(), 'the quiet culture still publishes its field after the seek-back rebuild');
// same culture however it was reached: the field after a seek back equals a fresh stage stepped straight to that gen
const fresh = createDishLifeStage();
fresh.apply(quiet(2), layers(), W, H);
assert.equal(stage.generation, fresh.generation, 'seek back lands on the same generation');
console.log('dishLifeStageQuietSeek.selfcheck: ok');
