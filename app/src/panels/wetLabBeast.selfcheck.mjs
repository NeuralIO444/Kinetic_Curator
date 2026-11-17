// wetLabBeast.selfcheck.mjs — #2232 step 7: the beast KIN / CUR strip's glue and the store's beast tap door.
//
//   press     a KIN press is a pure function of (seed, press number, width); every beast in a hand walks
//   walk      a beast's drawing at t = 0 is the pool tile's own thumbnail; later it has moved; a dead linkage draws nothing
//   store     bankDealtBeast banks a pool tile; twice is 'already'; junk is 'nobody';
//             a full pool refuses ('pool-full') and room again banks
//   subject   CUR narrows from the beast last banked or tapped, else the newest in the pool, else nothing
//   cur       up to three neighbours, never the subject, one pick; empty with no subject
//   unkept    a beast banked from the strip and not turned on for the stage
//   lab       the WetLab mounts the beast strip under the bank rail; neither file touches a clock or Math.random
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { useStore } from '../state/store.js';
import { OVERLAY_CAP } from '../assets/overlay.js';
import { beastTile, beastTileSvg } from '../engine/beastTile.js';
import { isStillborn } from '../engine/jansenSolver.js';
import { wildTypeMeasures } from '../engine/jansenMeasures.js';
import { sanitizeMeasures } from '../engine/beastBuilder.js';
import {
  BEAST_SCOPES,
  BEAST_KIN_DEFAULT_SCOPE,
  beastKinPress,
  nextBeastScope,
  poolBeasts,
  beastSubject,
  beastCurPress,
  walkPath,
  unkeptBeastIds,
  beastKey,
} from './beastDeal.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const S = () => useStore.getState();
const SEED = 0x2232;
const wild = sanitizeMeasures(wildTypeMeasures());
const reset = () => useStore.setState({ seed: SEED, customAssets: [], enabledAssets: {}, beastDealNote: null });

ok('press: a pure function of (seed, press, width); every beast walks; the width pill cycles', () => {
  const a = beastKinPress({ scope: 'loose', seed: SEED, press: 1 });
  assert.deepEqual(a, beastKinPress({ scope: 'loose', seed: SEED, press: 1 }));
  assert.notDeepEqual(a, beastKinPress({ scope: 'loose', seed: SEED, press: 2 }));
  assert.ok(a.length > 0 && a.length <= 6);
  for (const m of a) assert.ok(!isStillborn(m, m.scale), 'every beast in the hand walks');
  assert.equal(BEAST_KIN_DEFAULT_SCOPE, 'tame');
  const seen = [];
  let s = BEAST_KIN_DEFAULT_SCOPE;
  for (let i = 0; i < BEAST_SCOPES.length; i++) {
    seen.push(s);
    s = nextBeastScope(s);
  }
  assert.deepEqual(seen, ['tame', 'loose', 'wild', 'feral']);
  assert.equal(s, 'tame', 'and wraps');
  // a bad scope or press falls back rather than throwing
  assert.ok(Array.isArray(beastKinPress({ scope: 'nope', seed: SEED, press: -4 })));
});

ok('walk: t = 0 is the pool thumbnail; the crank turns; a bad t reads as rest', () => {
  const tileSvg = beastTileSvg(wild);
  const d0 = walkPath(wild, 0);
  assert.ok(d0 && tileSvg.includes(`d="${d0}"`), 'at rest it is the tile drawing');
  assert.notEqual(walkPath(wild, 0.9), d0, 'a moment later the legs have moved');
  assert.equal(walkPath(wild, 0.9), walkPath(wild, 0.9), 'and it is a pure function of t');
  assert.equal(walkPath(wild, NaN), d0, 'a bad t reads as rest');
});

ok('store: a tap banks a pool tile; twice is already; junk is nobody', () => {
  reset();
  const m = beastKinPress({ scope: 'tame', seed: SEED, press: 0 })[0];
  S().bankDealtBeast(m);
  assert.equal(S().beastDealNote.status, 'banked');
  assert.equal(S().beastDealNote.id, beastKey(m));
  assert.equal(S().customAssets.length, 1);
  assert.equal(S().customAssets[0].id, beastTile(m).id, 'the pool tile is the one beastTile mints');
  S().bankDealtBeast(m);
  assert.equal(S().beastDealNote.status, 'already');
  assert.equal(S().customAssets.length, 1, 'never banked twice');
  S().bankDealtBeast(null);
  assert.equal(S().beastDealNote.status, 'nobody');
});

