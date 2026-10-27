// node src/gl/spectrumWarp.selfcheck.mjs
// #1490 — spectral path P4: the FX feedback warp. The proofs this suite owns:
//   A. the address: the amount lives on the FX stratum's existing { kind, params } item surface — off
//      (no item / amount 0 / hidden layer / shed) is exactly 0, and no layout/contract/recipe key
//      exists for the warp, so off-state documents and frames are byte-identical by construction.
//   B. per-bin smoothing in the feedback pass only: the driver's attenuated state is one exponential
//      PER BIN — a hot bin's neighbour stays exactly silent (a block-smoothed variant leaks and would
//      fail), the core's state is read never written, and the ballistics are frame-rate independent.
//   C. the mapping: zoom from bass deviation (relative mode, gated on bass sounding), spin from
//      attenuated mids, decay inside 0.92..0.985, treble to prism + grain; silence is the exact
//      neutral (identity warp, decay only).
//   D. applySpectrumWarp: amount 0 / null warp returns the recipe field-for-field; a hot warp composes
//      with the artist's own TUNNEL/PRISM values and stays inside its clamps; the recipe guard passes.
//   E. replay determinism: the warp's only audio input is the spectrum state, which during a take is
//      the recorded section stepped through spectrumLive's playback path — the same recorded bytes
//      replay to the identical warp sequence, twice, and a live sequence replays identically too.
//   F. governor: cut 1.45 — after mark weather (1.4), before the creature count (1.5); opt-in, so a
//      caller that never says the warp is live walks the pre-#1490 ladder; badge + restore honest.
//   G. cost: tier 1 declared at registration with the measured CPU step (bench printed, not pinned).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createSpectrumWarp,
  feedbackWarpAmount,
  applySpectrumWarp,
  FEEDBACK_WARP_KIND,
  WARP_KEEP_MIN,
  WARP_KEEP_MAX,
  WARP_ATT_MS,
  WARP_BASS_BINS,
  WARP_MIDS_BINS,
  WARP_TREBLE_BINS,
} from './spectrumWarp.mjs';
import { createSpectrumCore, quantizeSpectrum, LOG_BINS } from './spectrumCore.mjs';
import { beginSpectrumPlayback, stepSpectrumPlayback, endSpectrumPlayback, readSpectrum } from './spectrumLive.mjs';
import { accumRecipeParams, applyAudioEnvelope, assertRecipeFinite } from './accum.mjs';
import {
  sanitizeFxEffects,
  defaultFxParams,
  compileFxPrimitives,
  FX_EFFECT_KINDS,
  FX_RACK,
  FX_MENU_KINDS,
} from '../fx/fxFilters.js';
import { compileFxShaders } from './effects/fxShaders.mjs';
import { KIND_FACE } from '../fx/efRackTile.mjs';
import { buildSceneContract } from './sceneContract.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';
import { nextGovernorCut, shedSummary, GOVERNOR_RESTORE_CUTS } from '../hooks/governorCuts.js';
import { getCostTier } from './costTiers.mjs';

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = (a, b, msg) => {
  assert.equal(a, b, msg);
  checks++;
};
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const flat = (s) => s.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, ''); // layout-blind source pins (#1684): whitespace and trailing commas are Prettier's, not the code's
const blankState = () => ({ smooth: new Float32Array(LOG_BINS), rel: new Float32Array(LOG_BINS) });

