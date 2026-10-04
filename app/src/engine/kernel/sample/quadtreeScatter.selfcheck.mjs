// Slice 3 — quadtree scatter: sampler registration, LAYOUT_MODES entry,
// density-by-depth dealing. Run: node <this file>
import assert from 'node:assert';
import { getSampler } from './registry.js';
import { LAYOUT_MODES, DEFAULT_LAYOUT_PARAMS, PARAM_SPEC } from '../../../data/layout-modes.js';
import {
  quadtreeTree, quadtreePlacement, dealLeafCounts,
} from './quadtree.js';
import { makeQuadtreeInterestingness, QUAD_BAND_ORDER } from './quadtreeSignal.js';
import { buildQuadtree } from './quadtree.js';

const SEED = (n) => (n * 2654435761) >>> 0;
const bandKey = (bands) => bands ? QUAD_BAND_ORDER.map((k) => (bands[k] || 0).toFixed(2)).join(',') : 'off';

// 1. The sampler is registered.
{
  const s = getSampler('quadtree');
  assert.strictEqual(typeof s, 'function', 'quadtree sampler must be registered');
}

// 2. LAYOUT_MODES entry: a System writing layoutParams.mode, face-copy clean.
{
  const entry = LAYOUT_MODES.find((m) => m.id === 'quadtree');
  assert.ok(entry, 'LAYOUT_MODES must include quadtree');
  assert.strictEqual(entry.name, 'quadtree', 'face name is the plain noun');
  for (const banned of ['preset', 'vibe', 'hype', 'swarm', 'murm']) {
    assert.ok(!entry.name.toLowerCase().includes(banned), `face name must not reuse banned word "${banned}"`);
  }
  assert.ok(typeof entry.glyph === 'string' && entry.glyph.length > 0, 'glyph required');
}

// 3. Params ride DEFAULT_LAYOUT_PARAMS → PARAM_SPEC with the spec defaults.
{
  assert.strictEqual(DEFAULT_LAYOUT_PARAMS.quadAudio, 0.5, 'quadAudio default 0.5');
  assert.strictEqual(DEFAULT_LAYOUT_PARAMS.quadField, 0.5, 'quadField default 0.5');
  assert.strictEqual(DEFAULT_LAYOUT_PARAMS.quadDepth, 5, 'quadDepth default 5');
  assert.deepStrictEqual(PARAM_SPEC.quadAudio, { min: 0, max: 1 }, 'quadAudio bounds');
  assert.deepStrictEqual(PARAM_SPEC.quadField, { min: 0, max: 1 }, 'quadField bounds');
  assert.deepStrictEqual(PARAM_SPEC.quadDepth, { min: 1, max: 6, int: true }, 'quadDepth bounds');
}

// 4. Dealing: the instance budget is a distribution, never a multiplier.
//    Total marks dealt == count exactly, for several counts and tree shapes.
{
  for (const seed of [SEED(7), SEED(99)]) {
    for (const count of [1, 7, 240, 800]) {
      const leaves = quadtreeTree({ seed, seedOffsets: null, quadAudio: 0.5, quadField: 0.5, quadDepth: 5, bands: null, fieldBucket: 3 });
      const dealt = dealLeafCounts(leaves, count);
      assert.strictEqual(dealt.length, leaves.length, 'one count per leaf');
      const total = dealt.reduce((a, b) => a + b, 0);
      assert.strictEqual(total, count, `dealt total must equal count exactly (seed ${seed}, count ${count})`);
      assert.ok(dealt.every((c) => Number.isInteger(c) && c >= 0), 'counts are non-negative integers');
    }
  }
  // Degenerate: a single root leaf still deals the whole count.
  {
    const leaves = quadtreeTree({ seed: SEED(1), seedOffsets: null, quadAudio: 0, quadField: 0, quadDepth: 5, bands: null, fieldBucket: 0 });
    const dealt = dealLeafCounts(leaves, 240);
    assert.strictEqual(dealt.reduce((a, b) => a + b, 0), 240, 'degenerate tree deals the full count');
  }
}

// 5. Bit-identical: same seed + params + signal → identical leaves AND placements.
{
  const args = { seed: SEED(42), seedOffsets: null, quadAudio: 0.7, quadField: 0.3, quadDepth: 5, bands: null, fieldBucket: 11 };
  const a = quadtreeTree(args);
  const b = quadtreeTree(args);
  assert.strictEqual(a, b, 'tree cache returns the identical array');
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b), 'tree is bit-identical');
  // Placements: same ctx stream twice → identical points.
  const mkCtx = (i) => ({
    i, count: 240, w: 1000, h: 800,
    rng: (() => { let s = SEED(5) + i * 97; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })(),
    jitter: 0, seed: SEED(42), seedOffsets: null,
    quadAudio: 0.7, quadField: 0.3, quadDepth: 5,
  });
  const nowMs = 1234567;
  const pa = [], pb = [];
  for (let i = 0; i < 240; i++) { pa.push(quadtreePlacement(mkCtx(i), nowMs)); pb.push(quadtreePlacement(mkCtx(i), nowMs)); }
  assert.strictEqual(JSON.stringify(pa), JSON.stringify(pb), 'placements are bit-identical');
  assert.ok(pa.every((p) => p.x >= 0 && p.x <= 1000 && p.y >= 0 && p.y <= 800), 'placements stay on the plate');
}

// 6. Density by depth: deeper leaves are denser per unit area.
{
  const leaves = quadtreeTree({ seed: SEED(1234), seedOffsets: null, quadAudio: 0.5, quadField: 0.5, quadDepth: 5, bands: null, fieldBucket: 0 });
  const dealt = dealLeafCounts(leaves, 800);
  const byDepth = new Map();
  leaves.forEach((L, j) => {
    const area = L.w * L.h;
    const dens = area > 0 ? dealt[j] / area : 0;
    if (!byDepth.has(L.depth)) byDepth.set(L.depth, []);
    byDepth.get(L.depth).push(dens);
  });
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  assert.ok(depths.length >= 3, `tree should span depths (got ${depths})`);
  const shallow = mean(byDepth.get(depths[0]));
  const deep = mean(byDepth.get(depths[depths.length - 1]));
  assert.ok(deep > shallow * 2, `deep leaves denser per area (shallow ${shallow.toFixed(1)}, deep ${deep.toFixed(1)})`);
}

// 7. Audio-led vs field-led give visibly different trees (the knob does something).
{
  const mk = (quadAudio, quadField, bands) => quadtreeTree({
    seed: SEED(77), seedOffsets: null, quadAudio, quadField, quadDepth: 5, bands, fieldBucket: 0,
  });
  const hot = { sub: 0.9, bass: 0.7, mud: 0.4, mids: 0.3, edge: 0.3, pres: 0.4, air: 0.5 };
  const audioLed = mk(1, 0, hot);
  const fieldLed = mk(0, 1, null);
  assert.notStrictEqual(JSON.stringify(audioLed), JSON.stringify(fieldLed), 'knob extremes give different trees');
  // Audio-led tree concentrates at the floor (sub at y=1): mean leaf-center y > 0.6.
  const meanY = (ls) => ls.reduce((a, L) => a + L.y + L.h / 2, 0) / ls.length;
  assert.ok(meanY(audioLed) > 0.6, `audio-led tree pools low (meanY ${meanY(audioLed).toFixed(2)})`);
}

console.log('quadtreeScatter.selfcheck: OK');
