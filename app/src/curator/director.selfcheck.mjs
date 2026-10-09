// director.selfcheck.mjs — #1145: the scheduler, the gates, the relax machine,
// and the no-surface scan (the Director never renders).
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SWAY_GATE_OPEN,
  TILT_GATE_OPEN,
  NEUTRAL_GAINS,
  directorGains,
  blendPick,
  createDirector,
  resetDirector,
  getDirector,
} from './director.js';
import { TEMP_DEFAULT } from './effectiveTemp.js';
import { DIRECTOR_TABLE } from './directorTable.js';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

// Feeds shaped for resolveLoisFace/resolveDavisState (honest-feed shape).
const feedBurnFlow = { burning: true, rollsLastMinute: 5, keepsLast5m: 3 };
const feedNodBloom = { frameKept: true, bloomAgeMs: 1000 };
const feedAwayUgly = { away: true, passesLast2m: 6 };

ok('silence → neutral gains (DS rule 4: silence is default)', () => {
  assert.deepEqual(directorGains({}), NEUTRAL_GAINS);
  assert.deepEqual(directorGains({ loisCode: 'NOD', davisCode: null }), NEUTRAL_GAINS);
  assert.equal(NEUTRAL_GAINS.temperature, TEMP_DEFAULT);
  assert.equal(NEUTRAL_GAINS.loisWeight, 0);
});

ok('FULL BURN reads hot off the table', () => {
  const g = directorGains({ loisCode: 'BURN', davisCode: 'FLOW' });
  assert.equal(g.temperature, 0.55);
  assert.ok(g.kinWeight > 1.5);
  assert.ok(g.loisWeight > 0.8);
  assert.equal(g.room.verdict, 'FULL BURN');
  assert.equal(g.room.n, 11);
});

ok('AGREEMENT reads cool and tight', () => {
  const g = directorGains({ loisCode: 'NOD', davisCode: 'BLOOM' });
  assert.ok(g.temperature <= 0.15);
  assert.ok(g.kinWeight < 1);
  assert.ok(g.loisWeight > 0.8);
});

ok('AWAY forces LOIS weight to 0 no matter what the table says', () => {
  for (const davis of ['FLOW', 'SEEDLING', 'UGLY', 'STUCK', 'BLOOM']) {
    assert.equal(directorGains({ loisCode: 'AWAY', davisCode: davis }).loisWeight, 0, davis);
  }
});

ok('the gates: sway is open (2026-10-08), tilt is shut until #1144 supplies a phase', () => {
  assert.equal(SWAY_GATE_OPEN, true, 'sway opened deliberately on 2026-10-08');
  assert.equal(TILT_GATE_OPEN, false, 'tilt stays shut until #1144 supplies a phase');
  for (const lois of ['NOD', 'VIBE', 'BURN', 'AWAY']) {
    const g = directorGains({ loisCode: lois, davisCode: 'FLOW', phase: 'explore' });
    assert.equal(g.swayAllowance, DIRECTOR_TABLE[`${lois}×FLOW`].sway_allowance, `${lois}: the room's allowance is live`);
    assert.equal(g.tiltLimit, 0, `${lois}: tilt gated`);
  }
});

ok('phase modulates through the single source (refine cools, explore warms)', () => {
  const base = directorGains({ loisCode: 'VIBE', davisCode: 'FLOW' }).temperature;
  const refine = directorGains({ loisCode: 'VIBE', davisCode: 'FLOW', phase: 'refine' }).temperature;
  const explore = directorGains({ loisCode: 'VIBE', davisCode: 'FLOW', phase: 'explore' }).temperature;
  assert.ok(refine < base, 'refine cools');
  assert.ok(explore > base, 'explore warms');
});

ok('blendPick: mixture of the two indices, never an invented third', () => {
  assert.equal(blendPick({ davisIndex: 2, loisIndex: 5, loisWeight: 0 }), 2);
  assert.equal(blendPick({ davisIndex: 2, loisIndex: 5, loisWeight: 1 }), 5);
  let seed = 42;
  const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 200; i++) {
    const p = blendPick({ davisIndex: 2, loisIndex: 5, loisWeight: 0.5, rng });
    assert.ok(p === 2 || p === 5, `invented index ${p}`);
  }
  // weight 0.5 splits roughly evenly — the critic really counts
  seed = 7;
  let lois = 0;
  for (let i = 0; i < 1000; i++) if (blendPick({ davisIndex: 0, loisIndex: 1, loisWeight: 0.5, rng }) === 1) lois++;
  assert.ok(lois > 400 && lois < 600, `mixture off: ${lois}/1000`);
});

