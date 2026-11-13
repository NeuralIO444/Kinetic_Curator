// node src/data/canon/canonSettings.selfcheck.mjs
// #2046 (Canon S4) — the Nash Book carries settings and gets read back. Pins:
//   1. the probe: a chapter record carries applicable settings (palette / motion / feel), not only pointers
//   2. the settings are drawn from the chapter's Canon style — measured from its own looks and voices
//   3. the read-back: with a chapter standing, the taste scorer's output differs from the no-chapter case in a
//      pinned way; with none standing (or Now) it is exactly what it was — same scores, same rng draws
//   4. the standing behaviour is untouched: chapter decks byte-identical; the pick still goes through the curator
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTERS, chapterById, chapterDeck, chapterSettings, chapterLooks } from '../chapters.js';
import { canonStyleSettings, feelAffinity, SETTINGS_MOTION_KEYS } from './settings.js';
import { canonStyle, canonMotion, CANON_STYLE_IDS } from './index.js';
import { COMPOSITION_PRESETS } from '../presets.js';
import { VOICE_DECK } from '../voiceDeck.js';
import { PALETTES } from '../palettes.js';
import { normalizeLayoutParams, BEHAVE_MODES, BLEND_MODES, PALETTE_SHIFTS } from '../layout-modes.js';
import { extractFeatures, FEATURE_KEYS } from '../../curator/tasteFeatures.js';
import * as taste from '../../curator/taste.js';
import { TASTE_FEATURES, getPersonaTaste } from '../../curator/personaTastes.js';
import { pickCurated } from '../../curator/curate.js';

const here = dirname(fileURLToPath(import.meta.url));
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const look = (id) => normalizeLayoutParams(COMPOSITION_PRESETS.find((l) => l.id === id).params);
const firstLookOf = (style) => look(canonStyle(style).looks[0]);

// ── 1. the probe: a chapter carries applicable settings ─────────────────────────────────────────────────────
{
  const paletteIds = new Set(PALETTES.map((p) => p.id));
  const movement = CHAPTERS.filter((c) => c.id !== 'now');
  assert.equal(movement.length, 8);
  for (const c of movement) {
    const s = c.settings;
    assert.ok(s, `${c.id}: carries settings`);
    assert.equal(chapterSettings(c.id), s, 'the read-back door returns the record’s own settings');
    assert.ok(Object.isFrozen(s) && Object.isFrozen(s.feel) && Object.isFrozen(s.palette.ids), `${c.id}: deep-frozen`);
    // palette behaviour — values the instrument can apply as they stand
    assert.ok(s.palette.ids.length >= 1 && s.palette.ids.every((id) => paletteIds.has(id)), `${c.id}: real palettes`);
    assert.ok(PALETTE_SHIFTS.includes(s.palette.shift), `${c.id}: palette shift is a real mode (${s.palette.shift})`);
    assert.ok(BLEND_MODES.includes(s.palette.blend), `${c.id}: blend is a real mode`);
    assert.ok(s.palette.ground >= 0 && s.palette.ground <= 1, `${c.id}: ground luminance`);
    // motion — real behaviours, real units, real layouts
    assert.ok(BEHAVE_MODES.includes(s.motion.behave), `${c.id}: behave is a real behaviour`);
    for (const k of SETTINGS_MOTION_KEYS)
      assert.ok(Number.isFinite(s.motion[k]) && s.motion[k] >= 0, `${c.id}: motion.${k}`);
    assert.ok(s.motion.layouts.length >= 1 && s.motion.layouts.every((id) => canonMotion(id)?.kind === 'layout'));
    // feel — the 19 taste features, in the space the curator scores in
    assert.deepEqual(Object.keys(s.feel), [...FEATURE_KEYS]);
    assert.deepEqual([...FEATURE_KEYS], [...TASTE_FEATURES], 'the feel speaks the persona vocabulary');
    for (const v of Object.values(s.feel)) assert.ok(v >= 0 && v <= 1);
    assert.ok(s.basis.looks >= 4 && s.basis.voices >= 6, `${c.id}: measured from its real members`);
  }
  // Now stands on the whole library: no style, no settings — and the door says so honestly
  assert.equal(chapterById('now').settings, null);
  assert.equal(chapterSettings('now'), null);
  assert.equal(chapterSettings(null), null);
  assert.equal(chapterSettings('no-such-chapter'), null);
  // the chapters are distinguishable by their settings — eight chapters, eight feels
  assert.equal(new Set(movement.map((c) => sha(c.settings.feel))).size, 8);
}

