// risoGrammar.selfcheck.mjs — RISO icon grammar (#2008).
// Pins: determinism (same seed → same icon set, byte-level), kit/rule census,
// marks-not-letterforms, the recompute discipline (the materialized catalogue
// equals a fresh recomputation — stored-vs-recomputed settled in the staging
// report: the seed is the artefact, the stamps are derived), and the asset
// shape the stamp bake consumes.
import assert from 'node:assert/strict';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const {
  composeRisoIcon,
  risoIconRecord,
  risoIconSet,
  risoSetHash,
  risoIconId,
  RISO_KIT,
  RISO_RULES,
  RISO_CENSUS,
  RISO_MAX_PARTS,
  RISO_CANON_SEED,
  RISO_ICON_SET_SIZE,
  RISO_GRAMMAR_VERSION,
} = await import('./risoGrammar.mjs');
const { ASSETS_RISO } = await import('../data/assets/assets-riso.js');
const { ASSETS } = await import('../data/assets/index.js');

ok('census pins: kit, rules, part bound, tiers, set size', () => {
  assert.deepEqual(
    { ...RISO_CENSUS },
    { kit: 8, rules: 6, maxParts: 5, sizeTiers: 4, strokeTiers: 3, rotDetents: 4, setSize: 24 },
  );
  assert.deepEqual([...RISO_KIT], ['disc', 'ring', 'target', 'plus', 'cross', 'pixel', 'arc', 'wedge']);
  assert.deepEqual([...RISO_RULES], ['single', 'pair', 'stack', 'orbit', 'grid', 'frame']);
  assert.equal(RISO_GRAMMAR_VERSION, 1);
});

ok('determinism: same seed → same icon set, byte-level (hash pinned)', () => {
  assert.equal(risoSetHash(), 4138279804, 'canonical set hash — grammar movement must re-pin with cause');
  assert.equal(risoSetHash(RISO_CANON_SEED, RISO_ICON_SET_SIZE), risoSetHash());
  const a = risoIconSet(777, 16);
  const b = risoIconSet(777, 16);
  assert.deepEqual(a, b);
  assert.equal(risoSetHash(777, 16), risoSetHash(777, 16));
});

ok('determinism: a different seed composes a different family', () => {
  assert.notEqual(risoSetHash(777, 16), risoSetHash(778, 16));
  assert.notEqual(composeRisoIcon(42, 3).svg, composeRisoIcon(43, 3).svg);
});

ok('every icon: parts within the bound, kit/rule members only, integer geometry', () => {
  for (const seed of [1, 7, 2008, 99991]) {
    for (let i = 0; i < 32; i++) {
      const icon = composeRisoIcon(seed, i);
      assert.ok(RISO_RULES.includes(icon.rule), `rule ${icon.rule}`);
      assert.ok(icon.parts.length >= 1 && icon.parts.length <= RISO_MAX_PARTS, `parts ${icon.parts.length}`);
      for (const part of icon.parts) assert.ok(RISO_KIT.includes(part.kit), `kit ${part.kit}`);
      assert.ok(!/\d\.\d/.test(icon.svg), `no float formatting in ${icon.svg.slice(0, 60)}`);
    }
  }
});

ok('marks, not letterforms: no <text>, no glyph field, geometric primitives only', () => {
  for (const rec of risoIconSet(RISO_CANON_SEED, RISO_ICON_SET_SIZE)) {
    assert.ok(!rec.svg.includes('<text'), rec.id);
    assert.ok(!('glyph' in rec), rec.id);
  }
});

ok('asset shape: the record the stamp bake consumes, ids stable and unique', () => {
  const set = risoIconSet(RISO_CANON_SEED, RISO_ICON_SET_SIZE);
  assert.equal(new Set(set.map((r) => r.id)).size, set.length);
  for (const rec of set) {
    assert.equal(rec.id, risoIconId(rec.riso.seed, rec.riso.index));
    for (const k of ['id', 'category', 'tags', 'weight', 'density', 'scale', 'rotate', 'svg'])
      assert.ok(k in rec, `${rec.id} missing ${k}`);
    assert.ok(Array.isArray(rec.scale) && rec.scale.length === 2);
    assert.ok(rec.svg.includes('var(--ink)') || rec.svg.includes('var(--accent)'));
  }
});

ok('recompute discipline: the materialized catalogue equals a fresh recomputation', () => {
  assert.deepEqual(ASSETS_RISO, risoIconSet(RISO_CANON_SEED, RISO_ICON_SET_SIZE));
  const inLibrary = ASSETS.filter((a) => a.id.startsWith('riso_'));
  assert.equal(inLibrary.length, RISO_ICON_SET_SIZE, 'the catalogue carries exactly the canonical set');
  assert.deepEqual(
    inLibrary.map((a) => a.id),
    ASSETS_RISO.map((a) => a.id),
  );
});

ok('dealing exclusion: no riso icon is in the authored pool (ASSETS_AUTHORED untouched)', async () => {
  const { ASSETS_AUTHORED } = await import('../data/assets/index.js');
  assert.ok(!ASSETS_AUTHORED.some((a) => a.id.startsWith('riso_')), 'composed icons are not authored content');
});

console.log(`risoGrammar.selfcheck: ${n} checks passed`);
