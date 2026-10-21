// node src/gl/resolverSnapshot.selfcheck.mjs
// #1367 slice 1 — the snapshot proof. The claim a mid-session take rests on:
// snapshot a live resolver at a frame boundary, restore the snapshot (through a JSON
// round-trip — the performance file is gzip JSON) into a FRESH resolver, and the
// continuation is bit-identical to the uninterrupted run, frame for frame.
//
// Method (the liveResolve.determinism harness's): every frame's full output is
// canonically hashed; the restored run's post-snapshot hashes must equal the control
// run's, and every scenario must MOVE (a frozen scene proves nothing). Scenarios are
// chosen to light each piece of the census surface: swarm physics, the dish (contacts,
// bonds, coalescence, trails, ecology), the FEED delay, the shared scent, an in-flight
// morph, growth ticks, the warp phase integral, and both creature builders. A missed
// state field diverges here, loudly, at the first checkpoint after the restore —
// which is exactly the failure class #1367 exists to catch before it ships in a take.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLiveResolver, checkResolverSnapshot } from './liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const T = 90; // frames per scenario
const SNAP_AT = 50; // snapshot boundary
const DT_MS = [16.7, 16.7, 33.3, 8, 16.7, 50, 16.7, 12.5];

const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, count: 48, particleCount: 48, ...over });
const snap = (seed, over = {}) => ({ seed, paletteId: 'bone', paletteOverrides: null, layoutParams: lp(over), caGrid: null, enabledAssets: null });
const baseInput = (over = {}) => ({
  layers: [L('lyr-a')], activeLayerId: 'lyr-a', layerSnapshots: {}, seed: 1234, seedOffsets: null,
  paletteId: 'bone', paletteOverrides: null, userPalettes: [], layoutParams: lp({ mode: 'random' }), caGrid: null,
  enabledAssets: null, assetWeightOverrides: {}, customAssets: [], quality: 'balanced', lockedParams: {},
  batchPaused: false, focusSwap: false, loopTimeMs: 0, dtSec: 1 / 60, perfClampOverride: null, perfTier1: false,
  assetThin: false, slowRender: false, scaleMul: 1, alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100],
  phraseWrapGen: 0, attractor: null, mixSeconds: 0, ...over,
});

/** Canonical encoding of anything the resolver returns (the determinism harness's). */
function canon(v, depth = 0) {
  if (v === null || v === undefined) return 'n';
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? (Object.is(v, -0) ? '-0' : String(v)) : `#${String(v)}`;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'boolean') return v ? 'T' : 'F';
  if (t === 'function') return 'fn';
  if (depth > 12) return '…';
  if (ArrayBuffer.isView(v)) return `[${Array.from(v).map((x) => canon(x, depth + 1)).join(',')}]`;
  if (Array.isArray(v)) return `[${v.map((x) => canon(x, depth + 1)).join(',')}]`;
  if (v instanceof Map) return canon([...v.entries()], depth + 1);
  if (v instanceof Set) return canon([...v.values()], depth + 1);
  return `{${Object.keys(v).sort().map((k) => `${k}:${canon(v[k], depth + 1)}`).join(',')}}`;
}
const frameHash = (out) => createHash('sha256').update(canon(out)).digest('hex').slice(0, 20);

function drive(r, scenario, from, to, hashes) {
  let t = 0;
  for (let f = 0; f < to; f++) {
    const dt = DT_MS[f % DT_MS.length];
    t += dt;
    if (f < from) continue;
    hashes.push(frameHash(r.resolveLayers(baseInput({ ...scenario.at(f), loopTimeMs: t, dtSec: dt / 1000 }))));
  }
  return hashes;
}

function runControl(scenario) {
  const r = createLiveResolver();
  const hashes = drive(r, scenario, 0, T, []);
  r.dispose();
  return hashes;
}

function runRestored(scenario) {
  const b = createLiveResolver();
  drive(b, scenario, 0, SNAP_AT, []);
  const snapshot = JSON.parse(JSON.stringify(b.snapshotState()));
  b.dispose();
  const c = createLiveResolver();
  assert.equal(c.restoreState(snapshot), true, `${scenario.name}: restoreState refused a genuine snapshot`);
  const hashes = drive(c, scenario, SNAP_AT, T, []);
  c.dispose();
  return { hashes, snapshot };
}

