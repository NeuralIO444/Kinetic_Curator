// node src/state/fieldDeal.selfcheck.mjs
// #1904 (FIELD S3) — the deal, wired live. The placement (poets/placement)
// and the stamp path (poets/fieldStampPath) are proven in isolation; this
// suite drives the REAL store action: a landed CURATOR press deals a form
// onto the landed params in the same commit, the deal replays from
// (seed, press #), the form is HELD across voice passes, and a no-op press
// deals nothing.
import assert from 'node:assert/strict';
import { useStore } from './store.js';
import { RANDOMIZABLE_KEYS } from './paramUtils.js';
import { resetDirector } from '../curator/director.js';
import { sanitizeFieldForm, POET_DECKS } from '../poets/fieldForm.js';

const S = () => useStore.getState();

const press = (seed, curatePress) => {
  resetDirector();
  useStore.setState({
    seed,
    seedOffsets: { spatial: 0, color: 0, asset: 0, noise: 0 },
    curatePress,
    lockedParams: {},
    layoutParams: { ...useStore.getInitialState().layoutParams },
    kineticRound: null,
    kineticNotch: null,
    armedMode: null,
    armedMotion: null,
  });
  S().curateUnlocked();
  return S().layoutParams;
};

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

let dealtForm = null;
ok('a landed CURATOR press deals a form onto the landed params', () => {
  const params = press(4242, 0);
  assert.equal(S().curatePress, 1, 'the press landed');
  dealtForm = params.fieldForm;
  assert.ok(dealtForm, 'fieldForm is present on the landed params');
  assert.ok(POET_DECKS[dealtForm.poetId], `the deal names a real poet (${dealtForm.poetId})`);
  assert.ok(dealtForm.stamps.length > 0, 'the form carries stamps');
  assert.deepEqual(sanitizeFieldForm(dealtForm), dealtForm, 'the dealt form passes its own trust-boundary door');
});

ok('the deal replays: same (seed, press #) -> identical form', () => {
  const again = press(4242, 0);
  assert.equal(JSON.stringify(again.fieldForm), JSON.stringify(dealtForm), 'bit-for-bit the same deal');
});

ok('the form is HELD across a voice pass', () => {
  S().kineticVoicePass();
  assert.equal(
    JSON.stringify(S().layoutParams.fieldForm),
    JSON.stringify(dealtForm),
    'the voice pass leaves the form standing',
  );
});

ok('a no-op press (everything locked) deals nothing and keeps the standing form', () => {
  const before = JSON.stringify(S().layoutParams.fieldForm);
  const pressBefore = S().curatePress;
  useStore.setState({ lockedParams: Object.fromEntries(RANDOMIZABLE_KEYS.map((k) => [k, true])) });
  S().curateUnlocked();
  assert.equal(S().curatePress, pressBefore, 'the no-op press did not land');
  assert.equal(JSON.stringify(S().layoutParams.fieldForm), before, 'the standing form is untouched');
});

console.log(`fieldDeal.selfcheck: ${n} checks passed`);
