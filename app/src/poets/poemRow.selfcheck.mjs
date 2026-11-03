// poemRow.selfcheck.mjs — FIELD poem row (#1918), Matt's rulings 2026-11-01, measured on the real store.
//
//   ruling 1  every KINETIC press re-deals the poem (look / voice / curator / chaos); CURATOR deals as today
//   ruling 2  identity chip = poem-only re-deal (nothing else moves), inert while held; FORM readout;
//             KEEP banks the exact materialized poem; HOLD locks the VALUE against KINETIC and CURATOR
//   laws      HOLD is document-long (a chapter landing does not clear it) and rides the take beside the
//             poem (both are scene keys); re-deals draw from the seeded varying stream (replayable)
//
// #1932 re-pin (cause: the genre gate, Matt's clarification 2026-11-03): a poem may stand only in a
// type-native room (swiss / bauhaus / japanese). The fixture therefore stands in a swiss look
// ('raster') — the store's default room (praystation, classic) is silent by design now — and
// ruling 1's press law is asserted in its gated form: the voice pass (which never moves the look)
// still deals varying poems, while the look-moving presses obey the biconditional — a poem
// stands after the press if and only if the LANDED look's family is type-native.
import assert from 'node:assert';
import { useStore } from '../state/store.js';
import { resetDirector, getDirector } from '../curator/director.js';
import { isTypeNativeFamily } from '../curator/fieldDirector.js';
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { fieldFormForDeal, sanitizeFieldForm, POET_DECKS } from './fieldForm.js';
import { poemIdentity, keepPoem, isPoemKept, sanitizePoemKeeps, MAX_POEM_KEEPS, POET_FORMS } from './poemRow.mjs';
import { SCENE_KEYS } from '../gl/playback.mjs';
import { serializeProject, parseProject } from '../state/projectDocument.js';
import { mkRng } from '../engine/prng.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const S = () => useStore.getState();
const form = (poetId, pieceId, seed = 3) => fieldFormForDeal({ poetId, pieceId }, mkRng(seed));
const BASE = S();
const standing = form('teijo', 't3');

