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
  conductHeat,
  initDirectorBeat,
} from './director.js';
import { TEMP_DEFAULT } from './effectiveTemp.js';
import { DIRECTOR_TABLE } from './directorTable.js';
import { createBeatTracker, CONFIDENCE_LAPSE_BARS } from './beatConfidence.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..');
let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

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

ok('the gates: sway is open (2026-10-08), tilt is open (2026-10-11) and only applies in explore', () => {
  assert.equal(SWAY_GATE_OPEN, true, 'sway opened deliberately on 2026-10-08');
  assert.equal(TILT_GATE_OPEN, true, 'tilt opened deliberately on 2026-10-11');
  for (const lois of ['NOD', 'VIBE', 'BURN', 'AWAY']) {
    const g = directorGains({ loisCode: lois, davisCode: 'FLOW', phase: 'explore' });
    assert.equal(
      g.swayAllowance,
      DIRECTOR_TABLE[`${lois}×FLOW`].sway_allowance,
      `${lois}: the room's allowance is live`,
    );
    assert.equal(
      g.tiltLimit,
      DIRECTOR_TABLE[`${lois}×FLOW`].tilt_limit,
      `${lois}: tilt is the room's limit in explore`,
    );
    // refine and an unknown phase never tilt: the keeps are being refined, not left
    assert.equal(
      directorGains({ loisCode: lois, davisCode: 'FLOW', phase: 'refine' }).tiltLimit,
      0,
      `${lois}: no tilt in refine`,
    );
    assert.equal(
      directorGains({ loisCode: lois, davisCode: 'FLOW', phase: null }).tiltLimit,
      0,
      `${lois}: no tilt without a phase`,
    );
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

ok("relax lasts the room's derived seconds, then the room breathes again", () => {
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
    'curator/directorRoom.selfcheck.mjs', // #1145 × Mind: proves the room reaches the bus and no mind moves a gain
    'curator/directorPresence.selfcheck.mjs', // #1145 part 2: her tier scales her allowance
    'curator/directorDebt.selfcheck.mjs', // #1145 part 3: pacing debt
    'curator/fieldLiveDeal.selfcheck.mjs', // #1917: pins the live Director's FIELD deal stream (drives getDirector)
    'poets/poemRow.selfcheck.mjs', // #1918: proves poem-only deals leave the room's slow debt alone
    // deliberate wiring: the pick path and the candidate count (logic, not surface)
    'curator/taste.js',
    'curator/curate.js',
    'curator/readDuel.mjs', // #1627 S3: the duel's tolerance reads the single temperature source (pick path, logic, not surface)
    'curator/readDuel.selfcheck.mjs',
    'curator/roomWidth.js', // #1145 step 3: the room's own kin_weight sets how far Davis may shift a moth (logic, not surface)
    'curator/roomWidth.selfcheck.mjs',
    'state/slices/layoutSlice.js',
    'App.jsx',
    // the rng guard's allowlist names blendPick's default param (deliberate)
    'engine/mathRandomGuard.selfcheck.mjs',
  ]);
  const ids = [
    'directorGains',
    'getDirector',
    'blendPick',
    'directorSense',
    'directorTable',
    'effectiveTemp',
    'initDirectorBeat',
    'directorTrace',
  ];
  // whole-identifier match, not substring: loot/lootWrite.selfcheck.mjs mocks the
  // File System Access API's getDirectoryHandle, which contains 'getDirector' as a
  // substring but references no scheduler identifier (#1591).
  const idRes = ids.map((id) => new RegExp(`(?<![\\w$])${id}(?![\\w$])`));
  const hits = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      const st = statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.(js|mjs|jsx)$/.test(e)) continue;
      const rel = relative(srcRoot, p);
      if (allowed.has(rel)) continue;
      const src = readFileSync(p, 'utf8');
      if (idRes.some((re) => re.test(src))) hits.push(rel);
    }
  };
  walk(srcRoot);
  assert.deepEqual(hits, [], `surface references to the scheduler: ${hits.join(', ')}`);
});

