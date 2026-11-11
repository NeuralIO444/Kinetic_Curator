// doctrines.selfcheck.mjs — #2010 (RAY GUN line, P5): the DOCTRINES.
//
// Pins the slice's contract (docs/design/raygun-headroom-2026-11-06.md §4.8, D2):
//   A  the pure chooser: two doctrines, CARSON arms the hot geometry modes, ASHWORTH arms Swiss Grit; a unit draw picks
//      deterministically; a standing mode is never re-picked when the doctrine has another; unknown → null
//   B  the record: `raygun.doctrine` is 'carson' | 'ashworth', named (never ambient), refused whole when anything else;
//      a record without it is exactly what it was
//   C  the store: setPoemDoctrine is session state (no undo step, no-op refused); with a doctrine standing a deal arms
//      the landing — mode from the doctrine's set, doctrine named, wear + distort axes named — off its own stream
//      (the performer's tap counter never moves); no doctrine → the landing is the plain one; a plate and a HOLD are
//      never armed; the same state deals the same arm (replay)
//   D  the call: callPoemDoctrine arms the standing poem as one undo step; the surface announces it as a re-arm
//      with cause 'director'; HOLD refuses it for a non-performer caller
import assert from 'node:assert';
import { useStore } from '../state/store.js';
import { resetDirector } from './director.js';
import { fieldFormForDeal, sanitizeFieldForm } from '../poets/fieldForm.js';
import { mkRng } from '../engine/prng.js';
import { on, Events, resetEnvelope } from '../composition/eventBus.js';
import { startTreatments, treatments } from './treatmentsLive.mjs';
import { reviewLanding } from './fieldReview.mjs';
import { DOCTRINES, DOCTRINE_IDS, doctrineMode, doctrineOfMode, isDoctrine } from './doctrines.mjs';

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};
console.log('doctrines.selfcheck');

const S = () => useStore.getState();
const BASE = S();
const form = fieldFormForDeal({ poetId: 'teijo', pieceId: 't3' }, mkRng(3));
assert.ok(form, 'fixture: a poem deals');
const reset = (fieldForm = form, lockedParams = {}, extra = {}) => {
  resetDirector();
  useStore.setState({
    seed: 0x1918,
    layoutParams: { ...BASE.layoutParams, composition: 'raster', fieldForm },
    lockedParams,
    poemDeal: 0,
    raygunTap: 0,
    curatePress: 0,
    poemDoctrine: null,
    historyUndoStack: [],
    historyRedoStack: [],
    ...extra,
  });
};

// ── A · the chooser ──────────────────────────────────────────────────────
ok('A1 two doctrines; CARSON arms carson|shot, ASHWORTH arms grit; no greiman, no third', () => {
  assert.deepStrictEqual([...DOCTRINE_IDS].sort(), ['ashworth', 'carson']);
  assert.deepStrictEqual([...DOCTRINES.carson.modes], ['carson', 'shot']);
  assert.deepStrictEqual([...DOCTRINES.ashworth.modes], ['grit']);
  assert.equal(isDoctrine('carson') && isDoctrine('ashworth'), true);
  for (const bad of ['', 'greiman', 'CARSON', null, undefined, 1, {}, 'toString'])
    assert.equal(isDoctrine(bad), false, `${String(bad)} is no doctrine`);
});

ok('A2 doctrineMode: the draw picks; a standing mode is never re-picked; unknown → null; out-of-range clamps', () => {
  assert.equal(doctrineMode('carson', 0), 'carson');
  assert.equal(doctrineMode('carson', 0.99), 'shot');
  assert.equal(doctrineMode('carson', 0, 'carson'), 'shot', 'the call is a change when it has one to make');
  assert.equal(doctrineMode('carson', 0.99, 'shot'), 'carson');
  assert.equal(doctrineMode('ashworth', 0.5), 'grit');
  assert.equal(doctrineMode('ashworth', 0.5, 'grit'), 'grit', 'a one-mode doctrine has nothing else to call');
  assert.equal(doctrineMode('nobody', 0.5), null);
  assert.equal(doctrineMode('carson', 7), 'shot');
  assert.equal(doctrineMode('carson', NaN), 'carson');
  assert.equal(doctrineOfMode('shot'), 'carson');
  assert.equal(doctrineOfMode('grit'), 'ashworth');
  assert.equal(doctrineOfMode('greiman'), null);
});

