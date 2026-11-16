// wetLabDeal.selfcheck.mjs — #2232 step 3: the KIN strip's glue and the store's tap-to-bank door.
//
//   library   a deal draws only from dealable assets WITH their markup; a creature's own tile is never a body
//   press     a KIN press is a pure function of (seed, press number, width, bank); the counter and width are bounded
//   unkept    ruling Q4: a creature banked from a tap and not turned on for the stage is unkept
//   store     bankDealtCreature banks a dealt creature with its tile; the same tap twice is 'already'; a stillborn or
//             dishonest record is 'nobody'; a full pool refuses ('pool-full'); removing an unkept creature takes its tile
//   lab       the WetLab opens with no shape (the empty lab) and mounts the strip; a named shape missing from the pool opens nothing
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSETS } from '../data/assets/index.js';
import { useStore } from '../state/store.js';
import { creatureTileId, isCreatureTile } from '../engine/creatureTileId.js';
import { MAX_CREATURE_RECORDS } from '../engine/creatureAssembler.js';
import { OVERLAY_CAP } from '../assets/overlay.js';
import {
  dealLibrary,
  kinPress,
  nextKinScope,
  sanitizePress,
  unkeptIds,
  bodySvgOf,
  KIN_DEFAULT_SCOPE,
  CREATURE_SCOPES,
} from './wetLabDeal.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const S = () => useStore.getState();
const SEED = 0x2232;

ok('the library is dealable assets with their markup; a creature tile is never a body', () => {
  const lib = dealLibrary(ASSETS, []);
  assert.ok(lib.length > 100 && lib.every((a) => typeof a.svg === 'string' && a.svg));
  assert.ok(!lib.some((a) => a.id === 'creature'), 'the creature citizen is never dealt');
  const tile = { id: 'user:cr-00000001', category: 'creature', source: 'wetlab', svg: '<svg/>' };
  assert.ok(isCreatureTile(tile));
  assert.ok(!dealLibrary(ASSETS, [tile]).some((a) => a.id === tile.id), 'a creature tile is not a body');
  const imp = {
    id: 'user:mine',
    category: 'user',
    source: 'import',
    svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30"/></svg>',
  };
  assert.ok(
    dealLibrary(ASSETS, [imp]).some((a) => a.id === 'user:mine'),
    'an import is a body',
  );
});

const lib = dealLibrary(ASSETS, []);
const hand = (over = {}) =>
  kinPress({ scope: 'weak', seed: SEED, press: 0, library: lib, assetAttach: {}, bank: [], ...over });

ok('a press is pure; the counter and the width are bounded and wrap', () => {
  assert.deepEqual(hand(), hand());
  assert.notDeepEqual(
    hand({ press: 1 }).hand.map((c) => c.id),
    hand({ press: 0 }).hand.map((c) => c.id),
  );
  assert.equal(hand().hand.length, 6, 'a hand of six');
  assert.equal(sanitizePress(-1), 0);
  assert.equal(sanitizePress(2.5), 0);
  assert.equal(sanitizePress(7), 7);
  assert.equal(KIN_DEFAULT_SCOPE, 'weak');
  assert.deepEqual(
    CREATURE_SCOPES.map((s) => s.id),
    ['off', 'weak', 'med', 'koz'],
  );
  assert.equal(nextKinScope('koz'), 'off');
  assert.equal(hand({ scope: 'nonsense' }).scope, 'weak', 'an unknown width falls to the default');
});

ok('every dealt creature has a body drawing for its tile', () => {
  for (const c of hand().hand) assert.ok(bodySvgOf(c, lib), `${c.body} has markup`);
  assert.equal(bodySvgOf({ body: 'nope' }, lib), null);
});

ok('unkept: banked from a tap and not turned on for the stage', () => {
  const bank = [{ id: 'cr-00000001' }, { id: 'cr-00000002' }, { id: 'cr-00000003' }];
  const dealt = ['cr-00000001', 'cr-00000002'];
  assert.deepEqual(unkeptIds(dealt, bank, {}), ['cr-00000001', 'cr-00000002']);
  assert.deepEqual(unkeptIds(dealt, bank, { [creatureTileId('cr-00000002')]: true }), ['cr-00000001']);
  assert.deepEqual(unkeptIds([], bank, {}), [], 'nothing dealt, nothing unkept');
  assert.deepEqual(unkeptIds(dealt, [{ id: 'cr-00000001' }], {}), ['cr-00000001'], 'a removed creature is not listed');
});

