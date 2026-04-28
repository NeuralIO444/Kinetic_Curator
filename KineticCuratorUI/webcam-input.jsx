// WebcamInput.jsx — Motion detection via live video feed
// Analyzes brightness changes for stimulus input

const { useEffect: useEffectWC, useRef: useRefWC, useState: useStateWC } = React;

function WebcamInput({ enabled, onMotion, onFrameData }) {
  const videoRef = useRefWC(null);
  const canvasRef = useRefWC(null);
  const animIdRef = useRefWC(null);
  
  const [isActive, setIsActive] = useStateWC(false);
  const [error, setError] = useStateWC(null);

  const runningRef = useRefWC(false);
  const prevFrameRef = useRefWC(null);
  const motionHistoryRef = useRefWC([]);

  // Request webcam access and initialize video analysis
  useEffectWC(() => {
    if (!enabled) return;

    const initWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 320 },
            height: { ideal: 240 },
            facingMode: 'user'
          },
          audio: false
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            runningRef.current = true;
            setIsActive(true);
            setError(null);
            analyzeMotion();
          };
        }
      } catch (err) {
        setError(err.message);
        console.error('Webcam input failed:', err);
      }
    };

    initWebcam();

    return () => {
      runningRef.current = false;
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
      if (animIdRef.current) {
        cancelAnimationFrame(animIdRef.current);
      }
      setIsActive(false);
    };
  }, [enabled]);

  const analyzeMotion = () => {
    if (!runningRef.current || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;

    // Draw current frame to canvas
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Calculate average brightness (0-255)
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r + g + b) / 3;
      totalBrightness += brightness;
    }
    const avgBrightness = totalBrightness / (data.length / 4);

    // Detect motion as brightness change
    let motion = 0;
    if (prevFrameRef.current !== null) {
      motion = Math.abs(avgBrightness - prevFrameRef.current) / 255;
      motion = Math.min(1, motion * 2); // Scale and clamp
    }
    prevFrameRef.current = avgBrightness;

    // Smooth motion history for better stimulus
    motionHistoryRef.current.push(motion);
    if (motionHistoryRef.current.length > 10) {
      motionHistoryRef.current.shift();
    }
    const smoothMotion = motionHistoryRef.current.reduce((a, b) => a + b, 0) / motionHistoryRef.current.length;

    if (onMotion) onMotion(smoothMotion);
    if (onFrameData) {
      onFrameData({ 
        brightness: avgBrightness / 255, 
        motion: smoothMotion,
        frameCount: data.length / 4
      });
    }

    animIdRef.current = requestAnimationFrame(analyzeMotion);
  };

  return (
    <>
      <div style={{ fontSize: '0.85rem', color: '#888', padding: '4px 0' }}>
        {enabled && (
          <>
            {isActive && (
              <span style={{ color: '#00ff00' }}>📹 Webcam active</span>
            )}
            {error && (
              <span style={{ color: '#ff3300' }}>⚠ {error}</span>
            )}
            {!isActive && !error && (
              <span>Requesting webcam access...</span>
            )}
          </>
        )}
      </div>
      {/* Hidden video and canvas elements for processing */}
      <video ref={videoRef} style={{ display: 'none' }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </>
  );
}
