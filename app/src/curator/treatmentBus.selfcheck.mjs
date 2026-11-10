// treatmentBus.selfcheck.mjs — #2010 (RAY GUN line, slice 1): the treatment bus records.
//
// Pins the slice's contract (docs/design/raygun-headroom-2026-11-06.md §8d, §9 F8/F9, ruling D4):
//   A  the surface: read / arm / disarm / cycle land through the owning slice — the cycle is the performer's tap,
//      bit-identical to the store action; arm draws from the same ray-gun stream; refusals change nothing
//   B  the announcer: every change to the standing record is announced once, with its cause and the envelope
//      (seq + musical stamp); changes nobody called (undo, a re-deal) say `document`; playback says `playback`
//   C  the bus never carries state: payloads are frozen copies; a stage with every listener off is identical
//   D  the take's recording listener: frame-keyed, caused, fail-closed check, ignores its own playback,
//      a read-only fold — and the take section is registered
import assert from 'node:assert';
import fs from 'node:fs';
import { useStore } from '../state/store.js';
import { resetDirector } from './director.js';
import { fieldFormForDeal } from '../poets/fieldForm.js';
import { POEM_RAYGUN_BASE } from '../poets/poemRow.mjs';
import { mkRng } from '../engine/prng.js';
import { rngForIndex, CH } from '../engine/kernel/rng.js';
import { on, Events, setStampProvider, resetEnvelope } from '../composition/eventBus.js';
import { startTreatments, treatments } from './treatmentsLive.mjs';
import {
  createTreatmentRecorder,
  checkTreatmentRecord,
  treatmentAt,
  treatmentState,
  TREATMENT_RECORD_VERSION,
  TREATMENT_RECORD_MAX,
} from './treatmentRecord.mjs';

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

const S = () => useStore.getState();
const BASE = S();
const standing = fieldFormForDeal({ poetId: 'teijo', pieceId: 't3' }, mkRng(3));
assert.ok(standing, 'fixture: a standing poem deals');
function reset(extra = {}) {
  resetDirector();
  useStore.setState({
    seed: 0x1918,
    layoutParams: { ...BASE.layoutParams, composition: 'raster', fieldForm: standing },
    lockedParams: {},
    poemDeal: 0,
    raygunTap: 0,
    curatePress: 0,
    historyUndoStack: [],
    historyRedoStack: [],
    kineticChapterId: null,
    kineticLanding: null,
    kineticRound: null,
    kineticNotch: null,
    ...extra,
  });
}
const expectedSeed = (tap) => {
  const st = S();
  return Math.floor(rngForIndex(st.seed, CH.curate, POEM_RAYGUN_BASE + tap, st.seedOffsets)() * 0x100000000) >>> 0;
};

// a bus tap: every treatment event with its meta
let heard = [];
const offs = [Events.TREATMENT_ARM, Events.TREATMENT_DISARM].map((ev) =>
  on(ev, (p, meta) => heard.push({ ev, p, meta })),
);
setStampProvider(() => ({ loopMs: 1234, bar: 12, beat: 2, phase: 0.5, bpm: 120 }));
let replaying = false;
const stop = startTreatments({
  getState: useStore.getState,
  subscribe: (fn) => useStore.subscribe(fn),
  isReplaying: () => replaying,
});

console.log('treatmentBus.selfcheck');

// ── A · the surface ─────────────────────────────────────────────────────
ok('A1 the surface cycle IS the performer tap: same records, same seeds, same undo steps as the store action', () => {
  reset();
  const viaStore = [];
  for (let i = 0; i < 5; i++) {
    S().cyclePoemRaygun();
    viaStore.push({
      raygun: S().layoutParams.fieldForm.raygun ?? null,
      tap: S().raygunTap,
      undo: S().historyUndoStack.length,
    });
  }
  reset();
  const viaSurface = [];
  for (let i = 0; i < 5; i++) {
    assert.equal(treatments.cycle('poem', { by: 'performer' }), true, `cycle ${i} lands`);
    viaSurface.push({
      raygun: S().layoutParams.fieldForm.raygun ?? null,
      tap: S().raygunTap,
      undo: S().historyUndoStack.length,
    });
  }
  assert.deepStrictEqual(viaSurface, viaStore);
  assert.deepStrictEqual(S().layoutParams.fieldForm, standing, 'a full cycle returns the exact plain form');
});

