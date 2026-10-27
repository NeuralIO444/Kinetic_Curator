// node src/engine/markWeather.selfcheck.mjs
//
// #1627 S1 — mark-born weather. The issue's laws, pinned:
//   A. DETERMINISM — same seed + same input sequence = same motes, bit
//      for bit, over uneven frame times; different chunkings of the
//      same total time land on the same state (step-clock law).
//   B. SOURCES — each spawn criterion fires from its measured signal
//      and only from it: no sun → no beam motes; no density field →
//      no pressure puffs; still marks → no trail motes; no contacts →
//      no puffs. No sources at all → no weather, however long it runs.
//   C. SHADOW — beam motes advected out of the beam die within the
//      grace steps; motes inside the beam live out their life.
//   D. CAP — the population never exceeds the device-class cap
//      (quality.js MARK_WEATHER_CAPS), iPad tighter than desktop, and
//      the cap sheds the oldest first.
//   E. SHED — governor shed clears every mote on the step it arrives,
//      spawns nothing, and banks no time (no storm replays on restore).
//   F. GOVERNOR ORDER — cut 1.4 sheds ahead of creature count (1.5)
//      and travel (1.6) and the quality tier; absent weatherActive it
//      does not exist. Restore + badge agree. (The ladder walk is
//      travel.selfcheck's own idiom.)
//   G. COST — spawn + advect at the desktop cap sits far inside the
//      frame's weather share; the registry declaration exists.
//   H. STATE HYGIENE — reseed restarts the scene; prune drops it; the
//      store carries no recipe-shaped data (motes are derived state).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createMarkWeatherStore,
  pruneMarkWeatherStore,
  markWeatherSnapshot,
  stepMarkWeather,
  BEAM_RADIUS_SHARE,
  SHADOW_GRACE_STEPS,
  MOTE_LIFE_STEPS,
} from './markWeather.mjs';
import { buildDishDensity } from './dishDensity.mjs';
import { MARK_WEATHER_CAPS, markWeatherCapForDevice } from '../data/quality.js';
import { nextGovernorCut, shedSummary, GOVERNOR_RESTORE_CUTS } from '../hooks/governorCuts.js';
import { getCostTier } from './kernel/costRegistry.mjs';

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const W = 1000;
const H = 700;
const SUN = {
  x: 500,
  y: 350,
  height: 260,
  intensity: 0.9,
  ambient: 0.35,
  slot: 'white',
  bevel: 0.6,
  spec: 0.8,
  pool: 0,
};
// Marks clustered at the sun (beam), one traveling, all inside a
// saturated density cell.
const ITEMS = [];
for (let i = 0; i < 40; i++) ITEMS.push({ x: 480 + (i % 8) * 6, y: 330 + Math.floor(i / 8) * 6, index: i });
ITEMS.push({ x: 520, y: 360, index: 40, deformAmt: 0.3 });
const DENSE_FIELD = (() => {
  // One cell covering the cluster, saturated (8+ bodies).
  const cellStart = new Int32Array([0, 40, 40]);
  return buildDishDensity({ cellStart, cols: 1, rows: 1, cellSize: 2000, minCx: 0, minCy: 0 });
})();
const CONTACTS = [
  { x: 500, y: 350, energy: 1 },
  { x: 505, y: 345, energy: 0.8 },
];
const FULL = {
  seed: 42,
  sceneId: 'wx',
  canvasW: W,
  canvasH: H,
  items: ITEMS,
  light: SUN,
  densityField: DENSE_FIELD,
  contacts: CONTACTS,
};
const moteHash = (motes) =>
  createHash('sha256')
    .update(motes.map((m) => `${m.kind},${m.x},${m.y},${m.age},${m.alpha}`).join('|'))
    .digest('hex');
const runFrames = (ctx, frames, dtSeq = [1000 / 60]) => {
  const store = createMarkWeatherStore();
  const hashes = [];
  for (let f = 0; f < frames; f++) {
    const motes = stepMarkWeather(store, { ...ctx, frameMs: dtSeq[f % dtSeq.length] });
    hashes.push(moteHash(motes));
  }
  return { store, hashes };
};

