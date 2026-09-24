// patchLinearity.selfcheck — gain-preservation guards (#507).
// Kernel-only: proves the FIELD/FEED/MOD gains keep their SHAPE (doubling
// strength doubles effect) without pinning the frozen constants, so this
// suite can never brittle-fail on values Matt hasn't changed — but any edit
// to 0.002, 0.05, or the knob factors breaks a ratio. Header says why.
import { strict as assert } from 'node:assert';
import { applyField, applyMod, normalizePatch } from './trackGraph.js';
import { createFeedLive } from './feedLive.js';

const RATIO_TOL = 1e-9;
const ratio2 = (dFull, dHalf, label) => {
  assert.ok(Math.abs(dFull - 2 * dHalf) < RATIO_TOL, `${label} scales linearly with strength`);
};

// FIELD: fixed geometry, strength 0.5 → 1.0 doubles per-item displacement.
{
  const tgt = [{ x: 0.5, y: 0.5 }, { x: 0.2, y: 0.8 }];
  const src = [{ x: 0.9, y: 0.1 }, { x: 0.8, y: 0.2 }, { x: 0.7, y: 0.3 }];
  const disp = (s) => {
    const out = applyField(tgt, src, normalizePatch({ mode: 'field', strength: s }));
    return tgt.map((q, i) => Math.hypot(out[i].x - q.x, out[i].y - q.y));
  };
  const half = disp(0.5), full = disp(1.0);
  for (let i = 0; i < tgt.length; i++) ratio2(full[i], half[i], `field item ${i}`);
  console.log('[selfcheck] patchLinearity FIELD gain shape');
}

// FEED: committed history, strength 0.5 → 1.0 doubles displacement.
// (Mirror the feedLive.selfcheck flow: push, commit, then applyTo reads
// the committed delay state. Fresh identical history per strength so each
// applyTo reads the same delay.)
{
  const pts = [{ x: 0.4, y: 0.55 }, { x: 0.5, y: 0.55 }];
  // History must be DENSE around the targets: the flow field is the spatial
  // gradient/curl of the rasterized luma, so isolated dots read ~zero
  // everywhere except their immediate neighbours. A tight line through the
  // targets (mirroring feedLive.selfcheck's proven setup) guarantees pull.
  const hist = Array.from({ length: 40 }, (_, i) => ({ x: 0.35 + i * 0.005, y: 0.55 }));
  const disp = (s) => {
    // Delay-1 needs two cycles before it pulls (first applyTo primes).
    const feed = createFeedLive();
    feed.pushSource(0, hist);
    feed.applyTo(pts, { mode: 'feed', from: 0, to: 1, strength: s });
    feed.commit();
    feed.pushSource(0, hist);
    const out = feed.applyTo(pts, { mode: 'feed', from: 0, to: 1, strength: s });
    return pts.map((q, i) => Math.hypot(out[i].x - q.x, out[i].y - q.y));
  };
  const half = disp(0.5), full = disp(1.0);
  assert.ok(half.some((d) => d > 0), 'committed history pulls (nonzero baseline)');
  for (let i = 0; i < pts.length; i++) ratio2(full[i], half[i], `feed item ${i}`);
  console.log('[selfcheck] patchLinearity FEED gain shape');
}

// MOD: fixed metrics, strength 0.5 → 1.0 doubles glow/fade/displace deltas.
{
  const metrics = { speed: 2, agitation: 3, density: 0.5 };
  const k0 = { glow: 0, fade: 0, displace: 0 };
  const half = applyMod(k0, metrics, normalizePatch({ mode: 'mod', strength: 0.5 }));
  const full = applyMod(k0, metrics, normalizePatch({ mode: 'mod', strength: 1 }));
  ratio2(full.glow, half.glow, 'mod glow');
  ratio2(full.fade, half.fade, 'mod fade');
  ratio2(full.displace, half.displace, 'mod displace');
  ratio2(full.ali - 1, half.ali - 1, 'mod ali');
  ratio2(full.coh - 1, half.coh - 1, 'mod coh');
  ratio2(full.sep - 1, half.sep - 1, 'mod sep');
  console.log('[selfcheck] patchLinearity MOD gain shape');
}