// ── 2. drawn from the Canon style, by measurement ───────────────────────────────────────────────────────────
{
  for (const c of CHAPTERS.filter((x) => x.style)) {
    assert.equal(c.settings, canonStyleSettings(c.style), `${c.id}: the settings ARE its Canon style’s`);
    // re-measured from the catalogues, the same numbers fall out (deterministic, nothing typed in)
    assert.deepEqual(canonStyleSettings(c.style, { looks: COMPOSITION_PRESETS, deck: VOICE_DECK }), c.settings);
    const own = chapterLooks(c);
    assert.equal(c.settings.basis.looks, own.length);
    // spot-check one number by hand: markDensity is the mean over the style's looks and family voices
    const recipes = [
      ...own.map((l) => l.params),
      ...VOICE_DECK.filter((v) => v.kind === 'family' && v.def.family === c.style).map((v) => v.def.params),
    ].map((p) => extractFeatures(normalizeLayoutParams(p)).markDensity);
    const mean = recipes.reduce((a, b) => a + b, 0) / recipes.length;
    assert.ok(Math.abs(c.settings.feel.markDensity - mean) < 1e-4, `${c.id}: markDensity is the measured mean`);
  }
  // a style's own look sits nearer its feel than the average outsider does
  for (const c of CHAPTERS.filter((x) => x.style)) {
    const mine = chapterLooks(c).map((l) => feelAffinity(extractFeatures(look(l.id)), c.settings.feel));
    const others = COMPOSITION_PRESETS.filter((l) => l.group !== c.style).map((l) =>
      feelAffinity(extractFeatures(look(l.id)), c.settings.feel),
    );
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    assert.ok(avg(mine) > avg(others), `${c.id}: its looks read like it`);
  }
  // styles with nothing to measure are an honest blank, and unknown ids are null
  for (const id of CANON_STYLE_IDS)
    assert.equal(
      canonStyleSettings(id) === null,
      canonStyle(id).looks.length === 0 && !VOICE_DECK.some((v) => v.def.family === id),
    );
  assert.equal(canonStyleSettings('techno'), null);
  assert.equal(canonStyleSettings('vaporwave'), null);
  assert.equal(feelAffinity({}, null), null);
  assert.equal(
    feelAffinity(CHAPTERS[1].settings.feel, CHAPTERS[1].settings.feel),
    1,
    'a feel is at distance 0 from itself',
  );
}

