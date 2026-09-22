// spineE.selfcheck.mjs — verify Spine E
//
// 1. Stub chips and mode enums ride the paletteMix state machine.
// 2. Sliders: current -> target exp damp on the loop clock; round when settling.
// 3. Float count fades spawn/death on both particles and buildPlacements.
// 4. Enums and assets do not snap at t=0.5.

import assert from 'node:assert';
import { createPaletteMix } from './paletteMix.mjs';
import { ParticleSystem } from '../engine/particles.js';
import { buildPlacements } from '../engine/buildPlacements.js';
import { mixVoiceState } from '../data/voices.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

console.log('spineE.selfcheck: starting...');

// ── 1. paletteMix mode & stub chip dissolve ───────────────────────────────
{
  const m = createPaletteMix();
  // Frame 0: cold start
  const c0 = m.update({
    id: 'p1', overrides: null, userPalettes: null,
    mode: 'grid', behave: 'cruise', assetsKey: 'a,b',
    mixSeconds: 2, now: 1000, canDissolve: false, bakeReady: true,
  });
  assert.strictEqual(c0.kind, 'cut', 'first sighting is cut');

  // Frame 1: mode chip changed from grid to swarm
  const c1 = m.update({
    id: 'p1', overrides: null, userPalettes: null,
    mode: 'swarm', behave: 'cruise', assetsKey: 'a,b',
    mixSeconds: 2, now: 1016, canDissolve: true, bakeReady: true,
  });
  assert.strictEqual(c1.kind, 'start', 'mode change triggers dissolve start');
  assert.strictEqual(c1.dur, 2);
  assert.strictEqual(c1.retarget, false);

  // Frame 2: first bake-ready frame starts the mix clock (t=0)
  const c2 = m.update({
    id: 'p1', overrides: null, userPalettes: null,
    mode: 'swarm', behave: 'cruise', assetsKey: 'a,b',
    mixSeconds: 2, now: 1016, canDissolve: true, bakeReady: true,
  });
  assert.strictEqual(c2.kind, 'mix', 'bake ready starts mix');
  assert.strictEqual(c2.t, 0, 't=0 at clock start');

  // Frame 3: dissolve in progress at halfway mark
  const c3 = m.update({
    id: 'p1', overrides: null, userPalettes: null,
    mode: 'swarm', behave: 'cruise', assetsKey: 'a,b',
    mixSeconds: 2, now: 2016, canDissolve: true, bakeReady: true,
  });
  assert.strictEqual(c3.kind, 'mix', 'dissolve progresses');
  assert.ok(c3.t > 0 && c3.t < 1, 't in (0, 1)');

  // Frame 4: rapid retarget to fibonacci before mix finishes
  const c4 = m.update({
    id: 'p1', overrides: null, userPalettes: null,
    mode: 'fibonacci', behave: 'cruise', assetsKey: 'a,b',
    mixSeconds: 2, now: 2100, canDissolve: true, bakeReady: true,
  });
  assert.strictEqual(c4.kind, 'start', 'retarget triggers start');
  assert.strictEqual(c4.retarget, true, 'retarget flag is true to preserve original held deck');

  console.log('  [ok] paletteMix state machine handles mode chips, retargets cleanly');
}

// ── 2. ParticleSystem float count & fade spawn/death ──────────────────────
{
  const assets = [{ id: 'm1' }];
  const palette = { swatches: ['#ffffff'], bg: '#000000' };
  const sys = new ParticleSystem();
  sys.init(10, 1000, 700, assets, palette, 0x123);

  // Set count to float 10.5
  sys.update(
    { ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 10.5 },
    assets, palette, 0x123, 1000, null, null, 1 / 60,
  );
  // Ensure alpha is nonzero for testing
  sys.alpha.fill(80);

  const items = sys.getItems(assets);
  assert.strictEqual(items.length, 11, '10.5 allocates 11 particles (ceil)');
  const last = items[items.length - 1];
  const secondLast = items[items.length - 2];

  assert.strictEqual(secondLast.alpha, 80, 'integer particles keep full alpha');
  assert.strictEqual(last.alpha, 40, 'fractional particle alpha scaled by 0.5');

  console.log('  [ok] ParticleSystem float count fades fractional particle alpha (spawn/death)');
}

// ── 3. buildPlacements float count & fade spawn/death ─────────────────────
{
  const activeAssets = [{ id: 'm1', weight: 'medium' }];
  const palette = { swatches: ['#ffffff'], bg: '#000000' };
  const res = buildPlacements({
    layoutParams: {
      ...DEFAULT_LAYOUT_PARAMS,
      mode: 'fibonacci',
      count: 12.5,
      density: 100,
      alpha: [100, 100],
    },
    seed: 42,
    activeAssets,
    palette,
    canvasW: 1000,
    canvasH: 700,
  });

  assert.strictEqual(res.items.length, 13, '12.5 count samples ceil(12.5) items');
  const lastItem = res.items[res.items.length - 1];
  assert.ok(Math.abs(lastItem.alpha - 50) < 1e-4, 'fractional item alpha is scaled by 0.5');

  console.log('  [ok] buildPlacements float count fades fractional item alpha');
}

// ── 4. mixVoiceState stops enum snapping at t=0.5 ─────────────────────────
{
  const a = { params: { mode: 'grid', behave: 'cruise' }, palette: { swatches: ['#fff'] } };
  const b = { params: { mode: 'swarm', behave: 'wander' }, palette: { swatches: ['#000'] } };

  const at0 = mixVoiceState(a, b, 0);
  assert.strictEqual(at0.params.mode, 'grid', 't=0 keeps from');
  assert.strictEqual(at0.params.behave, 'cruise');

  const atEarly = mixVoiceState(a, b, 0.1);
  assert.strictEqual(atEarly.params.mode, 'swarm', 't>0 takes to immediately without 0.5 cut');
  assert.strictEqual(atEarly.params.behave, 'wander');

  const atLate = mixVoiceState(a, b, 0.9);
  assert.strictEqual(atLate.params.mode, 'swarm');
  assert.strictEqual(atLate.params.behave, 'wander');

  console.log('  [ok] mixVoiceState stops enum snapping at t=0.5');
}

console.log('spineE.selfcheck: OK');
