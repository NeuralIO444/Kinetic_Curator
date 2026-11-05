// node src/gl/liveResolve.dishLife.selfcheck.mjs
// #1923 slice 3c — the culture on the live resolver. The resolver stays a pure function of its recorded input stream:
// input.dishLife = { wakeMs, gen, shed } is the whole contribution of the idle clock. Pinned here:
//   no stamp           byte-identical to a resolver that never heard of DISH LIFE (the flag-off take shape)
//   a stamp            the top layer's items become the dissolving scene + cells (the frame changes, key `life:`)
//   same stamps        two fresh resolvers produce identical frames, frame for frame
//   snapshot/restore   a mid-culture snapshot (through JSON) continues bit-identically on a fresh resolver
//   the touch          dropping the stamp restores the exact un-stamped frame
//   checkResolverSnapshot accepts a genuine dishLife key and refuses a malformed one; absent stays valid
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLiveResolver, checkResolverSnapshot } from './liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, count: 60, particleCount: 60, ...over });
const baseInput = (over = {}) => ({
  layers: [L('lyr-a')],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 4242,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  layoutParams: lp({ mode: 'random' }),
  caGrid: null,
  enabledAssets: null,
  assetWeightOverrides: {},
  customAssets: [],
  quality: 'balanced',
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
  loopTimeMs: 0,
  dtSec: 1 / 60,
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
  mixSeconds: 0,
  canvasW: 1280,
  canvasH: 720,
  ...over,
});

function canon(v, d = 0) {
  if (v === null || v === undefined) return 'n';
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? String(v) : `#${v}`;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'boolean') return v ? 'T' : 'F';
  if (t === 'function') return 'fn';
  if (d > 12) return '…';
  if (ArrayBuffer.isView(v)) return `[${Array.from(v).join(',')}]`;
  if (Array.isArray(v)) return `[${v.map((x) => canon(x, d + 1)).join(',')}]`;
  if (v instanceof Map) return canon([...v.entries()], d + 1);
  if (v instanceof Set) return canon([...v.values()], d + 1);
  // an undefined field and an absent one are the same thing to every consumer (and a JSON round-trip drops the former)
  return `{${Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort()
    .map((k) => `${k}:${canon(v[k], d + 1)}`)
    .join(',')}}`;
}
const hash = (o) => createHash('sha256').update(canon(o)).digest('hex').slice(0, 20);

const DT = 16.7;
const WAKE = 5 * DT;
/** The stamp at frame f: asleep until frame 5, then the culture advances ~one generation per 2 frames. */
const stampAt = (f) => (f < 5 ? null : { wakeMs: WAKE, gen: Math.floor((f - 5) / 2), shed: 0 });
const inputAt = (f, stamp) =>
  baseInput({ loopTimeMs: f * DT, dtSec: DT / 1000, ...(stamp ? { dishLife: stamp } : {}) });
const topItems = (out) => out.find((l) => Array.isArray(l.items))?.items ?? [];
const run = (r, from, to, stampFn) => {
  const hs = [];
  for (let f = from; f < to; f++) hs.push(hash(r.resolveLayers(inputAt(f, stampFn(f)))));
  return hs;
};
const N = 40;

// 1. no stamp = the resolver as it was
{
  const a = createLiveResolver();
  const b = createLiveResolver();
  assert.deepEqual(
    run(a, 0, N, () => null),
    run(b, 0, N, () => null),
    'unstamped runs agree',
  );
  assert.equal(a.snapshotState().dishLife, undefined, 'no culture, no dishLife key in the snapshot');
  a.dispose();
  b.dispose();
}

// 2. a stamp changes the top layer; the cells are `life:` items; the same stamps replay identically
let stampedRun;
{
  const plain = createLiveResolver();
  const a = createLiveResolver();
  const b = createLiveResolver();
  const ph = run(plain, 0, N, () => null);
  stampedRun = run(a, 0, N, stampAt);
  assert.deepEqual(stampedRun, run(b, 0, N, stampAt), 'same stamps, same frames on two fresh resolvers');
  assert.deepEqual(stampedRun.slice(0, 5), ph.slice(0, 5), 'before the wake the frames are the plain frames');
  assert.notDeepEqual(stampedRun.slice(8), ph.slice(8), 'a stamped frame differs from the plain one');
  assert.equal(new Set(stampedRun.slice(6)).size > 3, true, 'the culture moves frame to frame');
  const probe = createLiveResolver();
  let out;
  for (let f = 0; f < 20; f++) out = probe.resolveLayers(inputAt(f, stampAt(f)));
  assert.equal(
    topItems(out).some((it) => String(it.key).startsWith('life:')),
    true,
    'cells are on the top layer',
  );
  assert.equal(typeof probe.snapshotState().dishLife, 'object', 'a running culture rides the snapshot');
  probe.dispose();
  plain.dispose();
  a.dispose();
  b.dispose();
}

// 3. the touch: dropping the stamp returns the plain scene (the frame is whatever the resolver deals, untouched)
{
  const plain = createLiveResolver();
  const r = createLiveResolver();
  const touchAt = 25;
  const ph = run(plain, 0, N, () => null);
  const got = run(r, 0, N, (f) => (f < touchAt ? stampAt(f) : null));
  assert.deepEqual(got.slice(touchAt), ph.slice(touchAt), 'after the touch the frames are the plain frames again');
  plain.dispose();
  r.dispose();
}

// 4. snapshot mid-culture through JSON, restore on a fresh resolver: bit-identical continuation
{
  const SNAP = 24;
  const b = createLiveResolver();
  run(b, 0, SNAP, stampAt);
  const snapshot = JSON.parse(JSON.stringify(b.snapshotState()));
  b.dispose();
  assert.ok(snapshot.dishLife, 'the snapshot carries the culture');
  const c = createLiveResolver();
  assert.equal(c.restoreState(snapshot), true, 'restore accepts a genuine culture snapshot');
  assert.deepEqual(run(c, SNAP, N, stampAt), stampedRun.slice(SNAP), 'the restored run continues bit-identically');
  c.dispose();

  assert.equal(checkResolverSnapshot(snapshot), true, 'checkResolverSnapshot accepts the genuine key');
  const noKey = { ...snapshot };
  delete noKey.dishLife;
  assert.equal(checkResolverSnapshot(noKey), true, 'a snapshot with no dishLife key stays valid');
  const d0 = snapshot.dishLife;
  const broken = [
    { ...d0, marks: undefined },
    { ...d0, marks: 'x' },
    { ...d0, wakeMs: 'soon' },
    { ...d0, W: NaN },
    { ...d0, H: undefined },
    { ...d0, gen: -1 },
    { ...d0, gen: 1.5 },
  ];
  for (const bad of broken) {
    assert.equal(checkResolverSnapshot({ ...snapshot, dishLife: bad }), false, 'refuses a malformed culture snapshot');
  }
  for (const bad of [null, 5, 'x', [], { gen: 'a' }]) {
    assert.equal(
      checkResolverSnapshot({ ...snapshot, dishLife: bad }),
      false,
      `refuses dishLife=${JSON.stringify(bad)}`,
    );
  }
}

// 5. dispose ends the culture: a disposed resolver carries no stale one
{
  const r = createLiveResolver();
  run(r, 0, 20, stampAt);
  assert.ok(r.snapshotState().dishLife, 'running');
  r.dispose();
  assert.equal(r.snapshotState().dishLife, undefined, 'dispose resets the stage');
}

console.log('liveResolve.dishLife selfcheck: ok');
