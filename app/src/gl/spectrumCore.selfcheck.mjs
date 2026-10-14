// #1482 P1 — the spectrum analysis core, on synthetic spectra: where a tone lands, the dB window and tilt, ballistics
// that do not depend on the frame rate, peak hold and fall, the relative mode, the texture rows, the Queen's set as a
// spectrum, and the compact take record.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LOG_BINS, TEX_W, TEX_H, F_LO, F_HI, ATTACK_MS, RELEASE_MS, PEAK_HOLD_MS, PEAK_FALL_MS, DB_FLOOR, DB_CEIL, RECORD_BINS,
  logBinCentre, tiltDb, dbToUnit, buildLogBinMap, createSpectrumCore, packSpectrumTexture, spectrumFromBands,
  quantizeSpectrum, expandSpectrum,
} from './spectrumCore.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const FFT = 1024; const SR = 48000;
const hzPerBin = SR / 2 / FFT;
/** A dB spectrum: a floor everywhere and a peak (dB) at one frequency's bin. */
const tone = (hz, db = -30, floor = -120) => { const a = new Float32Array(FFT).fill(floor); a[Math.round(hz / hzPerBin)] = db; return a; };
const flat = (db) => new Float32Array(FFT).fill(db);
const logIndexOf = (hz) => Math.min(LOG_BINS - 1, Math.max(0, Math.floor(LOG_BINS * Math.log(hz / F_LO) / Math.log(F_HI / F_LO))));
const argmax = (a) => { let m = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[m]) m = i; return m; };
/** Run a spectrum for `ms` of wall time at `fps`; return the core. */
function run(spec, ms, fps, core = createSpectrumCore({ fftBins: FFT, sampleRate: SR })) {
  const dt = 1000 / fps; for (let t = 0; t < ms; t += dt) core.update(spec, dt);
  return core;
}

ok('the log map covers 30 Hz to 16 kHz with no empty bin, in order', () => {
  const m = buildLogBinMap(FFT, SR);
  for (let i = 0; i < LOG_BINS; i++) { assert.ok(m.hi[i] >= m.lo[i], `bin ${i} is not empty`); assert.ok(m.lo[i] >= 0 && m.hi[i] < FFT); }
  for (let i = 1; i < LOG_BINS; i++) assert.ok(m.lo[i] >= m.lo[i - 1], 'monotone');
  assert.ok(logBinCentre(0) > F_LO && logBinCentre(LOG_BINS - 1) < F_HI);
  assert.ok(Math.abs(logBinCentre(LOG_BINS / 2) - Math.sqrt(F_LO * F_HI)) / Math.sqrt(F_LO * F_HI) < 0.05, 'the middle is the geometric mean');
});

ok('a tone lands in the log bin that holds its frequency (within one bin), across the range', () => {
  for (const hz of [100, 440, 1000, 3000, 8000, 12000]) {
    const c = run(tone(hz), 400, 60);
    const at = argmax(c.state.smooth);
    assert.ok(Math.abs(at - logIndexOf(hz)) <= 1, `${hz} Hz -> bin ${at}, expected ~${logIndexOf(hz)}`);
    assert.ok(c.state.smooth[at] > 0.2, `${hz} Hz reads (${c.state.smooth[at].toFixed(2)})`);
  }
});

ok('silence is exactly zero everywhere, and not-a-number bins are silence, not poison', () => {
  const c = run(flat(-140), 500, 60);
  assert.ok(c.state.smooth.every((v) => v === 0) && c.state.peak.every((v) => v === 0));
  assert.equal(c.state.rms, 0); assert.equal(c.state.centroid, 0);
  const bad = flat(-60); bad[100] = NaN; bad[200] = -Infinity; bad[300] = Infinity;
  const c2 = run(bad, 200, 60);
  assert.ok(c2.state.smooth.every((v) => Number.isFinite(v) && v >= 0 && v <= 1));
  assert.doesNotThrow(() => createSpectrumCore().update(null, 16));
});

ok('the dB window and the tilt: -72 is 0, -36 is 1; treble gets +3 dB per octave above 1 kHz, clamped', () => {
  assert.equal(dbToUnit(DB_FLOOR), 0); assert.equal(dbToUnit(DB_CEIL), 1);
  assert.ok(Math.abs(dbToUnit((DB_FLOOR + DB_CEIL) / 2) - 0.5) < 1e-9);
  assert.equal(dbToUnit(-200), 0); assert.equal(dbToUnit(40), 1);
  assert.equal(tiltDb(500), 0); assert.equal(tiltDb(1000), 0);
  assert.ok(Math.abs(tiltDb(2000) - 3) < 1e-9 && Math.abs(tiltDb(4000) - 6) < 1e-9);
  assert.equal(tiltDb(16000), 12, 'four octaves up is the clamp');
  // the same level reads louder in the treble than in the bass
  const low = run(tone(500, -50), 300, 60).state.smooth;
  const high = run(tone(8000, -50), 300, 60).state.smooth;
  assert.ok(Math.max(...high) > Math.max(...low));
});

