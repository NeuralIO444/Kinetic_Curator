// rollSafety.selfcheck.mjs — a random roll never deals a dead frame (#1107).
//
// The KIN hammer's CHAOS roll used to come out washed out, flat or black about one time in two. This
// pins the three causes (see fx/rollSafety.js for the measurements): the bottom content layer's blend,
// INVERT, and a default-strength HAZE. Node side drives the real store; the browser side renders the
// frames and measures them.
import assert from 'node:assert';
import { ROLL_EXCLUDED_FX, rollFxKinds, rollFxParams, rollBlend } from './rollSafety.js';
import { FX_MENU_KINDS, defaultFxParams, isFxLayer } from './fxFilters.js';
import { BLEND_MODES, DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { useStore } from '../state/store.js';
import { isMathLayer } from './mathFilters.js';
import { frameHealth, isDeadFrame } from './frameHealth.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const okA = async (name, fn) => { await fn(); n++; console.log(`  [ok] ${name}`); };

// A seeded Math.random, so the rolls below are reproducible.
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const realRandom = Math.random;

ok('pure helpers: INVERT is excluded, HAZE is gentle, everything else is untouched, the bottom is normal', () => {
  assert.deepEqual([...ROLL_EXCLUDED_FX], ['invert']);
  assert.ok(FX_MENU_KINDS.includes('invert') && FX_MENU_KINDS.includes('haze'), 'both exist for the player; a roll just does not deal INVERT');
  const kinds = rollFxKinds(FX_MENU_KINDS);
  assert.ok(!kinds.includes('invert')); assert.equal(kinds.length, FX_MENU_KINDS.length - 1);
  assert.deepEqual(rollFxParams('haze'), { ...defaultFxParams('haze'), amount: 0.15, lift: 0.1 });
  assert.ok(rollFxParams('haze').amount < defaultFxParams('haze').amount && rollFxParams('haze').lift < defaultFxParams('haze').lift);
  for (const k of kinds.filter((x) => x !== 'haze')) assert.deepEqual(rollFxParams(k), defaultFxParams(k), `${k} keeps its defaults`);
  assert.equal(rollBlend(true, () => 'screen'), 'normal');
  assert.equal(rollBlend(false, () => 'screen'), 'screen');
});

ok('300 seeded chaos rolls: the bottom content layer is always normal, INVERT is never dealt, HAZE is always gentle', () => {
  Math.random = mulberry32(20261006);
  try {
    let blended = 0; let withFx = 0; let haze = 0;
    for (const layerSet of [1, 2, 3]) {
      const kc = (i) => ({ id: `kc${i}`, name: `KC-${i + 1}`, type: 'content', visible: true, layerBlendMode: 'multiply', layerOpacity: 1, patch: { mode: 'off', to: null, strength: 0.16 } });
      for (let r = 0; r < 100; r++) {
        useStore.setState({ layers: Array.from({ length: layerSet }, (_, i) => kc(i)), activeLayerId: 'kc0', lockedParams: {}, armedMode: null, armedMotion: null, historyUndoStack: [], historyRedoStack: [] });
        useStore.getState().kineticRoll();
        const layers = useStore.getState().layers;
        const content = layers.filter((l) => !isFxLayer(l) && !isMathLayer(l));
        assert.equal(content[0].layerBlendMode, 'normal', `roll ${r}: the bottom content layer must be normal`);
        for (const l of content.slice(1)) { assert.ok(BLEND_MODES.includes(l.layerBlendMode)); if (l.layerBlendMode !== 'normal') blended += 1; }
        for (const fx of layers.filter(isFxLayer)) {
          for (const e of fx.effects) {
            withFx += 1;
            assert.notEqual(e.kind, 'invert', `roll ${r}: INVERT was dealt`);
            if (e.kind === 'haze') { haze += 1; assert.deepEqual(e.params, rollFxParams('haze')); }
          }
        }
      }
    }
    assert.ok(blended > 20, `upper layers still get random blends (${blended}): a roll stays wild`);
    assert.ok(withFx > 150 && haze > 10, `the sweep exercised effects (${withFx}) and HAZE (${haze})`);
  } finally { Math.random = realRandom; }
});

// ── browser: the frames themselves ──────────────────────────────────────────
const luma = (px) => {
  const l = []; for (let i = 0; i < px.length; i += 4) l.push((0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255);
  l.sort((a, b) => a - b);
  const q = (p) => l[Math.floor(p * (l.length - 1))];
  return { mean: l.reduce((a, v) => a + v, 0) / l.length, range: q(0.95) - q(0.05) };
};

// The measure is shared with the live roll guard (fx/frameHealth.js, #1107): one definition of a dead frame.
const ink = (px) => frameHealth(px);

try {
  const { renderCandidate, closeCandidate } = await import('../gl/candidate.mjs');
  const { serializeProject } = await import('../state/projectDocument.js');
  // one fixed scene, whatever the rolls above left in the store
  useStore.setState({
    seed: 0xc0ffee, paletteId: 'praystation', paletteOverrides: null, layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
    layers: [{ id: 'kc0', name: 'KC-1', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: null, strength: 0.16 } }],
    activeLayerId: 'kc0', layerSnapshots: {}, lockedParams: {},
  });
  const base = serializeProject(useStore.getState());
  const kc = base.layers.find((l) => !isFxLayer(l) && !isMathLayer(l));
  const frame = async (layers) => luma((await renderCandidate({ doc: { ...structuredClone(base), layers } }, { width: 140 })).pixels);
  const withFx = (effects) => [{ ...kc }, { id: 'fx1', name: 'FX 1', type: 'fx', visible: true, layerBlendMode: 'normal', layerOpacity: 1, effects }];

  const plain = await frame(withFx([]));
  const dflt = await frame(withFx([{ kind: 'haze', params: defaultFxParams('haze') }]));
  const rolled = await frame(withFx([{ kind: 'haze', params: rollFxParams('haze') }]));
  const inverted = await frame(withFx([{ kind: 'invert', params: defaultFxParams('invert') }]));
  const lone = (blend) => frame([{ ...kc, layerBlendMode: blend }]);
  const screened = await lone('screen'); const overlaid = await lone('overlay'); const normal = await lone('normal');

  await okA('why: a default HAZE halves the contrast and doubles the brightness; a rolled HAZE keeps 75% of the contrast', async () => {
    assert.ok(dflt.range < plain.range * 0.6, `default haze range ${dflt.range.toFixed(2)} vs plain ${plain.range.toFixed(2)}`);
    assert.ok(dflt.mean > plain.mean + 0.15);
    assert.ok(rolled.range >= plain.range * 0.75, `rolled haze range ${rolled.range.toFixed(2)} vs plain ${plain.range.toFixed(2)}`);
    assert.ok(rolled.mean < plain.mean + 0.12);
  });
  await okA('why: INVERT turns a dark scene into a light one', async () => {
    assert.ok(inverted.mean > plain.mean + 0.3, `${inverted.mean.toFixed(2)} vs ${plain.mean.toFixed(2)}`);
  });
  await okA('why: a lone layer under SCREEN or OVERLAY loses its picture; under NORMAL it keeps it', async () => {
    assert.ok(normal.range > 0.5, `normal range ${normal.range.toFixed(2)}`);
    assert.ok(Math.min(screened.range, overlaid.range) < normal.range * 0.8, `screen ${screened.range.toFixed(2)}, overlay ${overlaid.range.toFixed(2)}, normal ${normal.range.toFixed(2)}`);
  });

  // The rolls themselves: dark palettes, modes that draw something at t=0. The three causes above made
  // whole frames empty, solid, white or black; none of that may come back. (Bright and colourful is fine: judged by ink, not mean brightness.) (A roll can still come out
  // DIM on a dark ground: that is palette-and-mode interplay, and #1107's live check is the answer.)
  await okA('36 seeded chaos rolls on dark palettes: never an empty or solid frame, and the typical frame is healthy', async () => {
    Math.random = mulberry32(31337);
    const { PALETTES } = await import('../data/palettes.js');
    const dark = new Set(PALETTES.filter((p) => parseInt(p.bg.slice(1, 3), 16) < 0x30).map((p) => p.id));
    const GROWS = new Set(['dla', 'eden', 'ca']); // growth modes start empty at t=0 in a one-shot render
    const bad = []; const gaps = []; let dim = 0; let judged = 0;
    try {
      for (let i = 0; i < 90 && judged < 36; i++) {
        useStore.getState().kineticRoll();
        const s = useStore.getState();
        if (!dark.has(s.paletteId) || GROWS.has(s.layoutParams.mode) || ['swarm', 'hype'].includes(s.layoutParams.mode)) continue;
        judged += 1;
        const px = (await renderCandidate({ doc: serializeProject(s) }, { width: 140 })).pixels;
        const m = ink(px);
        gaps.push(m.lumaGap);
        if (m.lumaGap < 0.15) dim += 1;
        const desc = `${s.layoutParams.mode}/${s.paletteId} coverage ${m.coverage.toFixed(2)} lumaGap ${m.lumaGap.toFixed(2)} ${s.layers.map((l) => (isFxLayer(l) ? 'fx[' + l.effects.map((e) => e.kind).join(',') + ']' : l.layerBlendMode)).join(' ')}`;
        if (m.coverage < 0.05) bad.push(desc);
      }
    } finally { Math.random = realRandom; }
    assert.ok(judged >= 30, `judged ${judged} frames`);
    assert.deepEqual(bad, [], `dead frames:\n${bad.join('\n')}`);
    gaps.sort((a, b) => a - b);
    assert.ok(gaps[Math.floor(gaps.length / 2)] >= 0.25, `median ink gap ${gaps[Math.floor(gaps.length / 2)].toFixed(2)}`);
    console.log(`    info: ${dim} of ${judged} unguarded rolls are dim-on-dark (ink gap < 0.15)`);
  });
  // #1107: the live guard. Same rolls, but a dead frame is dealt again (up to MAX_REDEALS) like the app does.
  await okA('the guard: re-dealing dead frames leaves (almost) no dead roll standing, on every palette', async () => {
    Math.random = mulberry32(777);
    const { MAX_REDEALS } = await import('./rollGuard.js');
    const GROWS = new Set(['dla', 'eden', 'ca', 'swarm', 'hype']);
    const look = async () => frameHealth((await renderCandidate({ doc: serializeProject(useStore.getState()) }, { width: 96 })).pixels);
    let judged = 0; let rawDead = 0; let guardedDead = 0; let redeals = 0;
    try {
      for (let i = 0; i < 120 && judged < 40; i++) {
        useStore.getState().kineticRoll();
        if (GROWS.has(useStore.getState().layoutParams.mode)) continue;
        judged += 1;
        let h = await look();
        if (isDeadFrame(h)) rawDead += 1;
        for (let k = 0; isDeadFrame(h) && k < MAX_REDEALS; k++) {
          useStore.getState().undo(); useStore.getState().kineticRoll(); redeals += 1;
          if (GROWS.has(useStore.getState().layoutParams.mode)) break;
          h = await look();
        }
        if (isDeadFrame(h) && !GROWS.has(useStore.getState().layoutParams.mode)) guardedDead += 1;
      }
    } finally { Math.random = realRandom; }
    console.log(`    info: ${judged} rolls, ${rawDead} dead as dealt, ${guardedDead} still dead after the guard (${redeals} re-deals)`);
    assert.ok(judged >= 30);
    assert.ok(guardedDead <= Math.max(1, Math.floor(judged * 0.05)), `${guardedDead} of ${judged} still dead after the guard`);
    assert.ok(guardedDead <= rawDead);
  });
  await closeCandidate();
} catch (e) {
  Math.random = realRandom;
  if (/Executable doesn't exist/.test(e.message || '')) console.log('  SKIP browser render checks: headless Chromium not installed');
  else throw e;
}

console.log(`rollSafety.selfcheck: ${n} checks passed`);
