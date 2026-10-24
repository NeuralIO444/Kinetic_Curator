// LOIS, lower left of the master bar, left of LIVE. #948, #1126, #1588.
// It draws what the honest feed says (curator/loisActivity.js) and decides nothing itself: the feed owns
// every signal, resolveLoisFace owns the priority, loisTicker.mjs owns the ticker's decisions, and this
// only polls, measures, and paints. #1588: her verdict line rides in the place the kaomoji face held,
// scrolling right to left when it overflows the slot; the face is gone, her state code stays.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Events, on } from '../composition/eventBus.js';
import { useStore } from '../state/store.js';
import { loisActivity } from '../curator/loisActivity.js';
import { resolveLoisFace, LOIS_FACES } from '../curator/loisFace.js';
import { loisLook } from '../curator/mindFace.js';
import { useMindFaces } from '../hooks/useMindFaces.js';
import { tickerLine, tickerMotion, TICKER_DIVIDER } from './loisTicker.mjs';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function LoisPill() {
  const [face, setFace] = useState(LOIS_FACES.VIBE);
  const [line, setLine] = useState('');
  // #1462 — a mind request lends the code its state while it holds sway (curator/mindFace.js)
  const { lois: mind } = useMindFaces();
  // #1588 — reduced motion settles the ticker: read the OS signal, and keep reading it while mounted.
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED_MOTION_QUERY).matches,
  );
  useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia?.(REDUCED_MOTION_QUERY) : null;
    if (!mq?.addEventListener) return undefined;
    const onChange = (e) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const draw = () => { setFace(resolveLoisFace(loisActivity.snapshot())); setLine(tickerLine()); };
    // an event or a store change is worth an immediate repaint; the interval carries the clock-driven AWAY
    const unsubs = [on(Events.LAYOUT_CURATE, draw), on(Events.KINETIC_TAP, draw), on(Events.DAVIS_FAVORITE, draw)];
    const unsubStore = useStore.subscribe(draw);
    const timer = setInterval(draw, 500);
    draw();
    return () => {
      unsubs.forEach((u) => u());
      unsubStore();
      clearInterval(timer);
    };
  }, []);

  // #1588 — measure the TAPE's natural width against the slot's, honestly: a hidden twin of one
  // line+divider unit reports the unit width, the slot reports its own, and the observer re-measures
  // when either moves. The run paints two of those units and travels one per loop (loisTicker.mjs).
  const slotRef = useRef(null);
  const measureRef = useRef(null);
  const [widths, setWidths] = useState({ text: 0, slot: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const text = measureRef.current?.offsetWidth ?? 0;
      const slot = slotRef.current?.clientWidth ?? 0;
      setWidths((w) => (w.text === text && w.slot === slot ? w : { text, slot }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    if (slotRef.current) ro.observe(slotRef.current);
    if (measureRef.current) ro.observe(measureRef.current);
    return () => ro.disconnect();
  }, [line]);

  const motion = tickerMotion({ textWidth: widths.text, slotWidth: widths.slot, reducedMotion });
  const look = mind && mind.id ? loisLook(mind.id) : null;
  const code = look && mind.weight >= 0.5 ? look.code : face.code;
  // One unit of tape: the verdict line and its divider. The second copy is what makes the wrap land on an
  // identical frame (the run travels exactly one unit per loop), and it is aria-hidden — as is the divider,
  // which is decoration — so the line is still said once.
  const unit = (copy) => (
    <span className="lois-ticker-unit" {...(copy ? { 'aria-hidden': 'true' } : {})}>
      {line}
      <span className="lois-ticker-div" aria-hidden="true">{TICKER_DIVIDER}</span>
    </span>
  );
  return (
    <div className="lois-pill" data-tone={face.tone} data-code={face.code} data-mind={look ? look.code : undefined}
      title={`LOIS · ${code} — ${(mind && mind.line) || (look && mind.weight >= 0.5 ? look.label : '') || face.label}`}>
      {line && (
        <span className="lois-ticker" ref={slotRef} data-mode={motion.mode}>
          <span className="lois-ticker-run" key={line}
            style={motion.mode === 'scroll'
              ? { '--tk-from': `${motion.from}px`, '--tk-to': `${motion.to}px`, animationDuration: `${motion.durationS.toFixed(2)}s` }
              : undefined}>
            {unit(false)}
            {unit(true)}
          </span>
          <span className="lois-ticker-measure" ref={measureRef} aria-hidden="true">{unit(false)}</span>
        </span>
      )}
      <span className="lois-word">LOIS</span>
      <span className="lois-dot">·</span>
      <span className="lois-code">{code}</span>
    </div>
  );
}
