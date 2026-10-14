// Fixed kaomoji left of LIVE. Face, code, and color only. #948, #1126.
// It draws what the honest feed says (curator/loisActivity.js) and decides nothing itself: the feed owns every
// signal, resolveLoisFace owns the priority, and this only polls and paints.
import { useEffect, useState } from 'react';
import { Events, on } from '../composition/eventBus.js';
import { useStore } from '../state/store.js';
import { loisActivity } from '../curator/loisActivity.js';
import { resolveLoisFace, LOIS_FACES } from '../curator/loisFace.js';
import { loisLook } from '../curator/mindFace.js';
import { useMindFaces, blendStyles } from '../hooks/useMindFaces.js';

export function LoisPill() {
  const [face, setFace] = useState(LOIS_FACES.VIBE);
  // #1462 — a mind request blends a state over the honest face, holds, and eases back (curator/mindFace.js)
  const { lois: mind, barS } = useMindFaces();

  useEffect(() => {
    const draw = () => setFace(resolveLoisFace(loisActivity.snapshot()));
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

  const look = mind && mind.id ? loisLook(mind.id) : null;
  const st = blendStyles(mind, barS);
  const code = look && mind.weight >= 0.5 ? look.code : face.code;
  return (
    <div className="lois-pill" data-tone={face.tone} data-code={face.code} data-mind={look ? look.code : undefined}
      title={`LOIS · ${code} — ${(mind && mind.line) || (look && mind.weight >= 0.5 ? look.label : '') || face.label}`}>
      <span className="lois-face mind-blend">
        <span className="mind-honest" style={st.honest}>{face.face}</span>
        {look && <span className="mind-over" aria-hidden="true" style={st.mind}>{look.face}</span>}
      </span>
      <span className="lois-word">LOIS</span>
      <span className="lois-dot">·</span>
      <span className="lois-code">{code}</span>
    </div>
  );
}
