// node src/engine/constructStagePool.selfcheck.mjs
// #2337 — banked constructs on the STAGE. The stage's pool (gl/liveLoop.mjs) is the overlay, the stage-born tiles
// and, now, a tile for every banked construct, drawn from its record and never saved.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { useStore } from '../state/store.js';
import { serializeProject } from '../state/projectDocument.js';
import { ASSETS } from '../data/assets/index.js';
import { assembleConstruct, constructTile, constructTileId } from './constructAssembler.js';
import { constructRule, CONSTRUCT_STYLE_IDS } from './constructRules.js';
import { poolWithConstructs } from './constructPool.js';
import { poolWithBirths } from './kineticBirths.mjs';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { frameHash } from '../gl/performanceFile.mjs';

let n = 0;
const ok = (name, fn) => Promise.resolve(fn()).then(() => console.log(`  ok ${++n} — ${name}`));

const byId = new Map(ASSETS.map((a) => [a.id, a]));
const svgOf = (id) => (byId.get(id) || {}).svg;
const style = CONSTRUCT_STYLE_IDS[0];
const rule = constructRule(style, (id) => byId.get(id) || null, null);
const rec = assembleConstruct({ ...rule, vocabulary: rule.vocabulary.slice(0, 2), seed: 0x2337beef });
const rec2 = assembleConstruct({ ...rule, vocabulary: rule.vocabulary.slice(0, 2), seed: 0x2337cafe });
const tileId = constructTileId(rec.id);

await ok('no constructs banked: the pool is returned as the SAME array (today’s pool exactly)', () => {
  const pool = [{ id: 'user:x', svg: '<circle r="1"/>' }];
  assert.equal(poolWithConstructs(pool, [], svgOf), pool);
  assert.equal(poolWithConstructs(pool, undefined, svgOf), pool);
  assert.equal(poolWithConstructs(undefined, [], svgOf).length, 0);
  assert.equal(poolWithConstructs(pool, [rec], undefined), pool, 'no svg source: nothing to draw');
});

await ok('a banked construct adds its tile, drawn from the record, after the overlay, in bank order', () => {
  const pool = [{ id: 'user:x', svg: '<circle r="1"/>' }];
  const out = poolWithConstructs(pool, [rec, rec2], svgOf);
  assert.deepEqual(
    out.map((a) => a.id),
    ['user:x', tileId, constructTileId(rec2.id)],
  );
  assert.deepEqual(out[1], constructTile(rec, svgOf));
  assert.equal(pool.length, 1, 'the input pool is not mutated');
});

await ok('memoized on identities; a changed bank gives a new pool', () => {
  const pool = [];
  const recs = [rec];
  const a = poolWithConstructs(pool, recs, svgOf);
  assert.equal(poolWithConstructs(pool, recs, svgOf), a, 'same inputs, same array (no per-frame allocation)');
  assert.notEqual(poolWithConstructs(pool, [rec, rec2], svgOf), a);
});

await ok('a tile already in the pool is not added twice; a record that cannot draw is left out', () => {
  const have = [constructTile(rec, svgOf)];
  assert.equal(poolWithConstructs(have, [rec], svgOf), have, 'already there: the pool itself');
  const broken = { ...rec, id: 'cn-deadbeef', parts: rec.parts.map((p) => ({ ...p, asset: 'no-such-asset' })) };
  const pool = [];
  assert.equal(poolWithConstructs(pool, [broken], svgOf), pool, 'nothing drew: the pool itself');
  assert.deepEqual(
    poolWithConstructs(pool, [broken, rec], svgOf).map((a) => a.id),
    [tileId],
  );
});

await ok('a piece may be an overlay asset: the overlay is consulted before the catalogue', () => {
  const custom = { id: 'user:custom-piece', svg: '<rect width="10" height="10"/>' };
  const withCustom = { ...rec, parts: rec.parts.map((p, i) => (i === 0 ? { ...p, asset: custom.id } : p)) };
  const out = poolWithConstructs([custom], [withCustom], svgOf);
  assert.ok(
    out.some((a) => a.id === constructTileId(withCustom.id)),
    'drew with the overlay piece',
  );
});

