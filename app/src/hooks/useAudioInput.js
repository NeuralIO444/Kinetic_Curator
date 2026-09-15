// useAudioInput — audio analysis with a stable graph lifecycle.
//
// The analysis loop and the caller's callbacks live in refs, so the effect that
// builds the AudioContext depends only on things that genuinely require a new
// graph (enabled / source / monitor). Previously the loop was a useCallback in
// the dependency array, so any change to a callback tore down and rebuilt the
// mic connection mid-performance.

import { useRef, useEffect } from 'react';

export function useAudioInput({ enabled, source, gain, monitor, onStimulus, onBands, onBeat }) {
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const audioElRef = useRef(null);
  const gainNodeRef = useRef(null);
  const rafRef = useRef(null);
  const runningRef = useRef(false);
  const prevRmsRef = useRef(0);

  const cbRef = useRef({ onStimulus, onBands, onBeat });
  const gainRef = useRef(gain);
  useEffect(() => { cbRef.current = { onStimulus, onBands, onBeat }; });
  useEffect(() => { gainRef.current = gain; }, [gain]);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

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
      cb.onStimulus?.(rms);
      cb.onBands?.({ bass, mid, treble, rms });

      // Beat detection: sharp rms spike
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
          if (cancelled) { audio.pause(); return; }
        } else {
          const constraints = { audio: source.id === 'default' ? true : { deviceId: { exact: source.id } } };
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
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

        rafRef.current = requestAnimationFrame(analyze);
      } catch (err) {
        console.warn('[useAudioInput] mic/audio access denied:', err?.message ?? err);
      }
    })();

    return () => {
      cancelled = true;
      runningRef.current = false;
      prevRmsRef.current = 0;

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