ok('A2 arm a named mode in ONE step — the ray-gun stream seed, one undo entry, review superseded', () => {
  reset({
    layoutParams: { ...BASE.layoutParams, composition: 'raster', fieldForm: { ...standing, review: { ops: [] } } },
  });
  const want = expectedSeed(0);
  assert.equal(treatments.arm('poem', { mode: 'shot', by: 'davis' }), true);
  assert.deepStrictEqual(S().layoutParams.fieldForm.raygun, { mode: 'shot', seed: want, wear: 1 });
  assert.equal(S().layoutParams.fieldForm.review, undefined, 'arming supersedes the review record, as the tap does');
  assert.equal(S().raygunTap, 1);
  assert.equal(S().historyUndoStack.length, 1);
  assert.deepStrictEqual(treatments.read('poem'), { mode: 'shot', seed: want });
  assert.equal(treatments.arm('poem', { mode: 'greiman', by: 'director' }), true, 're-arming another mode lands');
  assert.deepStrictEqual(S().layoutParams.fieldForm.raygun, { mode: 'greiman', seed: expectedSeed(1), wear: 1 });
  assert.equal(treatments.disarm('poem', { by: 'performer' }), true);
  assert.equal(S().layoutParams.fieldForm.raygun, undefined, 'disarm: record absent, not nulled');
  assert.equal(S().raygunTap, 2, 'disarming draws no seed');
  assert.equal(treatments.read('poem'), null);
});

ok('A3 refusals change nothing: same mode, plain disarm, bad mode, bad caller, bad target, plate, no poem', () => {
  reset();
  treatments.arm('poem', { mode: 'carson', by: 'performer' });
  const snap = () => ({ lp: S().layoutParams, tap: S().raygunTap, undo: S().historyUndoStack.length });
  const before = snap();
  assert.equal(treatments.arm('poem', { mode: 'carson', by: 'performer' }), false, 'the same mode is a no-op');
  assert.equal(treatments.arm('poem', { mode: 'dingbats', by: 'performer' }), false, 'an unknown mode');
  assert.equal(treatments.arm('poem', { mode: 'shot', by: 'loki' }), false, 'an unknown caller');
  assert.equal(treatments.arm('poem', { mode: 'shot' }), false, 'a caller must name itself');
  assert.equal(
    treatments.arm('poem', { mode: 'shot', by: 'document' }),
    false,
    '`document` is the announcer’s word, not a caller',
  );
  assert.equal(treatments.arm('creature', { mode: 'shot', by: 'performer' }), false, 'an unknown target');
  assert.deepStrictEqual(snap(), before);
  assert.equal(S().layoutParams, before.lp, 'not even a new object');
  reset();
  assert.equal(treatments.disarm('poem', { by: 'performer' }), false, 'disarming a plain form');
  assert.equal(S().historyUndoStack.length, 0);
  reset({ layoutParams: { ...BASE.layoutParams, composition: 'raster', fieldForm: { ...standing, plate: true } } });
  assert.equal(treatments.arm('poem', { mode: 'carson', by: 'performer' }), false, 'a plate is never treated');
  assert.equal(S().raygunTap, 0);
  const { fieldForm: _f, ...noPoem } = BASE.layoutParams;
  reset({ layoutParams: noPoem });
  assert.equal(treatments.cycle('poem', { by: 'performer' }), false, 'no poem standing');
  assert.equal(treatments.read('poem'), null);
});

