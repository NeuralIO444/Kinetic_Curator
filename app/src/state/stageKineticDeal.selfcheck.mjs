// node src/state/stageKineticDeal.selfcheck.mjs
// #2544 — the stage KINETIC deal: a pool-dealing press (LOOK pass, CHAOS roll) runs the wide-deal engines
// over the creature and construct adapters, and the hand JOINS THE ROLL (Matt's landing ruling, 2026-11-26).
// ALWAYS IN THE MIX (his gate ruling, same day): no switch — so there is no "off" to A/B against; the
// off-state law is the empty-hand law pinned in 5: when nothing can be dealt, the press is exactly as it was.
//   1. the scope mapping: creatures take the stage's own ladder; constructs take ANY at every stage scope
//   2. a press deals creatures when the library supports them: stage births, tiles enabled, never banked
//   3. a press deals construct recipes for every style in play: assembled, banked, tiles enabled
//   4. no style in play: no construct candidates, no error (empty shelf, below the floor, junk entries)
//   5. the empty-hand law: no dealable creatures and nothing drawable to build from → null, the press untouched
//   6. never dealt twice: a standing creature is skipped; a banked recipe banks nothing new, its tile still joins
//   7. determinism: the same standing state and press number deal the identical hand
//   8. the store presses: LOOK pass and CHAOS roll land the deal in the same commit, counter advancing
//   9. the CONSTRUCTS chip is not the gate: the deal reads it never (its pool-leading behaviour is its own)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useStore } from './store.js';
import { resolveStageDeal, stageDealScopes } from './stageKineticDeal.mjs';
import { CONSTRUCT_STYLE_IDS, constructVocabularyIds } from '../engine/constructRules.js';
import { constructTileId, sanitizeConstructRecord } from '../engine/constructAssembler.js';
import { creatureTileId } from '../engine/creatureTileId.js';
import { sanitizeCreatureRecord } from '../engine/creatureAssembler.js';

const here = dirname(fileURLToPath(import.meta.url));
let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
const S = () => useStore.getState();

const SEED = 1234567;
const base = (over = {}) => ({
  seed: SEED,
  startupMode: 'weak',
  customAssets: [],
  creatureRecords: [],
  stageBirths: [],
  constructRecords: [],
  shapeShelf: [],
  assetAttach: {},
  layoutParams: { composition: null },
  kineticVoiceId: null,
  ...over,
});
const commit = { geo_square_01: true, org_blob_01: true };
// the first Canon style whose vocabulary can put it in play, with its first two shapes kept
const styleInPlay = CONSTRUCT_STYLE_IDS.map((s) => [s, constructVocabularyIds(s)]).find(([, v]) => v.length >= 2);
const [STYLE, VOCAB] = styleInPlay;
const shelf = VOCAB.slice(0, 2).map((asset) => ({ style: STYLE, asset }));

// 1 — the scope mapping (issue item 4, deliberate).
{
  for (const id of ['off', 'weak', 'med', 'koz']) {
    const m = stageDealScopes(id);
    assert.equal(m.creatureScope, id, `stage scope ${id}: the creature deal runs at ${m.creatureScope}`);
    assert.equal(
      m.constructScope,
      'any',
      `stage scope ${id}: the construct deal runs at ${m.constructScope}, never a style`,
    );
  }
  const junk = stageDealScopes('bogus');
  assert.equal(
    junk.creatureScope,
    'weak',
    `an unknown stage scope falls to the adapter default (got ${junk.creatureScope})`,
  );
  assert.equal(junk.constructScope, 'any');
  ok(
    'scope mapping: creature scope = the stage scope (junk → the adapter default); construct scope = ANY at every stage scope',
  );
}

// 2 — creatures deal when the library supports them.
{
  const r = resolveStageDeal(base(), 1, commit);
  assert.ok(r, 'a press with the whole library behind it lands');
  assert.equal(r.creatures.length, 6, `the hand is the wide hand of 6 (measured ${r.creatures.length})`);
  assert.equal((r.stageBirths || []).length, 6, `six stage births stand (measured ${(r.stageBirths || []).length})`);
  assert.ok(!('creatureRecords' in r), 'a dealt creature is never banked by the press — banking stays the keep');
  for (const rec of r.creatures) {
    assert.ok(sanitizeCreatureRecord(rec), `${rec.id}: the record passes the bank's door`);
    assert.equal(rec.cultivated && rec.cultivated.outcome, 'viable', `${rec.id}: dealt viable`);
    assert.equal(r.enabledAssets[creatureTileId(rec.id)], true, `${rec.id}: its tile is enabled over the dealt pool`);
  }
  assert.equal(r.enabledAssets.geo_square_01, true, 'the dealt pool itself stands untouched under the new tiles');
  ok('creatures: a press deals a viable hand of 6 as stage births, tiles enabled over the pool, nothing banked');
}

// 3 — construct recipes deal for a style in play.
{
  const r = resolveStageDeal(base({ shapeShelf: shelf }), 1, commit);
  assert.ok(r, 'a press with a style in play lands');
  assert.equal(r.constructs.length, 6, `the recipe hand is 6 (measured ${r.constructs.length})`);
  assert.equal(
    (r.constructRecords || []).length,
    6,
    `six records banked (measured ${(r.constructRecords || []).length})`,
  );
  for (const rec of r.constructs) {
    assert.ok(sanitizeConstructRecord(rec), `${rec.id}: the banked record passes its door`);
    assert.equal(rec.style, STYLE, `${rec.id}: built from the style in play (${rec.style})`);
    assert.ok(
      rec.parts.every((p) => VOCAB.slice(0, 2).includes(p.asset)),
      `${rec.id}: every part is one of the kept shapes`,
    );
    assert.equal(r.enabledAssets[constructTileId(rec.id)], true, `${rec.id}: its tile joins the roll`);
  }
  ok(`constructs: a press deals 6 ${STYLE} recipes from the kept shapes, banks them, and enables their tiles`);
}