ok('ballistics are frame-rate independent: the same wall time at 30, 60 and 144 fps lands on the same level', () => {
  const at = (fps, ms) => { const c = run(tone(1000, -45), ms, fps); return c.state.smooth[argmax(c.state.smooth)]; };
  for (const ms of [10, 40, 200]) {
    const a = at(30, ms); const b = at(60, ms); const c = at(144, ms);
    assert.ok(Math.abs(a - b) < 0.12 && Math.abs(b - c) < 0.06, `${ms} ms: ${a.toFixed(3)} ${b.toFixed(3)} ${c.toFixed(3)}`);
  }
  // release is slower than attack, by the issue's constants
  const core = createSpectrumCore({ fftBins: FFT, sampleRate: SR });
  run(tone(1000, -40), 400, 60, core);
  const top = core.state.smooth[argmax(core.state.smooth)];
  run(flat(-140), RELEASE_MS, 60, core);
  const after = core.state.smooth[argmax(core.state.peak) ] ;
  assert.ok(ATTACK_MS < RELEASE_MS);
  assert.ok(after < top * 0.5 && after > top * 0.15, `after one release time the level is ~1/e (${(after / top).toFixed(2)})`);
});

ok('peaks jump up, hold for PEAK_HOLD_MS, then fall at a fixed rate and never below the level', () => {
  const core = createSpectrumCore({ fftBins: FFT, sampleRate: SR });
  run(tone(1000, -40), 300, 60, core);
  const i = argmax(core.state.smooth);
  const p0 = core.state.peak[i];
  assert.ok(p0 >= core.state.smooth[i] - 1e-6);
  run(flat(-140), PEAK_HOLD_MS - 30, 60, core);
  assert.equal(core.state.peak[i], p0, 'held');
  run(flat(-140), 140, 60, core);
  assert.ok(core.state.peak[i] < p0, 'then falling');
  run(flat(-140), PEAK_FALL_MS + 400, 60, core);
  assert.ok(core.state.peak[i] <= 1e-6 + core.state.smooth[i] + 0.01, 'down to the level (here: silence)');
  assert.ok(core.state.peak.every((p, k) => p >= core.state.smooth[k] - 1e-6), 'a peak is never below the level');
});

ok('relative mode: a steady signal reads ~0 after a while; a sudden rise reads positive, then settles', () => {
  const core = createSpectrumCore({ fftBins: FFT, sampleRate: SR });
  run(flat(-50), 12000, 60, core);
  assert.ok(core.state.rel.every((v) => Math.abs(v) < 0.05), 'steady is normal');
  run(flat(-38), 120, 60, core);
  assert.ok(Math.max(...core.state.rel) > 0.2, 'a rise is a deviation');
  run(flat(-38), 20000, 60, core);
  assert.ok(core.state.rel.every((v) => Math.abs(v) < 0.1), 'and it becomes the new normal');
  assert.ok(core.state.rel.every((v) => v >= -1 && v <= 1));
});

ok('flux reports only rises, and the spectral centroid follows where the energy is', () => {
  const core = createSpectrumCore({ fftBins: FFT, sampleRate: SR });
  core.update(flat(-140), 16.7);
  core.update(tone(2000, -30), 16.7);
  assert.ok(core.state.flux[logIndexOf(2000)] > 0.1, 'a new tone is flux');
  core.update(tone(2000, -30), 16.7);
  assert.equal(core.state.flux[logIndexOf(2000)], 0, 'held, no flux');
  const lo = run(tone(150, -30), 300, 60).state.centroid;
  const hi = run(tone(9000, -30), 300, 60).state.centroid;
  assert.ok(hi > lo + 0.3, `centroid ${lo.toFixed(2)} < ${hi.toFixed(2)}`);
});

