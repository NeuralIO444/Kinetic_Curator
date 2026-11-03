// node src/state/fieldDeal.selfcheck.mjs
// #1904 (FIELD S3) — the deal, wired live. The placement (poets/placement)
// and the stamp path (poets/fieldStampPath) are proven in isolation; this
// suite drives the REAL store action: a landed CURATOR press deals a form
// onto the landed params in the same commit, the deal replays from
// (seed, press #), the form is HELD across voice passes, and a no-op press
// deals nothing.
// #1932 re-pin (cause: the genre gate, Matt's clarification 2026-11-03): the press's
// room must be type-native for a form to deal at all, so the fixture stands in a
// swiss look ('raster'); the last block proves the same press in the store's
// default room (praystation, classic) deals silence — no form, by design.
import assert from 'node:assert/strict';
import { useStore } from './store.js';
import { RANDOMIZABLE_KEYS } from './paramUtils.js';
import { resetDirector } from '../curator/director.js';
import { sanitizeFieldForm, POET_DECKS } from '../poets/fieldForm.js';

const S = () => useStore.getState();

const press = (seed, curatePress, composition = 'raster') => {
  resetDirector();
  useStore.setState({
    seed,
    seedOffsets: { spatial: 0, color: 0, asset: 0, noise: 0 },
    curatePress,
    lockedParams: {},
    layoutParams: { ...useStore.getInitialState().layoutParams, composition },
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

// #1918 re-pin (cause: ruling 1, Matt 2026-11-01 — the poem re-deals on every KINETIC press, over the
// research's CURATOR-only recommendation). S3's "held across voice passes" is now the HOLD chip's job:
// held, a voice pass leaves the form standing exactly; unheld, the voice pass deals off the poem stream.
ok('HOLD keeps the form across a voice pass; unheld, the voice pass re-deals', () => {
  S().togglePoemHold();
  S().kineticVoicePass();
  assert.equal(
    JSON.stringify(S().layoutParams.fieldForm),
    JSON.stringify(dealtForm),
    'a held form stands through the voice pass',
  );
  S().togglePoemHold();
  const deal = S().poemDeal;
  S().kineticVoicePass();
  assert.equal(S().poemDeal, deal + 1, 'unheld, the voice pass drew a poem deal');
  useStore.setState({ layoutParams: { ...S().layoutParams, fieldForm: dealtForm } });
});

ok('a no-op press (everything locked) deals nothing and keeps the standing form', () => {
  const before = JSON.stringify(S().layoutParams.fieldForm);
  const pressBefore = S().curatePress;
  useStore.setState({ lockedParams: Object.fromEntries(RANDOMIZABLE_KEYS.map((k) => [k, true])) });
  S().curateUnlocked();
  assert.equal(S().curatePress, pressBefore, 'the no-op press did not land');
  assert.equal(JSON.stringify(S().layoutParams.fieldForm), before, 'the standing form is untouched');
});

ok('#1932: the same press in a non-type-native room deals silence — no form lands', () => {
  const params = press(4242, 0, 'praystation');
  assert.equal(S().curatePress, 1, 'the press landed');
  assert.equal(params.fieldForm, undefined, 'a classic room holds no poem (the genre gate, through the real store)');
});

console.log(`fieldDeal.selfcheck: ${n} checks passed`);
