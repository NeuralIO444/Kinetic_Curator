// audioSidecar.selfcheck.mjs — #618 FILE source + kc-audio-envelope/1 sidecar.
//
//  A. parseAudioEnvelope: good / legacy / schema drift; every malformed input
//     resolves to env null with a reason — never a throw, never an invented value.
//  B. envelopeTick is pure and deterministic (same file → same visuals twice),
//     counts beats across ticks, and never drops one across a loop.
//  C. the node loader and the browser parser agree (one parser, two readers).
//  D. store: a sidecar belongs to ONE file; a new source drops it; a refused
//     pick records why.
//  E. the SOURCE status says, per state, what is driving reactivity and what
//     is not — including "no sidecar" and "sidecar ignored".
//  F. wiring: the live hook reads the sidecar for a FILE source only, zeroes
//     the band routes (the sidecar has no bands), and falls back to live
//     analysis + its own beat detector otherwise.
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAudioEnvelope, envelopeTick, sampleEnvelope, AUDIO_SCHEMA } from './audioEnvelopeCore.mjs';
import * as nodeLoader from './audioEnvelope.mjs';
import { sourceStatus, sidecarReason, clock } from './sourceStatus.mjs';
import { useStore } from '../state/store.js';

const good = () => ({
  schema: AUDIO_SCHEMA, source: 'x.wav', sr: 22050, hop_length: 512, fps: 10, duration: 4, tempo_bpm: 120,
  frames: Array.from({ length: 41 }, (_, i) => ({ t: i / 10, rms: Math.min(1, i / 40), flux: 0.2, beat_phase: (i % 5) / 5 })),
  beats: [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5], downbeats: [],
});

// ── A ────────────────────────────────────────────────────────────────────
{
  const r = parseAudioEnvelope(good());
  assert.ok(r.env && r.problem === null && r.note === null);
  assert.strictEqual(r.env.samples.length, 41);
  assert.strictEqual(r.env.beats.length, 7);
  assert.strictEqual(r.env.tempoBpm, 120);
  const drift = parseAudioEnvelope({ ...good(), schema: 'kc-audio-envelope/2' });
  assert.ok(drift.env && /kc-audio-envelope\/2/.test(drift.note), 'schema drift still reads, with a note');
  const legacy = parseAudioEnvelope([{ t: 0, rms: 0.5, beat: 1 }, { t: 0.1, rms: 0.7, beat: 0 }]);
  assert.ok(legacy.env && legacy.env.samples.length === 2, 'the legacy sketch still reads');
  // hostile values are clamped, bad frames dropped, order fixed
  const hostile = parseAudioEnvelope({ frames: [{ t: 1, rms: 9, flux: -3 }, { t: 'x', rms: 1 }, null, { t: -1, rms: 1 }, { t: 0, rms: NaN }], beats: [2, 'a', -1, 1] });
  assert.ok(hostile.env);
  assert.deepStrictEqual(hostile.env.samples.map((s) => s.t), [0, 1], 'bad frames dropped, sorted');
  assert.deepStrictEqual(hostile.env.samples.map((s) => s.rms), [0, 1], 'rms clamped 0..1, NaN → 0');
  assert.deepStrictEqual(hostile.env.beats, [1, 2], 'beats filtered and sorted');
  // malformed: refused with a reason, never a throw
  for (const bad of [null, undefined, 0, 'x', true, {}, [], { frames: [] }, { frames: 'nope' }, { frames: [null, 'a', {}] }, { envelope: [] }]) {
    let r2;
    assert.doesNotThrow(() => { r2 = parseAudioEnvelope(bad); }, `malformed ${JSON.stringify(bad)} never throws`);
    assert.strictEqual(r2.env, null, `malformed ${JSON.stringify(bad)} is refused`);
    assert.ok(['no-frames', 'no-usable-frames'].includes(r2.problem));
  }
}

// ── B ────────────────────────────────────────────────────────────────────
{
  const env = parseAudioEnvelope(good()).env;
  // deterministic: replay a fixed playback script twice → identical
  const play = () => {
    const out = []; let prev = null;
    for (let i = 0; i <= 400; i++) { const t = i * 0.01; out.push(envelopeTick(env, t, prev)); prev = t; }
    return out;
  };
  assert.deepStrictEqual(play(), play(), 'same file, same playback → same visuals, twice in a row');
  const run = play();
  assert.strictEqual(run.reduce((n, x) => n + x.beats, 0), 7, 'all 7 beats fire exactly once over one play');
  assert.strictEqual(envelopeTick(env, 0.5, null).beats, 0, 'first tick never fires beats');
  assert.strictEqual(envelopeTick(env, 0.5, 0.49).beats, 1, 'a beat crossed fires');
  assert.strictEqual(envelopeTick(env, 0.5, 0.5).beats, 0, 'and only once');
  assert.ok(Math.abs(envelopeTick(env, 2, null).rms - 0.5) < 1e-9, 'rms follows the envelope at t');
  assert.ok(envelopeTick(env, 1.0, null).rms < envelopeTick(env, 3.0, null).rms, 'and it moves');
  // a loop (time jumps back) drops no beat: end-of-file beats + start-of-file beats
  assert.strictEqual(envelopeTick(env, 0.6, 3.9).beats, 1, 'wrap 3.9 → 0.6 crosses beat 0.5');
  assert.strictEqual(envelopeTick(env, 0.1, 3.4).beats, 1, 'wrap 3.4 → 0.1 crosses beat 3.5');
  assert.strictEqual(envelopeTick(env, 0.1, 3.9).beats, 0, 'wrap with nothing between');
  // garbage time is safe
  for (const t of [NaN, -5, Infinity, undefined]) assert.ok(Number.isFinite(envelopeTick(env, t, null).rms), `t=${t}`);
  // no beats list → no beats
  assert.strictEqual(envelopeTick({ ...env, beats: [] }, 2, 1).beats, 0);
  assert.ok(sampleEnvelope(env, 1).rms >= 0);
}

