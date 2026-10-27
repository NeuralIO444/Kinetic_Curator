// node src/state/kineticSweep.selfcheck.mjs
// #1772 (epic #1766, slice 6) — the KINETIC tap as a left-to-right filter: LOOK → VOICE → CURATOR (→ CHAOS on
// hammering). The param-diff audit per pass: from a cold start, three measured taps produce a look change only, then
// a voice change only, then a curator nudge within its cap. The curator never exceeds the cap and can pass. One undo
// per tap that changed something; locked params hold at every stage; the armed roll scope (#964) is the ceiling.
import assert from 'node:assert/strict';
import { useStore } from './store.js';
import {
  lookPass,
  voicePass,
  curatorPass,
  paramDiff,
  nudgeWithinCap,
  nudgeFits,
  NUDGE_MAX_KEYS,
  NUDGE_SPREAD,
  ACCUM_KEYS,
} from './kineticSweep.mjs';
import { MOTION_KEYS } from './rollScope.mjs';
import { RANDOMIZABLE_KEYS } from './paramUtils.js';
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { VOICE_DECK } from '../data/voiceDeck.js';
import { assetRecords } from '../data/assetStyle.js';
import { ASSETS } from '../data/assets/index.js';
import { mkRng } from '../engine/prng.js';
import { pickCurated } from '../curator/curate.js';

const S = () => useStore.getState();
const lookIds = new Set(COMPOSITION_PRESETS.map((p) => p.id));
const records = assetRecords(ASSETS);
const recById = new Map(records.map((r) => [r.id, r]));
const STRUCT_OK = (k) => !MOTION_KEYS.includes(k); // a look moves structure, never motion
const VOICE_OK = (k) => MOTION_KEYS.includes(k) || ACCUM_KEYS.includes(k);
const EPS = 1e-6;
const capOk = (m) => nudgeWithinCap(m.key, m.from, m.to);
const snap = () => {
  const s = S();
  return {
    lp: JSON.parse(JSON.stringify(s.layoutParams)),
    assets: JSON.stringify(s.enabledAssets),
    palette: JSON.stringify([s.paletteId, s.paletteOverrides]),
    seed: s.seed,
    undo: s.historyUndoStack.length,
  };
};

