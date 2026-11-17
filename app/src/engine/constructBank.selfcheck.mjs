// constructBank.selfcheck.mjs — #2108 (constructs, slice 4): the record door and the bank.
//
//   1. the door keeps every dealt record byte for byte, across all eleven styles
//   2. a record dishonest in any particular is refused whole — above all a piece outside its style's vocabulary
//   3. the bank: de-duplicated, capped at 64, the oldest dropping off; a refused record changes nothing
//   4. a project with constructs reloads them intact through the real save and load; a project with none saves
//      exactly as before (no field); tiles are never saved
//   5. every banked record still draws its tile from the pool (records only: the tile is derived, not stored)
import assert from 'node:assert/strict';
import {
  assembleConstruct,
  constructTile,
  sanitizeConstructRecord,
  sanitizeConstructRecords,
  bankConstructRecord,
  isConstructTileId,
  MAX_CONSTRUCT_RECORDS,
} from './constructAssembler.js';
import { constructRule, CONSTRUCT_STYLE_IDS } from './constructRules.js';
import { ASSETS } from '../data/assets/index.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';
import { useStore } from '../state/store.js';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
const S = () => useStore.getState();
const byId = new Map(ASSETS.map((a) => [a.id, a]));
const find = (id) => byId.get(id);
const deal = (style, seed) => assembleConstruct({ ...constructRule(style, find), seed });
const clone = (v) => JSON.parse(JSON.stringify(v));

// 1 — the door keeps what the assembler deals, byte for byte.
{
  let n = 0;
  for (const style of CONSTRUCT_STYLE_IDS) {
    for (let i = 0; i < 30; i++) {
      const rec = deal(style, (i * 40503 + 11) >>> 0);
      assert.equal(JSON.stringify(sanitizeConstructRecord(clone(rec))), JSON.stringify(rec), `${style} #${i}`);
      n++;
    }
  }
  ok(`${n} dealt records pass the door unchanged (the engine never writes a record its door would refuse)`);
}

// 2 — dishonest records are refused whole.
{
  const good = deal('bauhaus', 2108);
  const bad = (name, edit) => {
    const r = clone(good);
    edit(r);
    assert.equal(sanitizeConstructRecord(r), null, name);
  };
  bad('unknown kind', (r) => (r.kind = 'kc-assembled/1'));
  bad('a creature id', (r) => (r.id = 'cr-0123abcd'));
  bad('a fractional seed', (r) => (r.seed = 1.5));
  bad('a negative seed', (r) => (r.seed = -1));
  bad('an unknown style', (r) => (r.style = 'rococo'));
  bad('too few pieces', (r) => (r.parts = r.parts.slice(0, 11)));
  bad('too many pieces', (r) => (r.parts = [...r.parts, ...r.parts].slice(0, 17)));
  bad('a piece from another style (one style per construct)', (r) => (r.parts[2].asset = 'line_squiggle_01'));
  bad('a piece that is not a pool id', (r) => (r.parts[0].asset = ''));
  bad('own is not a point index', (r) => (r.parts[1].own = 4));
  bad('own is fractional', (r) => (r.parts[1].own = 0.5));
  bad('a non-finite position', (r) => (r.parts[1].x = null));
  bad('a position far outside the box', (r) => (r.parts[1].y = 5000));
  bad('zero scale', (r) => (r.parts[1].s = 0));
  bad('a piece larger than the box', (r) => (r.parts[1].s = 1.5));
  bad('a turn outside 0..360', (r) => (r.parts[1].r = 360));
  bad('points missing', (r) => delete r.points);
  bad('a point outside the box', (r) => (r.points = [{ x: 200, y: 5 }]));
  bad('five points', (r) => (r.points = Array.from({ length: 5 }, (_, i) => ({ x: i * 10, y: 5 }))));
  bad('a creature role on a point', (r) => (r.points = [{ x: 5, y: 5, role: 'H' }]));
  for (const junk of [null, undefined, 7, 'cn-00000000', [], [good]]) assert.equal(sanitizeConstructRecord(junk), null);
  // The same bauhaus pieces are refused under a style whose vocabulary does not hold them.
  assert.equal(sanitizeConstructRecord({ ...clone(good), style: 'memphis' }), null);
  // Unknown fields are dropped, never carried: the record shape has no second-style slot.
  const extra = sanitizeConstructRecord({ ...clone(good), style2: 'memphis', tile: '<g/>' });
  assert.deepEqual(Object.keys(extra), ['id', 'kind', 'style', 'seed', 'parts', 'points']);
  ok('20 dishonest records refused whole; a second style and a saved tile cannot ride a record');
}