// ── Audit fix 3f — blendPick's no-rng path is deterministic ─────────────────
// blendPick defaulted rng = Math.random: at loisWeight 0.5 the blend
// scattered between its two indices (measured pre-fix: both over 200
// identical calls). A missing/non-function rng now rolls 0 — any positive
// LOIS weight takes the blend, deterministically (the 3a contract). The
// production path (taste.js) passes the seeded stream and is unchanged.
{
  const { blendPick } = await import('./director.js');
  const args = { davisIndex: 1, loisIndex: 2, loisWeight: 0.5 };
  assert.strictEqual(blendPick(args), 2, 'no-rng blendPick rolls 0: positive weight takes the blend');
  assert.strictEqual(blendPick(args), blendPick(args), 'no-rng blendPick is deterministic');
  assert.strictEqual(blendPick({ ...args, rng: undefined }), 2, 'undefined rng = the roll-0 stream');
  assert.strictEqual(blendPick({ ...args, rng: 42 }), 2, 'non-function rng = the roll-0 stream');
  assert.strictEqual(blendPick({ ...args, rng: () => 0 }), 2, 'explicit zero stream matches');
  assert.strictEqual(blendPick({ ...args, rng: () => 0.999 }), 1, 'injected stream above the weight keeps Davis');
  assert.strictEqual(blendPick({ davisIndex: 1, loisIndex: 2, loisWeight: 0 }), 1, 'weight 0 never draws');
}

ok('#1483 conductHeat: 0..1 from the last sway, 0 when nobody leans; a share of the warming M2 allows', () => {
  resetDirector();
  assert.equal(conductHeat(), 0, 'a fresh director: nobody leans');
  const d = getDirector();
  const real = Object.getOwnPropertyDescriptor(d, 'lastSway');
  assert.ok(real && typeof real.get === 'function', 'lastSway is a getter on the live director');
  resetDirector();
});

// ── #2089: the Director's beat input listens to the store without flooding the tracker ──
// A fake `subscribe` records listeners and hands (state, prev) like Zustand's. getDirector()'s pushBeat and
// setPullInputs are spied; the beat tracker itself is not touched.
const beatRig = () => {
  resetDirector();
  const d = getDirector();
  const rig = { listeners: [], beats: [], pulls: 0 };
  const realPush = d.pushBeat.bind(d);
  const realPull = d.setPullInputs.bind(d);
  d.pushBeat = (p) => {
    rig.beats.push(p);
    realPush(p);
  };
  d.setPullInputs = (x) => {
    rig.pulls++;
    realPull(x);
  };
  rig.subscribe = (fn) => {
    rig.listeners.push(fn);
    return () => {
      rig.listeners = rig.listeners.filter((l) => l !== fn);
    };
  };
  rig.fire = (s, prev) => [...rig.listeners].forEach((l) => l(s, prev));
  return rig;
};
const baseState = { beatPulse: 0, keeps: [], audioBands: null, audioEnabled: false, audioSource: null };

ok('#2089 an unrelated state change pushes no beat sample and no pull inputs', () => {
  const r = beatRig();
  initDirectorBeat(r.subscribe);
  r.fire({ ...baseState, sliderX: 1 }, baseState);
  assert.equal(r.beats.length, 0, 'beatPulse did not change: no sample');
  assert.equal(r.pulls, 0, 'none of the four pull inputs changed: no setPullInputs');
  resetDirector();
});

ok('#2089 a beatPulse change pushes exactly one sample; a pull-input change sets pull inputs once', () => {
  const r = beatRig();
  initDirectorBeat(r.subscribe);
  r.fire({ ...baseState, beatPulse: 0.8 }, baseState);
  assert.deepEqual(r.beats, [0.8]);
  assert.equal(r.pulls, 0, 'a pulse alone does not touch the pull inputs');
  r.fire({ ...baseState, audioEnabled: true }, baseState);
  assert.equal(r.pulls, 1, 'one input changed: one setPullInputs');
  assert.equal(r.beats.length, 1, 'and no extra beat sample');
  resetDirector();
});

ok('#2089 init twice then one pulse change → exactly one push (the handle is replaced, not stacked)', () => {
  const r = beatRig();
  initDirectorBeat(r.subscribe);
  initDirectorBeat(r.subscribe);
  assert.equal(r.listeners.length, 1, 'one live listener after a double init');
  r.fire({ ...baseState, beatPulse: 1 }, baseState);
  assert.equal(r.beats.length, 1, 'one pulse change, one sample');
  resetDirector();
});