// ── C ────────────────────────────────────────────────────────────────────
{
  const dir = mkdtempSync(join(tmpdir(), 'kc-sidecar-'));
  const p = join(dir, 'good.audio.json');
  writeFileSync(p, JSON.stringify(good()));
  assert.deepStrictEqual(nodeLoader.loadAudioEnvelope(p), parseAudioEnvelope(good()).env, 'node loader = browser parser');
  assert.strictEqual(nodeLoader.sampleEnvelope, sampleEnvelope, 'one sampler');
  const badPath = join(dir, 'bad.json');
  writeFileSync(badPath, '{"frames": []}');
  const errWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = () => true; // the loader warns on stderr by contract
  try {
    assert.strictEqual(nodeLoader.loadAudioEnvelope(badPath), null, 'malformed file → null (a real no-op)');
    assert.strictEqual(nodeLoader.loadAudioEnvelope(join(dir, 'missing.json')), null, 'missing file → null');
  } finally { process.stderr.write = errWrite; }
}

// ── D ────────────────────────────────────────────────────────────────────
{
  const S = () => useStore.getState();
  S().setAudioSource({ type: 'file', url: 'blob:x', name: 'a.wav' });
  assert.strictEqual(S().audioSidecar, null);
  const env = parseAudioEnvelope(good()).env;
  S().setAudioSidecar({ name: 'a.audio.json', env });
  assert.strictEqual(S().audioSidecar.name, 'a.audio.json');
  assert.strictEqual(S().audioSidecarNote, '');
  S().setAudioSource({ type: 'file', url: 'blob:y', name: 'b.wav' });
  assert.strictEqual(S().audioSidecar, null, 'a different file drops the old sidecar');
  S().setAudioSidecar(null, sidecarReason('no-frames'));
  assert.strictEqual(S().audioSidecarNote, 'no frames[] in it', 'a refused pick records why');
  S().setAudioSidecar({ name: 'a.audio.json', env });
  assert.strictEqual(S().audioSidecarNote, '', 'a good pick clears the note');
  S().setAudioSource({ type: 'device', id: 'default' });
  assert.strictEqual(S().audioSidecar, null, 'going back to the mic drops it');
}

// ── E ────────────────────────────────────────────────────────────────────
{
  const env = parseAudioEnvelope(good()).env;
  assert.strictEqual(sourceStatus({ type: 'device' }, null).tag, 'MIC');
  const noSide = sourceStatus({ type: 'file', name: 'a.wav' }, null, '');
  assert.strictEqual(noSide.tag, 'FILE');
  assert.match(noSide.line, /no sidecar — live analysis/);
  const ignored = sourceStatus({ type: 'file' }, null, 'no frames[] in it');
  assert.match(ignored.line, /sidecar ignored: no frames\[\] in it — live analysis/);
  const withSide = sourceStatus({ type: 'file' }, { name: 'a.audio.json', env }, '');
  assert.strictEqual(withSide.tag, 'FILE+ENV');
  assert.match(withSide.line, /SIDECAR a\.audio\.json · 41 frames · 0:04/);
  assert.match(withSide.driving, /Bass \/ mid \/ treble routes are idle/, 'says what the sidecar does NOT drive');
  assert.match(noSide.driving, /not repeatable/, 'and that live analysis is not repeatable');
  assert.strictEqual(clock(242), '4:02');
  assert.strictEqual(sidecarReason('weird'), 'unreadable');
}

// ── F ────────────────────────────────────────────────────────────────────
{
  const hook = readFileSync(new URL('../hooks/useAudioInput.js', import.meta.url), 'utf8');
  assert.ok(/source\.type === 'file'/.test(hook) && /envelopeTick\(env, el\.currentTime, envPrevTRef\.current\)/.test(hook), 'the sidecar drives a FILE source only, from playback time');
  assert.ok(/rms = tick\.rms; bass = 0; mid = 0; treble = 0;/.test(hook), 'band routes zero: the sidecar has no bands');
  assert.ok(/envBeat != null \? envBeat : rms - prevRmsRef\.current > 0\.15/.test(hook), 'beats from the sidecar, else the live spike detector');
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.ok(/sidecar: state\.audioSidecar\?\.env \?\? null/.test(app), 'App hands the sidecar to the hook');
  const ctl = readFileSync(new URL('../panels/stimulus/SourceControls.jsx', import.meta.url), 'utf8');
  assert.ok(/parseAudioEnvelope\(raw\)/.test(ctl) && /set\(null, sidecarReason/.test(ctl), 'a malformed pick is refused with a reason');
  assert.ok(/not-json/.test(ctl), 'invalid JSON is refused too');
}
console.log('audioSidecar.selfcheck: OK');