// 3 — the bank.
{
  const many = Array.from({ length: MAX_CONSTRUCT_RECORDS + 6 }, (_, i) => deal(CONSTRUCT_STYLE_IDS[i % 11], i + 1));
  assert.equal(new Set(many.map((r) => r.id)).size, many.length);
  let bank = [];
  for (const r of many) bank = bankConstructRecord(bank, r);
  assert.equal(bank.length, MAX_CONSTRUCT_RECORDS);
  assert.equal(bank[bank.length - 1].id, many[many.length - 1].id, 'the newest is kept');
  assert.equal(bank[0].id, many[6].id, 'the oldest dropped off');
  assert.equal(bankConstructRecord(bank, many[10]), bank, 'already banked: the same list');
  assert.equal(bankConstructRecord(bank, { ...many[0], style: 'rococo' }), bank, 'refused: the same list');
  const listed = sanitizeConstructRecords([many[0], many[0], { nope: 1 }, many[1], null]);
  assert.deepEqual(
    listed.map((r) => r.id),
    [many[0].id, many[1].id],
  );
  assert.equal(sanitizeConstructRecords(many).length, MAX_CONSTRUCT_RECORDS);
  assert.deepEqual(sanitizeConstructRecords('nope'), []);
  ok(`the bank holds ${MAX_CONSTRUCT_RECORDS}, drops the oldest, and ignores duplicates and refusals`);
}

// 4 — the real save and load.
{
  const before = JSON.stringify(serializeProject(S()));
  assert.ok(
    !('constructRecords' in serializeProject(S())),
    'no constructs, no field: an untouched project saves as before',
  );
  const recs = [deal('bauhaus', 1), deal('memphis', 2), deal('japanese', 3)];
  for (const r of recs) S().bankConstruct(r);
  assert.deepEqual(
    S().constructRecords.map((r) => r.id),
    recs.map((r) => r.id),
  );
  const held = S().constructRecords;
  S().bankConstruct(recs[1]);
  S().bankConstruct({ ...recs[0], id: 'cn-zzzzzzzz' });
  assert.equal(S().constructRecords, held, 'a duplicate or a refused record writes nothing');
  const doc = serializeProject(S());
  const text = JSON.stringify(doc);
  assert.equal(JSON.stringify(doc.constructRecords), JSON.stringify(recs));
  // Records only: no construct tile is written into the saved overlay.
  assert.ok(!(doc.customAssets || []).some((a) => isConstructTileId(a.id)), 'tiles are never saved');
  const parsed = parseProject(JSON.parse(text));
  assert.ok(parsed.ok, 'the saved project parses');
  useStore.setState({ constructRecords: [] });
  S().applyProject(parsed.doc);
  assert.equal(JSON.stringify(S().constructRecords), JSON.stringify(recs), 'reloaded intact');
  assert.equal(JSON.stringify(serializeProject(S())), text, 'byte-stable through save and load');
  // A hand-edited document: the honest record loads, the dishonest one is dropped whole.
  const tampered = JSON.parse(text);
  tampered.constructRecords[1].parts[0].asset = 'geo_circle_01';
  const reparsed = parseProject(tampered);
  assert.deepEqual(
    reparsed.doc.constructRecords.map((r) => r.id),
    [recs[0].id, recs[2].id],
  );
  // A document without the field loads with none, and the session's leftovers do not survive it.
  useStore.setState({ constructRecords: [] });
  const empty = parseProject(JSON.parse(JSON.stringify(serializeProject(S()))));
  useStore.setState({ constructRecords: recs });
  S().applyProject(empty.doc);
  assert.deepEqual(S().constructRecords, []);
  assert.equal(JSON.stringify(serializeProject(S())), before, 'back to the untouched project, byte for byte');
  ok('constructs reload intact through the real save and load; none saves as before; tiles are never saved');
}

// 5 — records only: every banked record still draws its tile from the pool.
{
  for (const style of CONSTRUCT_STYLE_IDS) {
    const rec = sanitizeConstructRecord(clone(deal(style, 99)));
    const tile = constructTile(rec, (id) => find(id)?.svg);
    assert.ok(tile && isConstructTileId(tile.id), `${style}: the tile is drawn from the record`);
    assert.equal(tile.svg, constructTile(deal(style, 99), (id) => find(id)?.svg).svg);
  }
  ok('a reloaded record draws the same tile it was dealt with, in every style');
}

console.log(`constructBank.selfcheck: OK (${checks} checks)`);