// ── 3. the read-back ────────────────────────────────────────────────────────────────────────────────────────
{
  const { pickPersona, chapterLeans, scoreCandidate, CHAPTER_FEEL_GAIN } = taste;
  assert.equal(CHAPTER_FEEL_GAIN, 0.5);
  const weights = getPersonaTaste('davis').weights;
  const grunge = firstLookOf('grunge');
  const memphis = firstLookOf('memphis');
  const pool = [grunge, memphis];
  const top = () => 0; // a zero roll takes the top-scored candidate — the pick is then a pure reading of the scores

  // (a) no chapter: the persona alone decides — Memphis out-scores Grunge for Davis
  const base = pool.map((c) => scoreCandidate(extractFeatures(c), weights));
  assert.ok(base[1] > base[0] && base[1] - base[0] < CHAPTER_FEEL_GAIN, 'a close call the Book can settle');
  assert.equal(pickPersona(pool, 'davis', top), 1);
  assert.equal(pickPersona(pool, 'davis', top, 0.4, {}), 1);
  assert.equal(pickPersona(pool, 'davis', top, 0.4, { chapterFeel: null }), 1);

  // (b) the Grunge chapter standing: the same pool, the same persona, the same roll — the other candidate
  const grungeFeel = chapterSettings('grunge').feel;
  assert.deepEqual(
    chapterLeans(pool.map(extractFeatures), grungeFeel),
    [CHAPTER_FEEL_GAIN, 0],
    'the pool’s nearest gets the full lean',
  );
  assert.equal(
    pickPersona(pool, 'davis', top, 0.4, { chapterFeel: grungeFeel }),
    0,
    'the Book changed what taste picked',
  );
  // …and the Memphis chapter standing agrees with the persona, so the pick holds
  assert.equal(pickPersona(pool, 'davis', top, 0.4, { chapterFeel: chapterSettings('memphis').feel }), 1);

  // (c) across a pool of one look per chapter, each chapter leans hardest toward a look of its own style
  const styles = CHAPTERS.filter((c) => c.style).map((c) => c.style);
  const wide = styles.map(firstLookOf).map(extractFeatures);
  let own = 0;
  for (const c of CHAPTERS.filter((x) => x.style)) {
    const lean = chapterLeans(wide, c.settings.feel);
    assert.equal(Math.max(...lean), CHAPTER_FEEL_GAIN);
    assert.equal(Math.min(...lean), 0);
    if (lean[styles.indexOf(c.style)] === CHAPTER_FEEL_GAIN) own++;
  }
  assert.ok(own >= 5, `${own}/8 chapters rank their own look first in a mixed pool`);

  // (d) nothing standing → exactly nothing: zero lean, and the rng stream is consumed identically
  assert.deepEqual(
    chapterLeans(wide, null),
    wide.map(() => 0),
  );
  assert.deepEqual(
    chapterLeans([wide[0], wide[0]], grungeFeel),
    [0, 0],
    'a pool the chapter cannot tell apart gets no lean',
  );
  const counted = () => {
    let n = 0;
    const rng = () => (n++, 0.37);
    return { rng, calls: () => n };
  };
  const a = counted();
  const b = counted();
  const candidates = styles.map(firstLookOf);
  assert.equal(
    pickPersona(candidates, 'davis', a.rng),
    pickPersona(candidates, 'davis', b.rng, 0.4, { chapterFeel: null }),
  );
  assert.equal(a.calls(), b.calls());
  const c = counted();
  pickPersona(candidates, 'davis', c.rng, 0.4, { chapterFeel: grungeFeel });
  assert.equal(c.calls(), a.calls(), 'a standing chapter changes the scores, never the number of draws');

  // (e) the live path: pickCurated resolves the standing chapter and hands its feel to the engine
  const seen = [];
  const spy = { name: 'spy', status: () => 'active', pick: (_c, _rng, ctx) => (seen.push(ctx), 0) };
  pickCurated([grunge, memphis], spy, top, { chapterId: 'grunge' });
  pickCurated([grunge, memphis], spy, top, { chapterId: 'now' });
  pickCurated([grunge, memphis], spy, top, { chapterId: null });
  pickCurated([grunge, memphis], spy, top);
  assert.equal(seen[0].chapterFeel, grungeFeel);
  assert.deepEqual(
    seen.slice(1).map((x) => x.chapterFeel),
    [null, null, null],
  );
  // an engine written before the Book (two-argument pick) is untouched by the third argument
  const legacy = { name: 'legacy', status: () => 'active', pick: (cands) => cands.length - 1 };
  assert.deepEqual(pickCurated([grunge, memphis], legacy, top, { chapterId: 'grunge' }), { index: 1, curated: true });
  // the CURATE press passes the standing chapter (the one line in the store)
  assert.match(
    readFileSync(join(here, '..', '..', 'state', 'slices', 'layoutSlice.js'), 'utf8'),
    /pickCurated\(candidates, curator, rng, \{\s*refine: refining,\s*chapterId: state\.kineticChapterId,?\s*\}\)/,
  );
}

// ── 4. standing behaviour untouched ─────────────────────────────────────────────────────────────────────────
{
  assert.equal(
    sha(CHAPTERS.map((c) => [c.id, chapterDeck(c)])),
    '44abd0199a5dc9c8', // #2150 re-pin: chapter decks differ by exactly the glyph membership (swiss −36, grunge −3, now −47)
    'every chapter deck is byte-identical',
  );
  assert.equal(sha(COMPOSITION_PRESETS), '61c50037062a6337'); // #1838 re-pin: dusk-flock gained `trailFresh: 0.6` (1 of 70 records, that field only)
  assert.equal(sha(VOICE_DECK), '556e0e2b3e55fe04'); // #2150 re-pin: 17 of 72 voices differ (glyph losses + wardrobe re-draws over the narrowed pool); no voice wears a glyph
  // extractFeatures moved to a leaf — taste.js still exports the same function
  assert.equal(taste.extractFeatures, extractFeatures);
}

console.log(
  'canonSettings.selfcheck: ok — 8 chapters carry measured settings (palette / motion / feel); a standing chapter leans the taste pick; none standing changes nothing',
);