const breathe = (f) => ({ effectiveScale: [0.5, 1.5 + 0.2 * Math.sin(f / 9)], effectiveAlpha: [20 + 10 * Math.sin(f / 13), 100] });
const single = (mode, over = {}) => ({
  name: `single:${mode}`,
  at: (f) => ({ layoutParams: lp({ mode, ...over }), ...breathe(f) }),
});
const twoLayer = (name, patch, aOver = {}, bOver = {}) => ({
  name,
  at: (f) => ({
    layers: [L('lyr-a'), L('lyr-b', patch ? { patch } : {})],
    activeLayerId: 'lyr-a',
    layoutParams: lp({ mode: 'swarm', behave: 'scatter', ...aOver }),
    layerSnapshots: { 'lyr-b': snap(999, { mode: 'random', count: 30, ...bOver }) },
    ...breathe(f),
  }),
});

const SCENARIOS = [
  single('swarm', { behave: 'scatter' }),
  single('dla'),
  single('eden'),
  single('random', { displacement: 0.6, noiseSpeed: 0.8 }), // the warp phase integral
  twoLayer('patch:feed', { mode: 'feed', to: 'lyr-a', strength: 1 }),
  twoLayer('patch:mod', { mode: 'mod', to: 'lyr-a', strength: 1 }),
  // travel kinemes (#1574 FLOW, #1575 PATH): the roam is accumulative (per-mark offset + velocity, the scene's
  // step bank, the travel clock's last frame) — a missed field restores every traveller at home and the
  // continuation roams elsewhere. Fifty frames of roam are banked when the snapshot lands.
  { ...single('random', { transport: 'flow', kinemeBreath: 0, kinemeDrift: 0, lifeDrift: 0 }), name: 'travel:flow' },
  { ...single('random', { transport: 'path', transportPath: 'lissajous', kinemeBreath: 0, kinemeDrift: 0, lifeDrift: 0 }), name: 'travel:path' },
  // #1576 — P3's accumulative state: the surge envelope store (a trigger pulse at frame 40 starts an envelope that is
  // mid-flight at the frame-50 snapshot) and the parallax drift clock (zTiers > 1 so the front tiers move)
  {
    name: 'travel:surge+parallax',
    at: (f) => ({
      layoutParams: lp({ mode: 'random', zTiers: 4, transportSurge: 1, transportParallax: 1, kinemeBreath: 0, kinemeDrift: 0, lifeDrift: 0 }),
      surgeTrigger: f >= 40 && f < 44 ? 1 : 0,
      ...breathe(f),
    }),
  },
  {
    name: 'shared-scent:mold',
    at: (f) => ({
      layers: [L('lyr-m1'), L('lyr-m2')], activeLayerId: 'lyr-m1',
      layoutParams: lp({ mode: 'hype', behave: 'mold', count: 16, particleCount: 16 }),
      layerSnapshots: { 'lyr-m1': snap(101, { mode: 'hype', behave: 'mold', count: 16, particleCount: 16 }), 'lyr-m2': snap(202, { mode: 'hype', behave: 'mold', count: 16, particleCount: 16 }) },
      ...breathe(f),
    }),
  },
  {
    // The dish, fully up: contacts with friction, wet grip (bonds form), coalescence,
    // deform + pigment (param defaults), trail accumulation, the ecology ledger.
    name: 'dish-full',
    at: (f) => ({
      layers: [L('lyr-a'), L('lyr-b')], activeLayerId: 'lyr-a',
      layoutParams: lp({
        mode: 'swarm', behave: 'flock', count: 60, particleCount: 60,
        dish: true, contactRadius: 42, contactMode: 'friction', contactRestitution: 0.4,
        accumulation: true, accumulationWetness: 0.85, ecology: true,
      }),
      layerSnapshots: {
        'lyr-b': snap(999, {
          mode: 'swarm', behave: 'flock', count: 40, particleCount: 40,
          dish: true, contactRadius: 42, contactMode: 'friction', accumulation: true, accumulationWetness: 0.85, ecology: true,
        }),
      },
      ...breathe(f),
    }),
  },
  {
    // A morph in flight at the snapshot boundary: the placement-mode change at f=48
    // changes the morph signature and starts a 2.5 s morph; the snapshot at f=50
    // must carry the transition ledger mid-glide. (A count change alone does not
    // move the signature — the mode change is the honest trigger.)
    name: 'morph-in-flight',
    at: (f) => ({
      layoutParams: lp({ mode: f >= 48 ? 'poisson' : 'grid', count: 48 }),
      mixSeconds: 2.5,
      ...breathe(f),
    }),
  },
  {
    // Both creature builders from frame 0: pin 0 formed and UNHOSTED (the field
    // moth grows — creature.js skips hosted pins), pin 1 formed and HOSTED (the
    // dish creature grows — dishCreature.js only builds on hosted pins). Fifty
    // frames of growth are banked when the snapshot lands.
    name: 'creatures',
    at: (f) => ({
      layoutParams: lp({ mode: 'grid', count: 24 }),
      dishPins: [{ x: 500, y: 350 }, { x: 640, y: 350 }],
      dishFormed: [true, true],
      dishHosted: [false, true],
      dishPressure: 0.7,
      ...breathe(f),
    }),
  },
];

