// useAudioInput — audio analysis hook with proper rAF lifecycle
// Fixes B7: guards requestAnimationFrame with runningRef check BEFORE scheduling

import { useRef, useEffect, useCallback } from 'react';

export function useAudioInput({ enabled, source, gain, monitor, onStimulus, onBands, onBeat }) {
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const audioElRef = useRef(null);
  const gainNodeRef = useRef(null);
  const rafRef = useRef(null);
  const runningRef = useRef(false);
  const prevRmsRef = useRef(0);

  const analyze = useCallback(() => {
    if (!runningRef.current) return; // guard BEFORE scheduling next frame

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

    onStimulus?.(rms);
    onBands?.({ bass, mid, treble, rms });

    // Beat detection: sharp rms spike
    const delta = rms - prevRmsRef.current;
    if (delta > 0.15) onBeat?.();
    prevRmsRef.current = rms;

    // Schedule next ONLY if still running
    if (runningRef.current) {
      rafRef.current = requestAnimationFrame(analyze);
    }
  }, [onStimulus, onBands, onBeat]);

  useEffect(() => {
    if (!enabled) {
      runningRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current.src = '';
      }
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const ctx = new window.AudioContext();
        let srcNode;
        let stream = null;

        if (source.type === 'file') {
          const audio = new Audio();
          audio.src = source.url;
          audio.loop = true;
          audio.crossOrigin = 'anonymous';
          await audio.play();
          if (cancelled) { audio.pause(); return; }
          srcNode = ctx.createMediaElementSource(audio);
          audioElRef.current = audio;
        } else {
          // Device
          const constraints = { audio: source.id === 'default' ? true : { deviceId: { exact: source.id } } };
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
          srcNode = ctx.createMediaStreamSource(stream);
        }

        const gainNode = ctx.createGain();
        gainNode.gain.value = gain;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;

        srcNode.connect(gainNode);
        gainNode.connect(analyser);
        if (monitor) {
          gainNode.connect(ctx.destination);
        }

        ctxRef.current = ctx;
        sourceRef.current = { node: srcNode, stream };
        gainNodeRef.current = gainNode;
        analyserRef.current = analyser;
        runningRef.current = true;

        rafRef.current = requestAnimationFrame(analyze);
      } catch (err) {
        console.warn('[useAudioInput] mic/audio access denied:', err.message);
      }
    })();

    return () => {
      cancelled = true;
      runningRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current.src = '';
      }
      if (sourceRef.current?.stream) {
        sourceRef.current.stream.getTracks().forEach(t => t.stop());
      }
      sourceRef.current?.node.disconnect();
      gainNodeRef.current?.disconnect();
      ctxRef.current?.close();
    };
  }, [enabled, source.id, source.url, source.type, monitor, analyze]); // Do NOT include `gain` in dependency array so it doesn't re-init the whole graph on slider drag!

  // Update gain dynamically without tearing down the audio graph
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = gain;
    }
  }, [gain]);
}
