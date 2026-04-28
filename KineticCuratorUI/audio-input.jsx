// AudioInput.jsx — Browser-based audio stimulus via Web Audio API
// Provides beat detection, frequency analysis, and RMS energy

const { useEffect: useEffectAI, useRef: useRefAI, useState: useStateAI } = React;

function AudioInput({ enabled, onStimulus, onBeatDetect, onFrequencyData }) {
  const audioCtxRef = useRefAI(null);
  const analyserRef = useRefAI(null);
  const micStreamRef = useRefAI(null);
  const animIdRef = useRefAI(null);
  
  const [isActive, setIsActive] = useStateAI(false);
  const [error, setError] = useStateAI(null);
  
  const prevEnergyRef = useRefAI(0);
  const beatCooldownRef = useRefAI(0);

  // Request microphone access and initialize audio analysis
  useEffectAI(() => {
    if (!enabled) return;

    const initAudio = async () => {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = audioCtx;

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        micStreamRef.current = stream;

        const source = audioCtx.createMediaStreamAudioSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyserRef.current = analyser;

        source.connect(analyser);

        setIsActive(true);
        setError(null);

        // Start the analysis loop
        analyzeAudio();
      } catch (err) {
        setError(err.message);
        console.error('Audio input failed:', err);
      }
    };

    initAudio();

    return () => {
      // Cleanup
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (animIdRef.current) {
        cancelAnimationFrame(animIdRef.current);
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, [enabled]);

  const analyzeAudio = () => {
    if (!analyserRef.current || !isActive) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    // Analyze frequency bands
    const bassEnd = Math.floor(bufferLength * (200 / 22050)); // ~200 Hz
    const midEnd = Math.floor(bufferLength * (2000 / 22050)); // ~2 kHz
    
    let bass = 0, mid = 0, treble = 0;
    for (let i = 0; i < bassEnd; i++) {
      bass += dataArray[i];
    }
    for (let i = bassEnd; i < midEnd; i++) {
      mid += dataArray[i];
    }
    for (let i = midEnd; i < bufferLength; i++) {
      treble += dataArray[i];
    }

    bass /= bassEnd;
    mid /= (midEnd - bassEnd);
    treble /= (bufferLength - midEnd);

    // Detect beat onset (bass spike)
    let beatStrength = 0;
    if (bass > prevEnergyRef.current + 50 && beatCooldownRef.current <= 0) {
      beatStrength = Math.min(1, (bass - prevEnergyRef.current) / 100);
      beatCooldownRef.current = 10;
      if (onBeatDetect) onBeatDetect(beatStrength);
    }

    prevEnergyRef.current = prevEnergyRef.current * 0.95 + bass * 0.05;
    beatCooldownRef.current--;

    // Compute overall stimulus (RMS energy)
    let rms = 0;
    for (let i = 0; i < dataArray.length; i++) {
      rms += (dataArray[i] / 255) ** 2;
    }
    rms = Math.sqrt(rms / dataArray.length);

    // Stimulus = blend of beat strength and overall energy
    const stimulus = beatStrength * 0.6 + rms * 0.4;

    if (onStimulus) onStimulus(stimulus);
    if (onFrequencyData) {
      onFrequencyData({ bass, mid, treble, rms });
    }

    animIdRef.current = requestAnimationFrame(analyzeAudio);
  };

  return (
    <div style={{ fontSize: '0.85rem', color: '#888', padding: '4px 0' }}>
      {enabled && (
        <>
          {isActive && (
            <span style={{ color: '#00ff00' }}>🎙️ Audio input active</span>
          )}
          {error && (
            <span style={{ color: '#ff3300' }}>⚠ {error}</span>
          )}
          {!isActive && !error && (
            <span>Requesting microphone access...</span>
          )}
        </>
      )}
    </div>
  );
}