ok('the texture is 256 x 4: smoothed, peak, waveform, flux, every byte deterministic and in range', () => {
  const core = run(tone(1000, -35), 300, 60);
  const wave = new Float32Array(1024).map((_, i) => Math.sin(i / 20));
  core.update(tone(1000, -35), 16.7, wave);
  const tex = packSpectrumTexture(core.state);
  assert.equal(tex.length, TEX_W * TEX_H);
  const row = (r) => Array.from(tex.slice(r * TEX_W, (r + 1) * TEX_W));
  assert.ok(Math.max(...row(0)) > 40, 'row 0 carries the spectrum');
  assert.ok(row(1).every((v, x) => v >= row(0)[x] - 1), 'row 1 (peaks) is never below row 0');
  assert.ok(Math.max(...row(2)) > 200 && Math.min(...row(2)) < 60, 'row 2 is a waveform around 0.5');
  assert.ok(Math.abs(row(2).reduce((s, v) => s + v, 0) / TEX_W - 128) < 40, 'centred on 0.5');
  const again = packSpectrumTexture(core.state);
  assert.deepEqual(Array.from(again), Array.from(tex), 'the same state packs to the same bytes');
  const silent = packSpectrumTexture(createSpectrumCore().state);
  assert.ok(row(0).length === TEX_W && Array.from(silent.slice(0, TEX_W)).every((v) => v === 0), 'silence is a black row');
});

ok('the Queen\'s set as a spectrum: her 7 band levels spread smoothly over 128 bins, deterministic, nothing invented', () => {
  const kick = spectrumFromBands({ sub: 0.9, bass: 0.8, mud: 0.2, mids: 0, edge: 0, pres: 0, air: 0 });
  assert.equal(kick.length, LOG_BINS);
  assert.ok(kick[0] > kick[LOG_BINS / 2] && kick[LOG_BINS / 2] > kick[LOG_BINS - 1], 'energy falls off up the spectrum');
  assert.ok(kick.every((v) => v >= 0 && v <= 1));
  for (let i = 1; i < LOG_BINS; i++) assert.ok(Math.abs(kick[i] - kick[i - 1]) < 0.1, 'smooth: no cliff between neighbours');
  const hat = spectrumFromBands([0, 0, 0, 0, 0.3, 0.8, 0.9]);
  assert.ok(hat[LOG_BINS - 1] > hat[0]);
  assert.deepEqual(Array.from(spectrumFromBands({ sub: 0.5 })), Array.from(spectrumFromBands({ sub: 0.5 })));
  assert.ok(spectrumFromBands(null).every((v) => v === 0), 'no bands is silence');
  assert.ok(spectrumFromBands({ sub: NaN, bass: 9 }).every((v) => Number.isFinite(v) && v >= 0 && v <= 1));
});

ok('the compact take record: 32 bytes, close to the original, and flat stays flat', () => {
  const core = run(tone(1500, -34), 300, 60);
  const q = quantizeSpectrum(core.state.smooth);
  assert.equal(q.length, RECORD_BINS);
  const back = expandSpectrum(q);
  assert.equal(back.length, LOG_BINS);
  assert.ok(Math.abs(argmax(back) - argmax(core.state.smooth)) <= 3, 'a narrow tone keeps its place (it loses its width)');
  // a broad spectrum survives the 4:1 record with a small error
  const broad = new Float32Array(LOG_BINS).map((_, i) => Math.exp(-(((i - 50) / 14) ** 2)));
  const bb = expandSpectrum(quantizeSpectrum(broad));
  let worst = 0; for (let i = 0; i < LOG_BINS; i++) worst = Math.max(worst, Math.abs(bb[i] - broad[i]));
  assert.ok(worst < 0.1, `worst error on a broad spectrum ${worst.toFixed(3)}`);
  const flatQ = quantizeSpectrum(new Float32Array(LOG_BINS).fill(0.5));
  assert.ok(Array.from(expandSpectrum(flatQ)).every((v) => Math.abs(v - 0.5) < 0.01));
  assert.ok(quantizeSpectrum(new Float32Array(LOG_BINS)).every((v) => v === 0));
});

ok('pure: no clock, timers or DOM, and the state is reused (no per-frame allocation)', () => {
  const code = readFileSync(new URL('./spectrumCore.mjs', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.ok(!/Date\.now|performance\.now|Math\.random|setTimeout|setInterval|requestAnimationFrame|AudioContext|document|window/.test(code));
  const core = createSpectrumCore();
  const a = core.update(tone(1000), 16.7);
  const smooth = a.smooth;
  const b = core.update(tone(2000), 16.7);
  assert.equal(a, b); assert.equal(b.smooth, smooth);
});

console.log(`spectrumCore.selfcheck: ${n} checks passed`);