function reset(extra = {}) {
  resetDirector();
  useStore.setState({
    seed: 0x1918,
    // #1932: the room stands in a type-native look (swiss 'raster') so poems may stand at all.
    layoutParams: { ...BASE.layoutParams, composition: 'raster', fieldForm: standing },
    lockedParams: {},
    poemDeal: 0,
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
const withoutPoem = (lp) => {
  const { fieldForm, ...rest } = lp;
  return rest;
};
const PRESSES = {
  look: () => S().kineticLookPass(),
  voice: () => S().kineticVoicePass(),
  curator: () => S().kineticCuratorPass(),
  chaos: () => S().kineticRoll(),
};

ok('identity: every deck piece names its poet (surname), first words, and FORM in the spec vocabulary', () => {
  // proper names as authored; the row's CSS sets the caps (DS §5)
  const want = { greenleaf: 'Whittier', teijo: 'Nakamura', rosselli: 'Rosselli', gibson: 'Gibson' };
  assert.deepEqual(POET_FORMS, { greenleaf: 'held', teijo: 'haiku', rosselli: 'quadro', gibson: 'fragment' });
  for (const [poetId, deck] of Object.entries(POET_DECKS)) {
    for (const piece of deck) {
      const id = poemIdentity({ poetId, pieceId: piece.id });
      assert.equal(id.surname, want[poetId]);
      assert.equal(id.form, POET_FORMS[poetId]);
      assert.ok(id.firstWords.length > 0 && piece.lines.join(' ').startsWith(id.firstWords));
    }
  }
  assert.equal(poemIdentity(standing).firstWords, 'THE PEONIES LOOK');
  assert.equal(poemIdentity(standing).truncated, true);
  assert.equal(poemIdentity(null), null, 'silence: no identity, no row');
  assert.equal(poemIdentity({ poetId: 'nobody', pieceId: 'x' }), null);
});

ok('ruling 1: every KINETIC press re-deals the poem off the varying stream (look, voice, curator, chaos)', () => {
  // The voice pass never moves the look: the room stays swiss, and the stream deals varying poems.
  reset();
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    PRESSES.voice();
    const f = S().layoutParams.fieldForm;
    seen.add(f ? `${f.poetId}/${f.pieceId}` : 'silence');
  }
  assert.equal(S().poemDeal, 8, 'voice: every press advanced the poem stream');
  assert.ok(seen.size >= 3, `voice: presses deal varying poems (saw ${[...seen].join(', ')})`);

  // #1932: the look-moving presses re-deal the poem UNDER THE GATE — after each press a poem
  // stands if and only if the landed look's family is type-native, and the stream still advances.
  const familyOf = (lp) => COMPOSITION_PRESETS.find((p) => p.id === lp.composition)?.group ?? null;
  for (const name of ['look', 'curator', 'chaos']) {
    reset();
    const outcomes = new Set();
    for (let i = 0; i < 8; i++) {
      PRESSES[name]();
      const lp = S().layoutParams;
      const fam = familyOf(lp);
      const f = lp.fieldForm;
      assert.equal(
        !!f,
        isTypeNativeFamily(fam),
        `${name} press ${i}: poem ${f ? 'stands' : 'absent'} ⟺ landed family ${fam} ${isTypeNativeFamily(fam) ? 'is' : 'is not'} type-native`,
      );
      outcomes.add(f ? `${f.poetId}/${f.pieceId}` : `silence(${fam})`);
    }
    assert.equal(S().poemDeal, 8, `${name}: every press advanced the poem stream`);
    assert.ok(outcomes.size >= 2, `${name}: presses deal varying gated outcomes (saw ${[...outcomes].join(', ')})`);
  }
});

ok('identity chip: a poem-only re-deal — look, voice, palette and pool stand; a different piece lands; one undo step', () => {
  reset();
  const before = S();
  S().redealPoem();
  const after = S();
  assert.deepEqual(withoutPoem(after.layoutParams), withoutPoem(before.layoutParams), 'nothing but the poem moved');
  assert.equal(after.paletteId, before.paletteId);
  assert.equal(after.enabledAssets, before.enabledAssets);
  assert.equal(after.seed, before.seed);
  assert.notEqual(after.layoutParams.fieldForm?.pieceId, 't3', 'the dislike path shed the standing poem');
  assert.equal(after.historyUndoStack.length, 1);
  S().undo();
  assert.deepEqual(S().layoutParams.fieldForm, standing, 'undo brings the shed poem back');
});

ok('HOLD: refused with no poem standing; with one, KINETIC and CURATOR pass the held VALUE by', () => {
  reset({ layoutParams: withoutPoem(BASE.layoutParams) });
  S().togglePoemHold();
  assert.ok(!S().lockedParams.fieldForm, 'no value to hold');

  for (const [name, press] of Object.entries({ ...PRESSES, curate: () => S().curateUnlocked() })) {
    reset();
    S().togglePoemHold();
    assert.equal(S().lockedParams.fieldForm, true);
    for (let i = 0; i < 4; i++) press();
    assert.deepEqual(S().layoutParams.fieldForm, standing, `${name}: the held poem stands, exactly`);
    assert.equal(S().poemDeal, 0, `${name}: a held poem draws nothing from the poem stream`);
  }
});

ok('HOLD: the identity chip is inert while held; releasing frees the deal again', () => {
  reset();
  S().togglePoemHold();
  S().redealPoem();
  assert.deepEqual(S().layoutParams.fieldForm, standing);
  assert.equal(S().historyUndoStack.length, 0, 'an inert tap leaves no undo entry');
  S().togglePoemHold();
  assert.equal(S().lockedParams.fieldForm, false);
  S().redealPoem();
  assert.notEqual(S().layoutParams.fieldForm?.pieceId, 't3');
});

ok('HOLD is document-long: a chapter landing (KINETIC look flip) does not clear it', () => {
  reset();
  S().togglePoemHold();
  S().kineticLookPass();
  assert.ok(S().kineticChapterId, 'the flip landed in a chapter');
  assert.equal(S().lockedParams.fieldForm, true);
  assert.deepEqual(S().layoutParams.fieldForm, standing);
});

ok('a take records the poem, its HOLD and its keepers: all ride scene keys (layoutParams + lockedParams)', () => {
  assert.ok(SCENE_KEYS.includes('layoutParams') && SCENE_KEYS.includes('lockedParams'));
  reset();
  S().keepPoem();
  S().togglePoemHold();
  const st = S();
  assert.deepEqual(st.layoutParams.fieldForm, standing, 'the poem rides layoutParams');
  assert.deepEqual(st.layoutParams.poemKeeps, [standing], 'the keepers ride layoutParams');
  assert.equal(st.lockedParams.fieldForm, true, 'HOLD rides lockedParams');
});

ok('KEEP survives a project save and load (the bank is document data)', () => {
  reset();
  S().keepPoem();
  const doc = JSON.parse(JSON.stringify(serializeProject(S())));
  const back = parseProject(doc);
  assert.ok(back.ok, back.error);
  assert.deepEqual(sanitizePoemKeeps(back.doc.layoutParams.poemKeeps), [standing], 'the keeper loads back exactly');
  assert.deepEqual(back.doc.layoutParams.fieldForm, standing, 'and the poem with it');
});

ok('HOLD under undo behaves like every param lock: undo restores the lock state the entry captured', () => {
  reset();
  S().kineticLookPass(); // a press: its entry captures HOLD off
  const dealt = S().layoutParams.fieldForm;
  S().togglePoemHold();
  S().undo();
  assert.ok(!S().lockedParams.fieldForm, 'undo takes back the press and the lock state it saw (house lock idiom)');
  assert.deepEqual(S().layoutParams.fieldForm, standing, 'the poem before the press is back');
  // #1932: what the press dealt is a form or silence, by the landed look's family — either is honest;
  // a form, when present, must pass its own door.
  assert.ok(dealt === undefined || JSON.stringify(sanitizeFieldForm(dealt)) === JSON.stringify(dealt), 'the press dealt a form or silence');
});

ok('a poem-only deal does not move the room: KINETIC taps never count as fresh room observations', () => {
  reset();
  S().curateUnlocked(); // one real tick: the room observes once
  const d = getDirector();
  const debt = d.fieldState.slowDebt;
  const hist = d.fieldState.slowDebtHistory.length;
  const room = d.fieldState.room;
  // poem-only deals (the identity chip, and the poem half of every KINETIC press) read the last tick's room;
  // they must not add observations to the slow debt that steers the next CURATOR press's pool
  for (let i = 0; i < 6; i++) S().redealPoem();
  assert.equal(d.fieldState.slowDebt, debt);
  assert.equal(d.fieldState.slowDebtHistory.length, hist, 'no observation was added by a poem-only deal');
  assert.equal(d.fieldState.room, room, 'the room did not walk');
});

ok('determinism: the same document, seed, stream index and Director state re-deal the same poem', () => {
  reset({ poemDeal: 5 });
  S().redealPoem();
  const a = S().layoutParams.fieldForm;
  reset({ poemDeal: 5 });
  S().redealPoem();
  assert.deepEqual(S().layoutParams.fieldForm, a);
  reset({ poemDeal: 6 });
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    S().redealPoem();
    const f = S().layoutParams.fieldForm;
    seen.add(f ? `${f.poetId}/${f.pieceId}` : 'silence');
  }
  assert.ok(seen.size >= 3, `consecutive deals vary (${[...seen].join(', ')})`);
});

ok('KEEP: banks the exact materialized poem; KEEP twice is one keeper; silence banks nothing', () => {
  reset();
  S().keepPoem();
  assert.equal(S().layoutParams.poemKeeps.length, 1);
  assert.deepEqual(S().layoutParams.poemKeeps[0], standing, 'poet + piece + placement, exactly');
  assert.ok(isPoemKept(S().layoutParams.poemKeeps, standing));
  const keeps = S().layoutParams.poemKeeps;
  S().keepPoem();
  assert.equal(S().layoutParams.poemKeeps, keeps, 'a second KEEP is a no-op');
  assert.equal(S().historyUndoStack.length, 1, 'KEEP is one undo step; the no-op pushes none');
  assert.ok(!isPoemKept(S().layoutParams.poemKeeps, form('teijo', 't3', 99)), 'the same piece placed differently is a different keeper');
  reset({ layoutParams: withoutPoem(BASE.layoutParams) });
  S().keepPoem();
  assert.equal(S().layoutParams.poemKeeps, undefined, 'silence banks nothing');
});

ok('KEEP bank: validated at the door, oldest drops past the cap', () => {
  let keeps = [];
  for (let i = 0; i < MAX_POEM_KEEPS + 4; i++) keeps = keepPoem(keeps, form('gibson', 'w1', 100 + i));
  assert.equal(keeps.length, MAX_POEM_KEEPS);
  assert.deepEqual(keeps[0], form('gibson', 'w1', 104));
  assert.deepEqual(sanitizePoemKeeps([standing, { poetId: 'teijo' }, null, 'x']), [standing]);
  assert.deepEqual(keepPoem([], { poetId: 'teijo', pieceId: 't3' }), [], 'an unmaterialized poem is not a keeper');
});

console.log(`poemRow.selfcheck: ${n} checks passed`);