// ── B · the announcer ───────────────────────────────────────────────────
ok('B1 every change is announced once, caused and stamped (seq + bar/beat)', () => {
  reset();
  heard = [];
  resetEnvelope();
  treatments.cycle('poem', { by: 'performer' }); // → carson
  treatments.arm('poem', { mode: 'shot', by: 'davis' }); // carson → shot
  treatments.disarm('poem', { by: 'lois' });
  assert.equal(heard.length, 3);
  const [a, b, c] = heard;
  assert.equal(a.ev, 'treatment:arm');
  assert.deepStrictEqual(a.p, { target: 'poem', mode: 'carson', seed: expectedSeed(0), from: null });
  assert.equal(a.meta.cause, 'performer');
  assert.deepStrictEqual([a.meta.seq, a.meta.bar, a.meta.beat, a.meta.bpm], [1, 12, 2, 120]);
  assert.deepStrictEqual(b.p, { target: 'poem', mode: 'shot', seed: expectedSeed(1), from: 'carson' });
  assert.equal(b.meta.cause, 'davis');
  assert.equal(c.ev, 'treatment:disarm');
  assert.deepStrictEqual(c.p, { target: 'poem', mode: 'shot' });
  assert.equal(c.meta.cause, 'lois');
  assert.equal(c.meta.seq, 3);
});

ok('B2 changes nobody called are still announced — undo, redo, a re-deal — as `document`', () => {
  reset();
  treatments.arm('poem', { mode: 'greiman', by: 'performer' });
  heard = [];
  S().undo();
  assert.equal(heard.length, 1);
  assert.equal(heard[0].ev, 'treatment:disarm');
  assert.equal(heard[0].meta.cause, 'document');
  S().redo();
  assert.equal(heard.length, 2);
  assert.equal(heard[1].ev, 'treatment:arm');
  assert.equal(heard[1].p.mode, 'greiman');
  assert.equal(heard[1].meta.cause, 'document');
  S().redealPoem(); // a re-deal deals a plain form: the treatment leaves with the old poem
  assert.equal(S().layoutParams.fieldForm?.raygun, undefined);
  assert.equal(heard.length, 3);
  assert.deepStrictEqual([heard[2].ev, heard[2].meta.cause], ['treatment:disarm', 'document']);
});

ok('B3 no change, no announcement; a change while a take plays back says `playback`', () => {
  reset();
  heard = [];
  treatments.disarm('poem', { by: 'performer' }); // refused
  useStore.setState({ curatePress: 9 }); // an unrelated store change
  assert.equal(heard.length, 0);
  replaying = true;
  treatments.cycle('poem', { by: 'performer' });
  replaying = false;
  assert.equal(heard.length, 1);
  assert.equal(heard[0].meta.cause, 'playback');
});

ok('B4 HOLD is sovereign for every caller but the performer', () => {
  reset({ lockedParams: { fieldForm: true } });
  for (const by of ['davis', 'director', 'lois']) {
    assert.equal(treatments.arm('poem', { mode: 'shot', by }), false, `${by} never treats a held poem`);
    assert.equal(treatments.cycle('poem', { by }), false);
  }
  assert.equal(S().raygunTap, 0);
  assert.equal(
    treatments.arm('poem', { mode: 'shot', by: 'performer' }),
    true,
    'the performer’s own gun works on a held poem',
  );
  assert.equal(treatments.disarm('poem', { by: 'davis' }), false, 'nor does a persona disarm one');
  assert.equal(treatments.disarm('poem', { by: 'performer' }), true);
});

ok('B5 a listener that writes while hearing: every later listener hears changes in the order they happened', () => {
  reset();
  heard = [];
  let answered = false;
  const offAnswer = on(Events.TREATMENT_ARM, (p) => {
    if (p.mode === 'carson' && !answered) {
      answered = true;
      treatments.arm('poem', { mode: 'greiman', by: 'davis' }); // a write from inside a listener
    }
  });
  const late = [];
  const offLate = on(Events.TREATMENT_ARM, (p, meta) => late.push([p.mode, meta.cause])); // registered after
  treatments.arm('poem', { mode: 'carson', by: 'performer' });
  offAnswer();
  offLate();
  assert.deepStrictEqual(late, [
    ['carson', 'performer'],
    ['greiman', 'davis'],
  ]);
  assert.equal(S().layoutParams.fieldForm.raygun.mode, 'greiman', 'the last announcement is what stands');
});

