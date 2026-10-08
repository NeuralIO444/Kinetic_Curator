import { useEffect, useMemo, useRef } from 'react';
import { sigilGeometry, drawSigil, sigilTempo, SIGIL_SIZE } from '../curator/davisSigil.js';

// Davis's face (#1126). Drawn once per seed; turns with CSS at the tempo of his state; still with no state or when
// the person asked for less motion (DS rule 7: the state is readable from the label with the motion off).
export function DavisSigil({ seed, code }) {
  const ref = useRef(null);
  const geom = useMemo(() => sigilGeometry(seed), [seed]);
  useEffect(() => {
    const cv = ref.current;
    const cx = cv && cv.getContext && cv.getContext('2d');
    if (!cx) return;
    const rgb = getComputedStyle(cv).getPropertyValue('--kc-davis-rgb').trim() || '255,205,130';
    drawSigil(cx, geom, rgb);
  }, [geom]);
  const tempo = sigilTempo(code);
  return (
    <canvas ref={ref} className={`davis-sigil${tempo ? ' turning' : ''}`} width={SIGIL_SIZE} height={SIGIL_SIZE}
      style={tempo ? { animationDuration: `${tempo}s` } : undefined} role="img"
      aria-label={code ? `Davis, ${code}` : 'Davis, resting'} data-state={code || 'none'} />
  );
}