// ── A. determinism ───────────────────────────────────────────────────
{
  const DT = [16.7, 16.7, 33.3, 8, 16.7, 50, 12.5];
  const a = runFrames(FULL, 300, DT);
  const b = runFrames(FULL, 300, DT);
  assert.deepStrictEqual(a.hashes, b.hashes, 'two fresh stores, one uneven input sequence: every frame identical');
  checks++;
  ok(new Set(a.hashes).size > 100, 'the weather actually lives (frames differ)');
  const snap = markWeatherSnapshot(a.store, 'wx');
  ok(snap.motes.length > 0, `weather spawned (${snap.motes.length} motes alive at frame 300)`);
  // Chunking: same total time, different slices (under the step cap)
  // spends the same steps and lands on the same state.
  const whole = runFrames(FULL, 4, [100]);
  const sliced = runFrames(FULL, 8, [50]);
  assert.strictEqual(
    moteHash(markWeatherSnapshot(whole.store, 'wx').motes),
    moteHash(markWeatherSnapshot(sliced.store, 'wx').motes),
    '50 ms slices == 100 ms slices',
  );
  checks++;
  assert.strictEqual(markWeatherSnapshot(whole.store, 'wx').steps, 24, '400 ms at the locked step is 24 steps');
  checks++;
  console.log(
    `markWeather.selfcheck A determinism: 300 frames identical on two fresh stores; kinds ${JSON.stringify(snap.counts)}`,
  );
}

// ── B. sources ───────────────────────────────────────────────────────
{
  const kinds = (ctx, frames = 240) => {
    const { store } = runFrames(ctx, frames);
    return markWeatherSnapshot(store, 'wx').counts;
  };
  const full = kinds(FULL);
  for (const kind of ['beam', 'pressure', 'trail', 'contact']) {
    ok((full[kind] || 0) > 0, `the full scene spawns ${kind} motes (${full[kind]})`);
  }
  const noSun = kinds({ ...FULL, light: null });
  ok(!noSun.beam, 'no sun → no beam motes');
  ok((noSun.pressure || 0) > 0, 'pressure still puffs without a sun (sources are independent)');
  const noField = kinds({ ...FULL, densityField: null });
  ok(!noField.pressure, 'no density field → no pressure puffs');
  const still = kinds({ ...FULL, items: ITEMS.slice(0, 40) });
  ok(!still.trail, 'no traveling marks → no trail motes');
  const noContacts = kinds({ ...FULL, contacts: null });
  ok(!noContacts.contact, 'no contacts → no contact puffs');
  const bare = kinds({ seed: 42, sceneId: 'wx', canvasW: W, canvasH: H, items: ITEMS.slice(0, 40) });
  assert.deepStrictEqual(bare, {}, 'no sources at all → no weather, ever');
  checks++;
  // A sun with no spec pool spawns no beam motes: the pool IS the criterion.
  const flatSun = kinds({ ...FULL, light: { ...SUN, spec: 0 } });
  ok(!flatSun.beam, 'spec 0 → the beam is empty');
  console.log('markWeather.selfcheck B sources: each criterion fires from its own measured signal, and only from it');
}

// ── C. shadow ────────────────────────────────────────────────────────
{
  // A beam mote placed outside the beam dies within the grace steps;
  // one at the sun's heart lives.
  const store = createMarkWeatherStore();
  stepMarkWeather(store, { ...FULL, frameMs: 1000 / 60 });
  const sc = store.scenes.get('wx');
  sc.motes = [
    { x: 990, y: 690, kind: 'beam', age: 0, life: MOTE_LIFE_STEPS.beam, strength: 1, shadeSteps: 0, vx: 0, vy: 0 },
    { x: 500, y: 350, kind: 'beam', age: 0, life: MOTE_LIFE_STEPS.beam, strength: 1, shadeSteps: 0, vx: 0, vy: 0 },
  ];
  // No items: nothing new spawns; only advection + shade run.
  for (let f = 0; f < SHADOW_GRACE_STEPS + 3; f++) {
    stepMarkWeather(store, {
      seed: 42,
      sceneId: 'wx',
      canvasW: W,
      canvasH: H,
      items: [],
      light: SUN,
      frameMs: 1000 / 60,
    });
  }
  const left = markWeatherSnapshot(store, 'wx').motes;
  ok(
    left.length === 1 && Math.hypot(left[0].x - 500, left[0].y - 350) < 60,
    `the shadow mote died within the grace (survivors: ${left.length}, at the sun)`,
  );
  ok(BEAM_RADIUS_SHARE > 0, 'the beam has a radius');
  console.log('markWeather.selfcheck C shadow: motes die in shadow within the grace; the beam keeps its own');
}

