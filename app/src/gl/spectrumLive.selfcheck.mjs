// #1482 P2 — the live spectrum: a fake analyser and a fake set drive it exactly as the real ones would; the set is
// asked once a frame (by the live loop) and never again by the spectrum; and the meter's analyser, the bands and the
// routes read exactly what they read before.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stepSpectrum, readSpectrum } from './spectrumLive.mjs';
import { setSourceFeed, readSourceFeed, peekSourceFeed } from './sourceFeed.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const flat = (s) => s.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, ''); // layout-blind source pins (#1684): whitespace and trailing commas are Prettier's, not the code's
const argmax = (a) => { let m = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[m]) m = i; return m; };
/** A fake AnalyserNode with one tone (dB) at a frequency. */
const fakeAnalyser = (hz, db = -30, sr = 48000) => ({
  fftSize: 2048, frequencyBinCount: 1024,
  getFloatFrequencyData(a) { a.fill(-120); a[Math.round(hz / (sr / 2 / 1024))] = db; },
  getFloatTimeDomainData(a) { for (let i = 0; i < a.length; i++) a[i] = Math.sin(i / 10) * 0.5; },
});
const steps = (an, ms) => { for (let t = 0; t < ms; t += 16.7) stepSpectrum(an, 48000, 16.7); return readSpectrum(); };

ok('real audio: a tone through the analyser shows where it is, and the waveform row fills', () => {
  const s = steps(fakeAnalyser(3000), 400);
  const lo = steps(fakeAnalyser(100), 400);
  assert.ok(argmax(s.smooth) > 70 || argmax(lo.smooth) < 40, 'tones land by frequency');
  assert.ok(argmax(lo.smooth) < 40, `100 Hz lands low (bin ${argmax(lo.smooth)})`);
  assert.ok(Math.max(...lo.wave) > 0.6, 'the waveform row is filled');
});

ok('audio off: the measured part releases to exactly zero', () => {
  const s = steps(null, 3000);
  assert.ok(s.smooth.every((v) => v === 0), 'silent');
});

ok('the set, with no audio: its bands drive the spectrum, scaled by its mix; asked once a frame, never by the spectrum', () => {
  let asked = 0;
  setSourceFeed(() => { asked++; return { mix: 1, bands: { sub: 0.9, bass: 0.8, mud: 0.3, mids: 0, edge: 0, pres: 0, air: 0 } }; });
  for (let t = 0; t < 600; t += 16.7) { readSourceFeed(t); stepSpectrum(null, 48000, 16.7); }
  const frames = Math.ceil(600 / 16.7);
  assert.equal(asked, frames, 'the provider is asked only by the live loop');
  const s = readSpectrum();
  assert.ok(s.smooth[5] > 0.5 && s.smooth[120] < 0.05, 'low bins up, high bins down');
  assert.ok(peekSourceFeed() && peekSourceFeed().mix === 1);
  setSourceFeed(() => ({ mix: 0.5, bands: { sub: 0.9, bass: 0.8 } }));
  for (let t = 0; t < 600; t += 16.7) { readSourceFeed(t); stepSpectrum(null, 48000, 16.7); }
  const half = readSpectrum().smooth[3];
  assert.ok(half > 0.3 && half < 0.55, `mix 0.5 is half (${half.toFixed(2)})`);
  setSourceFeed(null);
  assert.equal(peekSourceFeed(), null, 'removing the provider clears the last answer');
  assert.equal(readSourceFeed(0), null);
  const s2 = steps(null, 3000);
  assert.ok(s2.smooth.every((v) => v === 0), 'and the spectrum releases');
});

ok('a provider that throws or answers mix 0 is no source', () => {
  setSourceFeed(() => { throw new Error('x'); });
  assert.equal(readSourceFeed(0), null); assert.equal(peekSourceFeed(), null);
  setSourceFeed(() => ({ mix: 0, bands: { sub: 1 } }));
  assert.equal(readSourceFeed(0), null); assert.equal(peekSourceFeed(), null);
  setSourceFeed(null);
});

ok('the meter and the modulation analysers are untouched: same sizes, same smoothing; the spectrum is a third node', () => {
  const hook = src('../hooks/useAudioInput.js');
  assert.ok(flat(hook).includes(flat('analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.8;')), 'modulation analyser as before');
  assert.ok(flat(hook).includes(flat('meterAnalyser.fftSize = METER_FFT_SIZE; meterAnalyser.smoothingTimeConstant = 0.6;')), 'meter analyser as before');
  assert.ok(flat(hook).includes(flat('spectrumAnalyser.smoothingTimeConstant = 0;')) && flat(hook).includes(flat('gainNode.connect(spectrumAnalyser)')));
  assert.ok(flat(hook).includes(flat('setAudioMeterTap({ analyser: meterAnalyser, spectrum: spectrumAnalyser')), 'the bands still read the meter analyser');
  const tap = src('../hooks/audioMeterTap.js');
  assert.ok(/tap\.analyser\.getByteFrequencyData/.test(tap) && !/tap\.spectrum/.test(tap), 'band levels never read the spectrum node');
});

ok('wired: App starts and stops the driver; STIMULI mounts the strip under the METER; the strip only reads', () => {
  const app = src('../App.jsx');
  assert.ok(/const stopSpectrum = startSpectrum\(getAudioMeterTap\)/.test(app) && /stopSpectrum\(\)/.test(app));
  const panel = src('../panels/StimulusPanel.jsx');
  assert.ok(/<MeterHero \/>[\s\S]*?<MotionMeter \/>[\s\S]*?<SpectrumStrip \/>/.test(panel), 'under the METER, below the MOTION strip (#1469 takes the beside-the-METER slot)');
  const strip = src('../panels/stimulus/SpectrumStrip.jsx');
  assert.ok(/readSpectrum\(\)/.test(strip) && !/stepSpectrum|emit\(|useStore/.test(strip), 'read only');
  const live = src('./spectrumLive.mjs');
  assert.ok(!/readSourceFeed/.test(live), 'the spectrum peeks; it never asks the set');
});

console.log(`spectrumLive.selfcheck: ${n} checks passed`);
