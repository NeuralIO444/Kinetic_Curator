// node src/state/chapterWalk.selfcheck.mjs
// #1855 (BOOK S2) — the landing. Over seeded cold flips, every deal's look, voice and pool resolve inside
// the landed chapter ∩ the scope deck, and no cross-chapter asset ever appears. The walk carries the
// novelty term (unvisited chapters pull harder) and walks the spine through neighbours only. At OFF a
// chapter with no OFF-sized deck fires the honest path — it re-deals at the nearest scope where it has a
// deck and says so — never a silent borrow. Warm taps inside a chapter hold the pigment freeze (#1778):
// a voice that does not declare accumulation never moves the glow.
import assert from 'node:assert/strict';
import { useStore } from './store.js';
import {
  UNVISITED_WEIGHT,
  chapterWeight,
  chapterWeights,
  dealLanding,
  chapterScopeDeck,
  chapterHasDeck,
  effectiveChapterScope,
  chapterDeckReadout,
} from './chapterWalk.mjs';
import { lookPass, voicePass, ACCUM_KEYS } from './kineticSweep.mjs';
import { SCOPE_CYCLE, scopeDecks } from './kineticScope.mjs';
import { CHAPTERS, chapterById, chapterLooks, chapterVoices, chapterAssets, chapterDeck } from '../data/chapters.js';
import { mkRng } from '../engine/prng.js';

const S = () => useStore.getState();

// ── 1. the novelty term: unvisited pulls hardest, every visit weakens the pull ────────────────────────────────────
assert.equal(chapterWeight(0), UNVISITED_WEIGHT, 'an unvisited chapter weighs the novelty weight');
assert.equal(chapterWeight(1), 1, 'once visited, a chapter weighs 1');
assert.equal(chapterWeight(2), 0.5, 'twice visited, 1/2');
assert.equal(chapterWeight(4), 0.25, 'four visits, 1/4');
assert.deepEqual(
  chapterWeights({ marks: 2 }).map((w) => w.id),
  CHAPTERS.map((c) => c.id),
  'the weight table is the spine, in order',
);
assert.equal(chapterWeights({ marks: 2 }).find((w) => w.id === 'marks').visits, 2, 'the ledger reads back');

{
  // seeded distribution, no visits: the whole book is reachable and roughly even
  const rng = mkRng(1855);
  const counts = {};
  for (let i = 0; i < 1800; i++) {
    const { chapterId } = dealLanding(rng, {});
    counts[chapterId] = (counts[chapterId] || 0) + 1;
  }
  for (const c of CHAPTERS) assert.ok(counts[c.id] > 100, `${c.id} lands from a cold book (${counts[c.id]}/1800)`);

  // seeded distribution, every chapter visited 3× except Japan: Japan must pull far above its share
  const visits = Object.fromEntries(CHAPTERS.map((c) => [c.id, 3]));
  visits.japan = 0;
  const rng2 = mkRng(777);
  let japan = 0;
  for (let i = 0; i < 1200; i++) if (dealLanding(rng2, { visits }).chapterId === 'japan') japan++;
  assert.ok(japan / 1200 > 0.4, `the unvisited chapter pulls (${japan}/1200, expect ≈53%)`);
}

// ── 2. the path: neighbours only, from the standing chapter (or Marks) to the landing ─────────────────────────────
for (const fromId of [null, 'marks', 'now', 'swiss', 'grunge']) {
  const rng = mkRng(4242);
  for (let i = 0; i < 200; i++) {
    const { chapterId, path } = dealLanding(rng, { fromId, visits: {} });
    assert.equal(path[0], fromId ?? 'marks', 'the walk starts where the book stands (Marks when none stands)');
    assert.equal(path[path.length - 1], chapterId, 'the walk ends on the landing');
    const pos = path.map((id) => chapterById(id).position);
    for (let j = 1; j < pos.length; j++)
      assert.equal(Math.abs(pos[j] - pos[j - 1]), 1, 'the walk passes neighbours only — no teleporting');
  }
}

