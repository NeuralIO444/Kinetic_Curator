// constructRules.selfcheck.mjs — #2108 (constructs, slice 3): the styles' construct vocabularies, as data.
//
//   1. every Canon style names a small vocabulary, and every id in it is a real pool asset
//   2. the vocabulary took its OWN slot: `families` (the pack-family slot chapter decks read) is untouched
//   3. every style's rule resolves against the real pool, and can grow (a primitive with two or more points)
//   4. every style assembles and draws: 12–16 pieces, only its own vocabulary, a tile the pool's door keeps
//   5. the artist's hand-edited ATTACH points win over the shape's; a missing primitive shrinks the rule
import assert from 'node:assert/strict';
import {
  constructRule,
  constructVocabularyIds,
  CONSTRUCT_STYLE_IDS,
  QUARTER_TURNS,
  FREE_TURNS,
} from './constructRules.js';
import { assembleConstruct, constructTile, CONSTRUCT_MIN_PARTS, CONSTRUCT_MAX_PARTS } from './constructAssembler.js';
import { autoAttachPoints } from './autoAttach.js';
import { CANON_STYLES, CANON_STYLE_IDS } from '../data/canon/styles.js';
import { ASSETS } from '../data/assets/index.js';
import { sanitizeOverlay } from '../assets/overlay.js';
import { COST_WARNING_THRESHOLD } from '../assets/ingest.js';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
const byId = new Map(ASSETS.map((a) => [a.id, a]));
const find = (id) => byId.get(id);

// 1 — every style names a small vocabulary of real pool assets.
{
  assert.deepEqual([...CONSTRUCT_STYLE_IDS], [...CANON_STYLE_IDS], 'all eleven styles carry a vocabulary');
  const all = new Set();
  for (const s of CANON_STYLES) {
    const ids = s.assets.primitives;
    assert.ok(ids.length >= 3 && ids.length <= 6, `${s.id}: a small vocabulary (${ids.length})`);
    assert.equal(new Set(ids).size, ids.length, `${s.id}: no primitive named twice`);
    for (const id of ids) {
      assert.ok(byId.has(id), `${s.id}: ${id} is a real pool asset`);
      all.add(id);
    }
    assert.ok(Object.isFrozen(ids));
    assert.ok(s.assets.turns === 'quarter' || s.assets.turns === 'free');
    assert.deepEqual(constructVocabularyIds(s.id), [...ids]);
  }
  assert.ok(all.size <= 60, `the dealt set stays small (${all.size} primitives across eleven styles)`);
  ok(`eleven styles, ${all.size} primitives in all, every one a real pool asset`);
}

// 2 — `families` is the pack-family slot. #2105 ruling A fills it for the five single-owner packs only;
//      the five shared-pack styles stay empty. Anything else changing it is a deliberate ruling, not drift.
{
  const ruled = {
    marks: ['marks'],
    swiss: ['letterforms'],
    engraved: ['haeckel'],
    techno: ['micro-hud'],
    pixel: ['pixel-glyphs'],
    grunge: ['riso'],
  };
  for (const s of CANON_STYLES) {
    assert.deepEqual([...s.assets.families], ruled[s.id] || [], `${s.id}: families match the #2105 ruling`);
  }
  ok('the pack-family slot matches the #2105 ruling (six claim a pack, five stay empty)');
}

// 3 — every rule resolves against the real pool and can grow.
{
  for (const id of CANON_STYLE_IDS) {
    const rule = constructRule(id, find);
    assert.ok(rule && rule.style === id);
    assert.equal(rule.vocabulary.length, constructVocabularyIds(id).length);
    assert.ok(
      rule.vocabulary.every((v) => v.points.length > 0),
      `${id}: every primitive carries a point`,
    );
    assert.ok(
      rule.vocabulary.some((v) => v.points.length > 1),
      `${id}: a primitive with two points (it can grow)`,
    );
    const free = CANON_STYLES.find((s) => s.id === id).assets.turns === 'free';
    assert.deepEqual(rule.rotations, [...(free ? FREE_TURNS : QUARTER_TURNS)]);
  }
  assert.equal(constructRule('no-such-style', find), null);
  assert.equal(constructRule('bauhaus', null), null);
  assert.equal(
    constructRule('bauhaus', () => undefined),
    null,
    'none of the vocabulary in the pool: no rule',
  );
  ok('every style resolves to a rule that can grow; an unknown style or an empty pool has none');
}

// 4 — every style assembles and draws from its own vocabulary alone.
{
  let worstCost = 0;
  for (const id of CANON_STYLE_IDS) {
    const rule = constructRule(id, find);
    const allowed = new Set(constructVocabularyIds(id));
    for (let i = 0; i < 40; i++) {
      const rec = assembleConstruct({ ...rule, seed: (i * 2246822519 + 7) >>> 0 });
      assert.ok(rec && rec.style === id);
      assert.ok(rec.parts.length >= CONSTRUCT_MIN_PARTS && rec.parts.length <= CONSTRUCT_MAX_PARTS);
      assert.ok(
        rec.parts.every((p) => allowed.has(p.asset)),
        `${id}: nothing outside its own vocabulary`,
      );
      assert.ok(
        rec.parts.every((p) => rule.rotations.includes(p.r)),
        `${id}: only the style's turns`,
      );
      const tile = constructTile(rec, (a) => find(a)?.svg);
      assert.ok(tile, `${id}: the tile draws`);
      const [kept] = sanitizeOverlay([tile]);
      assert.ok(kept && kept.svg === tile.svg, `${id}: the pool's door keeps the tile whole`);
      worstCost = Math.max(worstCost, tile.cost.score);
    }
  }
  assert.ok(worstCost < COST_WARNING_THRESHOLD, `no dealt construct crosses the cost line (worst ${worstCost})`);
  ok(`440 constructs across eleven styles assemble and draw (worst cost ${worstCost} of ${COST_WARNING_THRESHOLD})`);
}

// 5 — the artist's points win; a missing primitive shrinks the rule, never breaks it.
{
  const mine = [
    { x: 10, y: 10 },
    { x: 90, y: 90 },
  ];
  const rule = constructRule('bauhaus', find, { geo_circle_01: mine });
  assert.deepEqual(rule.vocabulary.find((v) => v.id === 'geo_circle_01').points, mine);
  assert.deepEqual(
    rule.vocabulary.find((v) => v.id === 'geo_tri_01').points,
    autoAttachPoints(find('geo_tri_01').svg).map((p) => ({ x: p.x, y: p.y })),
  );
  const fewer = constructRule('bauhaus', (id) => (id === 'geo_tri_01' ? undefined : find(id)));
  assert.equal(fewer.vocabulary.length, rule.vocabulary.length - 1);
  assert.ok(!fewer.vocabulary.some((v) => v.id === 'geo_tri_01'));
  ok("hand-edited ATTACH points win over the shape's; a missing primitive is left out of the rule");
}

console.log(`constructRules.selfcheck: OK (${checks} checks)`);