ok('#2089 initDirectorBeat returns an unsubscribe that detaches the listener', () => {
  const r = beatRig();
  const stop = initDirectorBeat(r.subscribe);
  assert.equal(typeof stop, 'function');
  stop();
  assert.equal(r.listeners.length, 0, 'unsubscribed');
  r.fire({ ...baseState, beatPulse: 1 }, baseState);
  assert.equal(r.beats.length, 0, 'no sample after cleanup');
  stop(); // idempotent
  resetDirector();
});

// ── #2090: time-in-phase must not hold its own reset closed ──
// A fake clock drives createDirector; every tick passes nowTs explicitly. The Director's `phaseTime` input was one
// of the four max-pooled signals AND the thing that stopped `lastCoolAt` resetting, so after ~60 s without a
// cool tick it latched the room at intensity 1 for good.
const sim = (script) => {
  let clock = 0;
  const dir = createDirector({ now: () => clock });
  const trace = [];
  for (const [nowTs, audio] of script) {
    clock = nowTs;
    const r = dir.tick({ feed: {}, audio, nowTs });
    trace.push({ s: nowTs / 1000, audio, level: r.intensity, phase: r.directorPhase });
  }
  return trace;
};
const ticksEvery = (everyS, fromS, toS, audio) => {
  const out = [];
  for (let sec = fromS; sec <= toS; sec += everyS) out.push([sec * 1000, audio]);
  return out;
};

ok('#2090 a silent 20-minute session with regular picks does not sit at intensity 1', () => {
  // first tick after a 90 s gap, then one every 20 s
  const trace = sim(ticksEvery(20, 90, 1200, 0));
  const late = trace.filter((t) => t.s > 360);
  assert.ok(late.length > 30, 'the session ran past minute 6');
  assert.ok(
    late.every((t) => t.level < 1),
    `intensity never pinned at 1 after minute 6 (worst ${Math.max(...late.map((t) => t.level))})`,
  );
  assert.ok(
    late.some((t) => t.phase === 'build'),
    'the room is in build after minute 6',
  );
  assert.ok(
    late.every((t) => t.phase === 'build'),
    'a silent room never peaks or relaxes',
  );
});

ok('#2090 sustained mid-level audio still builds to a peak on time-in-phase; the relax window returns to build', () => {
  // audio 0.5 is above the cool floor but nowhere near a peak on its own: only time-in-phase can get it there
  const loud = ticksEvery(5, 5, 360, 0.5);
  const quiet = ticksEvery(5, 365, 900, 0);
  const trace = sim([...loud, ...quiet]);
  const early = trace.filter((t) => t.s <= 120);
  assert.ok(
    early.every((t) => t.level < 0.85 && t.phase === 'build'),
    'two minutes in, audio alone has not peaked',
  );
  const peakAt = trace.find((t) => t.phase === 'peak');
  assert.ok(peakAt && peakAt.s <= 360, 'time-in-phase carried sustained audio to a peak inside six minutes');
  assert.ok(peakAt.s > 120, 'and it took time, not audio alone');
  const after = trace.filter((t) => t.s > peakAt.s && t.audio === 0);
  assert.ok(
    after.some((t) => t.phase === 'relax'),
    'the peak is followed by a relax window',
  );
  assert.ok(
    after.some((t) => t.phase === 'build'),
    'after the relax window the phase returns to build',
  );
  assert.ok(trace[trace.length - 1].level < 0.85, 'and the room is not still pinned at the end of the quiet stretch');
});

// ── #2091: beat confidence lapses 2 bars after the last strong hit (Matt's ruling), on LOOP time ──
// The tracker is driven by pushes, not a clock, so push(pulse, nowMs, bpm) carries the loop time and the BPM.
const BPM = 120;
const BAR_MS = (4 * 60000) / BPM; // 2000 ms: two bars = 4 s
const hit = (t, at, strength = 0.9) => {
  // one attack: rise, peak, fall — about 100 ms wide
  t.push(0, at, BPM);
  t.push(strength, at + 30, BPM);
  t.push(strength * 0.9, at + 60, BPM);
  t.push(0.05, at + 90, BPM);
};
const silence = (t, fromMs, toMs, stepMs = 16) => {
  for (let at = fromMs; at <= toMs; at += stepMs) t.push(0, at, BPM);
};

