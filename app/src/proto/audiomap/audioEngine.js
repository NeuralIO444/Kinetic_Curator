// ─────────────────────────────────────────────────────────────
// audioEngine.js — prototype audio front-end for the audio→map demo.
// Mic input OR a synthesized demo source → BASS / MID / TREBLE band
// energies + RMS, with attack/decay ballistics and peak-hold ticks.
// WebAudio only, no dependencies. Not wired to the main app.
// ─────────────────────────────────────────────────────────────

export const BANDS = [
  { id: 'bass', label: 'BASS', f0: 20, f1: 250, color: '#ff2d6f' },
  { id: 'mid', label: 'MID', f0: 250, f1: 2000, color: '#ffd400' },
  { id: 'treble', label: 'TREBLE', f0: 2000, f1: 20000, color: '#00d9ff' },
  { id: 'rms', label: 'RMS', f0: 0, f1: 0, color: '#00ff88' }, // RMS is time-domain
  // colors match the real STIMULI meter strip exactly
];

const FFT_SIZE = 2048;
const HISTORY_MAX = 320;

function dbToUnit(db) {
  // Map analyser dB range onto 0..1. -90dB ≈ silence, -30dB ≈ hot.
  if (!isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db + 90) / 60));
}

export function createAudioEngine() {
  let ctx = null;
  let analyser = null;
  let micStream = null;
  let demoNodes = [];
  let mode = 'idle'; // 'idle' | 'mic' | 'demo'

  let freqData = null;
  let timeData = null;

  const state = {
    mode,
    raw: { bass: 0, mid: 0, treble: 0, rms: 0 },
    val: { bass: 0, mid: 0, treble: 0, rms: 0 }, // ballistics-smoothed 0..1
    peak: { bass: 0, mid: 0, treble: 0, rms: 0 }, // peak-hold ticks
    trims: { bass: 1, mid: 1, treble: 1, rms: 1 },
    history: [], // ring buffer of smoothed {bass,mid,treble,rms}
  };

  function ensureCtx() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0; // we do our own ballistics
    freqData = new Float32Array(analyser.frequencyBinCount);
    timeData = new Float32Array(analyser.fftSize);
    analyser.connect(ctx.destination); // keep graph alive; gain stays modest
    return ctx;
  }

  function teardownSource() {
    for (const n of demoNodes) {
      try { n.stop && n.stop(); } catch { /* already stopped */ }
      try { n.disconnect(); } catch { /* already gone */ }
    }
    demoNodes = [];
    if (micStream) {
      for (const t of micStream.getTracks()) t.stop();
      micStream = null;
    }
  }

  async function startMic() {
    ensureCtx();
    teardownSource();
    await ctx.resume();
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const src = ctx.createMediaStreamSource(micStream);
    const pad = ctx.createGain();
    pad.gain.value = 1.0;
    src.connect(pad);
    pad.connect(analyser);
    demoNodes = [src, pad];
    mode = 'mic';
    state.mode = mode;
  }

  // Demo source: a slow sine sweep (bass→mid) + noise bursts (treble)
  // so the prototype dances with no microphone.
  function startDemo() {
    ensureCtx();
    teardownSource();
    ctx.resume();

    const out = ctx.createGain();
    out.gain.value = 0.6;
    out.connect(analyser);

    // Sweeping bass/mid tone
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 90;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.12; // one sweep every ~8s
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.9;
    osc.connect(oscGain);
    oscGain.connect(out);

    // Noise bursts for treble energy
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 5200;
    bp.Q.value = 0.8;
    const burst = ctx.createGain();
    burst.gain.value = 0;
    // Random-ish bursts via a second LFO + waveshaper-ish gating done manually:
    const burstLfo = ctx.createOscillator();
    burstLfo.type = 'square';
    burstLfo.frequency.value = 0.9;
    const burstDepth = ctx.createGain();
    burstDepth.gain.value = 0.28;
    const burstBase = ctx.createConstantSource();
    burstBase.offset.value = 0.30;
    burstLfo.connect(burstDepth);
    burstDepth.connect(burst.gain);
    burstBase.connect(burst.gain);
    noise.connect(bp);
    bp.connect(burst);
    burst.connect(out);

    for (const n of [osc, lfo, noise, burstLfo, burstBase]) n.start();
    demoNodes = [osc, lfo, lfoGain, oscGain, noise, bp, burst, burstLfo, burstDepth, burstBase, out];
    mode = 'demo';
    state.mode = mode;
  }

  function stop() {
    teardownSource();
    mode = 'idle';
    state.mode = mode;
    state.val = { bass: 0, mid: 0, treble: 0, rms: 0 };
    state.peak = { bass: 0, mid: 0, treble: 0, rms: 0 };
  }

  function bandEnergy(id, f0, f1) {
    const hzPerBin = ctx.sampleRate / FFT_SIZE;
    const b0 = Math.max(1, Math.floor(f0 / hzPerBin));
    const b1 = Math.min(freqData.length - 1, Math.ceil(f1 / hzPerBin));
    let sum = 0;
    let n = 0;
    for (let b = b0; b <= b1; b++) {
      sum += dbToUnit(freqData[b]);
      n++;
    }
    return n ? sum / n : 0;
  }

  // One analysis frame. attack/decay are 0..1 slider positions.
  function tick(attack, decay) {
    if (mode === 'idle' || !analyser) return state;

    analyser.getFloatFrequencyData(freqData);
    analyser.getFloatTimeDomainData(timeData);

    // Fast attack coefficient (near-instant at 1), slow release (lazy at 0).
    const atk = 0.05 + attack * 0.95;
    const dec = 0.002 + (1 - decay) * 0.25; // decay slider UP = longer tail

    const raw = {
      bass: bandEnergy('bass', 20, 250) * state.trims.bass,
      mid: bandEnergy('mid', 250, 2000) * state.trims.mid,
      treble: bandEnergy('treble', 2000, 20000) * state.trims.treble,
      rms: 0,
    };
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i];
    raw.rms = Math.min(1, Math.sqrt(sum / timeData.length) * 3.2) * state.trims.rms;
    state.raw = raw;

    for (const k of ['bass', 'mid', 'treble', 'rms']) {
      const v = state.val[k];
      const r = Math.min(1.5, raw[k]);
      // Ballistics: jump toward loud, drift down toward quiet.
      state.val[k] = r > v ? v + (r - v) * atk : v + (r - v) * dec;
      // Peak-hold: stick at the max, fall slowly.
      state.peak[k] = Math.max(r, state.peak[k] * 0.985);
    }

    state.history.push({ ...state.val });
    if (state.history.length > HISTORY_MAX) state.history.shift();
    return state;
  }

  return { state, BANDS, startMic, startDemo, stop, tick, getMode: () => mode };
}