// ── D. cap ───────────────────────────────────────────────────────────
{
  assert.strictEqual(markWeatherCapForDevice(false), MARK_WEATHER_CAPS.desktop);
  assert.strictEqual(markWeatherCapForDevice(true), MARK_WEATHER_CAPS.ipad);
  ok(MARK_WEATHER_CAPS.ipad < MARK_WEATHER_CAPS.desktop, 'iPad-class is the tighter budget');
  checks += 2;
  const storm = { ...FULL, contacts: Array.from({ length: 60 }, (_, i) => ({ x: 500 + (i % 10), y: 350, energy: 1 })) };
  for (const ipadClass of [false, true]) {
    const store = createMarkWeatherStore();
    let max = 0;
    for (let f = 0; f < 600; f++) {
      const motes = stepMarkWeather(store, { ...storm, frameMs: 1000 / 60, ipadClass });
      if (motes.length > max) max = motes.length;
    }
    const cap = markWeatherCapForDevice(ipadClass);
    ok(max <= cap, `${ipadClass ? 'ipad' : 'desktop'} population never exceeds its cap (${max} ≤ ${cap})`);
    ok(
      max === cap,
      `${ipadClass ? 'ipad' : 'desktop'} storm actually reaches its cap (${max}) — the cap is the binding constraint`,
    );
  }
  console.log(
    `markWeather.selfcheck D cap: desktop ${MARK_WEATHER_CAPS.desktop}, ipad ${MARK_WEATHER_CAPS.ipad} — never exceeded under a contact storm`,
  );
}

// ── E. shed ──────────────────────────────────────────────────────────
{
  const { store } = runFrames(FULL, 120);
  ok(markWeatherSnapshot(store, 'wx').motes.length > 0, 'weather is live before the shed');
  const cleared = stepMarkWeather(store, { ...FULL, frameMs: 1000 / 60, shed: true });
  assert.strictEqual(cleared.length, 0, 'the shed clears every mote on the step it arrives');
  checks++;
  const stepsAtShed = markWeatherSnapshot(store, 'wx').steps;
  for (let f = 0; f < 60; f++) stepMarkWeather(store, { ...FULL, frameMs: 1000 / 60, shed: true });
  assert.strictEqual(markWeatherSnapshot(store, 'wx').motes.length, 0, 'nothing spawns under the shed');
  checks++;
  assert.strictEqual(markWeatherSnapshot(store, 'wx').steps, stepsAtShed, 'the clock does not bank shed time');
  checks++;
  console.log('markWeather.selfcheck E shed: clear on arrival, silent under shed, no banked storm on restore');
}