ok('store: a tap banks the dealt creature with its tile; twice is already; a stillborn is nobody', () => {
  useStore.setState({ seed: SEED, creatureRecords: [], customAssets: [], enabledAssets: {}, creatureDealNote: null });
  const [a, b] = hand().hand;
  S().bankDealtCreature(a);
  assert.equal(S().creatureDealNote.status, 'banked');
  assert.equal(S().creatureDealNote.id, a.id);
  assert.equal(S().creatureRecords.length, 1);
  assert.ok(
    S().customAssets.some((t) => t.id === creatureTileId(a.id) && isCreatureTile(t)),
    'its tile rides in the pool',
  );
  S().bankDealtCreature(a);
  assert.equal(S().creatureDealNote.status, 'already');
  assert.equal(S().creatureRecords.length, 1, 'never banked twice');
  S().bankDealtCreature({ ...b, cultivated: { ...b.cultivated, outcome: 'stillborn', cost: null } });
  assert.equal(S().creatureDealNote.status, 'nobody', 'a stillborn is refused');
  S().bankDealtCreature({ id: 'cr-deadbeef' });
  assert.equal(S().creatureDealNote.status, 'nobody', 'a dishonest record is refused');
  S().bankDealtCreature({ ...b, cultivated: undefined });
  assert.equal(S().creatureDealNote.status, 'nobody', 'a record with no cultivation note is refused');
  assert.equal(S().creatureRecords.length, 1);
});

ok('store: a full pool refuses with a note; clearing an unkept creature takes its tile and makes room', () => {
  useStore.setState({ seed: SEED, creatureRecords: [], customAssets: [], enabledAssets: {}, creatureDealNote: null });
  // a creature's tile lives in the pool's overlay (OVERLAY_CAP, shared with imports), so the pool fills before the
  // bank's own cap: a fast KIN-and-tap session meets 'pool-full' first
  let refused = null;
  for (let p = 0; p < 200 && !refused; p++) {
    for (const c of hand({ press: p, bank: S().creatureRecords }).hand) {
      S().bankDealtCreature(c);
      const st = S().creatureDealNote.status;
      if (st !== 'banked' && st !== 'already') {
        refused = { st, c };
        break;
      }
    }
  }
  assert.ok(refused, 'the pool fills');
  assert.equal(refused.st, 'pool-full');
  assert.equal(S().customAssets.length, OVERLAY_CAP, 'the pool holds exactly its cap');
  assert.ok(S().creatureRecords.length <= MAX_CREATURE_RECORDS);
  const before = S().creatureRecords.length;
  S().bankDealtCreature(refused.c);
  assert.equal(S().creatureRecords.length, before, 'a refused tap banks nothing');
  const victim = S().creatureRecords[0].id;
  S().removeCreatureRecord(victim);
  assert.ok(!S().creatureRecords.some((r) => r.id === victim));
  assert.ok(!S().customAssets.some((t) => t.id === creatureTileId(victim)), 'its tile left with it');
  S().bankDealtCreature(refused.c);
  assert.equal(S().creatureDealNote.status, 'banked', 'room again, so it banks');
});

ok(
  'the lab: opens with no shape and mounts the strip; a named missing shape opens nothing; no clock or Math.random',
  () => {
    const src = readFileSync(new URL('./WetLab.jsx', import.meta.url), 'utf8');
    assert.match(src, /if \(!asset && assetId\) return null/, 'only a NAMED shape that is missing opens nothing');
    assert.match(src, /useState\(assetId \? 'assemble' : 'genome'\)/, 'the empty lab opens on the genome panel');
    assert.match(src, /<WetLabDealStrip/, 'the strip is mounted in the lab');
    const pool = readFileSync(new URL('./AssetPoolPanel.jsx', import.meta.url), 'utf8');
    assert.match(pool, /data-testid="open-wetlab-empty"/);
    assert.match(pool, /labId !== null/, 'an empty-string lab id still opens');
    for (const f of ['./wetLabDeal.mjs', './WetLabDealStrip.jsx']) {
      const code = readFileSync(new URL(f, import.meta.url), 'utf8')
        .split('\n')
        .filter((l) => !/^\s*\/\//.test(l))
        .join('\n');
      for (const bad of ['Date.now', 'Math.random', 'performance.now'])
        assert.ok(!code.includes(bad), `${f} has no ${bad}`);
    }
  },
);

console.log(`wetLabDeal selfcheck: ${n} ok`);
