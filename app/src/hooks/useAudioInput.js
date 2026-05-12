// useAudioInput — audio analysis with Tone.js. Tone is dynamically imported
// so it stays out of the initial bundle until audio is toggled on.

import { useRef, useEffect, useCallback } from 'react';

let ToneModule = null;
async function loadTone() {
  if (!ToneModule) ToneModule = await import('tone');
  return ToneModule;
}

// Dispatch throttle — analyze runs at rAF rate, store updates run at 30 Hz.
const DISPATCH_INTERVAL_MS = 33;

export function useAudioInput({ enabled, source, gain, monitor, onStimulus, onBands, onBeat }) {
  const meterRef = useRef(null);
  const fftRef = useRef(null);
  const inputRef = useRef(null);
  const gainNodeRef = useRef(null);
  const rafRef = useRef(null);
  const runningRef = useRef(false);
  const prevRmsRef = useRef(0);
  const lastDispatchRef = useRef(0);
  const toneRef = useRef(null);

  const analyze = useCallback(() => {
    if (!runningRef.current) return;
    const meter = meterRef.current;
    const fft = fftRef.current;
    const Tone = toneRef.current;
    if (!meter || !fft || !Tone) return;

    const now = performance.now();
    const rms = Tone.dbToGain(meter.getValue());
    // Beat detection runs every frame (transients are short) but is cheap.
    const delta = rms - prevRmsRef.current;
    if (delta > 0.15) onBeat?.();
    prevRmsRef.current = rms;

    // Bands/stimulus dispatch is throttled to 30 Hz — these wake store
    // subscribers and we don't want 60 Hz cascades.
    if (now - lastDispatchRef.current >= DISPATCH_INTERVAL_MS) {
      lastDispatchRef.current = now;
      const freqs = fft.getValue();
      const len = freqs.length;
      const bassEnd = Math.floor(len * 0.15);
      const midEnd = Math.floor(len * 0.5);
      let bassSum = 0, midSum = 0, trebleSum = 0;
      for (let i = 0; i < len; i++) {
        const v = Tone.dbToGain(freqs[i]);
        if (i < bassEnd) bassSum += v;
        else if (i < midEnd) midSum += v;
        else trebleSum += v;
      }
      const bass = bassEnd > 0 ? bassSum / bassEnd : 0;
      const mid = (midEnd - bassEnd) > 0 ? midSum / (midEnd - bassEnd) : 0;
      const treble = (len - midEnd) > 0 ? trebleSum / (len - midEnd) : 0;
      onStimulus?.(rms);
      onBands?.({ bass, mid, treble, rms });
    }

    rafRef.current = requestAnimationFrame(analyze);
  }, [onStimulus, onBands, onBeat]);

  useEffect(() => {
    // Clean up any prior session — null refs after dispose so a stale toggle
    // can't double-dispose.
    const teardown = () => {
      runningRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (inputRef.current) { try { inputRef.current.dispose(); } catch { /* idempotent */ } inputRef.current = null; }
      if (gainNodeRef.current) { try { gainNodeRef.current.dispose(); } catch { /* idempotent */ } gainNodeRef.current = null; }
      if (meterRef.current) { try { meterRef.current.dispose(); } catch { /* idempotent */ } meterRef.current = null; }
      if (fftRef.current) { try { fftRef.current.dispose(); } catch { /* idempotent */ } fftRef.current = null; }
    };

    if (!enabled) {
      teardown();
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const Tone = await loadTone();
        if (cancelled) return;
        toneRef.current = Tone;
        await Tone.start();
        if (cancelled) return;

        let input;
        if (source.type === 'device') {
          input = new Tone.UserMedia();
          // Pass the device id if it's a real id (not the sentinel "default").
          const deviceId = source.id && source.id !== 'default' ? source.id : undefined;
          await input.open(deviceId);
        } else if (source.type === 'file') {
          input = new Tone.Player(source.url);
          input.loop = true;
          await input.start();
        } else {
          return;
        }
        // Re-check cancellation immediately before wiring refs so a rapid
        // disable→enable doesn't leave the *first* attempt running.
        if (cancelled) { try { input.dispose(); } catch { /* ignore */ } return; }

        const gainNode = new Tone.Gain(gain);
        const meter = new Tone.Meter();
        const fft = new Tone.FFT(256);

        input.connect(gainNode);
        gainNode.connect(meter);
        gainNode.connect(fft);
        if (monitor) gainNode.connect(Tone.Destination);

        if (cancelled) {
          try { input.dispose(); gainNode.dispose(); meter.dispose(); fft.dispose(); } catch { /* ignore */ }
          return;
        }

        inputRef.current = input;
        gainNodeRef.current = gainNode;
        meterRef.current = meter;
        fftRef.current = fft;

        runningRef.current = true;
        rafRef.current = requestAnimationFrame(analyze);
      } catch (err) {
        console.warn('[useAudioInput] audio access error:', err.message);
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [enabled, source, monitor, analyze]);

  // Gain slider: update the actual Tone.Gain node in the chain. (Previously
  // we wrote to `input.volume.value` which is a separate dB parameter and
  // doesn't affect what the Meter / FFT see.)
  useEffect(() => {
    const node = gainNodeRef.current;
    if (!node) return;
    try {
      node.gain.rampTo(gain, 0.05);
    } catch {
      try { node.gain.value = gain; } catch { /* ignore */ }
    }
  }, [gain]);

  return {};
}
