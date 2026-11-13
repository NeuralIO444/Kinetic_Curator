// node src/data/canon/canon.selfcheck.mjs
// #2044 (Canon S1) — one style record, declared once, and a style dimension in taste. Pins:
//   1. the probe: one style resolves whole (looks, voices, palettes) from the Canon alone
//   2. the four restating stores IMPORT the vocabulary — by value and by source (no literal survives)
//   3. the dealt catalogues are byte-identical to before the Canon (70 looks, 72 deck voices, chapter decks)
//   4. every record carries an art-history identity; the names policy holds (figures never reach a label)
//   5. a kept take's ledger row carries its style id, and keeps aggregate by style
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANON_STYLES,
  CANON_STYLE_IDS,
  canonStyle,
  canonStyles,
  canonStyleRecord,
  canonLookGroups,
  canonFamilyPairing,
  canonChapterAxes,
  canonChapterForStyle,
  canonStyleOfLook,
} from './index.js';
import { STYLES } from '../assetStyle.js';
import { STYLE_LOOK_GROUPS, STYLE_LOOKS } from '../styleLooks.js';
import { FAMILY_PAIRING, VOICE_DECK } from '../voiceDeck.js';
import { CHAPTERS, chapterDeck, chapterLooks, chapterVoices } from '../chapters.js';
import { COMPOSITION_PRESETS, PRESET_GROUPS } from '../presets.js';
import { PALETTES } from '../palettes.js';
import { ledgerRow, isLedgerRow, serializeRow, parseLedger } from '../../curator/tasteLedger.js';
import {
  styleContextOf,
  styleContextFor,
  isStyleContext,
  sanitizeStyleContext,
  styleTerms,
  keepsByStyle,
} from '../../curator/tasteStyle.js';
import { captureFavorite, sanitizeFavorite } from '../../state/slices/davisSlice.js';
import { featureTerms } from '../../curator/tasteHead.js';
import { recipeFeatures, FEATURES_VERSION } from '../../curator/recipeFeatures.js';

const here = dirname(fileURLToPath(import.meta.url));
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

// ── 1. the probe: "show me the Swiss style", whole, from the one declaration ─────────────────────────────────
{
  const swiss = canonStyle('swiss');
  assert.equal(swiss.label, 'Swiss');
  assert.equal(swiss.identity.movement, 'International Typographic Style');
  assert.ok(swiss.looks.length >= 4, 'swiss lists its looks');
  assert.ok(swiss.voices.length >= 6, 'swiss lists its voices');
  assert.ok(swiss.palettes.length >= 4, 'swiss lists its palettes');
  assert.equal(swiss.chapter, 'swiss');
  // the lists are the catalogues' own members — the same answer the Book derives
  assert.deepEqual(
    swiss.looks,
    chapterLooks('swiss').map((l) => l.id),
  );
  assert.deepEqual(
    swiss.voices,
    chapterVoices('swiss').map((v) => v.id),
  );
  const palIds = new Set(PALETTES.map((p) => p.id));
  for (const s of canonStyles()) {
    assert.ok(
      s.palettes.every((p) => palIds.has(p)),
      `${s.id}: every palette is in the catalog`,
    );
    assert.ok(
      s.looks.every((id) => COMPOSITION_PRESETS.some((p) => p.id === id)),
      `${s.id}: looks resolve`,
    );
  }
  // every style Look and every deck voice is reachable through the Canon — nothing is orphaned from it
  const viaCanon = new Set(canonStyles().flatMap((s) => s.looks));
  for (const l of STYLE_LOOKS) assert.ok(viaCanon.has(l.id), `${l.id}: reachable through its Canon style`);
  const voicesViaCanon = new Set(canonStyles().flatMap((s) => s.voices));
  for (const v of VOICE_DECK) assert.ok(voicesViaCanon.has(v.id), `${v.id}: reachable through a Canon style`);
  assert.equal(canonStyle('nope'), null);
  // a style with no Look group or voice family is still a whole record (its members are honestly empty or paired)
  const techno = canonStyle('techno');
  assert.deepEqual(techno.looks, []);
  assert.equal(techno.chapter, null);
  assert.ok(techno.voices.includes('dark-glass'), 'techno finds the flagship that pairs with it');
}