ok('peak → forced relax; no re-peak while relaxing (never back-to-back)', () => {
  let t = 1000000;
  const d = createDirector({ now: () => t });
  const r1 = d.tick({ feed: feedBurnFlow, audio: 1, nowTs: t });
  assert.equal(r1.directorPhase, 'peak');
  t += 1000;
  const r2 = d.tick({ feed: feedBurnFlow, audio: 1, nowTs: t });
  assert.equal(r2.directorPhase, 'relax', 'peak forces relax');
  assert.ok(r2.gains.temperature <= 0.3, 'relax cools the room');
  assert.ok(r2.gains.kinWeight <= 1, 'relax holds the candidate multiplier');
  // still hot, but no new relax may start while relaxing
  t += 5000;
  const r3 = d.tick({ feed: feedBurnFlow, audio: 1, nowTs: t });
  assert.equal(r3.directorPhase, 'relax');
});

ok('a keep ends relax early (strong user action)', () => {
  let t = 2000000;
  const d = createDirector({ now: () => t });
  d.tick({ feed: feedBurnFlow, audio: 1, nowTs: t });
  t += 1000;
  assert.equal(d.tick({ feed: feedBurnFlow, audio: 1, nowTs: t }).directorPhase, 'relax');
  t += 1000;
  const r = d.tick({ feed: feedBurnFlow, audio: 0.9, keep: true, nowTs: t });
  assert.notEqual(r.directorPhase, 'relax', 'the keep broke the relax');
});

ok('relax lasts the room\'s derived seconds, then the room breathes again', () => {
  let t = 3000000;
  const d = createDirector({ now: () => t });
  const room = directorGains({ loisCode: 'BURN', davisCode: 'FLOW' });
  d.tick({ feed: feedBurnFlow, audio: 1, nowTs: t });
  t += room.relaxSeconds * 1000 + 1000;
  // quiet long enough to decay below peak: build again
  const r = d.tick({ feed: feedBurnFlow, audio: 0, nowTs: t });
  assert.equal(r.directorPhase, 'build');
});

ok('two-sided clamping: never flatline, never unbound', () => {
  const g = directorGains({ loisCode: 'NOD', davisCode: 'BLOOM' });
  assert.ok(g.kinWeight >= 0.25, 'the room always rolls');
  assert.ok(g.temperature >= 0.1);
  const hot = directorGains({ loisCode: 'BURN', davisCode: 'FLOW' });
  assert.ok(hot.temperature <= 0.55);
  assert.ok(hot.kinWeight <= 2);
});

ok('singleton: getDirector is stable, resetDirector drops it (tests)', () => {
  resetDirector();
  assert.equal(getDirector(), getDirector());
  resetDirector();
});

// ─── the Director never renders: no surface file may reference the scheduler ───
ok('no UI-surface file references the director scheduler', () => {
  const allowed = new Set([
    // the scheduler itself
    'curator/director.js',
    'curator/directorSense.mjs',
    'curator/directorTable.js',
    'curator/effectiveTemp.js',
    'curator/director.selfcheck.mjs',
    'curator/directorSense.selfcheck.mjs',
    'curator/directorTable.selfcheck.mjs',
    'curator/effectiveTemp.selfcheck.mjs',
    'curator/directorSway.selfcheck.mjs',
    'curator/phase.selfcheck.mjs', // proves the phase reaches the pick through the scheduler
    'curator/directorRank.selfcheck.mjs',
    // deliberate wiring: the pick path and the candidate count (logic, not surface)
    'curator/taste.js',
    'curator/curate.js',
    'state/slices/layoutSlice.js',
    'App.jsx',
    // the rng guard's allowlist names blendPick's default param (deliberate)
    'engine/mathRandomGuard.selfcheck.mjs',
  ]);
  const ids = ['directorGains', 'getDirector', 'blendPick', 'directorSense', 'directorTable', 'effectiveTemp', 'initDirectorBeat', 'directorTrace'];
  const hits = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      const st = statSync(p);
      if (st.isDirectory()) { walk(p); continue; }
      if (!/\.(js|mjs|jsx)$/.test(e)) continue;
      const rel = relative(srcRoot, p);
      if (allowed.has(rel)) continue;
      const src = readFileSync(p, 'utf8');
      if (ids.some((id) => src.includes(id))) hits.push(rel);
    }
  };
  walk(srcRoot);
  assert.deepEqual(hits, [], `surface references to the scheduler: ${hits.join(', ')}`);
});

console.log(`director.selfcheck: ${n} checks passed`);