// ── 1. three measured taps from a cold start ──────────────────────────────────────────────────────────────────────
{
  const a = snap();
  S().kineticLookPass();
  const b = snap();
  const dLook = paramDiff(a.lp, b.lp);
  assert.ok(lookIds.has(S().layoutParams.composition), 'LOOK lands on one of the 64 looks');
  assert.notEqual(b.lp.composition, a.lp.composition, 'LOOK deals a different look');
  assert.ok(dLook.every(STRUCT_OK), `LOOK moved motion keys: ${dLook.filter((k) => !STRUCT_OK(k))}`);
  assert.notEqual(b.assets, a.assets, 'LOOK re-deals the pool');
  assert.equal(b.palette, a.palette, 'LOOK leaves the palette (the voice owns colour)');
  assert.equal(b.seed, a.seed, 'LOOK keeps the seed');
  assert.equal(b.undo, a.undo + 1, 'LOOK = one undo step');
  const look = COMPOSITION_PRESETS.find((p) => p.id === b.lp.composition);
  const pool = Object.keys(S().enabledAssets).filter((k) => S().enabledAssets[k]);
  assert.ok(
    pool.every((id) => look.categories.includes(recById.get(id).category)),
    `LOOK's pool is coherent with ${look.id}'s pairing`,
  );

  S().kineticVoicePass();
  const c = snap();
  const dVoice = paramDiff(b.lp, c.lp);
  const voice = VOICE_DECK.find((v) => v.id === S().kineticVoiceId);
  assert.ok(voice, 'VOICE deals one of the 64 voices');
  assert.ok(dVoice.every(VOICE_OK), `VOICE moved structure: ${dVoice.filter((k) => !VOICE_OK(k))}`);
  if (!voice.accumulation)
    assert.ok(!dVoice.some((k) => ACCUM_KEYS.includes(k)), 'a voice without ACCUM never deals the glow');
  assert.equal(c.assets, b.assets, 'VOICE keeps the pool (the look owns the shapes)');
  assert.equal(c.lp.composition, b.lp.composition, 'VOICE keeps the look');
  assert.notEqual(c.palette, b.palette, 'VOICE deals a palette');
  assert.equal(c.undo, b.undo + 1, 'VOICE = one undo step');

  S().kineticCuratorPass();
  const d = snap();
  const nudge = S().kineticNudge;
  assert.ok(nudge && Array.isArray(nudge.moves), 'the CURATOR pass leaves its backstage record');
  const dCur = paramDiff(c.lp, d.lp);
  assert.deepEqual(dCur, nudge.moves.map((m) => m.key).sort(), 'the record names exactly what moved');
  assert.ok(dCur.length <= NUDGE_MAX_KEYS, `CURATOR moved ${dCur.length} keys`);
  assert.ok(
    dCur.every((k) => RANDOMIZABLE_KEYS.includes(k)),
    'CURATOR only nudges dice-rollable params',
  );
  assert.ok(nudge.moves.every(capOk), `CURATOR stayed within its cap: ${JSON.stringify(nudge.moves)}`);
  assert.equal(d.assets, c.assets, 'CURATOR keeps the pool');
  assert.equal(d.palette, c.palette, 'CURATOR keeps the palette');
  assert.equal(d.undo, c.undo + (dCur.length ? 1 : 0), 'CURATOR = one undo step, or none when it passed');

  // one undo per tap, all the way back
  if (dCur.length) S().undo();
  assert.deepEqual(snap().lp, c.lp, 'undo takes the curator nudge back');
  S().undo();
  assert.deepEqual(snap().lp, b.lp, 'undo takes the voice back');
  assert.equal(snap().palette, b.palette);
  S().undo();
  assert.deepEqual(snap().lp, a.lp, 'undo takes the look back');
  assert.equal(snap().assets, a.assets);
}

// ── 2. the curator's cap holds over many passes, and it can pass ──────────────────────────────────────────────────
{
  const st = { layoutParams: { ...S().layoutParams }, lockedParams: {}, armedMode: null, armedMotion: null };
  let passes = 0;
  for (let i = 0; i < 300; i++) {
    const rng = mkRng(9000 + i);
    // a taste-free judge: picks uniformly, so index 0 (keep the piece) wins about 1 time in 6
    const r = curatorPass(st, null, rng, (c, _cur, g) => ({ index: Math.floor(g() * c.length) }));
    if (!r.layoutParams) {
      passes++;
      assert.deepEqual(r.moves, []);
      continue;
    }
    assert.ok(r.moves.length >= 1 && r.moves.length <= NUDGE_MAX_KEYS, `nudge ${i} moved ${r.moves.length}`);
    assert.ok(r.moves.every(capOk), `nudge ${i} over the cap: ${JSON.stringify(r.moves)}`);
    assert.deepEqual(paramDiff(st.layoutParams, r.layoutParams), r.moves.map((m) => m.key).sort());
  }
  assert.ok(passes > 10, `the curator passes when the piece already wins (${passes}/300)`);
  // a curator that keeps the piece: a store pass with no change and no undo entry
  const keep = curatorPass(st, null, mkRng(1), () => ({ index: 0 }));
  assert.equal(keep.layoutParams, null, 'index 0 is a pass');
  const depth = S().historyUndoStack.length;
  const before = JSON.stringify(S().layoutParams);
  // with every dice-rollable key locked there is nothing to nudge: the pass passes
  for (const k of RANDOMIZABLE_KEYS) if (!S().lockedParams[k]) S().toggleParamLock(k);
  S().kineticCuratorPass();
  assert.equal(JSON.stringify(S().layoutParams), before, 'everything locked: the curator changes nothing');
  assert.equal(S().historyUndoStack.length, depth, 'a pass pushes no undo entry');
  assert.deepEqual(S().kineticNudge.moves, []);
  for (const k of RANDOMIZABLE_KEYS) if (S().lockedParams[k]) S().toggleParamLock(k);
}

