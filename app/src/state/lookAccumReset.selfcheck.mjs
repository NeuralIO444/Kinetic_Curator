// node src/state/lookAccumReset.selfcheck.mjs
//
// #2102 (Ruling, Matt 2026-11-11): a Look resets the trail. A Look that declares none
// of the ACCUM_KEYS returns them all to their defaults when applied; a Look that declares
// some sets those and defaults the rest. Only a LOCKED dial survives (lockedParams wins).
// A hand-set, unlocked trail is cleared like any other. Voices keep their own rule (#1768).
import assert from 'node:assert';
import { useStore } from './store.js';
import { ACCUM_KEYS } from './kineticSweep.mjs';
import { COMPOSITION_PRESETS as PRESETS } from '../data/presets.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const S = () => useStore.getState();
const declares = (p) => ACCUM_KEYS.filter((k) => k in p.params);

const accumLook = PRESETS.find((p) => p.params.accumulation === true && declares(p).length < ACCUM_KEYS.length);
const accumLook2 = PRESETS.find(
  (p) => p.params.accumulation === true && p.id !== accumLook.id && p.params.accumulationFade !== accumLook.params.accumulationFade,
);
const plainLook = PRESETS.find((p) => declares(p).length === 0 && p.id !== accumLook.id);
assert.ok(accumLook && accumLook2 && plainLook, 'catalogue has an accum look, a second one, and a plain one');

function reset(locked = {}) {
  useStore.setState({
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
    lockedParams: locked,
    voiceMix: null,
    armedMotion: null,
  });
}
// A Look lands through the MIX road: open, then commit.
function land(preset) {
  S().applyPreset(preset);
  if (S().voiceMix) S().commitVoiceMix();
}
const carried = () => ACCUM_KEYS.filter((k) => S().layoutParams[k] !== DEFAULT_LAYOUT_PARAMS[k]);

// ── 1. accum look → plain look: the trail clears, every accum dial at its default ──
reset();
land(accumLook);
assert.strictEqual(S().layoutParams.accumulation, true, 'the accum look turns the trail on');
land(plainLook);
console.log('[2102] carried over after plain look:', carried());
assert.strictEqual(S().layoutParams.accumulation, false, 'plain look: accumulation off');
for (const k of ACCUM_KEYS) assert.strictEqual(S().layoutParams[k], DEFAULT_LAYOUT_PARAMS[k], `plain look: ${k} at default`);
assert.strictEqual(S().layoutParams.composition, plainLook.id, 'the plain look still lands');

// ── 2. a hand-set, unlocked trail is cleared like any other ──
reset();
useStore.setState({ layoutParams: { ...S().layoutParams, accumulation: true, accumulationOptics: 0.1 } });
land(plainLook);
assert.strictEqual(S().layoutParams.accumulation, false, 'a hand-set unlocked trail clears');
assert.strictEqual(S().layoutParams.accumulationOptics, DEFAULT_LAYOUT_PARAMS.accumulationOptics);

// ── 3. locked accumulation survives; unlocked siblings still reset ──
reset({ accumulation: true });
useStore.setState({ layoutParams: { ...S().layoutParams, accumulation: true, accumulationOptics: 0.1 } });
land(plainLook);
assert.strictEqual(S().layoutParams.accumulation, true, 'locked accumulation is unchanged');
assert.strictEqual(S().layoutParams.accumulationOptics, DEFAULT_LAYOUT_PARAMS.accumulationOptics, 'unlocked sibling resets');
// …and a locked dial beats a look that declares it.
reset({ accumulation: true });
useStore.setState({ layoutParams: { ...S().layoutParams, accumulation: true } });
land(PRESETS.find((p) => p.params.accumulation === false) || plainLook);
assert.strictEqual(S().layoutParams.accumulation, true, 'lock beats any look');

// ── 4. accum look → accum look: the second look's values, defaults for what it omits ──
reset();
land(accumLook);
land(accumLook2);
for (const k of ACCUM_KEYS) {
  const want = k in accumLook2.params ? accumLook2.params[k] : DEFAULT_LAYOUT_PARAMS[k];
  assert.strictEqual(S().layoutParams[k], want, `accum→accum: ${k}`);
}

// ── 5. a look that declares only some keys sets those and defaults the rest ──
reset();
useStore.setState({ layoutParams: { ...S().layoutParams, accumulationTunnel: 0.5, accumulationPrism: 0.5 } });
land(accumLook);
for (const k of ACCUM_KEYS) {
  const want = k in accumLook.params ? accumLook.params[k] : DEFAULT_LAYOUT_PARAMS[k];
  assert.strictEqual(S().layoutParams[k], want, `partial look: ${k}`);
}

// ── 6. from a default state, a plain look changes no accum key (no golden drift) ──
reset();
land(plainLook);
assert.deepStrictEqual(carried(), [], 'default → plain look leaves the accum dials at default');

console.log('lookAccumReset.selfcheck: ok');
