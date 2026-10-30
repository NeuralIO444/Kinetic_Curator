// #1809 slice A — the wet-frame service: gate, ownership, shed policy,
// and the Phase A acceptance (byte-identical wetMask/wetVel vs the
// pre-service noteWetFrame path over fixed inputs).
import assert from 'node:assert';
import { EDGE_BAND_HI, EDGE_BAND_LO, noteWetFrame, VORTEX_WET_DRY } from './vortex.mjs';
import { createWetFrameService, WET_REGIMES, wetRegimeAt } from './wetFrame.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

/** Deterministic per-served-frame inputs (a pure function of the index). */
const frameInput = (i, over = {}) => ({
  wetness: 0.6,
  freeze: false,
  seed: 970,
  width: 1000,
  height: 700,
  behave: 'flock',
  motion: 0.4,
  instances: [
    { layer: 'content-0', key: 'a', x: 100 + i * 7, y: 200 + (i % 5) * 3, vx: 30, vy: 5 },
    { layer: 'content-0', key: 'b', x: 500 - i * 3, y: 400, vx: -12, vy: 20 },
    { layer: 'content-1', key: 'c', x: 700, y: 150 + i * 2, vx: 0, vy: 0 },
  ],
  ...over,
});

const assertWetEqual = (a, b, label) => {
  assert.strictEqual(a.wetStep, b.wetStep, `${label}: wetStep`);
  assert.strictEqual(a.wetGain, b.wetGain, `${label}: wetGain`);
  assert.strictEqual(a.wetAmount, b.wetAmount, `${label}: wetAmount`);
  for (const k of ['wetVel', 'wetMask']) {
    if (a[k] === null || b[k] === null) {
      assert.strictEqual(a[k], b[k], `${label}: ${k} null-ness`);
    } else {
      assert.strictEqual(a[k].n, b[k].n, `${label}: ${k}.n`);
      assert.deepStrictEqual(a[k].rgba, b[k].rgba, `${label}: ${k}.rgba bytes`);
    }
  }
};

