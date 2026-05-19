import { useEffect, useRef } from 'react';

export function WaveformMeter({ audioBands, beatPulse }) {
  const canvasRef = useRef(null);
  const historyRef = useRef(Array.from({ length: 100 }, () => ({ bass: 0, mid: 0, treble: 0, rms: 0 })));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Push new data and shift
    historyRef.current.push(audioBands);
    historyRef.current.shift();
    
    const hist = historyRef.current;
    const w = canvas.width;
    const h = canvas.height;
    
    // Clear
    ctx.clearRect(0, 0, w, h);
    
    const drawLine = (key, color, scale, offset = 0) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < hist.length; i++) {
        const val = hist[i][key] || 0;
        const x = (i / (hist.length - 1)) * w;
        const y = h - (val * scale * h) - offset;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    // Draw grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h/2); ctx.lineTo(w, h/2);
    ctx.stroke();

    // Draw bands
    drawLine('bass', '#ff2d6f', 1.0);
    drawLine('mid', '#ffd400', 1.0);
    drawLine('treble', '#00d9ff', 1.0);
    
    // Draw RMS fill
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0, 255, 136, 0.1)';
    ctx.moveTo(0, h);
    for (let i = 0; i < hist.length; i++) {
      const x = (i / (hist.length - 1)) * w;
      const y = h - ((hist[i].rms || 0) * h);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.fill();

  }, [audioBands]);

  return (
    <div className={`waveform-wrap ${beatPulse > 0.5 ? 'beat-flash' : ''}`} style={{
      width: '100%', height: '60px', border: '1px solid var(--line-2)', position: 'relative', overflow: 'hidden', background: '#0a0a0a', transition: 'box-shadow 0.1s'
    }}>
      <canvas ref={canvasRef} width={300} height={60} style={{ width: '100%', height: '100%' }} />
      <div style={{ position: 'absolute', top: 4, left: 4, display: 'flex', gap: '8px', fontSize: '9px', letterSpacing: '0.1em' }}>
        <span style={{ color: '#ff2d6f' }}>BASS</span>
        <span style={{ color: '#ffd400' }}>MID</span>
        <span style={{ color: '#00d9ff' }}>TREBLE</span>
        <span style={{ color: '#00ff88' }}>RMS</span>
      </div>
    </div>
  );
}
