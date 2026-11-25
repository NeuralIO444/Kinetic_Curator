// node src/state/budgetCeiling.selfcheck.mjs
//
// #2483 — the budget ceiling's law, pinned at three levels: the real
// slice + dispatch driven headlessly through the stress session's exact
// narrative, the document round trip (serialize + rig load), and the
// source contracts (the knob reads the ceiling; the governor never
// references it).
//
// The defect, from the 2026-11-24 stress session: the knob pressed FULL
// at boot and showed SHOW from mid-session on, with no click. The tree
// mechanism: ONE store field (`quality`) was both the performer's
// ceiling (what the knob displays) and the governor's live tier (what
// its shed cut writes via setQuality, #264). Every governor shed moved
// the displayed ceiling. The fix splits the ceiling into its own field
// (qualityCeiling) whose only writers are the performer's SET_QUALITY
// dispatch and a rig load; the governor keeps shedding the live tier
// underneath it, and the knob shows a "shedding" tag while it does.

import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { createGlobalSlice } from './slices/globalSlice.js';
import { applyAction } from './applyAction.js';
import { SET_QUALITY } from './actions.js';
import { serializeProject } from './projectDocument.js';
import { rigFieldsFromDoc } from './sceneApply.js';

// ── the headless store (the watchdog.selfcheck harness pattern) ─────
function makeStore() {
  let state = {};
  const set = (patch) => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
  };
  // layoutParams belongs to another slice; setQuality reads its mirror
  // flag, so the harness seeds the empty shape.
  state = { layoutParams: {}, ...createGlobalSlice(set) };
  return { get: () => state };
}

// The governor's quality shed and restore, call for call as written in
// usePerformanceGovernor (claim once per episode, then setQuality).
function governorShed(s, tier) {
  const st = s.get();
  if (st.qualityShedFrom == null) st.setQualityShedFrom(st.quality);
  s.get().setQuality(tier);
}
function governorRestore(s) {
  const st = s.get();
  st.setQuality(st.qualityShedFrom);
  s.get().setQualityShedFrom(null);
}

// ── the stress narrative, driven through the real dispatch ──────────
{
  const s = makeStore();
  assert.strictEqual(s.get().quality, 'balanced', 'boot live tier');
  assert.strictEqual(s.get().qualityCeiling, 'balanced', 'boot ceiling matches');
  assert.strictEqual(s.get().qualityShedFrom, null, 'no shed claim at boot');

  // The performer chooses FULL — the knob's (and the bridge's) one path.
  applyAction({ type: SET_QUALITY, payload: 'high' }, s.get());
  assert.strictEqual(s.get().quality, 'high', 'choice sets the live tier');
  assert.strictEqual(s.get().qualityCeiling, 'high', 'choice sets the ceiling');
  assert.strictEqual(s.get().qualityShedFrom, null, 'choice leaves no claim');

  // The governor sheds underneath: high → balanced → performance.
  governorShed(s, 'balanced');
  assert.strictEqual(s.get().quality, 'balanced', 'the live tier shed to SHOW');
  assert.strictEqual(
    s.get().qualityCeiling,
    'high',
    'THE DEFECT PIN: a governor shed must not move the ceiling (FULL stayed FULL)',
  );
  assert.strictEqual(s.get().qualityShedFrom, 'high', 'the claim remembers the ceiling');
  governorShed(s, 'performance');
  assert.strictEqual(s.get().quality, 'performance', 'the live tier shed to LEAN');
  assert.strictEqual(s.get().qualityCeiling, 'high', 'the ceiling still has not moved');
  assert.strictEqual(s.get().qualityShedFrom, 'high', 'one claim per episode, still the ceiling');

  // Recovery restores the live tier to the ceiling and releases the claim.
  governorRestore(s);
  assert.strictEqual(s.get().quality, 'high', 'recovery restores the live tier');
  assert.strictEqual(s.get().qualityCeiling, 'high', 'the ceiling never moved through the episode');
  assert.strictEqual(s.get().qualityShedFrom, null, 'claim released');

  // A performer choice made mid-shed re-pins both and cancels the claim.
  governorShed(s, 'balanced');
  applyAction({ type: SET_QUALITY, payload: 'performance' }, s.get());
  assert.strictEqual(s.get().quality, 'performance', 'mid-shed choice sets the live tier');
  assert.strictEqual(s.get().qualityCeiling, 'performance', 'mid-shed choice sets the ceiling');
  assert.strictEqual(s.get().qualityShedFrom, null, 'mid-shed choice cancels the claim');
}

