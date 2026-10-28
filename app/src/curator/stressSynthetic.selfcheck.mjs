// stressSynthetic.selfcheck.mjs — #1635: synthetic sessions for the band edges.
//
// The 0.28 / 0.72 edges can only be tuned from session evidence, and real sessions are scarce
// (five takes of actual play). This unit answers the question that does NOT need Matt's time:
// under modeled play, can the stress signal reach the edges at all, and what does it take?
// It generates deterministic synthetic sessions (pressure-space signals: activity / dish / taste,
// the same 0..1 values stressLive.js computes from the live instrument), feeds each through the
// REAL tracker + recorder, and reads the result back with the SAME evidence code that judges
// real takes (stressEvidence.js). If a retune of weights, saturations or edges changes which
// kinds of play can reach a band, this selfcheck fails and prints the new map.
//
// It complements the five real sessions #1635 requires; it never substitutes for them — the
// tuning verdict still comes from real takes. What it settles synthetically:
//   - the observed real takes (100% Relax, p50 ~0.03) are exactly what idle/watcher play
//     produces here — the model and the instrument agree;
//   - leaving Relax needs roughly two of the three signals hot at once;
//   - Tighten is reachable, but only by a full show: near-maxed hands + a crowded dish +
//     a rolling streak together. No single signal, and no pair short of hands+dish maxed,
//     can reach it. Taste alone (max 0.24) can never leave Relax at all.
import { createStressTracker, stressValue, RELAX_BELOW, TIGHTEN_ABOVE } from './stress.js';
import { createStressRecorder } from './stressRecord.js';
import { stressTakeEvidence, UPDATES_PER_MINUTE } from './stressEvidence.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Deterministic PRNG (mulberry32) — same seed, same session, every run, every machine. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SESSION_UPDATES = 5 * UPDATES_PER_MINUTE; // a five-minute session at 60 fps

/**
 * Synthetic play profiles. Each is a function of the update index returning the three
 * pressures stressLive would have computed for that style of play. Shapes are deliberately
 * plain: blocks, ramps and sawtooths with seeded jitter — archetypes, not impersonations.
 */
const PROFILES = {
  // The instrument open and untouched, one stray key nudge every ~20 s.
  idle: (t) => ({
    activity: t % 1200 < 30 ? 0.15 : 0,
    dish: 0,
    taste: 0,
  }),
  // Watching a run: a tap or short drag every ~8 s, nothing pinned, no rolls.
  watcher: (t, r) => ({
    activity: t % 480 < 90 ? 0.25 + 0.15 * r() : 0,
    dish: 0,
    taste: 0,
  }),
  // Busy hands only: near-continuous tweaking in blocks, the odd single roll (kept at once).
  hands: (t, r) => {
    const inDip = t % 1500 >= 1380;
    return {
      activity: inDip ? 0.1 : 0.55 + 0.4 * r(),
      dish: 0,
      taste: t % 2400 < 120 ? 0.15 : 0,
    };
  },
  // A rolling session: steady hands, dice rolls accumulating to a keep, again and again.
  roller: (t, r) => ({
    activity: 0.35 + 0.2 * r(),
    dish: 0,
    taste: (t % 1500) / 1500, // sawtooth 0 -> ~1 between keeps
  }),
  // A dish set: creatures pinned and crowded, moderate hands, slow rolling underneath.
  dishSet: (t, r) => {
    const ramp = Math.min(1, t / 600);
    return {
      activity: 0.25 + 0.2 * r(),
      dish: ramp * (0.78 + 0.14 * Math.sin(t / 900) + 0.05 * r()),
      taste: 0.6 * ((t % 3000) / 3000),
    };
  },
  // A full show in arcs: build, peak (everything hot at once), release — twice in 5 min.
  fullShow: (t, r) => {
    const c = (t % 9000) / 9000;
    const arc = c < 0.4 ? c / 0.4 : c < 0.7 ? 1 : 1 - (c - 0.7) / 0.3;
    return {
      activity: 0.15 + arc * (0.7 + 0.15 * r()),
      dish: arc * (0.55 + 0.4 * Math.abs(Math.sin(t / 700))),
      taste: arc * ((t % 1500) / 1500),
    };
  },
  // Theory check: every signal pinned at max, the whole time.
  ceiling: () => ({ activity: 1, dish: 1, taste: 1 }),
};