await ok('rides beside the stage-born tiles (poolWithBirths) and is never saved', () => {
  const births = [{ tile: { id: 'user:born-1', svg: '<circle r="2"/>' } }];
  const merged = poolWithConstructs(poolWithBirths([], births), [rec], svgOf);
  assert.deepEqual(
    merged.map((a) => a.id),
    ['user:born-1', tileId],
  );
  useStore.setState({ constructRecords: [rec], customAssets: [] });
  const doc = serializeProject(useStore.getState());
  assert.ok(!JSON.stringify(doc.customAssets || []).includes(tileId), 'the project keeps the record, not the tile');
  assert.deepEqual(
    (doc.constructRecords || []).map((r) => r.id),
    [rec.id],
  );
  useStore.setState({ constructRecords: [], customAssets: [] });
});

// The resolver: the pool the loop hands it places the construct when it is enabled, and changes nothing when not.
const resolve = (pool, enabled) => {
  const doc = serializeProject(useStore.getState());
  const layers = createLiveResolver().resolveLayers({
    loopTimeMs: 0,
    dtSec: 1 / 60,
    lockedParams: {},
    batchPaused: false,
    focusSwap: false,
    perfClampOverride: null,
    perfTier1: false,
    assetThin: false,
    slowRender: false,
    scaleMul: 1,
    alphaBoost: 0,
    effectiveScale: [0.5, 1.5],
    effectiveAlpha: [20, 100],
    phraseWrapGen: 0,
    attractor: null,
    userPalettes: [],
    assetWeightOverrides: {},
    quality: 'balanced',
    ...doc,
    enabledAssets: enabled,
    customAssets: pool,
  });
  return { layers, text: JSON.stringify(layers), hash: frameHash(layers) };
};

await ok(
  'the resolver places a banked construct when it is enabled, and a project without one resolves as before',
  () => {
    const only = { [tileId]: true };
    const pool = poolWithConstructs([], [rec], svgOf);
    assert.equal(pool.length, 1);
    const on = resolve(pool, only);
    assert.ok(on.text.includes(tileId), 'the construct tile is placed on the stage');
    // enabled assets without the construct: the construct in the pool must not change a single placement
    const someone = Object.keys(Object.fromEntries(ASSETS.slice(0, 3).map((a) => [a.id, true])));
    const enabled = Object.fromEntries(someone.map((id) => [id, true]));
    const without = resolve([], enabled);
    const withTile = resolve(pool, enabled);
    assert.equal(withTile.hash, without.hash, 'a banked but not enabled construct changes nothing');
    assert.ok(!without.text.includes(tileId));
  },
);

await ok('the same bank resolves the same frame twice (deterministic)', () => {
  const pool = poolWithConstructs([], [rec], svgOf);
  assert.equal(resolve(pool, { [tileId]: true }).hash, resolve(pool, { [tileId]: true }).hash);
});

await ok(
  'wiring: liveLoop reads its pool through stagePool at BOTH sites (resolver input and baker), nowhere raw',
  () => {
    const src = readFileSync(new URL('../gl/liveLoop.mjs', import.meta.url), 'utf8');
    assert.equal((src.match(/customAssets: stagePool\(s\)/g) || []).length, 1, 'the resolver input');
    assert.equal((src.match(/getPool\(stagePool\(st\)\)/g) || []).length, 1, 'the baker');
    assert.equal((src.match(/poolWithBirths\(/g) || []).length, 1, 'poolWithBirths is called only inside stagePool');
    const body = src.slice(src.indexOf('function stagePool(s)'), src.indexOf('function getPool('));
    assert.ok(
      /poolWithConstructs\(\s*poolWithBirths\(s\.customAssets, s\.stageBirths\),\s*s\.constructRecords/.test(body),
      'stagePool composes the births pool with the banked constructs',
    );
    assert.ok(/import \{ poolWithConstructs \} from '\.\.\/engine\/constructPool\.js'/.test(src));
  },
);

console.log(`constructStagePool.selfcheck: OK (${n} checks)`);
process.exit(0);