ok('#2091 two strong attacks then silence: confident is true while they are fresh and false once 2 bars pass', () => {
  const t = createBeatTracker();
  hit(t, 0);
  hit(t, 500);
  assert.equal(t.confident, true, 'two strong attacks: confident');
  silence(t, 600, 500 + 90 + 2 * BAR_MS - 200);
  assert.equal(t.confident, true, 'still inside the two-bar window');
  silence(t, 500 + 90 + 2 * BAR_MS - 200, 500 + 90 + 2 * BAR_MS + 400);
  assert.equal(t.confident, false, 'two bars after the last strong hit: it lapses');
  silence(t, 5000, 5 * 60000, 1000);
  assert.equal(t.confident, false, 'and stays lapsed through minutes of silence');
});

ok('#2091 a steady beat keeps confident true throughout; a lapse needs two fresh attacks to come back', () => {
  const t = createBeatTracker();
  let always = true;
  for (let i = 0; i < 120; i++) {
    hit(t, i * 500);
    silence(t, i * 500 + 100, i * 500 + 480, 20);
    if (i >= 1 && !t.confident) always = false;
  }
  assert.equal(always, true, 'a steady 120 BPM beat never lapses');
  silence(t, 60000, 60000 + 3 * BAR_MS, 50);
  assert.equal(t.confident, false, 'the room goes quiet: lapsed');
  hit(t, 80000);
  assert.equal(t.confident, false, 'one fresh attack is not two: the stale peaks do not count');
  hit(t, 80500);
  assert.equal(t.confident, true, 'two fresh attacks: confident again');
});

ok('#2091 the lapse follows the BPM it is given, and a pushed time that runs backwards (a restart) lapses it', () => {
  const t = createBeatTracker();
  const slow = (at, v) => t.push(v, at, 60); // 60 BPM: a bar is 4 s, two bars 8 s
  for (const [at, v] of [
    [0, 0],
    [30, 0.9],
    [90, 0.05],
    [500, 0],
    [530, 0.9],
    [590, 0.05],
  ])
    slow(at, v);
  assert.equal(t.confident, true);
  slow(8000, 0);
  assert.equal(t.confident, true, '5 s on at 60 BPM is still inside the two-bar window');
  slow(9000, 0);
  assert.equal(t.confident, false, 'past 8 s at 60 BPM it lapses');
  const r = createBeatTracker();
  hit(r, 10000);
  hit(r, 10500);
  assert.equal(r.confident, true);
  r.push(0, 100, BPM);
  assert.equal(r.confident, false, 'loop time went backwards (a restarted loop): the stale confidence is dropped');
  assert.equal(CONFIDENCE_LAPSE_BARS, 2, 'the ruled constant, in bars');
});

ok('#2091 the old call shape push(pulse) never lapses (MeterHero / whisper callers are unchanged)', () => {
  const t = createBeatTracker();
  for (const v of [0, 0.9, 0.1, 0, 0.9, 0.1, 0]) t.push(v);
  for (let i = 0; i < 100000; i++) t.push(0);
  assert.equal(t.confident, true);
});

ok('#2091 the Director: two strong hits then a silent room no longer pins intensity at 1', () => {
  let clock = 0;
  const d = createDirector({ now: () => clock });
  const feed = (pulse, at) => {
    clock = at;
    d.pushBeat(pulse, at, BPM);
  };
  for (const [at, v] of [
    [0, 0],
    [30, 0.9],
    [90, 0.05],
    [500, 0],
    [530, 0.9],
    [590, 0.05],
  ])
    feed(v, at);
  clock = 1000;
  const hot = d.tick({ feed: {}, audio: 0, nowTs: clock });
  assert.equal(hot.intensity, 1, 'two fresh strong hits: the beat reads confident');
  let level = 1;
  // a silent room sends no pushes (beatPulse stops changing): only the tick's clock can lapse it
  d.setBeatClock(() => ({ loopMs: clock, bpm: BPM }));
  for (let at = 2000; at <= 300000; at += 2000) {
    clock = at;
    level = d.tick({ feed: {}, audio: 0, nowTs: at }).intensity;
  }
  assert.ok(level < 0.5, `five silent minutes later the room has cooled (intensity ${level})`);
});

console.log(`director.selfcheck: ${n} checks passed`);