ok('B6 a recorder on the live bus agrees with the form, and its record survives the file round trip', () => {
  reset();
  let frame = 0;
  const rec = createTreatmentRecorder({
    initial: { poem: S().layoutParams.fieldForm.raygun ?? null },
    getFrame: () => frame,
  });
  const off = [
    on(Events.TREATMENT_ARM, (p, m) => rec.push('arm', p, m)),
    on(Events.TREATMENT_DISARM, (p, m) => rec.push('disarm', p, m)),
  ];
  frame = 3;
  treatments.cycle('poem', { by: 'performer' });
  frame = 9;
  treatments.arm('poem', { mode: 'shot', by: 'davis' });
  frame = 20;
  S().undo();
  for (const o of off) o();
  const r = JSON.parse(JSON.stringify(rec.finish()));
  assert.ok(checkTreatmentRecord(r));
  assert.deepStrictEqual(treatmentAt(r, 'poem', 99), treatmentState(S().layoutParams.fieldForm.raygun) ?? null);
  assert.deepStrictEqual(
    r.events.map((e) => [e[0], e[1], e.at(-1)]),
    [
      [3, 'arm', 'performer'],
      [9, 'arm', 'davis'],
      [20, 'arm', 'document'],
    ],
  );
});

// ── C · the bus never carries state ─────────────────────────────────────
ok('C1 payloads are frozen copies — a listener cannot reach the record', () => {
  reset();
  let got = null;
  const off = on(Events.TREATMENT_ARM, (p) => {
    got = p;
    try {
      p.mode = 'shot';
    } catch {
      /* frozen */
    }
  });
  treatments.arm('poem', { mode: 'carson', by: 'performer' });
  off();
  assert.ok(Object.isFrozen(got));
  assert.equal(got.mode, 'carson');
  assert.notStrictEqual(got, S().layoutParams.fieldForm.raygun);
  assert.equal(S().layoutParams.fieldForm.raygun.mode, 'carson');
});

ok('C2 the announcer is theatre: with it stopped, the same surface calls land the same document', () => {
  reset();
  treatments.arm('poem', { mode: 'shot', by: 'performer' });
  treatments.arm('poem', { mode: 'carson', by: 'davis' });
  const announced = { lp: S().layoutParams.fieldForm, tap: S().raygunTap };
  stop();
  assert.equal(treatments.read('poem'), null, 'unbound: the surface reads nothing');
  assert.equal(treatments.cycle('poem', { by: 'performer' }), false, 'unbound: the surface refuses');
  reset();
  S().setPoemRaygun('shot');
  S().setPoemRaygun('carson');
  assert.deepStrictEqual({ lp: S().layoutParams.fieldForm, tap: S().raygunTap }, announced);
  for (const off of offs) off();
});