// ── A. the address ────────────────────────────────────────────────────────────────────────────────────
{
  eq(feedbackWarpAmount(null), 0, 'no layers: 0');
  eq(feedbackWarpAmount([]), 0, 'no FX item: 0');
  eq(
    feedbackWarpAmount([{ type: 'content', effects: [{ kind: 'feedbackWarp', params: { amount: 1 } }] }]),
    0,
    'a content layer is not the FX stratum',
  );
  eq(
    feedbackWarpAmount([{ type: 'fx', visible: false, effects: [{ kind: 'feedbackWarp', params: { amount: 1 } }] }]),
    0,
    'a hidden FX layer does not drive',
  );
  eq(
    feedbackWarpAmount([{ type: 'fx', effects: [{ kind: 'feedbackWarp', params: { amount: 0 } }] }]),
    0,
    'amount 0 is off',
  );
  eq(
    feedbackWarpAmount([{ type: 'fx', effects: [{ kind: 'feedbackWarp', params: { amount: 0.7 } }] }]),
    0.7,
    'the amount reads off the item params',
  );
  eq(
    feedbackWarpAmount([
      { type: 'fx', effects: [{ kind: 'feedbackWarp', params: { amount: 0.3 } }] },
      {
        type: 'fx',
        effects: [
          { kind: 'grain', params: { amount: 1 } },
          { kind: 'feedbackWarp', params: { amount: 0.6 } },
        ],
      },
    ]),
    0.6,
    'the largest amount across the strata wins',
  );
  eq(
    feedbackWarpAmount([{ type: 'fx', effects: [{ kind: 'feedbackWarp', params: { amount: 2 } }] }]),
    1,
    'clamped to 1',
  );
  eq(
    feedbackWarpAmount([{ type: 'fx', effects: [{ kind: 'feedbackWarp', params: { amount: 'x' } }] }]),
    0,
    'junk is 0, never throws',
  );
  eq(
    feedbackWarpAmount([{ type: 'fx', effects: [{ kind: 'feedbackWarp', params: { amount: 0.9 } }] }], true),
    0,
    'shed is 0',
  );
  eq(FEEDBACK_WARP_KIND, 'feedbackWarp');

  // The catalog surface: sanitized like every FX item, offered by the rack and the menu, faced on the tile.
  assert.deepEqual(defaultFxParams('feedbackWarp'), { amount: 0 });
  checks++;
  assert.deepEqual(sanitizeFxEffects([{ kind: 'feedbackWarp', params: { amount: 5 } }]), [
    { kind: 'feedbackWarp', params: { amount: 1 } },
  ]);
  checks++;
  ok(FX_EFFECT_KINDS.includes('feedbackWarp'), 'the kind is in the FX roster');
  ok(FX_RACK.find((s) => s.slot === 'EF-2').kinds.includes('feedbackWarp'), 'EF-2 Distort holds it');
  ok(FX_MENU_KINDS.includes('feedbackWarp'), 'the add menu offers it');
  ok(!!KIND_FACE.feedbackWarp, 'the rack tile has a face for it');

  // No chain step, either backend: GL compiles nothing (no extra pass), SVG compiles the identity.
  assert.deepEqual(compileFxShaders([{ kind: 'feedbackWarp', params: { amount: 0.8 } }]), []);
  checks++;
  const prims = compileFxPrimitives([{ kind: 'feedbackWarp', params: { amount: 0.8 } }], {});
  assert.deepEqual(
    prims.map((p) => p.prim),
    ['feOffset'],
    'the SVG half is the identity pass-through',
  );
  checks++;
  eq(prims[0].attrs.dx, 0);
  eq(prims[0].attrs.dy, 0);

  // No key anywhere else: not in the layout defaults (a document gains nothing by existing), not
  // invented by normalize, and a contract built without the item never mentions the warp.
  ok(!('feedbackWarp' in DEFAULT_LAYOUT_PARAMS) && !('spectrumWarp' in DEFAULT_LAYOUT_PARAMS), 'no layout default key');
  ok(!('feedbackWarp' in normalizeLayoutParams({})), 'normalize invents no warp key');
  const c = buildSceneContract({ doc: { seed: 1, quality: 'balanced' }, resolvedLayers: [] });
  ok(!JSON.stringify(c).includes('feedbackWarp'), 'an off contract carries no warp key');
}

