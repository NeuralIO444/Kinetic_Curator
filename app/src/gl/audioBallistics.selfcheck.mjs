// audioBallistics.selfcheck.mjs — envelope ballistics for audio reactivity (#306).
//
// Node-only: follower attack/release time constants, response curves,
// peak-hold with falloff, exact-zero silence, param sanitization, and the
// swell fader on applyAudioEnvelope (the #306 washout control) — including
// that swell does not regress the #303 headroom-relative glow mapping.
import assert from 'node:assert';
import {
  BALLISTICS_CURVES,
  BALLISTICS_DEFAULTS,
  sanitizeBallistics,
  createBallisticsState,
  resetBallistics,
  processBallistics,
} from './audioBallistics.mjs';
import { accumRecipeParams, applyAudioEnvelope } from './accum.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const approx = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

ok('curve registry and defaults', () => {
  assert.deepEqual([...BALLISTICS_CURVES].sort(), ['exponential', 'linear', 'logarithmic', 'peak-hold'].sort());
  assert.equal(BALLISTICS_DEFAULTS.attackMs, 25);
  assert.equal(BALLISTICS_DEFAULTS.releaseMs, 320);
  assert.equal(BALLISTICS_DEFAULTS.curve, 'exponential');
  assert.equal(BALLISTICS_DEFAULTS.swell, 1);
});

ok('sanitizeBallistics clamps and falls back', () => {
  const d = sanitizeBallistics();
  assert.deepEqual(d, BALLISTICS_DEFAULTS);
  const s = sanitizeBallistics({ attackMs: -5, releaseMs: 99999, curve: 'bogus', swell: 7 });
  assert.equal(s.attackMs, 0, 'attack clamps at 0');
  assert.equal(s.releaseMs, 5000, 'release clamps at 5000');
  assert.equal(s.curve, 'exponential', 'unknown curve falls back');
  assert.equal(s.swell, 1, 'swell clamps at 1');
  assert.equal(sanitizeBallistics(null).curve, 'exponential', 'null -> defaults');
});

ok('silence stays exact zeros (no-op contract)', () => {
  const st = createBallisticsState();
  // Prime the follower with a loud signal, then cut to silence: it must
  // decay to *exactly* 0, not 1e-9, or the downstream passthrough branch
  // (applyAudioEnvelope silence identity) never fires.
  processBallistics(st, { rms: 1, flux: 1, beatPulse: 1 }, 16.7, { attackMs: 0, releaseMs: 50, curve: 'linear' });
  assert.ok(st.rms > 0, 'follower primed');
  for (let i = 0; i < 400; i++) {
    const out = processBallistics(st, { rms: 0, flux: 0, beatPulse: 0 }, 16.7, { attackMs: 0, releaseMs: 50, curve: 'linear' });
    assert.ok(out.rms >= 0 && out.flux >= 0 && out.beatPulse >= 0, 'never negative');
  }
  assert.strictEqual(st.rms, 0, 'rms snaps to exact 0');
  assert.strictEqual(st.flux, 0, 'flux snaps to exact 0');
  assert.strictEqual(st.beatPulse, 0, 'beatPulse snaps to exact 0');
  // And a never-touched follower is exact zeros from the first sample.
  const fresh = createBallisticsState();
  const z = processBallistics(fresh, { rms: 0, flux: 0, beatPulse: 0 }, 16.7, BALLISTICS_DEFAULTS);
  assert.deepEqual(z, { rms: 0, flux: 0, beatPulse: 0 });
});

ok('attack/release are one-pole time constants', () => {
  const st = createBallisticsState();
  const p = { attackMs: 100, releaseMs: 400, curve: 'linear' };
  const a = processBallistics(st, { rms: 1 }, 100, p).rms;
  assert.ok(approx(a, 1 - Math.exp(-100 / 100)), `attack step ${a} matches 1-e^-1`);
  // Second step on a sustained loud signal approaches 1 but never snaps.
  const b = processBallistics(st, { rms: 1 }, 100, p).rms;
  assert.ok(b > a && b < 1, 'attack converges smoothly');
  // Release at 400ms moves slower than attack at 100ms from the same distance.
  const stA = createBallisticsState(); stA.rms = 1;
  const stB = createBallisticsState(); stB.rms = 1;
  const dropA = 1 - processBallistics(stA, { rms: 0 }, 100, { attackMs: 100, releaseMs: 100, curve: 'linear' }).rms;
  const dropB = 1 - processBallistics(stB, { rms: 0 }, 100, { attackMs: 100, releaseMs: 400, curve: 'linear' }).rms;
  assert.ok(dropA > dropB, `slower release moves less (fast ${dropA.toFixed(3)} > slow ${dropB.toFixed(3)})`);
  // Zero attack/release = instant tracking (the still-path identity).
  const stI = createBallisticsState();
  const id = processBallistics(stI, { rms: 0.37, flux: 0.91 }, 16.7, { attackMs: 0, releaseMs: 0, curve: 'linear' });
  assert.ok(approx(id.rms, 0.37) && approx(id.flux, 0.91), 'identity params pass through exactly');
});

