// Fixed kaomoji left of LIVE. Face, code, and color only. #948.
import { useEffect, useState } from 'react';
import { Events, on } from '../composition/eventBus.js';
import { useStore } from '../state/store.js';
import { loisActivity, LOIS_VIBE_DWELL_MS } from '../curator/loisActivity.js';
import { createLoisFaceSession, LOIS_FACES } from '../curator/loisFace.js';

export function LoisPill() {
  const [face, setFace] = useState(LOIS_FACES.AWAY);

  useEffect(() => {
    const session = createLoisFaceSession();
    let palette = useStore.getState().paletteId;
    const draw = () => {
      const feed = loisActivity.snapshot();
      setFace(session.face({ ...feed, vibeMs: LOIS_VIBE_DWELL_MS }));
    };
    const unsubs = [
      on(Events.LAYOUT_CURATE, () => { session.noteCurate(); draw(); }),
      on(Events.DAVIS_FAVORITE, (p) => {
        if (p?.action === 'add') session.noteKeep();
        else if (p?.action === 'recall') session.noteRecall();
        else session.noteBrowse();
        draw();
      }),
    ];
    const unsubStore = useStore.subscribe((st) => {
      if (st.paletteId !== palette) {
        palette = st.paletteId;
        session.noteBrowse();
        draw();
      }
    });
    const timer = setInterval(draw, 500);
    draw();
    return () => {
      unsubs.forEach((u) => u());
      unsubStore();
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="lois-pill" data-tone={face.tone} data-code={face.code} title={`LOIS · ${face.code} — ${face.label}`}>
      <span className="lois-face">[{face.face}]</span>
      <span className="lois-word">LOIS</span>
      <span className="lois-dot">·</span>
      <span className="lois-code">{face.code}</span>
    </div>
  );
}