// ── B · the record ───────────────────────────────────────────────────────
ok('B1 the door carries `doctrine`, names nothing else, and adds no key without it', () => {
  for (const doctrine of ['carson', 'ashworth']) {
    const r = sanitizeFieldForm({ ...form, raygun: { mode: 'carson', seed: 9, wear: 1, distort: 1, doctrine } });
    assert.equal(r.raygun.doctrine, doctrine);
  }
  const plain = sanitizeFieldForm({ ...form, raygun: { mode: 'carson', seed: 9, wear: 1, distort: 1 } });
  assert.ok(!('doctrine' in plain.raygun), 'a performer’s arm names no doctrine');
  for (const bad of ['', 'greiman', 'Carson', 1, true, null, {}])
    assert.equal(
      sanitizeFieldForm({ ...form, raygun: { mode: 'carson', seed: 9, wear: 1, doctrine: bad } }),
      null,
      `doctrine ${JSON.stringify(bad)}`,
    );
});

// ── C · the store ────────────────────────────────────────────────────────
ok('C1 setPoemDoctrine: session state — no undo step, unknown refused, no-op refused', () => {
  reset();
  S().setPoemDoctrine('carson');
  assert.equal(S().poemDoctrine, 'carson');
  assert.equal(S().historyUndoStack.length, 0, 'not a document edit');
  S().setPoemDoctrine('greiman');
  assert.equal(S().poemDoctrine, 'carson', 'an unknown doctrine is refused');
  S().setPoemDoctrine(null);
  assert.equal(S().poemDoctrine, null);
});

ok(
  'C2 a deal with a doctrine standing lands armed: mode from its set, named, wear+distort, tap stream untouched',
  () => {
    for (const id of DOCTRINE_IDS) {
      reset(null, {}, { poemDoctrine: id });
      S().redealPoem();
      const f = S().layoutParams.fieldForm;
      assert.ok(f && f.raygun, `${id}: the deal armed (form ${f ? 'plain' : 'silent'})`);
      {
        assert.ok(DOCTRINES[id].modes.includes(f.raygun.mode), `${id}: mode ${f.raygun.mode} is its own`);
        assert.equal(f.raygun.doctrine, id);
        assert.equal(f.raygun.wear, 1);
        assert.equal(f.raygun.distort, 1);
        assert.equal(S().raygunTap, 0, 'the performer’s tap counter never moves for a deal');
      }
    }
  },
);

ok(
  'C3 a sweep of deals: every armed landing is its doctrine’s; the rest are exactly plain; replay is identical',
  () => {
    let armed = 0;
    let plain = 0;
    for (let d = 0; d < 24; d++) {
      reset(null, {}, { poemDoctrine: 'carson', poemDeal: d });
      S().redealPoem();
      const a = S().layoutParams.fieldForm ?? null;
      reset(null, {}, { poemDoctrine: 'carson', poemDeal: d });
      S().redealPoem();
      assert.deepStrictEqual(S().layoutParams.fieldForm ?? null, a, `deal ${d} replays identically`);
      if (a?.raygun) {
        armed++;
        assert.equal(a.raygun.doctrine, 'carson');
      } else if (a) {
        plain++;
        reset(null, {}, { poemDoctrine: null, poemDeal: d });
        S().redealPoem();
        assert.deepStrictEqual(S().layoutParams.fieldForm, a, `deal ${d}: a stood-down landing is the plain one`);
      }
    }
    assert.ok(armed > 0, `some deals arm (armed ${armed}, plain ${plain})`);
  },
);