for (const scenario of SCENARIOS) {
  const control = runControl(scenario);
  assert.ok(new Set(control).size > 10, `${scenario.name}: scenario barely moves — the proof would be vacuous`);
  const { hashes, snapshot } = runRestored(scenario);
  assert.deepEqual(hashes, control.slice(SNAP_AT), `${scenario.name}: continuation after restore diverges from the uninterrupted run`);
  console.log(`[ok] ${scenario.name} — snapshot at frame ${SNAP_AT}, ${T - SNAP_AT} continuation frames identical`);
  if (scenario.name === 'dish-full') {
    assert.ok(Object.keys(snapshot.swarm).length === 2, 'dish-full: both swarm systems snapshotted');
    assert.ok(snapshot.dishSession.trailTotal, 'dish-full: trail total field snapshotted');
    assert.ok(Object.keys(snapshot.dishSession.trailsByKey).length >= 1, 'dish-full: per-stratum trail fields snapshotted');
  }
  if (scenario.name === 'creatures') {
    assert.ok(snapshot.creatures.ages.some((a) => a > 0), 'creatures: the moth had banked grow-in ages at the snapshot');
    assert.ok(snapshot.dishCreatures.states.some((s) => s && s.age > 0), 'creatures: the dish creature had banked age at the snapshot');
  }
  if (scenario.name === 'morph-in-flight') {
    assert.ok(Object.keys(snapshot.morphState).length >= 1, 'morph-in-flight: a morph was in flight at the snapshot');
  }
}

// ── Fail-closed: a refused restore changes nothing ─────────────────────────────
{
  const scenario = SCENARIOS[0];
  const control = runControl(scenario);
  const r = createLiveResolver();
  const hashes = drive(r, scenario, 0, 30, []);
  const genuine = JSON.parse(JSON.stringify(r.snapshotState()));
  assert.equal(checkResolverSnapshot(genuine), true, 'validator accepts a genuine snapshot');
  assert.equal(checkResolverSnapshot(null), false);
  assert.equal(checkResolverSnapshot({ ...genuine, v: 2 }), false, 'validator refuses a future version');
  assert.equal(r.restoreState(null), false);
  assert.equal(r.restoreState({ ...genuine, v: 2 }), false);
  const tampered = JSON.parse(JSON.stringify(genuine));
  const layerId = Object.keys(tampered.swarm)[0];
  tampered.swarm[layerId].system.cols.x.b64 = 'AAAA'; // valid base64, wrong payload
  assert.equal(r.restoreState(tampered), false, 'a tampered column refuses the restore');
  const garbage = JSON.parse(JSON.stringify(genuine));
  garbage.scent.b64 = 'not base64!!';
  assert.equal(r.restoreState(garbage), false, 'a garbage scent record refuses the restore');
  drive(r, scenario, 30, T, hashes);
  r.dispose();
  assert.deepEqual(hashes, control, 'after refused restores the resolver continues exactly as the control');
  console.log('[ok] fail-closed — refused restores (null, wrong version, tampered column, garbage scent) leave the run untouched');
}

console.log(`resolverSnapshot.selfcheck: ok (${SCENARIOS.length} scenarios, snapshot at frame ${SNAP_AT} of ${T})`);
