// #807 — clock-domain inventory.
// Performers must be tagged loop | wall | bake. Wall is allow-listed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const WALL_OK = [
  'src/state/id.js',
  'src/state/history.js',
  'src/state/slices/paletteLibrarySlice.js',
  'src/state/slices/voiceSlice.js',
  'src/hooks/useProjectAutosave.js',
  'src/hooks/usePerformanceGovernor.js',
  'src/engine/kernel/tracks/patchDiag.mjs',
  'src/gl/debug/costTiers.measure.mjs',
  'src/gl/debug/measureCosts.mjs',
  'src/gl/phase6.selfcheck.mjs',
  'src/panels/davis/VoiceDish.jsx',
];

const LOOP_OWNERS = [
  'src/gl/liveLoop.mjs',
  'src/gl/liveResolve.mjs',
];

function read(rel) {
  return readFileSync(join(APP, rel), 'utf8');
}

test('#807 loop owners do not pass Date.now() into sim', () => {
  for (const f of LOOP_OWNERS) {
    const src = read(f);
    const codeCalls = src.split('\n').filter((l) => {
      const t = l.trim();
      return t.includes('Date.now()') && !t.startsWith('//') && !t.startsWith('*');
    });
    assert.deepEqual(codeCalls, [], `${f} must not call Date.now() for sim`);
    assert.match(src, /dtSec/, `${f} owns dtSec`);
    assert.match(src, /loopTimeMs/, `${f} owns loopTimeMs`);
  }
});

test('#807 liveLoop documents Spine A clamp', () => {
  const src = read('src/gl/liveLoop.mjs');
  assert.match(src, /clampedDtMs/);
  assert.match(src, /buildFrame\(0, loopTimeMs\)/);
});

test('#807 bake clock is not Date.now', () => {
  const src = read('src/engine/kernel/bake/index.js');
  assert.match(src, /BAKE_TIME_ORIGIN/);
  assert.match(src, /not Date\.now/);
});

test('#807 wall allow-list is explicit', () => {
  assert.ok(WALL_OK.length >= 8);
  for (const f of WALL_OK) {
    read(f);
  }
});

// ── #806 — parent Law table: every performer tagged loop | wall | bake ──
//
// The Law (issue #806): physics, warp, morph, MIX dissolve, behave ease,
// KINEME u_motionTime, EVOLVE interval, METRO phrase, FEED delay, biology age,
// audio ballistics, trail fade, capture/export time MUST run on loopTimeMs /
// dtSec. Wall clock is allowed only for: undo debounce, autosave, governor
// stall durations, id generation, diagnostics age — plus three documented
// design exceptions (swell gesture #268, gate weave #741, audio stage-1 #503).
//
// Rates are per-second at a 60 Hz reference: Math.pow(damp, 60 * dtSec).