// ── the document round trip: a mid-shed save keeps the ceiling ──────
{
  const s = makeStore();
  applyAction({ type: SET_QUALITY, payload: 'high' }, s.get());
  governorShed(s, 'balanced'); // live tier SHOW, ceiling FULL, claim open

  const state = {
    ...s.get(),
    seed: 7,
    paletteId: 'test-palette',
    layoutParams: {},
    enabledAssets: {},
  };
  const doc = serializeProject(state);
  assert.strictEqual(doc.quality, 'high', 'a document saved mid-shed carries the ceiling, not the shed live tier');

  // Loading that document sets ceiling and live tier from it together.
  const rig = rigFieldsFromDoc(doc, makeStore().get());
  assert.strictEqual(rig.quality, 'high', 'load sets the live tier from the document');
  assert.strictEqual(rig.qualityCeiling, 'high', 'load sets the ceiling from the document');

  // A dangling quality key falls back to the standing ceiling, not to
  // the possibly shed live tier.
  const damaged = rigFieldsFromDoc({ quality: 'not-a-tier' }, s.get());
  assert.strictEqual(damaged.qualityCeiling, 'high', 'damaged doc: ceiling falls back to the standing ceiling');
  assert.strictEqual(damaged.quality, 'high', 'damaged doc: live tier falls back with it');
}

// ── source contracts ────────────────────────────────────────────────
{
  const knob = readFileSync(new URL('../components/BudgetKnob.jsx', import.meta.url), 'utf8');
  assert.ok(
    knob.includes('qualityCeiling === tierId'),
    'the knob\u2019s pressed button derives from the ceiling, not the live tier',
  );
  assert.ok(!knob.includes('quality === tierId'), 'the knob no longer reads the live tier as the choice');
  assert.ok(
    knob.includes('tierId === qualityCeiling'),
    'the knob’s no-op guard compares the pressed tier against the ceiling, not the live tier',
  );
  assert.ok(knob.includes('qualityShedFrom != null'), 'the shedding state derives from the governor\u2019s claim');
  assert.ok(knob.includes('shedding'), 'the knob renders the shedding indicator');

  const governor = readFileSync(new URL('../hooks/usePerformanceGovernor.js', import.meta.url), 'utf8');
  const cuts = readFileSync(new URL('../hooks/governorCuts.js', import.meta.url), 'utf8');
  assert.ok(!governor.includes('qualityCeiling'), 'the governor never references the ceiling');
  assert.ok(!cuts.includes('qualityCeiling'), 'the governor\u2019s cut table never references the ceiling');

  const apply = readFileSync(new URL('./applyAction.js', import.meta.url), 'utf8');
  assert.ok(
    apply.includes('store.setQualityCeiling(payload)'),
    'the SET_QUALITY dispatch is the ceiling\u2019s session writer',
  );

  // The writer set, tree-wide: the setter may be CALLED from exactly one
  // file in src — the SET_QUALITY dispatch. (Suites are excluded: they
  // name the setter in assertions like this one. The rig load writes the
  // field directly through the slice spread, never through the setter.)
  const callers = [];
  const walk = (dir, prefix) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(new URL(`${e.name}/`, dir), `${prefix}${e.name}/`);
      else if (/\.(js|jsx|mjs)$/.test(e.name) && !e.name.includes('.selfcheck.')) {
        if (readFileSync(new URL(e.name, dir), 'utf8').includes('setQualityCeiling(')) {
          callers.push(`${prefix}${e.name}`);
        }
      }
    }
  };
  walk(new URL('../', import.meta.url), '');
  assert.deepStrictEqual(
    callers,
    ['state/applyAction.js'],
    'the ceiling setter has exactly one call site in src: the SET_QUALITY dispatch',
  );

  const doc = readFileSync(new URL('./projectDocument.js', import.meta.url), 'utf8');
  assert.ok(
    doc.includes('state.qualityCeiling || state.quality'),
    'serialization writes the ceiling into the document\u2019s quality key',
  );

  // The one-writer files carry no ceiling seam: the split needed none.
  for (const f of ['../gl/liveLoop.mjs', '../gl/liveResolve.mjs', '../engine/particles.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!src.includes('qualityCeiling'), `${f} untouched by the ceiling split`);
  }
}

console.log('budgetCeiling selfcheck: PASS');