// ── D · the take's recording listener ───────────────────────────────────
ok('D1 the recorder: frame-keyed, caused, starts from the store, ignores playback and junk', () => {
  let frame = 0;
  const rec = createTreatmentRecorder({ initial: { poem: { mode: 'carson', seed: 5 } }, getFrame: () => frame });
  frame = 10;
  rec.push('arm', { target: 'poem', mode: 'shot', seed: 7, from: 'carson' }, { cause: 'davis' });
  frame = 4; // frames never run backwards in the record
  rec.push('disarm', { target: 'poem', mode: 'shot' }, { cause: 'performer' });
  rec.push('arm', { target: 'poem', mode: 'shot', seed: 8 }, { cause: 'playback' }); // its own playback
  rec.push('arm', { target: 'beast', mode: 'shot', seed: 8 }, { cause: 'davis' }); // unknown target
  rec.push('arm', { target: 'poem', mode: 'shot', seed: -1 }, { cause: 'davis' }); // bad seed
  rec.push('verdict', { target: 'poem', mode: 'shot', verdict: 'sanctioned' }, {}); // no cause → document
  frame = 30;
  rec.push('arm', { target: 'poem', mode: 'greiman', seed: 9 }, null);
  const r = rec.finish();
  assert.deepStrictEqual(r, {
    version: TREATMENT_RECORD_VERSION,
    initial: { poem: { mode: 'carson', seed: 5 } },
    events: [
      [10, 'arm', 'poem', 'shot', 7, 'davis'],
      [10, 'disarm', 'poem', 'shot', 'performer'],
      [10, 'verdict', 'poem', 'shot', 'sanctioned', 'document'],
      [30, 'arm', 'poem', 'greiman', 9, 'document'],
    ],
  });
  assert.equal(checkTreatmentRecord(r), r);
  assert.deepStrictEqual(treatmentAt(r, 'poem', 0), { mode: 'carson', seed: 5 });
  assert.equal(treatmentAt(r, 'poem', 10), null);
  assert.deepStrictEqual(treatmentAt(r, 'poem', 99), { mode: 'greiman', seed: 9 });
  assert.notStrictEqual(rec.finish().events[0], r.events[0], 'finish hands out copies');
  const capped = createTreatmentRecorder();
  for (let i = 0; i < TREATMENT_RECORD_MAX + 5; i++)
    capped.push('disarm', { target: 'poem', mode: 'shot' }, { cause: 'lois' });
  assert.equal(capped.finish().events.length, TREATMENT_RECORD_MAX);
  assert.equal(treatmentState({ mode: 'shot', seed: 1, extra: 1 }).extra, undefined);
});

ok('D2 the check is fail-closed', () => {
  const good = { version: 1, initial: { poem: null }, events: [[0, 'disarm', 'poem', 'shot', 'lois']] };
  assert.equal(checkTreatmentRecord(good), good);
  const bad = [
    null,
    [],
    { ...good, version: 2 },
    { ...good, initial: { creature: null } },
    { ...good, initial: { poem: { mode: 'shot' } } },
    { ...good, initial: { poem: { mode: 'shot', seed: 1, x: 1 } } },
    {
      ...good,
      events: [
        [5, 'disarm', 'poem', 'shot', 'lois'],
        [4, 'disarm', 'poem', 'shot', 'lois'],
      ],
    },
    { ...good, events: [[0, 'blast', 'poem', 'shot', 'lois']] },
    { ...good, events: [[0, 'arm', 'poem', 'shot', 'lois']] },
    { ...good, events: [[0, 'arm', 'poem', 'shot', 1.5, 'lois']] },
    { ...good, events: [[0, 'disarm', 'poem', 'shot', 'loki']] },
    { ...good, events: [[0, 'verdict', 'poem', 'shot', 'lois']] },
  ];
  for (const b of bad) assert.equal(checkTreatmentRecord(b), null, JSON.stringify(b));
});

ok('D3 the take registers the section, and playback never applies it', () => {
  const flat = (t) => t.replace(/\s+/g, ' ');
  const pb = flat(fs.readFileSync('src/components/PerformanceButton.jsx', 'utf8'));
  assert.ok(pb.includes('treatments: treatmentsSection,'));
  assert.ok(pb.includes("on(Events.TREATMENT_ARM, (p, meta) => rec.push('arm', p, meta))"));
  const play = fs.readFileSync('src/gl/playback.mjs', 'utf8');
  assert.ok(!/treatment/i.test(play), 'playback never consults the treatment log (the form’s record replays)');
  const row = flat(fs.readFileSync('src/components/PoemRow.jsx', 'utf8'));
  assert.ok(row.includes("treatments.cycle('poem', { by: 'performer' })"), 'the poem row fires through the surface');
  const app = flat(fs.readFileSync('src/App.jsx', 'utf8'));
  assert.ok(app.includes('const stopTreatments = startTreatments({') && app.includes('stopTreatments();'));
});

setStampProvider(null);
console.log(`treatmentBus.selfcheck: ok (${passed} checks)`);