/** Run one profile through the real tracker + recorder; judge it with the real evidence code. */
function runProfile(name, gen, seed) {
  const r = rng(seed);
  const tracker = createStressTracker();
  let frame = 0;
  const recorder = createStressRecorder({ getFrame: () => frame });
  let peak = 0;
  for (let t = 0; t < SESSION_UPDATES; t++) {
    const s = gen(t, r);
    const out = tracker.update({ activity: clamp01(s.activity), dish: clamp01(s.dish), taste: clamp01(s.taste) });
    peak = Math.max(peak, out.smoothed ?? 0);
    recorder.update({ activity: clamp01(s.activity), dish: clamp01(s.dish), taste: clamp01(s.taste), band: out.band });
    frame++;
  }
  const ev = stressTakeEvidence(recorder.finish());
  return { name, ev, peak };
}

const results = Object.entries(PROFILES).map(([name, gen], i) => runProfile(name, gen, 1635 + i * 97));

// ---- the printed map -------------------------------------------------------

const pct = (v) => `${(v * 100).toFixed(1)}%`;
console.log('**Synthetic stress sessions (#1635)** — 5 min each, real tracker + real evidence code');
console.log('');
console.log('| profile | relax | normal | tighten | crossings/min | p50 | p90 | peak |');
console.log('|---|---|---|---|---|---|---|---|');
for (const { name, ev, peak } of results) {
  const o = ev.occupancy;
  console.log(
    `| ${name} | ${pct(o.relax)} | ${pct(o.normal)} | ${pct(o.tighten)} | ${ev.crossingsPerMinute} | ${ev.stress.p50} | ${ev.stress.p90} | ${peak.toFixed(2)} |`,
  );
}
console.log('');
console.log('Edge reachability (steady-state stressValue):');
console.log(
  `  taste alone at max ......... ${stressValue({ taste: 1 }).toFixed(2)}  (can never leave Relax: < ${RELAX_BELOW})`,
);
console.log(`  one signal maxed (a or d) .. ${stressValue({ activity: 1 }).toFixed(2)}  (Normal, barely)`);
console.log(`  activity + taste maxed ..... ${stressValue({ activity: 1, taste: 1 }).toFixed(2)}  (Normal only)`);
console.log(
  `  activity + dish maxed ...... ${stressValue({ activity: 1, dish: 1 }).toFixed(2)}  (Tighten, barely: > ${TIGHTEN_ABOVE})`,
);
console.log(`  all three maxed ............ ${stressValue({ activity: 1, dish: 1, taste: 1 }).toFixed(2)}`);
console.log('');

// ---- assertions: the reachability facts this unit guards -------------------

const failures = [];
const check = (label, ok) => {
  if (!ok) failures.push(label);
};
const byName = Object.fromEntries(results.map((r) => [r.name, r]));
const share = (name, band) => byName[name].ev.occupancy[band];

check('ceiling profile lives in Tighten (>99%)', share('ceiling', 'tighten') > 0.99);
check('idle is 100% Relax (matches the observed real takes)', share('idle', 'relax') >= 0.999);
check(
  'watcher stays in Relax (>=95%), never Tighten',
  share('watcher', 'relax') >= 0.95 && share('watcher', 'tighten') === 0,
);
check(
  'hands alone reaches Normal (>5%) but never Tighten',
  share('hands', 'normal') > 0.05 && share('hands', 'tighten') === 0,
);
check(
  'roller reaches Normal (>10%) but never Tighten',
  share('roller', 'normal') > 0.1 && share('roller', 'tighten') === 0,
);
check(
  'dish set reaches Normal (>30%) but never Tighten',
  share('dishSet', 'normal') > 0.3 && share('dishSet', 'tighten') === 0,
);
check(
  'full show reaches Tighten (>2%) and leaves Relax (<90% relax)',
  share('fullShow', 'tighten') > 0.02 && share('fullShow', 'relax') < 0.9,
);
check('taste alone can never leave Relax', stressValue({ taste: 1 }) < RELAX_BELOW);
check('activity + dish maxed barely reaches Tighten', stressValue({ activity: 1, dish: 1 }) > TIGHTEN_ABOVE);
check(
  'every synthetic record verifies against its own signals',
  results.every((r) => r.ev.consistent),
);

if (failures.length) {
  console.error(`stressSynthetic selfcheck FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('stressSynthetic selfcheck OK');