// ── B. per-bin smoothing, in this pass only ───────────────────────────────────────────────────────────
{
  const d = createSpectrumWarp();
  const st = blankState();
  const hot = WARP_MIDS_BINS[0];
  st.smooth[hot] = 1;
  const k1 = 1 - Math.exp(-16.7 / WARP_ATT_MS);
  d.step(st, 16.7);
  ok(Math.abs(d.att[hot] - k1) < 1e-7, 'one step is the per-bin exponential (to Float32 storage)');
  eq(d.att[hot + 1], 0, 'the neighbouring bin stays exactly silent — no cross-bin (block) smoothing');
  eq(d.att[hot - 1], 0, 'on the other side too');

  // The distinction, suite-proven: a block-smoothed variant (the spectrum averaged as a block, then
  // spread back) leaks the hot bin across the whole spectrum. The driver's att does not.
  const block = new Float32Array(LOG_BINS).fill((1 / LOG_BINS) * k1);
  ok(
    Math.abs(block[hot + 1] - d.att[hot + 1]) > 1e-6,
    'a block-smoothed variant would differ at the neighbour — and fail here',
  );

  // The core's state is read, never written; its smoothed values are NOT the attenuated ones.
  const before = Float32Array.from(st.smooth);
  d.step(st, 16.7);
  assert.deepEqual(Float32Array.from(st.smooth), before, 'the spectrum state is untouched by the warp step');
  checks++;
  ok(d.att[hot] < st.smooth[hot], 'attenuated is slower than the core smooth — a different signal, not a copy');

  // Frame-rate independence: 2 x 50 ms lands where 1 x 100 ms lands (constant input, exact ODE).
  const a = createSpectrumWarp();
  const b = createSpectrumWarp();
  const st1 = blankState();
  st1.smooth.fill(0.8);
  a.step(st1, 100);
  b.step(st1, 50);
  b.step(st1, 50);
  ok(Math.abs(a.att[10] - b.att[10]) < 1e-6, 'the ballistics are the same at any frame rate (to Float32 storage)');

  // Alternation survives: even bins hot, odd bins silent — per-bin keeps the pattern, a block
  // smoother would flatten it to the mean.
  const d2 = createSpectrumWarp();
  const alt = blankState();
  for (let i = 0; i < LOG_BINS; i += 2) alt.smooth[i] = 1;
  for (let f = 0; f < 30; f++) d2.step(alt, 16.7);
  ok(d2.att[0] > 0.3 && d2.att[1] === 0 && d2.att[3] === 0, 'the per-bin pattern survives 30 frames');
}

// ── C. the mapping ────────────────────────────────────────────────────────────────────────────────────
{
  // Silence from cold: the exact neutral.
  const d = createSpectrumWarp();
  const w = d.step(blankState(), 16.7);
  eq(w.bassDev, 0, 'silence: no bass deviation');
  eq(w.attMids, 0);
  eq(w.attTreble, 0);
  eq(w.attAll, 0);
  eq(w.keep, WARP_KEEP_MIN, 'silence: decay at the band floor (0.92)');

  // Bass deviation (relative mode) passes through, both signs — while bass is sounding.
  const d2 = createSpectrumWarp();
  const st = blankState();
  for (const i of WARP_BASS_BINS) {
    st.smooth[i] = 0.4;
    st.rel[i] = 0.5;
  }
  eq(d2.step(st, 16.7).bassDev, 0.5, 'above-normal bass reads +0.5');
  const d3 = createSpectrumWarp();
  const st3 = blankState();
  for (const i of WARP_BASS_BINS) {
    st3.smooth[i] = 0.4;
    st3.rel[i] = -0.25;
  }
  eq(d3.step(st3, 16.7).bassDev, -0.25, 'below-normal bass reads -0.25');

  // The gate: bass silent but the stale average still high (rel very negative) — history, not signal.
  const d4 = createSpectrumWarp();
  const st4 = blankState();
  for (const i of WARP_BASS_BINS) st4.rel[i] = -0.9;
  eq(d4.step(st4, 16.7).bassDev, 0, 'silent bass: deviation gated to 0, zoom sits at identity');

  // Band isolation: energy only in the mids moves attMids and nothing else.
  const d5 = createSpectrumWarp();
  const st5 = blankState();
  for (const i of WARP_MIDS_BINS) st5.smooth[i] = 1;
  for (let f = 0; f < 10; f++) d5.step(st5, 16.7);
  ok(d5.att[WARP_MIDS_BINS[0]] > 0, 'mids energy attenuates in');
  eq(Math.max(...WARP_TREBLE_BINS.map((i) => d5.att[i])), 0, 'no treble leakage');
  eq(Math.max(...WARP_BASS_BINS.map((i) => d5.att[i])), 0, 'no bass leakage');

  // Decay rides the attenuated overall level toward the band ceiling, and relaxes back to the floor.
  const d6 = createSpectrumWarp();
  const loud = blankState();
  loud.smooth.fill(1);
  let w6;
  for (let f = 0; f < 60; f++) w6 = d6.step(loud, 200);
  ok(w6.keep > WARP_KEEP_MAX - 0.005 && w6.keep <= WARP_KEEP_MAX, `loud: keep near the 0.985 ceiling (got ${w6.keep})`);
  for (let f = 0; f < 400; f++) w6 = d6.step(blankState(), 200);
  eq(w6.keep, WARP_KEEP_MIN, 'after silence: keep back at the floor, att exactly 0');
  eq(w6.attMids, 0);
  eq(w6.attTreble, 0);
}