const fnv = (bytes) => {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** fnv(wetMask.rgba) ^ fnv(wetVel.rgba) of the scripted session's final
 * frame below. Re-pins only when the sim itself changes (#1810).
 * #1810 re-pin: 2550213434 (64/30) → 3108730517 (128/20/4096), the
 * resolution change itself; character evidence in docs/review/1810/. */
const GOLDEN_FINAL_FRAME = 3108730517;

ok('Phase A acceptance: service output is byte-identical to noteWetFrame over a scripted session', () => {
  const slot = { vortex: null };
  const svc = createWetFrameService();
  const phases = [
    ...Array.from({ length: 30 }, (_, i) => frameInput(i)),
    ...Array.from({ length: 5 }, (_, i) => frameInput(30 + i, { freeze: true })),
    ...Array.from({ length: 5 }, (_, i) => frameInput(35 + i, { wetness: 0 })),
    ...Array.from({ length: 10 }, (_, i) => frameInput(40 + i)),
    ...Array.from({ length: 5 }, (_, i) => frameInput(50 + i, { seed: 41 })),
    ...Array.from({ length: 5 }, (_, i) => frameInput(55 + i, { seed: 41, width: 800, height: 600 })),
  ];
  let last = null;
  phases.forEach((input, idx) => {
    const direct = noteWetFrame(slot, input);
    const served = svc.frame({ consumers: { accum: true }, shed: null, degradedOk: false, ...input });
    assertWetEqual(direct, served, `frame ${idx}`);
    assert.strictEqual(served.wetMode, direct.wetStep === 1 ? 'live' : 'off', `frame ${idx}: mode`);
    last = served;
  });
  // Golden over the final frame's packed field — re-pins only with the sim (#1810).
  const golden = (fnv(last.wetMask.rgba) ^ fnv(last.wetVel.rgba)) >>> 0;
  assert.strictEqual(golden, GOLDEN_FINAL_FRAME, 'final-frame golden');
  const st = svc.stats();
  assert.strictEqual(st.births, 3, 'births: initial + seed change + size change');
  assert.strictEqual(st.fullSteps, 50, 'full steps: 30 + 10 resumed + 5 seed + 5 size');
  assert.strictEqual(st.heldFrames, 5, 'held: the freeze phase');
});

ok('determinism: two fresh services serve identical bytes', () => {
  const a = createWetFrameService();
  const b = createWetFrameService();
  for (let i = 0; i < 12; i++) {
    const input = frameInput(i, { seed: 41 });
    assertWetEqual(
      a.frame({ consumers: { accum: true }, ...input }),
      b.frame({ consumers: { accum: true }, ...input }),
      `frame ${i}`,
    );
  }
});

ok('need-based gate: no consumer requesting → zero steps, no field birth', () => {
  const svc = createWetFrameService();
  for (let i = 0; i < 6; i++) {
    const out = svc.frame({ consumers: { accum: false }, ...frameInput(i) });
    assert.strictEqual(out.wetStep, 0);
    assert.strictEqual(out.wetMask, null);
    assert.strictEqual(out.wetMode, 'off');
  }
  svc.frame({ ...frameInput(0) }); // no consumers key at all
  const st = svc.stats();
  assert.strictEqual(st.fullSteps, 0);
  assert.strictEqual(st.births, 0);
  assert.strictEqual(svc.field(), null, 'the field is never born for nothing');
});

ok('ownership: the field survives a consumer toggle, continuous across it', () => {
  const run = (withGap) => {
    const svc = createWetFrameService();
    const outs = [];
    for (let k = 0; k < 25; k++) {
      if (withGap && k === 15) {
        for (let j = 0; j < 10; j++) svc.frame({ consumers: { accum: false }, ...frameInput(900 + j) });
        assert.ok(svc.field(), 'field stands while its consumer is off');
        assert.strictEqual(svc.stats().fullSteps, 15, 'no steps across the gap');
        assert.strictEqual(svc.stats().births, 1, 'no rebirth across the gap');
      }
      outs.push(svc.frame({ consumers: { accum: true }, ...frameInput(k) }));
    }
    return outs;
  };
  const straight = run(false);
  const gapped = run(true);
  for (let k = 0; k < 25; k++) assertWetEqual(straight[k], gapped[k], `served frame ${k}`);
});

ok('wetness 0 is served dry: absent shape, no step, no birth', () => {
  const svc = createWetFrameService();
  const out = svc.frame({ consumers: { accum: true }, ...frameInput(0, { wetness: 0 }) });
  assert.strictEqual(out.wetStep, 0);
  assert.strictEqual(out.wetGain, 0);
  assert.strictEqual(out.wetMode, 'off');
  assert.strictEqual(svc.field(), null);
  assert.strictEqual(svc.stats().births, 0);
});

ok('freeze holds the field: same mask bytes, no step counted', () => {
  const svc = createWetFrameService();
  let prev = null;
  for (let i = 0; i < 8; i++) prev = svc.frame({ consumers: { accum: true }, ...frameInput(i) });
  const stepsBefore = svc.field().steps;
  const held = svc.frame({ consumers: { accum: true }, ...frameInput(8, { freeze: true }) });
  assert.strictEqual(held.wetStep, 1, 'a held frame still publishes the field');
  assert.deepStrictEqual(held.wetMask.rgba, prev.wetMask.rgba, 'held mask is byte-identical');
  assert.strictEqual(svc.field().steps, stepsBefore, 'the sim did not step');
  assert.strictEqual(svc.stats().heldFrames, 1);
  assert.strictEqual(svc.stats().fullSteps, 8);
});

ok('shed without degraded consent: stood down, named, field untouched', () => {
  const svc = createWetFrameService();
  const out = svc.frame({
    consumers: { accum: true },
    shed: 'perfTier1',
    degradedOk: false,
    ...frameInput(0),
  });
  assert.strictEqual(out.wetStep, 0);
  assert.strictEqual(out.wetMask, null);
  assert.strictEqual(out.wetMode, 'shed');
  assert.strictEqual(out.wetShed, 'perfTier1');
  assert.strictEqual(svc.field(), null, 'no field is born under the shed');
  assert.strictEqual(svc.stats().shedFrames, 1);
  assert.strictEqual(svc.stats().fullSteps, 0);
});

ok('degraded service: stamps land, the mask dries in place, nothing advects, no velocity published', () => {
  const svc = createWetFrameService();
  for (let i = 0; i < 12; i++) svc.frame({ consumers: { accum: true }, ...frameInput(i) });
  const state = svc.field();
  const snapCount = state.count;
  const snapVortons = Float32Array.from(state.vortons.subarray(0, snapCount * 4));
  const stepsBefore = state.steps;

  // A fresh stationary mark at a quiet corner, served degraded.
  const stampAt = { layer: 'content-1', key: 'z', x: 850, y: 620, vx: 0, vy: 0 };
  // The stamp's largest-weight cell, from stampWet's own bilinear mapping —
  // computed, not hardcoded, so the case survives grid changes (#1810).
  const sgx = (stampAt.x / state.width) * (state.n - 1);
  const sgy = (stampAt.y / state.height) * (state.n - 1);
  const si0 = sgx | 0;
  const sj0 = sgy | 0;
  const stx = sgx - si0;
  const sty = sgy - sj0;
  const [sci, scj] = [
    [si0, sj0, (1 - stx) * (1 - sty)],
    [si0 + 1, sj0, stx * (1 - sty)],
    [si0, sj0 + 1, (1 - stx) * sty],
    [si0 + 1, sj0 + 1, stx * sty],
  ].reduce((a, b) => (b[2] > a[2] ? b : a));
  const cellIdx = scj * state.n + sci;
  const cellBefore = state.wet[cellIdx];
  const out = svc.frame({
    consumers: { dish: true },
    shed: 'perfTier1',
    degradedOk: true,
    ...frameInput(12, { instances: [stampAt] }),
  });
  assert.strictEqual(out.wetMode, 'degraded');
  assert.strictEqual(out.wetShed, 'perfTier1');
  assert.strictEqual(out.wetStep, 1);
  assert.strictEqual(out.wetVel, null, 'no velocity is published while advection is skipped');
  assert.strictEqual(out.wetGain, 0);
  assert.strictEqual(out.wetAmount, 0.6);
  assert.ok(out.wetMask, 'the mask is published');
  assert.ok(
    state.wet[cellIdx] > cellBefore + 0.1,
    `stamp landed through the shed (${cellBefore} → ${state.wet[cellIdx]})`,
  );
  assert.strictEqual(state.steps, stepsBefore, 'the sim step did not run');
  assert.deepStrictEqual(
    Float32Array.from(state.vortons.subarray(0, snapCount * 4)),
    snapVortons,
    'pre-existing vortons neither moved nor decayed (advection skipped)',
  );
  assert.strictEqual(svc.stats().degradedSteps, 1);
  assert.strictEqual(svc.stats().fullSteps, 12);

  // A stamp-free degraded frame is exactly the dry factor, everywhere.
  const wetBefore = Float32Array.from(state.wet);
  svc.frame({
    consumers: { dish: true },
    shed: 'perfTier1',
    degradedOk: true,
    ...frameInput(13, { instances: [] }),
  });
  for (let i = 0; i < state.wet.length; i++) {
    assert.strictEqual(state.wet[i], Math.fround(wetBefore[i] * VORTEX_WET_DRY), `cell ${i} dried in place`);
  }
  assert.strictEqual(svc.stats().degradedSteps, 2);
});

ok('degraded service can birth the field (first consumer arrives under the shed)', () => {
  const svc = createWetFrameService();
  const out = svc.frame({
    consumers: { dish: true },
    shed: 'perfTier1',
    degradedOk: true,
    ...frameInput(0, { instances: [{ layer: 'content-0', key: 'a', x: 500, y: 350, vx: 0, vy: 0 }] }),
  });
  assert.strictEqual(out.wetMode, 'degraded');
  assert.ok(svc.field(), 'field born');
  assert.strictEqual(svc.stats().births, 1);
  // The packed-mask byte of the cell containing the stamp at (500, 350) —
  // computed from the field's own mapping, grid-agnostic since #1810.
  const fn = svc.field().n;
  const ci = Math.floor((500 / 1000) * (fn - 1));
  const cj = Math.floor((350 / 700) * (fn - 1));
  const centre = (cj * fn + ci) * 4;
  assert.ok(out.wetMask.rgba[centre] > 0, 'the stamp is in the published mask');
});

ok('regime thresholds: ordered bands over the mask value', () => {
  for (let i = 1; i < WET_REGIMES.length; i++) assert.ok(WET_REGIMES[i].at > WET_REGIMES[i - 1].at);
  for (const r of WET_REGIMES) assert.ok(r.at > 0 && r.at < 1);
  assert.strictEqual(wetRegimeAt(0), 'dry');
  assert.strictEqual(wetRegimeAt(Number.NaN), 'dry');
  assert.strictEqual(wetRegimeAt(0.05), 'damp');
  assert.strictEqual(wetRegimeAt(0.34), 'damp');
  assert.strictEqual(wetRegimeAt(0.35), 'wet');
  assert.strictEqual(wetRegimeAt(0.79), 'wet');
  assert.strictEqual(wetRegimeAt(0.8), 'soaked');
  assert.strictEqual(wetRegimeAt(1), 'soaked');
});

ok('dispose is the only destroy: after it, the next served frame rebirths', () => {
  const svc = createWetFrameService();
  svc.frame({ consumers: { accum: true }, ...frameInput(0) });
  assert.ok(svc.field());
  svc.dispose();
  assert.strictEqual(svc.field(), null);
  svc.frame({ consumers: { accum: true }, ...frameInput(1) });
  assert.ok(svc.field());
  assert.strictEqual(svc.stats().births, 2);
});

ok('#1811 pigment rides the service: tinted frames publish the deposit pack; tintless stay absent', () => {
  const svc = createWetFrameService();
  let out = null;
  for (let i = 0; i < 40; i++) {
    out = svc.frame({ consumers: { accum: true }, ...frameInput(i) });
    assert.strictEqual(out.pigStep, 0, `frame ${i}: no coloured marks yet`);
    assert.strictEqual(out.pigDep, null);
  }
  const tinted = (i) =>
    frameInput(i, {
      instances: [
        { layer: 'content-0', key: 'a', x: 500, y: 350, vx: 0, vy: 0, tint: '#1a4fd6' },
        { layer: 'content-0', key: 'b', x: 520, y: 350, vx: 0, vy: 0, tint: '#e8c832' },
      ],
    });
  for (let i = 0; i < 40; i++) out = svc.frame({ consumers: { accum: true }, ...tinted(i) });
  assert.strictEqual(out.pigStep, 1, 'pigment live publishes');
  assert.ok(out.pigDep && out.pigDep.n === svc.field().n, 'deposit pack at field resolution');
  let stained = 0;
  for (let k = 0; k < out.pigDep.n * out.pigDep.n; k++) if (out.pigDep.rgba[k * 4 + 3] > 0) stained++;
  assert.ok(stained > 0, 'deposits settled under the stamps are in the pack');
  // The service's full path is noteWetFrame's own result: same bytes.
  const slot = { vortex: null };
  const svc2 = createWetFrameService();
  for (let i = 0; i < 10; i++) {
    const direct = noteWetFrame(slot, tinted(i));
    const served = svc2.frame({ consumers: { accum: true }, ...tinted(i) });
    assert.strictEqual(served.pigStep, direct.pigStep);
    assert.deepStrictEqual(served.pigDep.rgba, direct.pigDep.rgba, `frame ${i}: deposit pack bytes`);
  }
});

ok('#1811 degraded service: pigment stamps land and keep settling under the shed', () => {
  const svc = createWetFrameService();
  const stamp = { layer: 'content-0', key: 'a', x: 500, y: 350, vx: 0, vy: 0, tint: '#1a4fd6' };
  let out = null;
  for (let i = 0; i < 30; i++) {
    out = svc.frame({
      consumers: { dish: true },
      shed: 'perfTier1',
      degradedOk: true,
      ...frameInput(i, { instances: [stamp] }),
    });
  }
  assert.strictEqual(out.wetMode, 'degraded');
  assert.strictEqual(out.pigStep, 1, 'pigment published under degraded service');
  const state = svc.field();
  let s = 0,
    d = 0;
  for (let k = 0; k < state.n * state.n; k++) {
    s += state.pigS[k * 4 + 3];
    d += state.pigD[k * 4 + 3];
  }
  assert.ok(s > 0, 'suspended pigment landed through the shed');
  assert.ok(d > 0, 'transfer settled pigment without any advection');
});

ok("#1812 the edge stage's damp band is the service's damp band", () => {
  assert.strictEqual(EDGE_BAND_LO, WET_REGIMES[0].at, 'band floor = the damp regime threshold');
  assert.strictEqual(EDGE_BAND_HI, WET_REGIMES[1].at, 'band ceiling = the wet regime threshold');
});

ok('#1812 degraded service: deposits darken on schedule under the shed', () => {
  const svc = createWetFrameService();
  const stamp = { layer: 'content-0', key: 'a', x: 500, y: 350, vx: 0, vy: 0, tint: '#1a4fd6' };
  let out = null;
  for (let i = 0; i < 30; i++) {
    out = svc.frame({
      consumers: { dish: true },
      shed: 'perfTier1',
      degradedOk: true,
      ...frameInput(i, { instances: [stamp] }),
    });
  }
  assert.strictEqual(out.pigStep, 1, 'pigment live under degraded service');
  // The stamps stop; the mask now dries in place through the damp band,
  // one VORTEX_WET_DRY factor per stamp-free degraded frame.
  for (let i = 0; i < 500; i++) {
    out = svc.frame({
      consumers: { dish: true },
      shed: 'perfTier1',
      degradedOk: true,
      ...frameInput(30 + i, { instances: [] }),
    });
  }
  const state = svc.field();
  let maxEdge = 0;
  for (let k = 0; k < state.n * state.n; k++) if (state.pigEdge[k] > maxEdge) maxEdge = state.pigEdge[k];
  assert.ok(maxEdge > 0.05, `edge darkening accrued under the shed (max ${maxEdge.toFixed(3)})`);
  assert.ok(out.pigDep, 'the darkened deposit pack is what degraded service publishes');
});

ok('#1841 the dish alone requests the field: need gate answers a second consumer', () => {
  const svc = createWetFrameService();
  const nobody = svc.frame({ consumers: {}, shed: null, degradedOk: false, ...frameInput(0) });
  assert.strictEqual(nobody.wetMode, 'off', 'no consumer: off');
  assert.strictEqual(svc.field(), null, 'no consumer: the field is never born');
  const served = svc.frame({ consumers: { dish: true }, shed: null, degradedOk: true, ...frameInput(0) });
  assert.strictEqual(served.wetStep, 1, 'the dish alone steps the field');
  assert.strictEqual(served.wetMode, 'live', 'full service for the dish');
  assert.ok(svc.field(), 'the field stands after the dish’s frame');
});

ok('#1841 sampleWet reads the standing field: stamped point wet, far point dry, no field dry', () => {
  const svc = createWetFrameService();
  assert.strictEqual(svc.sampleWet(700, 150), 0, 'no field yet: dry');
  assert.strictEqual(svc.sampleWet(-5, 150), 0, 'out of stage: dry');
  assert.strictEqual(svc.sampleWet(NaN, 150), 0, 'junk point: dry');
  for (let i = 0; i < 8; i++) svc.frame({ consumers: { dish: true }, shed: null, degradedOk: true, ...frameInput(i) });
  // frameInput's instance c rests at (700, 150 + i*2) and stamps 0.35 a frame.
  const atMark = svc.sampleWet(700, 157);
  assert.ok(atMark >= 0.35, `the resting mark's point reads wet (got ${atMark.toFixed(3)})`);
  assert.strictEqual(wetRegimeAt(atMark) === 'dry', false, 'and not in the dry regime');
  const far = svc.sampleWet(60, 660);
  assert.ok(far < 0.05, `a far corner stays under the damp threshold (got ${far.toFixed(3)})`);
});

ok('#1841 dish contact stamps land on the full path and under the shed; dropped unserved', () => {
  const stamps = [{ x: 300, y: 300, amount: 0.35 }];
  const plain = createWetFrameService();
  const pressed = createWetFrameService();
  for (let i = 0; i < 6; i++) {
    plain.frame({ consumers: { dish: true }, shed: null, degradedOk: true, ...frameInput(i, { instances: [] }) });
    pressed.frame({
      consumers: { dish: true },
      shed: null,
      degradedOk: true,
      stamps,
      ...frameInput(i, { instances: [] }),
    });
  }
  assert.ok(pressed.sampleWet(300, 300) > plain.sampleWet(300, 300), 'the press is in the field');
  assert.ok(pressed.sampleWet(300, 300) > 0.1, `and it reads (got ${pressed.sampleWet(300, 300).toFixed(3)})`);
  // Degraded: stamps-only service still takes the dish's stamps.
  const shedSvc = createWetFrameService();
  let out = null;
  for (let i = 0; i < 6; i++) {
    out = shedSvc.frame({
      consumers: { dish: true },
      shed: 'perfTier1',
      degradedOk: true,
      stamps,
      ...frameInput(i, { instances: [] }),
    });
  }
  assert.strictEqual(out.wetMode, 'degraded', 'the dish is served degraded under the shed');
  assert.ok(shedSvc.sampleWet(300, 300) > 0.1, 'the press landed through the shed');
  // Unserved: the stamps belong to a field nobody requested — dropped.
  const idle = createWetFrameService();
  const off = idle.frame({ consumers: {}, shed: null, degradedOk: false, stamps, ...frameInput(0) });
  assert.strictEqual(off.wetMode, 'off', 'no consumer: off');
  assert.strictEqual(idle.field(), null, 'and no field is born to receive them');
});

ok('#1841 dish stamps are deterministic: same presses, same field', () => {
  const run = () => {
    const svc = createWetFrameService();
    let last = null;
    for (let i = 0; i < 10; i++) {
      last = svc.frame({
        consumers: { accum: true, dish: true },
        shed: null,
        degradedOk: true,
        stamps: [{ x: 300 + i, y: 300, amount: 0.3 }],
        ...frameInput(i),
      });
    }
    return fnv(last.wetMask.rgba) >>> 0;
  };
  assert.strictEqual(run(), run(), 'two runs of the same presses agree byte for byte');
});

console.log(`wetFrame.selfcheck: ${n} checks passed`);