ok('store: a full pool refuses with a note; removing a tile makes room', () => {
  reset();
  let refused = null;
  for (let p = 0; p < 200 && !refused; p++) {
    for (const m of beastKinPress({ scope: 'wild', seed: SEED, press: p })) {
      S().bankDealtBeast(m);
      if (S().beastDealNote.status === 'pool-full') {
        refused = m;
        break;
      }
    }
  }
  assert.ok(refused, 'the pool fills');
  assert.equal(S().customAssets.length, OVERLAY_CAP);
  S().bankDealtBeast(refused);
  assert.equal(S().customAssets.length, OVERLAY_CAP, 'a refused tap banks nothing');
  S().removeCustomAsset(S().customAssets[0].id);
  S().bankDealtBeast(refused);
  assert.equal(S().beastDealNote.status, 'banked', 'room again, so it banks');
});

ok('subject: the last banked or tapped beast, else the newest in the pool, else nothing', () => {
  reset();
  assert.equal(beastSubject(S().customAssets, null), null, 'an empty pool has no subject');
  const [a, b] = beastKinPress({ scope: 'tame', seed: SEED, press: 3 });
  S().bankDealtBeast(a);
  S().bankDealtBeast(b);
  const pool = S().customAssets;
  assert.equal(poolBeasts(pool).length, 2);
  assert.equal(beastSubject(pool, beastKey(a)).id, beastKey(a), 'the one last tapped');
  assert.equal(beastSubject(pool, 'user:beast-00000000').id, beastKey(b), 'a stale id falls back to the newest');
  assert.equal(beastSubject(pool, null).id, beastKey(b));
  assert.equal(
    poolBeasts([{ id: 'user:x', category: 'creature', source: 'wetlab' }]).length,
    0,
    'other tiles are not beasts',
  );
});

ok('cur: up to three neighbours, never the subject, one pick; empty with no subject', () => {
  const r = beastCurPress({ subject: wild, cap: 'near', seed: SEED, press: 0 });
  assert.ok(r.hand.length > 0 && r.hand.length <= 3);
  assert.ok(r.picked && r.hand[0] === r.picked, 'the pick tops the order');
  for (const m of r.hand) {
    assert.notEqual(beastKey(m), beastKey(wild), 'never the subject');
    assert.ok(!isStillborn(m, m.scale));
  }
  assert.deepEqual(r, beastCurPress({ subject: wild, cap: 'near', seed: SEED, press: 0 }), 'pure');
  assert.deepEqual(beastCurPress({ subject: null, cap: 'near', seed: SEED, press: 0 }), { hand: [], picked: null });
  const dist = (hand) =>
    hand.reduce((s, m) => s + Math.abs(m.legCount - wild.legCount) + Math.abs(m.scale - wild.scale), 0);
  assert.ok(
    dist(beastCurPress({ subject: wild, cap: 'tight', seed: SEED, press: 0 }).hand) <=
      dist(beastCurPress({ subject: wild, cap: 'loose', seed: SEED, press: 0 }).hand) + 1e-9,
    'a tighter cap stays closer',
  );
});

ok('unkept: banked from the strip and not turned on for the stage', () => {
  const pool = [{ id: 'user:beast-aaaaaaaa' }, { id: 'user:beast-bbbbbbbb' }];
  const dealt = ['user:beast-aaaaaaaa', 'user:beast-bbbbbbbb', 'user:beast-gone0000'];
  assert.deepEqual(unkeptBeastIds(dealt, pool, {}), ['user:beast-aaaaaaaa', 'user:beast-bbbbbbbb']);
  assert.deepEqual(unkeptBeastIds(dealt, pool, { 'user:beast-aaaaaaaa': true }), ['user:beast-bbbbbbbb']);
  assert.deepEqual(unkeptBeastIds(null, null, null), []);
});

ok('lab: the beast strip is mounted under the bank rail; no clock or Math.random in the glue or the store door', () => {
  const lab = readFileSync(new URL('./WetLab.jsx', import.meta.url), 'utf8');
  // the rung rail shows one rung at a time: the strip belongs to the RIG rung, and still sits right under the bank rail
  assert.match(
    lab,
    /<\/footer>\s*\)\}\s*\{rungOnScreen === 'rig' && <WetLabBeastStrip\b[\s\S]*?\/>\}/,
    'the strip sits right under the bank rail, on the rig rung',
  );
  const strip = readFileSync(new URL('./WetLabBeastStrip.jsx', import.meta.url), 'utf8');
  assert.match(strip, /data-testid="beast-cur"/);
  assert.match(strip, /prefers-reduced-motion/, 'the walk stands still for reduced motion');
  const glue = readFileSync(new URL('./beastDeal.mjs', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
  for (const bad of ['Date.now', 'Math.random', 'performance.now', 'zustand', "from 'react'"])
    assert.ok(!glue.includes(bad), `beastDeal.mjs has no ${bad}`);
});

console.log(`wetLabBeast selfcheck: ${n} ok`);