// ── 3. intersections are intersections: nothing dealt is outside the chapter, or outside the scope ────────────────
for (const c of CHAPTERS) {
  const own = chapterDeck(c.id);
  for (const scope of SCOPE_CYCLE) {
    const d = chapterScopeDeck(c.id, scope);
    const sd = scopeDecks(scope);
    assert.ok(
      d.looks.every((l) => own.looks.includes(l.id) && sd.looks.some((x) => x.id === l.id)),
      `${c.id}@${scope}: looks inside chapter ∩ scope`,
    );
    assert.ok(
      d.voices.every((v) => own.voices.includes(v.id) && sd.voices.some((x) => x.id === v.id)),
      `${c.id}@${scope}: voices inside chapter ∩ scope`,
    );
    assert.ok(
      d.records.every((r) => own.assets.includes(r.id)),
      `${c.id}@${scope}: pool records inside the chapter`,
    );
    if (d.poolKind === 'sets')
      assert.ok(
        d.sets.every((set) => set.every((id) => own.assets.includes(id))),
        `${c.id}@${scope}: a dealt set is whole and the chapter's own`,
      );
  }
}
// the designed honest-empty case: Marks at OFF has nothing — no looks, no voices, no whole set
{
  const d = chapterScopeDeck('marks', 'off');
  assert.equal(d.looks.length, 0, 'Marks has no OFF looks (its looks are style looks — MED deck)');
  assert.equal(d.sets.length, 0, 'Marks holds no whole curated set');
  assert.equal(chapterHasDeck('marks', 'off'), false, 'Marks cannot deal at OFF');
  assert.equal(chapterScopeDeck('now', 'off').sets.length, 19, 'Now holds every curated set');
}

// ── 4. the effective scope: the chapter re-deals at the nearest scope where it has a deck, and says so ─────────────
for (const c of CHAPTERS) {
  assert.equal(chapterHasDeck(c.id, 'koz'), true, `${c.id}: every chapter deals at KOZ (the decks are total there)`);
  assert.deepEqual(effectiveChapterScope(c.id, 'med'), { scope: 'med', redealt: false }, `${c.id}: MED deals natively`);
  assert.deepEqual(effectiveChapterScope(c.id, 'koz'), { scope: 'koz', redealt: false }, `${c.id}: KOZ deals natively`);
  if (c.id === 'now') {
    assert.deepEqual(effectiveChapterScope('now', 'off'), { scope: 'off', redealt: false }, 'Now deals at OFF itself');
    assert.deepEqual(
      effectiveChapterScope('now', 'weak'),
      { scope: 'weak', redealt: false },
      'Now deals at WEAK itself',
    );
  } else {
    assert.equal(chapterHasDeck(c.id, 'off'), false, `${c.id}: no deck at OFF (its looks live at MED)`);
    assert.equal(chapterHasDeck(c.id, 'weak'), false, `${c.id}: no deck at WEAK either`);
    assert.deepEqual(
      effectiveChapterScope(c.id, 'off'),
      { scope: 'med', redealt: true },
      `${c.id}@OFF re-deals at MED and says so`,
    );
    assert.deepEqual(
      effectiveChapterScope(c.id, 'weak'),
      { scope: 'med', redealt: true },
      `${c.id}@WEAK re-deals at MED and says so`,
    );
  }
}
{
  const r = chapterDeckReadout('marks', 'off');
  assert.equal(r.name, 'Marks', 'the readout names the chapter');
  assert.equal(r.dealtScope, 'med', 'the readout names the scope the deal was made at');
  assert.equal(r.redealt, true, 'the readout confesses the re-deal');
  assert.deepEqual(
    { a: r.assets, l: r.looks, v: r.voices },
    { a: 18, l: 5, v: 8 },
    'the readout counts the dealt deck',
  );
  assert.equal(chapterDeckReadout('nope', 'off'), null, 'an unknown chapter reads null');
}