// ── D. applySpectrumWarp ──────────────────────────────────────────────────────────────────────────────
{
  const base = accumRecipeParams({ fade: 0.88, optics: 0.1, tunnel: 0.5, prism: 0.5, background: '#000000' });
  assert.deepEqual(applySpectrumWarp(base, null, 1), base, 'null warp: the recipe, field for field');
  checks++;
  const silent = createSpectrumWarp().step(blankState(), 16.7);
  assert.deepEqual(applySpectrumWarp(base, silent, 0), base, 'amount 0: the recipe, field for field');
  checks++;

  // Silence at full amount: identity warp, decay only — every transform field is the recipe's own,
  // and keep alone blends to the band floor.
  const n = applySpectrumWarp(base, silent, 1);
  eq(n.tunnelZoom, base.tunnelZoom, 'neutral: zoom untouched');
  eq(n.tunnelSpin, base.tunnelSpin, 'neutral: spin untouched');
  eq(n.prismUv, base.prismUv, 'neutral: prism untouched');
  eq(n.optics, base.optics, 'neutral: no grain');
  eq(n.keep, WARP_KEEP_MIN, 'neutral: keep is the warp decay (0.92)');

  // A hot warp composes: zoom follows the deviation, spin/prism/grain rise with their bands, and the
  // artist's own tunnel/prism amounts are added onto, never replaced.
  const hot = { bassDev: 1, attMids: 1, attTreble: 1, attAll: 1, keep: WARP_KEEP_MAX };
  const h = applySpectrumWarp(base, hot, 1);
  ok(Math.abs(h.tunnelZoom - (base.tunnelZoom + 0.02)) < 1e-12, 'zoom = the recipe zoom + 0.02 at deviation 1');
  ok(Math.abs(h.tunnelSpin - (base.tunnelSpin + 0.015)) < 1e-12, 'spin adds 0.015 rad/frame at att mids 1');
  ok(Math.abs(h.prismUv - (base.prismUv + 0.0015)) < 1e-12, 'prism adds 0.0015 UV at att treble 1');
  ok(
    h.optics > base.optics && h.stipple > base.stipple && h.chromaTexels > base.chromaTexels,
    'treble lifts the glow grain (stipple + chroma)',
  );
  eq(h.keep, WARP_KEEP_MAX, 'keep reaches the warp target at amount 1');
  assertRecipeFinite(h);
  checks++;

  // Partial amount scales the whole gesture; hostile warp values stay inside the clamps.
  const half = applySpectrumWarp(base, hot, 0.5);
  ok(Math.abs(half.tunnelSpin - (base.tunnelSpin + 0.0075)) < 1e-12, 'amount 0.5 halves the spin');
  const wild = applySpectrumWarp(base, { bassDev: 50, attMids: 50, attTreble: 50, keep: 99 }, 1);
  ok(
    wild.tunnelZoom <= 1.05 && wild.tunnelSpin <= 0.05 && wild.prismUv <= 0.004 && wild.keep <= 0.99,
    'clamps hold against hostile targets',
  );
  assertRecipeFinite(wild);
  checks++;

  // It composes with the band envelope the same way it composes with the sliders (order: envelope, then warp).
  const env = applyAudioEnvelope(base, { rms: 0.5, flux: 0, beatPulse: 0 }, { swell: 1 });
  const both = applySpectrumWarp(env, hot, 1);
  ok(both.tunnelZoom > env.tunnelZoom && both.keep >= env.keep, 'warp after envelope still moves zoom and decay');
}