ok('C4 no doctrine → no arm; a plate and a HOLD are never armed', () => {
  reset(null, {}, { poemDoctrine: null });
  S().redealPoem();
  assert.ok(!S().layoutParams.fieldForm?.raygun, 'no doctrine, no treatment');
  const plate = { ...form, plate: { kind: 'rule' } };
  reset(plate, {}, { poemDoctrine: 'carson' });
  S().callPoemDoctrine();
  assert.deepStrictEqual(S().layoutParams.fieldForm, plate, 'a plate is never treated');
  reset(form, { fieldForm: form }, { poemDoctrine: 'carson' });
  S().redealPoem();
  assert.deepStrictEqual(S().layoutParams.fieldForm, form, 'HOLD passes the deal by — nothing armed');
});

ok(
  'C5 the veto: a landing the review calls janky is never handed to a doctrine — it lands plain, the ladder repairs',
  () => {
    // slice 3's own fixture: seed 301 with the mirror on lands janky (markCover) and the ladder repairs it at rung 1
    const land = (doctrine) => {
      resetDirector();
      useStore.setState({
        seed: 301,
        seedOffsets: { spatial: 0, color: 0, asset: 0, noise: 0 },
        curatePress: 0,
        poemDeal: 0,
        raygunTap: 0,
        poemDoctrine: doctrine,
        lockedParams: {},
        layoutParams: { ...useStore.getInitialState().layoutParams, composition: 'raster', mirror: 'x' },
        kineticRound: null,
        kineticNotch: null,
        armedMode: null,
        armedMotion: null,
        fieldReview: null,
        fieldGateRefusal: null,
      });
      S().curateUnlocked();
      return S();
    };
    const without = land(null);
    assert.equal(without.fieldReview?.verdict, 'janky', 'fixture: the plain landing is janky');
    const withDoc = land('carson');
    assert.ok(!withDoc.layoutParams.fieldForm?.raygun, 'the doctrine stood down');
    assert.deepStrictEqual(
      withDoc.layoutParams.fieldForm,
      without.layoutParams.fieldForm,
      'exactly the plain, repaired landing',
    );
    assert.equal(withDoc.fieldReview?.adjustment?.outcome, 'repaired', 'the review ladder ran on it unchanged');
  },
);

// ── D · the call + the surface ───────────────────────────────────────────
let heard = [];
const offs = [Events.TREATMENT_ARM, Events.TREATMENT_DISARM].map((ev) =>
  on(ev, (p, meta) => heard.push({ ev, p, meta })),
);
const stop = startTreatments({ getState: useStore.getState, subscribe: (fn) => useStore.subscribe(fn) });

ok('D1 callPoemDoctrine arms the standing poem: one undo step, named, announced as the Director’s', () => {
  reset();
  resetEnvelope();
  heard = [];
  S().setPoemDoctrine('ashworth');
  assert.equal(treatments.standingDoctrine('poem'), 'ashworth');
  assert.equal(treatments.doctrine('poem', { call: 'ashworth', by: 'director' }), true);
  const r = S().layoutParams.fieldForm.raygun;
  assert.ok(r, 'the call armed the standing poem');
  {
    assert.equal(r.mode, 'grit');
    assert.equal(r.doctrine, 'ashworth');
    assert.equal(S().historyUndoStack.length, 1, 'one undo step');
    assert.equal(heard.length, 1, 'announced once');
    assert.equal(heard[0].ev, Events.TREATMENT_ARM);
    assert.equal(heard[0].meta.cause, 'director', 'the caller names itself');
  }
});

ok('D2 the surface: a bad caller or doctrine is refused; HOLD refuses a non-performer call', () => {
  reset();
  assert.equal(treatments.doctrine('poem', { call: 'carson', by: 'nobody' }), false);
  assert.equal(treatments.doctrine('poem', { call: 'greiman', by: 'director' }), false);
  reset(form, { fieldForm: form });
  assert.equal(treatments.doctrine('poem', { call: 'carson', by: 'director' }), false, 'HOLD is sovereign');
  assert.ok(!S().layoutParams.fieldForm.raygun);
});

offs.forEach((off) => off());
stop();
console.log(`doctrines.selfcheck — ${passed} checks passed`);
