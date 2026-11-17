// constructPool.selfcheck.mjs — a construct the artist banked can be a creature body (spec §14; Matt 2026-11-17).
//
// Built the way the ladder builds it: a construct from two kept shapes with its own seed (so NOT a house construct,
// and not in the catalogue), banked through bankConstruct; then a creature dealt on that body, banked through
// bankDealtCreature. Before this change the bank refused it ('nobody'): it could not find the body's drawing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { useStore } from '../state/store.js';
import { ASSETS } from '../data/assets/index.js';
import { assembleConstruct, constructTile, constructTileId } from './constructAssembler.js';
import { constructRule, CONSTRUCT_STYLE_IDS } from './constructRules.js';
import { bankedConstructTile, findBodyAsset } from './constructPool.js';
import { press } from '../deal/kineticEngine.mjs';
import { creatureAdapter } from '../deal/creatureAdapter.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ok - ${name}`);
};

const byId = new Map(ASSETS.map((a) => [a.id, a]));
const svgOf = (id) => (byId.get(id) || {}).svg;
const style = CONSTRUCT_STYLE_IDS[0];
const rule = constructRule(style, (id) => byId.get(id) || null, null);
const rec = assembleConstruct({ ...rule, vocabulary: rule.vocabulary.slice(0, 2), seed: 0x2304beef });
const tileId = constructTileId(rec.id);

ok('the construct is the artist’s own: not a house construct, not in the catalogue', () => {
  assert.ok(rec && /^cn-[0-9a-f]{8}$/.test(rec.id));
  assert.ok(!byId.has(tileId));
});

ok('bankedConstructTile draws the tile from the record; nothing for a stranger id', () => {
  const t = bankedConstructTile(tileId, [rec], svgOf);
  assert.deepEqual(t, constructTile(rec, svgOf));
  assert.equal(bankedConstructTile(tileId, [], svgOf), null);
  assert.equal(bankedConstructTile('user:cn-00000000', [rec], svgOf), null);
  assert.equal(bankedConstructTile('basic-circle', [rec], svgOf), null);
});

ok('findBodyAsset: overlay first, then the catalogue, then the banked constructs', () => {
  const lib = ASSETS[0];
  assert.equal(findBodyAsset(lib.id, { overlay: [], catalogue: ASSETS, constructRecords: [rec] }), lib);
  const mine = { ...lib, svg: '<g/>' };
  assert.equal(findBodyAsset(lib.id, { overlay: [mine], catalogue: ASSETS, constructRecords: [] }), mine);
  assert.equal(findBodyAsset(tileId, { overlay: [], catalogue: ASSETS, constructRecords: [rec] }).id, tileId);
  assert.equal(findBodyAsset(tileId, { overlay: [], catalogue: ASSETS, constructRecords: [] }), null);
});

ok('the store banks a creature whose body is a banked construct', () => {
  const st = useStore.getState();
  st.bankConstruct(rec);
  assert.ok(
    useStore.getState().constructRecords.some((r) => r.id === rec.id),
    'construct banked',
  );
  const tile = constructTile(rec, svgOf);
  const hand = press(creatureAdapter, {
    scope: 'weak',
    seed: 0x2304,
    press: 0,
    ctx: { library: [tile], bank: [] },
  }).hand;
  assert.ok(hand.length > 0, 'a creature is dealt on the construct body');
  const creature = hand[0];
  assert.equal(creature.body, tileId);
  useStore.getState().bankDealtCreature(creature);
  const note = useStore.getState().creatureDealNote;
  assert.equal(note && note.status, 'banked', `the bank said ${note && note.status}`);
  const ctile = useStore.getState().customAssets.find((a) => a.id === `user:${creature.id}`);
  assert.ok(ctile && ctile.svg && ctile.svg.length > 0, 'the creature tile carries its body drawing');
});

ok('no construct tile is saved: the overlay holds the creature, not the construct', () => {
  assert.ok(!useStore.getState().customAssets.some((a) => a.id === tileId));
});

ok('pure: no clock, no Math.random, no store, no React', () => {
  const src = readFileSync(new URL('./constructPool.js', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  for (const bad of ['Date.now', 'Math.random', 'useStore', "from 'react'"]) assert.ok(!src.includes(bad), bad);
});

console.log(`constructPool selfcheck: ${n} ok`);
