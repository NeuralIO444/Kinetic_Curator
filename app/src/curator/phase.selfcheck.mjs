// phase.selfcheck.mjs — explore / refine, from actions only (#1144). No clock, no randomness: the same sequence of
// store changes always gives the same phase.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { phaseStep, moveFraction, NEUTRAL_PHASE, PHASE_EXPLORE, PHASE_REFINE, JUMP_FRACTION, SETTLE_MOVES, MODIFIER_KEYS, getPhase, resetPhase, initPhase } from './phase.js';
import { directorGains } from './director.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const S = (over = {}) => ({ seed: 5, keeps: [], favorites: [], activeVoiceId: null, voice: 'davis', layoutParams: { ...DEFAULT_LAYOUT_PARAMS }, ...over });
const lp = (o) => ({ ...DEFAULT_LAYOUT_PARAMS, ...o });
const step = (state, prev, next) => phaseStep(state, prev, next);

ok('it starts unmodulated: null is yesterday\'s behaviour, and an unchanged store changes nothing', () => {
  assert.deepEqual(NEUTRAL_PHASE, { phase: null, small: 0 });
  assert.deepEqual(step(NEUTRAL_PHASE, S(), S()), NEUTRAL_PHASE);
  assert.deepEqual(step(NEUTRAL_PHASE, null, S()), NEUTRAL_PHASE); assert.deepEqual(step(null, S(), S()), NEUTRAL_PHASE);
});

ok('a keep or a favourite enters REFINE; a new seed, a voice switch, a look change each enter EXPLORE', () => {
  assert.equal(step(NEUTRAL_PHASE, S(), S({ keeps: [{}] })).phase, PHASE_REFINE);
  assert.equal(step(NEUTRAL_PHASE, S(), S({ favorites: [{}] })).phase, PHASE_REFINE);
  const refine = { phase: PHASE_REFINE, small: 0 };
  assert.equal(step(refine, S(), S({ seed: 6 })).phase, PHASE_EXPLORE, 'new seed');
  assert.equal(step(refine, S(), S({ activeVoiceId: 'v2' })).phase, PHASE_EXPLORE, 'voice switch');
  assert.equal(step(refine, S(), S({ voice: 'lois' })).phase, PHASE_EXPLORE, 'persona switch');
  assert.equal(step(refine, S({ layoutParams: lp({ composition: 'a' }) }), S({ layoutParams: lp({ composition: 'b' }) })).phase, PHASE_EXPLORE, 'look change');
});

ok('modifier discipline: changing a mode, behaviour, blend or symmetry mid-refine leaves refine', () => {
  const refine = { phase: PHASE_REFINE, small: 2 };
  assert.deepEqual([...MODIFIER_KEYS].sort(), ['behave', 'blendMode', 'mode', 'symmetry']);
  for (const k of MODIFIER_KEYS) assert.deepEqual(step(refine, S({ layoutParams: lp({ [k]: 'x' }) }), S({ layoutParams: lp({ [k]: 'y' }) })), { phase: PHASE_EXPLORE, small: 0 }, k);
});

ok('sliders: one big jump (a quarter of the range) explores; three small moves in a row settle into refine; a big jump resets the count', () => {
  const at = (v) => S({ layoutParams: lp({ count: v }) });
  assert.ok(Math.abs(moveFraction('count', 100, 100 + 0.25 * 790) - 0.25) < 1e-9);
  assert.equal(moveFraction('nonsense', 1, 2), 0); assert.equal(moveFraction('count', NaN, 2), 0); assert.equal(moveFraction('count', 5, 5), 0);
  assert.equal(step(NEUTRAL_PHASE, at(100), at(100 + JUMP_FRACTION * 790 + 1)).phase, PHASE_EXPLORE, 'a big jump');
  let st = { phase: PHASE_EXPLORE, small: 0 };
  for (let i = 1; i < SETTLE_MOVES; i++) { st = step(st, at(100 + i), at(101 + i)); assert.equal(st.phase, PHASE_EXPLORE, `after ${i} small move(s) still exploring`); }
  st = step(st, at(110), at(111)); assert.equal(st.phase, PHASE_REFINE, `${SETTLE_MOVES} small moves settle`);
  st = step({ phase: PHASE_EXPLORE, small: 2 }, at(100), at(100 + JUMP_FRACTION * 790 + 5)); assert.deepEqual(st, { phase: PHASE_EXPLORE, small: 0 });
});

ok('the phase is sticky until the opposite action, and a keep beats a seed change in the same update (a deliberate act wins)', () => {
  const refine = { phase: PHASE_REFINE, small: 0 };
  assert.equal(step(refine, S(), S({ layoutParams: { ...DEFAULT_LAYOUT_PARAMS } })).phase, PHASE_REFINE, 'nothing happened');
  assert.equal(step({ phase: PHASE_EXPLORE, small: 0 }, S(), S({ seed: 9, keeps: [{}] })).phase, PHASE_REFINE);
});

ok('no timers with opinions: the module reads no clock and no randomness, and the same sequence always gives the same phase', () => {
  const src = readFileSync(new URL('./phase.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  for (const bad of ['Date', 'setTimeout', 'setInterval', 'Math.random', 'performance', 'requestAnimationFrame']) assert.ok(!src.includes(bad), `phase.js must not use ${bad}`);
  const run = () => { let st = NEUTRAL_PHASE; const seq = [[S(), S({ seed: 2 })], [S({ seed: 2 }), S({ seed: 2, keeps: [{}] })], [S(), S({ layoutParams: lp({ mode: 'orbit' }) })]]; for (const [a, b] of seq) st = step(st, a, b); return st; };
  assert.deepEqual(run(), run());
});

ok('the live phase follows a store subscription, and a throwing step leaves the last phase standing', () => {
  resetPhase(); assert.equal(getPhase(), null);
  let listener = null; initPhase((fn) => { listener = fn; });
  listener(S({ keeps: [{}] }), S()); assert.equal(getPhase(), PHASE_REFINE);
  listener(S({ seed: 9 }), S()); assert.equal(getPhase(), PHASE_EXPLORE);
  listener(null, undefined); assert.equal(getPhase(), PHASE_EXPLORE, 'junk in: the last phase stands');
  resetPhase();
});

ok('the phase reaches the pick through the Director: refine cools the room, explore warms it, null leaves it alone', () => {
  const room = { loisCode: 'VIBE', davisCode: 'FLOW' };
  const base = directorGains(room).temperature;
  assert.ok(directorGains({ ...room, phase: PHASE_REFINE }).temperature < base, 'refine cools');
  assert.ok(directorGains({ ...room, phase: PHASE_EXPLORE }).temperature > base - 1e-12, 'explore does not cool');
  assert.equal(directorGains({ ...room, phase: null }).temperature, base, 'null: unmodulated');
  const taste = readFileSync(new URL('./taste.js', import.meta.url), 'utf8');
  assert.match(taste, /tick\(\{ feed: loisActivity\.snapshot\(\), phase: getPhase\(\) \}\)/, 'the pick passes the live phase');
});

console.log(`phase.selfcheck: ${n} checks passed`);