// 4 — no style in play: no construct candidates, no error.
{
  const empty = resolveStageDeal(base(), 1, commit);
  assert.equal(empty.constructs.length, 0, 'an empty shelf deals no constructs');
  const below = resolveStageDeal(base({ shapeShelf: shelf.slice(0, 1) }), 1, commit);
  assert.equal(
    below.constructs.length,
    0,
    `one kept shape is below the floor of 2 (measured ${below.constructs.length})`,
  );
  const junk = resolveStageDeal(
    base({ shapeShelf: [{ style: STYLE, asset: 'not-a-shape' }, { style: 'nope', asset: VOCAB[0] }, null, {}] }),
    1,
    commit,
  );
  assert.equal(junk.constructs.length, 0, 'junk shelf entries deal nothing and throw nothing');
  ok('no style in play (empty shelf, below the floor, junk entries): no construct candidates, no error');
}

// 5 — the empty-hand law: nothing dealable → null, so the press commit is exactly the press as it was.
{
  assert.equal(resolveStageDeal(base(), 1, commit, { library: [] }), null, 'no library, no shelf: nothing lands');
  assert.equal(
    resolveStageDeal(base({ shapeShelf: shelf }), 1, commit, { library: [] }),
    null,
    'kept shapes the library cannot draw assemble nothing: nothing lands',
  );
  ok('empty-hand law: no dealable creatures and no drawable construct material → null (the press is untouched)');
}

// 6 — never dealt twice.
{
  const first = resolveStageDeal(base(), 1, commit);
  const again = resolveStageDeal(base({ stageBirths: first.stageBirths }), 1, commit);
  assert.equal(again, null, 'the same press over the standing births deals no creature twice (nothing new lands)');
  const dealt = resolveStageDeal(base({ shapeShelf: shelf }), 1, commit);
  const redealt = resolveStageDeal(base({ shapeShelf: shelf, constructRecords: dealt.constructRecords }), 1, {});
  assert.ok(redealt && redealt.constructs.length === 6, 'the same recipes deal again');
  assert.ok(!('constructRecords' in redealt), 'already banked: the bank is not written again');
  assert.ok(
    redealt.constructs.every((c) => redealt.enabledAssets[constructTileId(c.id)]),
    'already banked: their tiles still join the roll',
  );
  ok('never dealt twice: standing creatures are skipped whole; banked recipes rejoin by tile, not by re-banking');
}

// 7 — determinism.
{
  const a = resolveStageDeal(base({ shapeShelf: shelf }), 2, commit);
  const b = resolveStageDeal(base({ shapeShelf: shelf }), 2, commit);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'same standing state, same press → the identical deal');
  ok('determinism: a deal is a pure function of (standing seed, press number, context)');
}

// 8 — the store presses land the deal in the same commit.
{
  useStore.setState({
    seed: SEED,
    startupMode: 'weak',
    shapeShelf: shelf,
    stageBirths: [],
    constructRecords: [],
    stageDealPress: 0,
    enabledAssets: {},
  });
  S().kineticLookPass();
  assert.equal(S().stageDealPress, 1, `the counter advances on the LOOK pass (at ${S().stageDealPress})`);
  assert.equal(
    (S().stageBirths || []).length,
    6,
    `six dealt creatures stand (measured ${(S().stageBirths || []).length})`,
  );
  assert.equal(
    (S().constructRecords || []).length,
    6,
    `six dealt constructs banked (measured ${(S().constructRecords || []).length})`,
  );
  const dealtTiles = Object.keys(S().enabledAssets || {}).filter(
    (id) => id.startsWith('user:cr-') || id.startsWith('user:cn-'),
  );
  assert.equal(
    dealtTiles.length,
    12,
    `the dealt tiles stand enabled in the pass's pool (measured ${dealtTiles.length})`,
  );
  S().kineticRoll();
  assert.equal(S().stageDealPress, 2, `the counter advances on the CHAOS roll (at ${S().stageDealPress})`);
  assert.equal(
    (S().stageBirths || []).length,
    12,
    `the roll deals six more creatures (measured ${(S().stageBirths || []).length})`,
  );
  assert.equal(
    (S().constructRecords || []).length,
    12,
    `the roll banks six more constructs (measured ${(S().constructRecords || []).length})`,
  );
  ok('store: LOOK pass and CHAOS roll each land the deal in their own commit, the counter advancing per press');
}

// 9 — the deal is not the CONSTRUCTS chip's business.
{
  const off = resolveStageDeal(base({ shapeShelf: shelf, constructLead: false }), 1, commit);
  const on = resolveStageDeal(base({ shapeShelf: shelf, constructLead: true }), 1, commit);
  assert.equal(JSON.stringify(on), JSON.stringify(off), 'the chip flag changes nothing about the deal');
  assert.equal(S().constructLead, false, 'the chip still defaults off, with its own pool-leading behaviour');
  const src = readFileSync(join(here, 'slices/layoutSlice.js'), 'utf8');
  assert.match(src, /landStageDeal\(state, finalEnabled\)/, 'the CHAOS roll runs the deal');
  assert.match(src, /landStageDeal\(state, passEnabled\)/, 'the LOOK pass runs the deal');
  ok('always in the mix: the deal runs on both pool-dealing presses and never reads the CONSTRUCTS chip');
}

console.log(`stageKineticDeal.selfcheck: OK (${checks} checks)`);
