import { useEffect, useMemo, useRef } from 'react';
import { sigilGeometry, drawSigil, sigilTempo, SIGIL_SIZE } from '../curator/davisSigil.js';

// Drawn at this many real pixels per art pixel: at least 3x, more on a sharper screen (capped), so the 112 px face is
// crisp on a retina display and an iPad instead of a 96 px bitmap stretched.
const pixelScale = () => Math.min(5, Math.max(3, Math.ceil((typeof window !== 'undefined' && window.devicePixelRatio) || 1) * 2));

// Davis's face (#1126). Drawn once per seed; turns with CSS at the tempo of his state; still with no state or when
// the person asked for less motion (DS rule 7: the state is readable from the label with the motion off).
export function DavisSigil({ seed, code }) {
  const ref = useRef(null);
  const geom = useMemo(() => sigilGeometry(seed), [seed]);
  const px = SIGIL_SIZE * pixelScale();
  useEffect(() => {
    const cv = ref.current;
    const cx = cv && cv.getContext && cv.getContext('2d');
    if (!cx) return;
    const rgb = getComputedStyle(cv).getPropertyValue('--kc-davis-rgb').trim() || '255,205,130';
    drawSigil(cx, geom, rgb, px);
  }, [geom, px]);
  const tempo = sigilTempo(code);
  return (
    <canvas ref={ref} className={`davis-sigil${tempo ? ' turning' : ''}`} width={px} height={px}
      style={tempo ? { animationDuration: `${tempo}s` } : undefined} role="img"
      aria-label={code ? `Davis, ${code}` : 'Davis, resting'} data-state={code || 'none'} />
  );
}