// ── 2. the four stores import the vocabulary ────────────────────────────────────────────────────────────────
{
  assert.equal(STYLES, CANON_STYLE_IDS, 'assetStyle STYLES is the Canon array itself');
  assert.equal(STYLES.length, 11);
  assert.deepEqual(STYLE_LOOK_GROUPS, canonLookGroups(), 'styleLooks groups are the Canon rows');
  assert.equal(STYLE_LOOK_GROUPS.length, 8);
  assert.deepEqual(FAMILY_PAIRING, canonFamilyPairing(), 'voiceDeck pairing is the Canon rows');
  assert.deepEqual(
    Object.keys(FAMILY_PAIRING),
    STYLE_LOOK_GROUPS.map((g) => g.id),
    'pairing keys, menu order',
  );
  for (const c of CHAPTERS) {
    if (c.id === 'now') {
      assert.equal(c.style, null, 'Now stands on the whole library');
      assert.deepEqual(c.assetStyles, [...STYLES]);
      continue;
    }
    assert.ok(canonStyleRecord(c.style), `${c.id}: names a Canon style`);
    const axes = canonChapterAxes(c.style);
    for (const k of Object.keys(axes)) assert.deepEqual([...c[k]], axes[k], `${c.id}.${k} is the Canon's`);
    assert.equal(canonChapterForStyle(c.style), c);
  }
  // by source: the literal lists are gone from the four files (a retyped vocabulary fails here)
  const src = (f) => readFileSync(join(here, '..', f), 'utf8');
  assert.match(src('assetStyle.js'), /export const STYLES = CANON_STYLE_IDS;/);
  assert.match(src('styleLooks.js'), /export const STYLE_LOOK_GROUPS = canonLookGroups\(\);/);
  assert.match(src('voiceDeck.js'), /export const FAMILY_PAIRING = Object\.freeze\(canonFamilyPairing\(\)\);/);
  const chaptersSrc = src('chapters.js');
  assert.equal(
    (chaptersSrc.match(/\.\.\.canonChapterAxes\('/g) || []).length,
    8,
    'eight movement chapters, eight spreads',
  );
  assert.doesNotMatch(chaptersSrc, /(lookGroups|assetStyles|voiceStyles): \['/, 'no chapter retypes a style id');
  for (const f of ['assetStyle.js', 'styleLooks.js', 'voiceDeck.js', 'chapters.js'])
    assert.match(src(f), /from '\.\/canon\/styles\.js'/, `${f} imports the Canon`);
  // the declaration is a leaf — it imports nothing, so no catalogue can reach it through a cycle
  assert.doesNotMatch(readFileSync(join(here, 'styles.js'), 'utf8'), /^import /m);
}

// ── 3. the dealt catalogues are byte-identical to before the Canon (hashes taken on main @ 6d37f9b) ────────────
{
  assert.equal(COMPOSITION_PRESETS.length, 70);
  // #1838 re-pin: the hash moved exactly one field — dusk-flock gained `trailFresh: 0.6`
  // (the trail drive's declared fresh pole). Verified per-record: 1 of 70 differs, that field only.
  assert.equal(sha(COMPOSITION_PRESETS), '61c50037062a6337', 'the 70 looks are byte-identical');
  assert.equal(sha(PRESET_GROUPS), '309f106f646c7efe', 'the 16 look groups are byte-identical');
  assert.equal(VOICE_DECK.length, 72);
  // #2150 re-pin: the deck hash moved on the type-exclusivity ruling — verified per-voice:
  // 17 of 72 voices differ (the 4 layout tiles lost only their glyph ids; 13 family
  // wardrobes re-drew over the glyph-narrowed pool) and no voice wears a glyph now.
  assert.equal(sha(VOICE_DECK), '556e0e2b3e55fe04', 'the 72 deck voices are byte-identical');
  assert.equal(
    sha(CHAPTERS.map((c) => [c.id, chapterDeck(c)])),
    '44abd0199a5dc9c8', // #2150 re-pin: chapter decks differ by exactly the glyph membership (swiss −36, grunge −3, now −47)
    'every chapter deck is byte-identical',
  );
  assert.equal(sha(STYLES), '4f28f882a61c232f');
  assert.equal(sha(STYLE_LOOK_GROUPS), '6b270a3882dffa1f');
  assert.equal(sha(FAMILY_PAIRING), 'c2a789a96df0fd20');
  // the chapter records gained exactly one field (`style`); everything they carried before is unchanged
  const withoutStyle = CHAPTERS.map(({ style: _style, settings: _settings, ...rest }) => rest); // #2046 added `settings`
  assert.equal(
    sha(withoutStyle),
    '8687c7d8965ca546',
    'chapter records are the old records plus `style` (#2044) and `settings` (#2046)',
  );
}

// ── 4. identity + the names policy ──────────────────────────────────────────────────────────────────────────
{
  assert.equal(new Set(CANON_STYLE_IDS).size, CANON_STYLES.length, 'ids are unique');
  const ranks = CANON_STYLES.filter((s) => s.lookGroup).map((s) => s.lookGroup.rank);
  assert.deepEqual(
    [...ranks].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7],
    'menu ranks are a clean 0..7',
  );
  for (const s of CANON_STYLES) {
    assert.ok(Object.isFrozen(s) && Object.isFrozen(s.identity), `${s.id}: frozen`);
    for (const k of ['movement', 'period', 'place', 'note'])
      assert.ok(typeof s.identity[k] === 'string' && s.identity[k].length > 3, `${s.id}: identity.${k}`);
    assert.ok(Array.isArray(s.identity.figures), `${s.id}: identity.figures`);
    assert.equal(!!s.lookGroup, !!s.pairing, `${s.id}: a Look group and a voice family arrive together`);
    // names policy: the surface label never carries a real name
    for (const name of s.identity.figures)
      assert.ok(!s.label.includes(name) && !s.identity.note.includes(name), `${s.id}: ${name} stays off the surface`);
  }
}

// ── 5. taste's style dimension ──────────────────────────────────────────────────────────────────────────────
{
  const opLook = canonStyle('op').looks[0];
  const ctx = styleContextOf({ lookId: opLook, voiceId: 'swarm' });
  assert.deepEqual(ctx, { id: 'op', pairs: ctx.pairs, voice: ['memphis', 'japanese'], chapter: 'op-art' });
  assert.ok(ctx.pairs.includes('op'));
  assert.ok(isStyleContext(ctx));
  assert.equal(canonStyleOfLook(opLook), 'op');
  // absent stays absent
  assert.equal(styleContextOf({}), null);
  assert.equal(styleContextOf({ lookId: 'no-such-look' }), null);
  assert.equal(styleContextFor(null), null);
  // a Look outside the style groups has no style id — its pairing is recorded, never promoted
  const plain = COMPOSITION_PRESETS.find((p) => !canonStyleRecord(p.group));
  const plainCtx = styleContextOf({ lookId: plain.id });
  assert.equal(plainCtx.id, null);
  assert.equal(plainCtx.chapter, null);
  assert.deepEqual(plainCtx.pairs, plain.styles);
  // the trust boundary
  assert.equal(sanitizeStyleContext({ id: 'vaporwave', pairs: [], voice: [], chapter: null }), null);
  assert.equal(
    sanitizeStyleContext({ id: 'op', pairs: ['op'], voice: [], chapter: 'grunge' }),
    null,
    'chapter must be the style’s',
  );
  assert.equal(
    sanitizeStyleContext({ id: null, pairs: [], voice: [], chapter: null }),
    null,
    'an empty stamp is no stamp',
  );
  assert.equal(sanitizeStyleContext('op'), null);

  // captureFavorite stamps it; sanitizeFavorite and the ledger carry it
  const state = (lookId, voiceId) => ({
    seed: 7,
    seedOffsets: {},
    layoutParams: { mode: 'grid', composition: lookId },
    kineticVoiceId: voiceId,
    enabledAssets: {},
  });
  const fav = captureFavorite(state(opLook, 'swarm'), 'hydra');
  assert.deepEqual(fav.style, ctx, 'the keep record carries the style stamp');
  assert.deepEqual(sanitizeFavorite(fav).style, ctx, 'the stamp survives the keep sanitizer');
  const row = ledgerRow(fav, 'canon');
  assert.equal(row.style.id, 'op', "a kept take's ledger row carries its style id");
  assert.equal(row.style.chapter, 'op-art');
  assert.ok(isLedgerRow(row));
  const bare = captureFavorite({ seed: 1, layoutParams: { mode: 'grid' }, enabledAssets: {} }, 'hydra');
  assert.ok(!('style' in bare), 'no known Look or voice — no stamp');
  assert.ok(!('style' in ledgerRow(bare, null)), 'and the ledger line writes no field');
  assert.ok(
    !isLedgerRow({ ...row, style: { id: 'vaporwave', pairs: [], voice: [], chapter: null } }),
    'a false stamp is not a row',
  );
  assert.ok(isLedgerRow((({ style: _s, ...legacy }) => legacy)(row)), 'a legacy line (no stamp) still reads');

  // aggregate keeps by style, through the real JSONL round trip
  const swissLook = canonStyle('swiss').looks[0];
  const text = [
    captureFavorite(state(opLook, 'swarm'), 'hydra'),
    captureFavorite(state(opLook, null), 'hydra'),
    captureFavorite(state(swissLook, null), 'transit'),
    bare,
  ]
    .map((f) => serializeRow(ledgerRow(f, null)))
    .join('');
  const { rows, skipped } = parseLedger(text, () => {});
  assert.equal(skipped, 0);
  const byStyle = keepsByStyle(rows);
  assert.deepEqual(byStyle, { counts: { op: 2, swiss: 1 }, unstyled: 1, total: 4 }, 'keeps count by style');
  assert.deepEqual(keepsByStyle(rows, 'chapter').counts, { 'op-art': 2, swiss: 1 }, 'and by chapter');
  assert.deepEqual(keepsByStyle(rows, 'voice').counts, { memphis: 1, japanese: 1 }, 'and by the voice’s styles');
  assert.throws(() => keepsByStyle(rows, 'mood'));

  // the style term speaks the taste vocabulary's one term rule…
  assert.deepEqual(styleTerms(ctx).slice(0, 1), ['style=op']);
  assert.ok(styleTerms(ctx).includes('voiceStyle=japanese') && styleTerms(ctx).includes('chapter=op-art'));
  assert.deepEqual(styleTerms(null), []);
  assert.deepEqual(
    featureTerms({ style: ctx.id, stylePairs: ctx.pairs, voiceStyle: ctx.voice, chapter: ctx.chapter }),
    styleTerms(ctx),
    'styleTerms is exactly what the term rule makes of the stamp',
  );
  // …and the trained head's feature vector is untouched (no silent FEATURES_VERSION bump — see tasteStyle.js)
  assert.equal(FEATURES_VERSION, 4);
  assert.ok(!('style' in recipeFeatures({ layoutParams: { composition: opLook } })));
}

console.log(
  `canon.selfcheck: ok — ${CANON_STYLES.length} styles declared once; 70 looks / 72 voices / chapter decks byte-identical; keeps count by style`,
);