ok('response curves shape the followed value', () => {
  const lin = (v) => processBallistics(createBallisticsState(), { rms: v }, 0, { attackMs: 0, releaseMs: 0, curve: 'linear' }).rms;
  const exp = (v) => processBallistics(createBallisticsState(), { rms: v }, 0, { attackMs: 0, releaseMs: 0, curve: 'exponential' }).rms;
  const log = (v) => processBallistics(createBallisticsState(), { rms: v }, 0, { attackMs: 0, releaseMs: 0, curve: 'logarithmic' }).rms;
  assert.ok(approx(lin(0.5), 0.5), 'linear is identity');
  assert.ok(approx(exp(0.5), 0.25), 'exponential squares (heavy at low levels)');
  assert.ok(approx(exp(0), 0) && approx(exp(1), 1), 'exponential pins 0 and 1');
  assert.ok(log(0.5) > 0.5, `logarithmic lifts quiet swells (${log(0.5).toFixed(3)} > 0.5)`);
  assert.ok(approx(log(0), 0) && approx(log(1), 1), 'logarithmic pins 0 and 1');
  assert.ok(log(0.25) > exp(0.25), 'log lifts where exponential suppresses');
});

ok('peak-hold: instant attack, linear falloff', () => {
  const st = createBallisticsState();
  const p = { attackMs: 200, releaseMs: 1000, curve: 'peak-hold' };
  // Attack is instant even with a slow attackMs — it is a peak detector.
  const hit = processBallistics(st, { rms: 0.8 }, 16.7, p).rms;
  assert.ok(approx(hit, 0.8), `peak-hold snaps to the peak (${hit})`);
  // Release falls linearly at 1/releaseMs per ms, holding the peak shape.
  const f1 = processBallistics(st, { rms: 0 }, 100, p).rms;
  assert.ok(approx(f1, 0.8 - 100 / 1000), `linear falloff after 100ms (${f1.toFixed(3)})`);
  const f2 = processBallistics(st, { rms: 0 }, 100, p).rms;
  assert.ok(approx(f2, 0.8 - 200 / 1000), 'falloff continues linearly');
  // A rising tail catches the falling peak.
  const caught = processBallistics(st, { rms: 0.9 }, 16.7, p).rms;
  assert.ok(approx(caught, 0.9), 'rising tail re-peaks');
});

ok('resetBallistics zeroes the session', () => {
  const st = createBallisticsState();
  processBallistics(st, { rms: 1 }, 16.7, { attackMs: 0, releaseMs: 0, curve: 'linear' });
  resetBallistics(st);
  assert.strictEqual(st.rms, 0);
  const out = processBallistics(st, { rms: 0 }, 16.7, BALLISTICS_DEFAULTS);
  assert.strictEqual(out.rms, 0, 'fresh session starts silent');
});

ok('applyAudioEnvelope: swell is the audio-glow fader (#306)', () => {
  const base = accumRecipeParams({ optics: 0.5 });
  const loud = { rms: 1, flux: 0, beatPulse: 0 };
  const full = applyAudioEnvelope(base, loud, { swell: 1 });
  const none = applyAudioEnvelope(base, loud, { swell: 0 });
  // swell=1 keeps the #303 headroom-relative math exactly.
  assert.ok(approx(full.optics, 0.5 + 0.5 * 0.3), `swell=1 headroom math intact (${full.optics})`);
  // swell=0: audio never moves the glow — the washout control.
  assert.ok(approx(none.optics, 0.5), `swell=0 leaves glow untouched (${none.optics})`);
  const half = applyAudioEnvelope(base, loud, { swell: 0.5 });
  assert.ok(half.optics > none.optics && half.optics < full.optics, 'swell scales continuously');
  // Swell only touches the glow gesture — keep/tunnel math is unchanged.
  assert.ok(approx(none.keep, full.keep), 'swell does not touch keep');
  assert.ok(approx(none.tunnelZoom, full.tunnelZoom), 'swell does not touch tunnel');
  // Default (no opts) is swell=1: existing callers are unaffected.
  const def = applyAudioEnvelope(base, loud);
  assert.ok(approx(def.optics, full.optics), 'opts default to swell=1');
});

ok('applyAudioEnvelope: #303 headroom guarantee survives ballistics', () => {
  // Loud audio can never peg GLOW past the slider's own ceiling, at any swell.
  for (const swell of [0, 0.5, 1]) {
    const atMax = applyAudioEnvelope(accumRecipeParams({ optics: 1 }), { rms: 1, flux: 1, beatPulse: 1 }, { swell });
    assert.ok(approx(atMax.optics, 1), `optics=1 stays 1 at swell=${swell}`);
    const high = applyAudioEnvelope(accumRecipeParams({ optics: 0.9 }), { rms: 1, flux: 1, beatPulse: 1 }, { swell });
    assert.ok(high.optics <= 1 && high.optics >= 0.9, `optics=0.9 never exceeds 1 at swell=${swell}`);
  }
  // Silence is still the exact passthrough, with or without opts.
  const base = accumRecipeParams({ optics: 0.4 });
  assert.deepEqual(applyAudioEnvelope(base, { rms: 0, flux: 0, beatPulse: 0 }, { swell: 1 }), base);
});

console.log(`\naudioBallistics: ${n} checks passed`);