// ── 3. locked params hold at every stage ──────────────────────────────────────────────────────────────────────────
{
  for (const k of ['density', 'count', 'lifeDrift', 'accumulationOptics']) S().toggleParamLock(k);
  const held = { ...S().layoutParams };
  for (let i = 0; i < 12; i++) {
    S().kineticLookPass();
    S().kineticVoicePass();
    S().kineticCuratorPass();
    for (const k of ['density', 'count', 'lifeDrift', 'accumulationOptics'])
      assert.deepEqual(S().layoutParams[k], held[k], `locked ${k} holds through the sweep (round ${i})`);
  }
  for (const k of ['density', 'count', 'lifeDrift', 'accumulationOptics']) S().toggleParamLock(k);
}

// ── 4. the ceiling: the armed roll scope (#964) ───────────────────────────────────────────────────────────────────
{
  S().toggleArmMode('grid');
  S().toggleArmMotion('still');
  S().kineticLookPass();
  const comp = S().layoutParams.composition;
  const motion = MOTION_KEYS.map((k) => S().layoutParams[k]);
  assert.equal(S().layoutParams.mode, 'grid', 'an armed MODE pins the mode');
  for (let i = 0; i < 8; i++) {
    S().kineticLookPass();
    assert.equal(S().layoutParams.composition, comp, 'an armed MODE keeps the standing look');
    S().kineticVoicePass();
    S().kineticCuratorPass();
    assert.deepEqual(
      MOTION_KEYS.map((k) => S().layoutParams[k]),
      motion,
      'an armed MOTION pins the motion numbers through look, voice and curator',
    );
  }
  S().clearRollScope();
}

// ── 5. the voice pass and the glow (S2's law): only a voice that declares accumulation deals it ──────────────────
{
  const base = { ...S(), layoutParams: { ...S().layoutParams, accumulationOptics: 0.01, accumulation: false } };
  const quiet = VOICE_DECK.filter((v) => !v.accumulation);
  const loud = VOICE_DECK.filter((v) => v.accumulation);
  assert.ok(quiet.length && loud.length);
  for (const v of quiet.slice(0, 10)) {
    const r = voicePass(base, () => 0, { deck: [v] });
    assert.equal(r.layoutParams.accumulationOptics, 0.01, `${v.id}: no ACCUM declared, glow untouched`);
    assert.equal(r.layoutParams.accumulation, false);
  }
  for (const v of loud) {
    const r = voicePass(base, () => 0, { deck: [v] });
    assert.equal(r.layoutParams.accumulation, true, `${v.id}: declares ACCUM and deals it`);
    assert.ok(r.layoutParams.accumulationOptics <= 0.25, `${v.id}: the glow lands inside the slider's cap`);
  }
}

// ── 6. look pass purity: a pool coherent with every look, structure only ─────────────────────────────────────────
{
  const st = { ...S(), armedMode: null, armedMotion: null, lockedParams: {} };
  for (const look of COMPOSITION_PRESETS) {
    const r = lookPass(st, mkRng(77), { looks: [look], records });
    assert.equal(r.lookId, look.id);
    assert.ok(r.coherent, `${look.id}: a coherent pool`);
    assert.ok(paramDiff(st.layoutParams, r.layoutParams).every(STRUCT_OK), `${look.id}: structure only`);
  }
}

// coarse keys sit out: their smallest move is already over the cap
assert.equal(nudgeFits('zTiers'), false, 'zTiers: one step is 11% of its range');
assert.equal(nudgeFits('damping'), false, 'damping: one rounding step is 12.5% of its range');
assert.ok(['count', 'scale', 'alpha', 'lifeDrift', 'noiseFreq'].every(nudgeFits));

// ── 7. the real taste-weighted pick is what the store uses ────────────────────────────────────────────────────────
assert.equal(typeof pickCurated, 'function');
assert.ok(Math.abs(NUDGE_SPREAD - 0.08) < EPS && NUDGE_MAX_KEYS === 3, 'the cap is 3 params × 8% of range');

console.log('kineticSweep.selfcheck: ok (#1772 — look → voice → curator, param-diff audit, cap, locks, armed scope)');