// ── F. governor order ────────────────────────────────────────────────
{
  const walk = (s0) => {
    const kinds = [];
    let s = { ...s0 };
    for (let i = 0; i < 16; i++) {
      const cut = nextGovernorCut(s);
      if (!cut) break;
      kinds.push(cut.kind);
      if (cut.kind === 'renderScale') s = { ...s, renderScale: cut.scale };
      else if (cut.kind === 'markWeather') s = { ...s, weatherShed: true };
      else if (cut.kind === 'creatureCount') s = { ...s, creatureShed: cut.creatureShed };
      else if (cut.kind === 'travel') s = { ...s, travelShed: true };
      else if (cut.kind === 'quality') s = { ...s, quality: cut.quality };
      else if (cut.kind === 'assetThin') s = { ...s, assetThin: true };
      else if (cut.kind === 'countClamp')
        s = { ...s, perfClampOverride: { count: cut.count }, effectiveCount: cut.count };
      else if (cut.kind === 'slowRender') s = { ...s, slowRender: true };
    }
    return kinds;
  };
  const PRESSURE = {
    renderScale: 1,
    quality: 'high',
    assetThin: false,
    perfClampOverride: null,
    effectiveCount: 400,
    slowRender: false,
    gpuSaturated: true,
  };
  const kinds = walk({
    ...PRESSURE,
    creatureCount: 2,
    creatureShed: 0,
    weatherActive: true,
    weatherShed: false,
    travelActive: true,
    travelShed: false,
  });
  assert.deepStrictEqual(
    kinds.slice(0, 7),
    ['renderScale', 'renderScale', 'renderScale', 'markWeather', 'creatureCount', 'creatureCount', 'travel'],
    'pixel trim, then weather (1.4), then population (1.5), then travel (1.6)',
  );
  checks++;
  ok(kinds.indexOf('markWeather') < kinds.indexOf('quality'), 'weather sheds ahead of the quality tier');
  const noWeather = walk({ ...PRESSURE, creatureCount: 0, creatureShed: 0 });
  ok(!noWeather.includes('markWeather'), 'no weatherActive from the caller → no weather rung (pre-#1627 ladder)');
  const entry = GOVERNOR_RESTORE_CUTS.find((c) => c.kind === 'markWeather');
  ok(!!entry, 'markWeather has a restore entry');
  const order = GOVERNOR_RESTORE_CUTS.map((c) => c.kind);
  ok(
    order.indexOf('markWeather') < order.indexOf('creatureCount') &&
      order.indexOf('markWeather') < order.indexOf('travel'),
    'restore table order matches shed order around the new rung',
  );
  assert.strictEqual(entry.needsRestore({ weatherShed: true }, { healthy: true }), true);
  assert.strictEqual(entry.needsRestore({ weatherShed: true }, { healthy: false }), false);
  assert.strictEqual(entry.needsRestore({ weatherShed: false }, { healthy: true }), false);
  checks += 3;
  assert.deepStrictEqual(
    shedSummary({ renderScale: 1, weatherShed: true }),
    ['weather clear'],
    'the badge is honest about a weather shed',
  );
  checks++;
  console.log(
    'markWeather.selfcheck F governor: cut 1.4 sits ahead of creature 1.5, travel 1.6 and quality; restore + badge agree',
  );
}

// ── G. cost ──────────────────────────────────────────────────────────
{
  const decl = getCostTier('weather/mark-motes');
  ok(!!decl && decl.timeMs > 0, 'weather/mark-motes is declared with a measured timeMs');
  const store = createMarkWeatherStore();
  const ctx = {
    ...FULL,
    contacts: Array.from({ length: 60 }, (_, i) => ({ x: 500 + (i % 10), y: 350, energy: 1 })),
    frameMs: 1000 / 60,
  };
  for (let i = 0; i < 120; i++) stepMarkWeather(store, ctx); // reach the cap
  const medians = [];
  for (let run = 0; run < 7; run++) {
    const times = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      stepMarkWeather(store, ctx);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    medians.push(times[100]);
  }
  medians.sort((a, b) => a - b);
  const measured = medians[3];
  ok(
    measured < 0.5,
    `measured ${measured.toFixed(3)} ms at the ${MARK_WEATHER_CAPS.desktop}-mote cap sits far inside the frame`,
  );
  console.log(
    `markWeather.selfcheck G cost: declared ${decl.timeMs} ms; re-measured median-of-medians ${measured.toFixed(3)} ms @cap, 1 step (sandbox)`,
  );
}

// ── H. state hygiene ─────────────────────────────────────────────────
{
  const { store } = runFrames(FULL, 60);
  const before = markWeatherSnapshot(store, 'wx');
  ok(before.steps === 60 && before.seed === 42, 'the snapshot reads the scene record');
  // A reseed starts the scene's weather over (state is keyed by seed).
  stepMarkWeather(store, { ...FULL, seed: 43, frameMs: 0 });
  const after = markWeatherSnapshot(store, 'wx');
  assert.strictEqual(after.seed, 43);
  assert.strictEqual(after.steps, 0);
  assert.strictEqual(after.motes.length, 0);
  checks += 3;
  pruneMarkWeatherStore(store, new Set(['other']));
  assert.strictEqual(markWeatherSnapshot(store, 'wx'), null, 'prune drops a removed scene');
  checks++;
  // Derived state only: a mote carries presentation fields, never a
  // recipe key — nothing here could be saved into a document.
  const { store: s2 } = runFrames(FULL, 30);
  const mote = markWeatherSnapshot(s2, 'wx').motes[0];
  ok(mote && !('layoutParams' in mote) && !('recipe' in mote), 'motes are derived state, never recipe data');
  console.log('markWeather.selfcheck H hygiene: reseed restarts, prune drops, motes carry no recipe data');
}

console.log(`markWeather.selfcheck: ok — ${checks} checks passed (#1627 S1)`);
