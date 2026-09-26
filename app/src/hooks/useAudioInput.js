// useAudioInput — audio analysis with a stable graph lifecycle.
//
// The analysis loop and the caller's callbacks live in refs, so the effect that
// builds the AudioContext depends only on things that genuinely require a new
// graph (enabled / source / monitor). Previously the loop was a useCallback in
// the dependency array, so any change to a callback tore down and rebuilt the
// mic connection mid-performance.

import { useRef, useEffect } from 'react';
import {
  createBallisticsState,
  resetBallistics,
  processBallistics,
  sanitizeBallistics,
} from '../gl/audioBallistics.mjs';

// #306: audio ballistics — the raw analyser output is shaped through an
// envelope follower (attack/release) + response curve before it reaches any
// reactivity consumer (scale/alpha/glow, ACCUM envelope). Beat detection
// stays on the RAW rms so the clock keeps its snap; everything the eye sees
// goes through the shaped envelope. Silence decays to exact zeros, so the
// no-op contracts downstream are preserved.

export function useAudioInput({ enabled, source, gain, monitor, ballistics, onStimulus, onBands, onBeat, onDenied }) {
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const audioElRef = useRef(null);
  const gainNodeRef = useRef(null);
  const rafRef = useRef(null);
  const runningRef = useRef(false);
  const prevRmsRef = useRef(0);
  // #306: one follower per audio session — created once, reset on every
  // graph start so the envelope never resumes from a stale session.
  const followerRef = useRef(createBallisticsState());
  const lastTsRef = useRef(0);

  const cbRef = useRef({ onStimulus, onBands, onBeat, onDenied });
  const gainRef = useRef(gain);
  useEffect(() => { cbRef.current = { onStimulus, onBands, onBeat, onDenied }; });
  useEffect(() => { gainRef.current = gain; }, [gain]);
  const ballisticsRef = useRef(ballistics);
  useEffect(() => { ballisticsRef.current = ballistics; }, [ballistics]);
  // Set in the catch block below, cleared on a successful start. Guards the
  // early-return clear just below: the denial handler itself flips `enabled`
  // back to false (SET_AUDIO_ENABLED false), which would otherwise re-run
  // this effect and immediately clear the denial notice it just raised.
  const deniedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      // Clears a stale denial notice when audio is manually turned off —
      // but not when this shutdown IS the denial (see deniedRef above).
      if (!deniedRef.current) cbRef.current.onDenied?.(false);
      return undefined;
    }

    let cancelled = false;
    // #306: the envelope follower lives for the whole effect; copying the
    // ref once keeps the cleanup honest (react-hooks/exhaustive-deps).
    const follower = followerRef.current;

    const analyze = () => {
      if (!runningRef.current) return;
      const analyser = analyserRef.current;
      if (!analyser) return;

      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);

      const len = data.length;
      const bassEnd = Math.floor(len * 0.15);
      const midEnd = Math.floor(len * 0.5);

      let bassSum = 0, midSum = 0, trebleSum = 0, total = 0;
      for (let i = 0; i < len; i++) {
        const v = data[i] / 255;
        total += v;
        if (i < bassEnd) bassSum += v;
        else if (i < midEnd) midSum += v;
        else trebleSum += v;
      }

      const rms = total / len;
      const bass = bassEnd > 0 ? bassSum / bassEnd : 0;
      const mid = (midEnd - bassEnd) > 0 ? midSum / (midEnd - bassEnd) : 0;
      const treble = (len - midEnd) > 0 ? trebleSum / (len - midEnd) : 0;

      const cb = cbRef.current;
      // #306: shape the envelope before anything downstream sees it. The
      // follower state lives across rAF ticks; dt comes from wall clock.
      // #503: this is stage 1 of a deliberate two-stage pipeline — the GL
      // loop (liveLoop.mjs) re-shapes these store bands with defaults for
      // dt-correct smoothing. Pinned by audioPipeline.selfcheck.mjs.
      const now = performance.now();
      const dtMs = lastTsRef.current > 0 ? now - lastTsRef.current : 16.7;
      lastTsRef.current = now;
      const shaped = processBallistics(
        follower,
        { bass, mid, treble, rms },
        dtMs,
        sanitizeBallistics(ballisticsRef.current)
      );
      cb.onStimulus?.(shaped.rms);
      cb.onBands?.(shaped);

      // Beat detection: sharp rms spike — on the RAW rms, so the clock
      // keeps its snap regardless of the follower's attack setting.
      if (rms - prevRmsRef.current > 0.15) cb.onBeat?.();
      prevRmsRef.current = rms;

      if (runningRef.current) rafRef.current = requestAnimationFrame(analyze);
    };

    (async () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        // Browsers start contexts suspended unless created inside a gesture.
        if (ctx.state === 'suspended') await ctx.resume();

        let srcNode;
        let stream = null;

        if (source.type === 'file') {
          const audio = new Audio();
          audio.src = source.url;
          audio.loop = true;
          audio.crossOrigin = 'anonymous';
          srcNode = ctx.createMediaElementSource(audio);
          audioElRef.current = audio;
          await audio.play();
          if (cancelled) { audio.pause(); ctx.close().catch(() => {}); return; }
        } else {
          const constraints = { audio: source.id === 'default' ? true : { deviceId: { exact: source.id } } };
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (cancelled) { stream.getTracks().forEach(t => t.stop()); ctx.close().catch(() => {}); return; }
          srcNode = ctx.createMediaStreamSource(stream);
        }

        const gainNode = ctx.createGain();
        gainNode.gain.value = gainRef.current;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;

        srcNode.connect(gainNode);
        gainNode.connect(analyser);
        // A file source routed only into the analyser is silent. Always monitor
        // file playback; a live mic is monitored on request (feedback risk).
        if (monitor || source.type === 'file') gainNode.connect(ctx.destination);

        ctxRef.current = ctx;
        sourceRef.current = { node: srcNode, stream };
        gainNodeRef.current = gainNode;
        analyserRef.current = analyser;
        runningRef.current = true;
        // #306: fresh session, fresh envelope — never resume from stale values.
        resetBallistics(follower);
        lastTsRef.current = 0;

        deniedRef.current = false;
        cbRef.current.onDenied?.(false);
        rafRef.current = requestAnimationFrame(analyze);
      } catch (err) {
        console.warn('[useAudioInput] mic/audio access denied:', err?.message ?? err);
        deniedRef.current = true;
        cbRef.current.onDenied?.(true);
      }
    })();

    return () => {
      cancelled = true;
      runningRef.current = false;
      prevRmsRef.current = 0;
      // #306: session over — drop the envelope so a re-enable starts silent.
      resetBallistics(follower);
      lastTsRef.current = 0;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current.removeAttribute('src');
        audioElRef.current.load();
        audioElRef.current = null;
      }
      if (sourceRef.current?.stream) {
        sourceRef.current.stream.getTracks().forEach(t => t.stop());
      }
      sourceRef.current?.node?.disconnect();
      gainNodeRef.current?.disconnect();
      // Guard against double-close on a re-run.
      if (ctxRef.current && ctxRef.current.state !== 'closed') {
        ctxRef.current.close().catch(() => {});
      }
      sourceRef.current = null;
      gainNodeRef.current = null;
      analyserRef.current = null;
      ctxRef.current = null;
    };
  }, [enabled, source.id, source.url, source.type, monitor]);

  // Retune gain without rebuilding the graph.
  useEffect(() => {
    if (gainNodeRef.current) gainNodeRef.current.gain.value = gain;
  }, [gain]);
}