// ── 5. seeded cold flips, composed exactly as the slice composes them: the acceptance ─────────────────────────────
{
  const base = {
    layoutParams: { composition: 'diagonal-grid', accumulation: false, accumulationOptics: 0.01 },
    lockedParams: {},
    armedMode: null,
    armedMotion: null,
    kineticVoiceId: null,
    paletteId: 'praystation',
    paletteOverrides: null,
  };
  let visits = {};
  let fromId = null;
  for (const scope of SCOPE_CYCLE) {
    const rng = mkRng(9000 + SCOPE_CYCLE.indexOf(scope));
    visits = {};
    fromId = null;
    for (let flip = 0; flip < 240; flip++) {
      const walk = dealLanding(rng, { fromId, visits });
      const eff = effectiveChapterScope(walk.chapterId, scope);
      const deck = chapterScopeDeck(walk.chapterId, eff.scope);
      const own = chapterDeck(walk.chapterId);
      const look = lookPass(base, rng, {
        looks: deck.looks,
        pool: deck.poolKind,
        sets: deck.sets,
        records: deck.records,
      });
      assert.ok(own.looks.includes(look.lookId), `${walk.chapterId}@${scope}: the dealt look is the chapter's`);
      const poolIds = Object.keys(look.enabledAssets).filter((k) => look.enabledAssets[k]);
      assert.ok(poolIds.length > 0, `${walk.chapterId}@${scope}: the pool is never empty`);
      assert.ok(
        poolIds.every((id) => own.assets.includes(id)),
        `${walk.chapterId}@${scope}: no cross-chapter asset in the pool`,
      );
      const dealtLook = deck.looks.find((l) => l.id === look.lookId);
      if (deck.poolKind === 'sets') {
        // the sets deal was never look-coherent (it is the pre-#1767 curated deal, labelled coherent:false
        // in kineticSweep): the invariant here is wholeness — the pool is exactly one contained set.
        assert.ok(
          deck.sets.some((set) => set.length === poolIds.length && set.every((id) => poolIds.includes(id))),
          `${walk.chapterId}@${scope}: the pool is one whole curated set of the chapter's`,
        );
      } else {
        assert.ok(
          poolIds.every((id) => dealtLook.categories.includes(deck.records.find((r) => r.id === id).category)),
          `${walk.chapterId}@${scope}: the pool stays coherent with ${look.lookId}'s pairing`,
        );
      }
      const mid = { ...base, layoutParams: look.layoutParams };
      const voice = voicePass(mid, rng, { deck: deck.voices });
      assert.ok(own.voices.includes(voice.voiceId), `${walk.chapterId}@${scope}: the dealt voice is the chapter's`);
      const dealtVoice = deck.voices.find((v) => v.id === voice.voiceId);
      if (!dealtVoice.accumulation)
        for (const k of ACCUM_KEYS)
          assert.deepEqual(
            voice.layoutParams[k],
            look.layoutParams[k],
            `${walk.chapterId}@${scope}: pigment freeze — a quiet voice never re-rolls ${k}`,
          );
      visits = { ...visits, [walk.chapterId]: (visits[walk.chapterId] || 0) + 1 };
      fromId = walk.chapterId;
    }
  }
}

// ── 6. through the store: the landing is state, the passes stay inside it, CHAOS leaves the book ──────────────────
{
  assert.equal(S().kineticChapterId, null, 'a fresh session stands in no chapter');
  const depth = S().historyUndoStack.length;
  S().kineticLookPass();
  assert.equal(S().historyUndoStack.length, depth + 1, 'the landing + look deal is one undo step');
  const landing = S().kineticLanding;
  assert.ok(landing && landing.chapterId === S().kineticChapterId, 'the record names the standing chapter');
  assert.equal(landing.path[landing.path.length - 1], landing.chapterId, 'the recorded walk ends on the landing');
  assert.equal(S().kineticChapterVisits[landing.chapterId], 1, 'the ledger counted the visit');
  assert.ok(
    chapterLooks(landing.chapterId).some((l) => l.id === S().layoutParams.composition),
    'the dealt look belongs to the landed chapter',
  );
  const poolIds = Object.keys(S().enabledAssets).filter((k) => S().enabledAssets[k]);
  assert.ok(
    poolIds.every((id) => chapterAssets(landing.chapterId).includes(id)),
    'the dealt pool belongs to the landed chapter',
  );
  S().kineticVoicePass();
  assert.ok(
    chapterVoices(landing.chapterId).some((v) => v.id === S().kineticVoiceId),
    'the warm voice pass deals inside the standing chapter',
  );

  // OFF scope, from a clean book: Now deals at OFF itself; every other chapter confesses a re-deal at MED —
  // and whichever lands, its deals still resolve inside it (never a borrow).
  for (let i = 0; i < 6; i++) {
    useStore.setState({ startupMode: 'off', kineticChapterId: null, kineticChapterVisits: {}, kineticLanding: null });
    S().kineticLookPass();
    const l2 = S().kineticLanding;
    assert.equal(l2.scope, 'off', "the record keeps the performer's scope");
    if (l2.chapterId === 'now') {
      assert.deepEqual(
        { s: l2.dealtScope, r: l2.redealt },
        { s: 'off', r: false },
        'Now deals at OFF, no confession needed',
      );
    } else {
      assert.deepEqual(
        { s: l2.dealtScope, r: l2.redealt },
        { s: 'med', r: true },
        `${l2.chapterId}@OFF: the honest path — re-dealt at MED, confessed`,
      );
    }
    assert.ok(
      chapterLooks(l2.chapterId).some((l) => l.id === S().layoutParams.composition),
      `${l2.chapterId}@OFF: the dealt look is still the chapter's own`,
    );
  }
  useStore.setState({ startupMode: 'koz' });

  S().kineticRoll();
  assert.equal(S().kineticChapterId, null, 'CHAOS leaves the book: no chapter stands after the roll');
  assert.equal(S().kineticLanding, null, 'the landing record leaves with it');
}

console.log('chapterWalk.selfcheck: ok (#1855 — the landing: novelty walk, chapter ∩ scope deals, honest re-deal)');