// ── E. replay determinism through the recorded-input path ────────────────────────────────────────────
{
  // A live sequence: tones sweeping the bands, stepped through a fresh core + driver.
  const frames = 240;
  const dbSeq = [];
  for (let f = 0; f < frames; f++) {
    const db = new Float32Array(1024).fill(-40); // a loud broadband passage
    const bin = 20 + Math.floor(300 * Math.abs(Math.sin(f / 30)));
    for (let k = bin; k < bin + 24; k++) db[k] = -30; // with a brighter band sweeping through it
    dbSeq.push(db);
  }
  const liveRun = () => {
    const core = createSpectrumCore();
    const d = createSpectrumWarp();
    return dbSeq.map((db) => {
      const w = d.step(core.update(db, 1000 / 60), 1000 / 60);
      return [w.bassDev, w.attMids, w.attTreble, w.keep];
    });
  };
  const run1 = liveRun();
  const run2 = liveRun();
  assert.deepEqual(run2, run1, 'the same analysis sequence warps identically, run for run');
  checks++;
  ok(
    run1.some((w) => w[3] > WARP_KEEP_MIN + 0.01),
    'the sequence actually warps (keep leaves the floor)',
  );

  // The take's path: record the section the way the take does (32-bin rows of the smoothed spectrum),
  // then play it back through spectrumLive — the exact calls the app makes — and step the warp off
  // readSpectrum(). Played twice, the warp sequences are identical: a replayed take warps identically.
  const core = createSpectrumCore();
  const rows = [];
  const bytes = new Uint8Array(frames * 32);
  dbSeq.forEach((db, f) => {
    core.update(db, 1000 / 60);
    rows.push(quantizeSpectrum(core.state.smooth, new Uint8Array(32)));
  });
  rows.forEach((r, f) => bytes.set(r, f * 32));
  const playRun = () => {
    beginSpectrumPlayback(bytes);
    const d = createSpectrumWarp();
    const out = [];
    for (let f = 0; f < frames; f++) {
      stepSpectrumPlayback(f);
      const w = d.step(readSpectrum(), 1000 / 60);
      out.push([w.bassDev, w.attMids, w.attTreble, w.keep]);
    }
    endSpectrumPlayback();
    return out;
  };
  const play1 = playRun();
  const play2 = playRun();
  assert.deepEqual(play2, play1, 'the recorded section replays to the identical warp sequence');
  checks++;
  ok(
    play1.some((w) => w[3] > WARP_KEEP_MIN + 0.005),
    'the replayed take still warps (the hearing survives the record)',
  );
}