const WALL_RE = /Date\.now\(\)|performance\.now\(\)|new Date\(/;

function codeLinesWithNumbers(src) {
  return src.split('\n').map((t, i) => ({ n: i + 1, t })).filter(({ t }) => {
    const s = t.trim();
    return s && !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*');
  });
}

// Every wall-clock read must be justified: an allow pattern matching the
// line itself or one of the next CONTEXT_LINES (covers `const now = ...`
// followed by its consumer a few lines down). Anything else FAILS.
function unjustifiedWallHits(rel, allowRes, contextLines = 4) {
  const lines = codeLinesWithNumbers(read(rel));
  const bad = [];
  lines.forEach(({ n, t }, i) => {
    if (!WALL_RE.test(t)) return;
    const window = lines.slice(i, i + 1 + contextLines).map((l) => l.t).join('\n');
    if (!allowRes.some((re) => re.test(window))) bad.push(`${rel}:${n}: ${t.trim()}`);
  });
  return bad;
}

// Must-loop performers with ZERO wall-clock reads in code.
const MUST_LOOP_BAN = [
  'src/hooks/useMorphEvolve.js', // #806: morph eases off loopClock.ms
  'src/hooks/useVoiceMixDriver.js', // #806: MIX advances off loopClock.ms
  'src/engine/particles.js', // physics integrates on loop dt
  'src/gl/liveResolve.mjs', // resolve on loopTimeMs / dtSec
  'src/gl/accum.mjs', // trail fade on loop frames
  'src/gl/accumStill.mjs',
  'src/engine/kernel/tracks/feedDelay.js', // pure frame history, no clock
  'src/state/slices/layoutSlice.js', // voiceMix startedAt on loopClock.ms
];

test('#806 must-loop performers read no wall clock', () => {
  for (const f of MUST_LOOP_BAN) {
    assert.deepEqual(unjustifiedWallHits(f, []), [], `${f}: must-loop performer reads wall clock`);
  }
});

// Must-loop files that legitimately mix: the loop owners' infra
// (retry backoff, error throttles, GPU timing) and documented designs.
// Every wall read must match an allow pattern — or the build fails.
const MUST_LOOP_ALLOW = {
  'src/state/slices/davisSlice.js': {
    // #719: human-readable keep timestamp (HH:MM:SS) for the favorites
    // shelf — metadata, not a performer clock. morphStart itself is loop ms.
    allow: [/new Date\(\)\.toISOString/],
    mustContain: [/morphStart: loopClock\.ms/],
  },
  'src/gl/liveLoop.mjs': {
    allow: [
      /swellStart/, // #268: deliberate wall-clock gesture envelope
      /accumRetryAt|lastAccumErrTs/, // fault-isolation backoff + throttle
      /bakeRetryAt|lastBakeErrTs/, // bake retry backoff + throttle
      /cpuT0|reportStage/, // GPU timing diagnostics
      /gateWeaveOffset/, // #741: film finish effect, live canvas only
      /\bt0\b|timeoutMs/, // bake watchdog timeouts
      /prevTime|rawDtMs|clampedDtMs/, // Spine A tick source -> loopTimeMs
      /lastErrTs/, // frame-error throttle
    ],
    mustContain: [/loopTimeMs \+=/, /kinemeClock\.at\(loopTimeMs/],
    noDateNow: true,
  },
  'src/gl/renderWorker.js': {
    allow: [
      /swellStart/, // #268 mirror: deliberate wall-clock gesture envelope
      /accumRetryAt/, // fault-isolation backoff
      /lastTickMs|dtMs|loopTimeMs \+=/, // worker tick source -> loopTimeMs
    ],
    mustContain: [/kinemeClock\.at\(frameTimeMs/, /loopTimeMs \+=/],
    noDateNow: true,
  },
  'src/state/slices/voiceSlice.js': {
    // createdAt / id generation are Law-allowed wall uses; the MIX clock
    // itself (startedAt) must be loop time — asserted below.
    allow: [/createdAt/, /Date\.now\(\)\.toString\(36\)/],
    mustContain: [/startedAt: loopClock\.ms/],
  },
  'src/hooks/useAudioInput.js': {
    // #503: deliberate two-stage pipeline — stage 1 pre-shapes on wall dt,
    // the GL loop re-shapes with loop dt. Pinned by audioPipeline.selfcheck.
    allow: [/lastTsRef/],
    mustContain: [/#503/, /two-stage/],
  },
  'src/biology/lifecycle.js': {
    // `at` is a UI sort key for the Biology panel, not an age input —
    // age is tick-driven (GrowthHooks.cellAge). Law-allowed diagnostics.
    allow: [/at: Date\.now\(\)/],
    mustContain: [/GrowthHooks\.cellAge/],
  },
};

test('#806 must-loop files justify every wall-clock read', () => {
  for (const [f, policy] of Object.entries(MUST_LOOP_ALLOW)) {
    const src = read(f);
    assert.deepEqual(unjustifiedWallHits(f, policy.allow), [], `${f}: unjustified wall-clock read`);
    for (const re of policy.mustContain) {
      assert.match(src, re, `${f}: must contain ${re}`);
    }
    if (policy.noDateNow) {
      const hits = codeLinesWithNumbers(src).filter(({ t }) => /Date\.now\(\)/.test(t));
      assert.deepEqual(hits.map((h) => `${f}:${h.n}`), [], `${f}: loop owner must never Date.now()`);
    }
  }
});

test('#806 morph + MIX ride the loop clock', () => {
  assert.match(read('src/hooks/useMorphEvolve.js'), /loopClock\.ms/, 'morph easing reads loopClock');
  assert.match(read('src/hooks/useVoiceMixDriver.js'), /loopClock\.ms/, 'MIX driver reads loopClock');
  assert.match(read('src/state/slices/davisSlice.js'), /morphStart: loopClock\.ms/, 'morph stamped in loop ms');
  assert.match(read('src/state/slices/voiceSlice.js'), /startedAt: loopClock\.ms/, 'voice MIX stamped in loop ms');
  assert.match(read('src/state/slices/layoutSlice.js'), /startedAt: loopClock\.ms/, 'layout MIX stamped in loop ms');
});

test('#806 documented wall-clock designs keep their rationale', () => {
  const live = read('src/gl/liveLoop.mjs');
  assert.match(live, /can't stick if a frame is dropped/, 'swell #268 wall rationale present');
  assert.match(live, /#741/, 'gate weave rationale present');
  assert.match(read('src/hooks/useAudioInput.js'), /#503/, 'audio two-stage rationale present');
});

test('#806 damping rates are per-second at 60 Hz reference', () => {
  const src = read('src/engine/particles.js');
  assert.match(src, /const dtFrames = dtSec \* 60;/, 'dtFrames is dtSec * 60');
  assert.match(src, /Math\.pow\(damp, dtFrames\)/, 'damping is pow(damp, 60 * dtSec)');
});
