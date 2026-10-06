// grainFinish.selfcheck.mjs — grain is presented with ACCUM off too (#1069).
//
// #520 Phase 2 split the grain-family finish chain out of the FX chain so it runs
// AFTER the accumulation step. Only the accum path ever applied it, so on every
// frame without ACCUM (the default) grain compiled, uploaded, animated and was
// never drawn. This renders a scene through the one-shot path (renderScene, no
// accumulation) with and without grain and demands the pixels differ. Byte-equal
// output is the bug.
import assert from 'node:assert';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

// ── no browser needed: the finish-chain plumbing is reachable from every presenter ──
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

ok('every non-accum present and readback applies the finish chains', () => {
  const live = read('./liveLoop.mjs');
  const ren = read('./renderer.mjs');
  const wk = read('./renderWorker.js');
  // the three plain-present sites in the main-thread loop
  assert.equal((live.match(/live\.present\(live\.applyFinishChains\(/g) || []).length, 3, 'liveLoop: three plain presents');
  assert.ok(!/live\.present\(target\)/.test(live), 'liveLoop: no raw present(target) is left');
  // the worker, accum and not
  assert.equal((wk.match(/live\.present\(live\.applyFinishChains\(/g) || []).length, 3, 'renderWorker: three plain presents');
  assert.ok(wk.includes('presentUpscaled(live.applyFinishChains('), 'renderWorker: the accum path finishes too');
  // one-shot stills and captures
  assert.ok(/applyFinishChains\(renderFrameInto\(payload, T, uploaded\)\)/.test(ren), 'renderScene finishes');
  assert.ok(/b\.resolveTargetToBytes\(b\.applyFinishChains\(mRead\)/.test(ren), 'renderFrameOffscreen finishes');
});

// ── browser: the actual pixels ──────────────────────────────────────────────
const diffStats = (a, b) => {
  let differ = 0; let sum = 0;
  const px = Math.min(a.length, b.length) / 4;
  for (let i = 0; i < px; i++) {
    const d = Math.abs(a[i * 4] - b[i * 4]) + Math.abs(a[i * 4 + 1] - b[i * 4 + 1]) + Math.abs(a[i * 4 + 2] - b[i * 4 + 2]);
    if (d > 0) differ++;
    sum += d;
  }
  return { differ: differ / px, meanDelta: sum / px / 3 };
};

try {
  const { getScene } = await import('./parity/corpus.mjs');
  const { renderCandidate, closeCandidate } = await import('./candidate.mjs');
  const base = getScene('fx-chain-2'); // FX layer [rgbSplit, grain 0.4] over content
  const withEffects = (effects) => {
    const doc = structuredClone(base.doc);
    doc.layers.find((l) => l.type === 'fx').effects = effects;
    return { ...base, doc };
  };
  const W = 200;
  const split = { kind: 'rgbSplit', params: { dx: 3 } };
  const grain = (amount) => ({ kind: 'grain', params: { amount } });

  const noGrain = await renderCandidate(withEffects([split]), { width: W });
  const g04 = await renderCandidate(withEffects([split, grain(0.4)]), { width: W });
  const g10 = await renderCandidate(withEffects([split, grain(1)]), { width: W });

  const a = diffStats(noGrain.pixels, g04.pixels);
  ok(`grain 0.4 is drawn: ${(a.differ * 100).toFixed(1)}% of pixels change (byte-equal was the bug)`, () => {
    assert.ok(!noGrain.pixels.equals(g04.pixels), 'grain must change the picture');
    assert.ok(a.differ > 0.05, `only ${(a.differ * 100).toFixed(2)}% of pixels changed`);
    assert.ok(a.meanDelta > 0.5, `mean change ${a.meanDelta.toFixed(3)} is not visible`);
  });
  const b = diffStats(noGrain.pixels, g10.pixels);
  ok('the amount is felt: grain 1.0 changes the picture more than 0.4', () => {
    assert.ok(b.meanDelta > a.meanDelta, `0.4 -> ${a.meanDelta.toFixed(3)}, 1.0 -> ${b.meanDelta.toFixed(3)}`);
  });
  const none = await renderCandidate(withEffects([split]), { width: W });
  ok('without grain the render is still deterministic', () => {
    assert.ok(noGrain.pixels.equals(none.pixels));
  });
  await closeCandidate();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  SKIP browser render checks: headless Chromium not installed');
  } else {
    throw e;
  }
}

console.log(`grainFinish.selfcheck: ${n} checks passed`);