// ── F. the governor rung ──────────────────────────────────────────────────────────────────────────────
{
  const walk = (s0) => {
    const kinds = [];
    let s = { ...s0 };
    for (let i = 0; i < 20; i++) {
      const cut = nextGovernorCut(s);
      if (!cut) break;
      kinds.push(cut.kind);
      if (cut.kind === 'renderScale') s = { ...s, renderScale: cut.scale };
      else if (cut.kind === 'markWeather') s = { ...s, weatherShed: true };
      else if (cut.kind === 'feedbackWarp') s = { ...s, feedbackWarpShed: true };
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
    feedbackWarpActive: true,
    feedbackWarpShed: false,
    travelActive: true,
    travelShed: false,
  });
  assert.deepStrictEqual(
    kinds.slice(0, 8),
    [
      'renderScale',
      'renderScale',
      'renderScale',
      'markWeather',
      'feedbackWarp',
      'creatureCount',
      'creatureCount',
      'travel',
    ],
    'pixel trim, weather (1.4), warp (1.45), population (1.5), travel (1.6)',
  );
  checks++;
  ok(kinds.indexOf('feedbackWarp') < kinds.indexOf('creatureCount'), 'the warp sheds before body counts');
  ok(kinds.indexOf('markWeather') < kinds.indexOf('feedbackWarp'), 'weather still dies before the warp');

  const noWarp = walk({
    ...PRESSURE,
    creatureCount: 1,
    creatureShed: 0,
    weatherActive: true,
    weatherShed: false,
    travelActive: true,
    travelShed: false,
  });
  ok(!noWarp.includes('feedbackWarp'), 'no feedbackWarpActive from the caller → no warp rung (pre-#1490 ladder)');
  const already = nextGovernorCut({
    ...PRESSURE,
    renderScale: 0.33,
    feedbackWarpActive: true,
    feedbackWarpShed: true,
    creatureCount: 0,
    creatureShed: 0,
  });
  ok(already.kind !== 'feedbackWarp', 'an already-shed warp does not re-fire');

  const summary = shedSummary({ renderScale: 1, feedbackWarpShed: true });
  ok(Array.isArray(summary) && summary.includes('feedback warp off'), 'the badge names the warp shed');
  const restore = GOVERNOR_RESTORE_CUTS.find((c) => c.kind === 'feedbackWarp');
  ok(!!restore, 'the warp has a restore entry');
  eq(restore.needsRestore({ feedbackWarpShed: true }, { healthy: true }), true, 'a shed warp restores when healthy');
  eq(restore.needsRestore({ feedbackWarpShed: true }, { healthy: false }), false, 'and not while unhealthy');
  eq(restore.needsRestore({ feedbackWarpShed: false }, { healthy: true }), false, 'an unshed warp never "restores"');

  // The event log's SHED_STEPS predates this rung (and 1.4/1.5/1.6): the hook's guarded record pattern
  // is the treatment — asserted here at the source so the guard is never "tidied" away.
  const hook = src('../hooks/usePerformanceGovernor.js');
  ok(
    flat(hook).includes(flat('recordCutEvent = (e) => { if (LOG_KNOWN_KINDS.has(e.cutKind))')),
    'the hook still guards event-log kinds',
  );
  ok(flat(hook).includes(flat("case 'feedbackWarp': setFeedbackWarpShed(true);")), 'the hook applies the warp shed');
  ok(flat(hook).includes(flat("case 'feedbackWarp': setFeedbackWarpShed(false);")), 'the hook restores the warp shed');

  // The live seam: amount gated, driver stepped off the shared spectrum state, only on the accum path.
  const loop = src('./liveLoop.mjs');
  ok(
    loop.includes('feedbackWarpAmount(s.layers, !!s.feedbackWarpShed)'),
    'the loop reads the amount off the FX strata + shed overlay',
  );
  ok(loop.includes('if (feedbackWarp > 0)'), 'the warp application is gated on the amount');
  ok(
    loop.includes('warpDriver.step(readSpectrum(), clampedDtMs)'),
    'the driver steps off readSpectrum() — the recorded-input path',
  );
}

// ── G. cost ───────────────────────────────────────────────────────────────────────────────────────────
{
  const decl = getCostTier('gl/spectrum-warp');
  ok(!!decl, 'the warp declares its cost tier at registration');
  eq(decl.tier, 1, 'tier 1 — the shed-first family');
  eq(decl.memoryBytes, 0, 'no working set: no pass, no texture');
  const st = blankState();
  st.smooth.fill(0.7);
  const d = createSpectrumWarp();
  const med = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[s.length >> 1];
  };
  const runs = [];
  for (let r = 0; r < 7; r++) {
    const times = [];
    for (let i = 0; i < 2000; i++) {
      const t0 = process.hrtime.bigint();
      d.step(st, 16.7);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    runs.push(med(times));
  }
  const stepMs = med(runs);
  console.log(
    `spectrumWarp bench: step ${stepMs.toFixed(4)} ms (per-step hrtime, median of 7 runs of 2000-step medians, sandbox node)`,
  );
  ok(stepMs < 0.05, 'the per-frame CPU step stays in the declared class (0.01 declared, timer-bound measure)');
}

console.log(`spectrumWarp.selfcheck: ok — ${checks} checks`);
