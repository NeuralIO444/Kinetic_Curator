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
    let favCount = (useStore.getState().favorites || []).length;
    const draw = () => {
      const feed = loisActivity.snapshot();
      setFace(session.face({ ...feed, vibeMs: LOIS_VIBE_DWELL_MS }));
    };
    const unsubs = [
      on(Events.LAYOUT_CURATE, () => { session.noteCurate(); draw(); }),
      on(Events.DAVIS_FAVORITE, (p) => {
        // 'add' commits straight to the store (see below) — the bus only
        // carries recall/morph/reorder here.
        if (p?.action === 'recall') session.noteRecall();
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
      // F and the star dispatch ADD_FAVORITE straight to the store, bypassing
      // the DAVIS_FAVORITE bus — a growing favorites list is the honest keep
      // signal (#1001: NOD on F or the star).
      const n = (st.favorites || []).length;
      if (n > favCount) {
        session.noteKeep();
        draw();
      }
      favCount = n;
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
      <span className="lois-face">{face.face}</span>
      <span className="lois-word">LOIS</span>
      <span className="lois-dot">·</span>
      <span className="lois-code">{face.code}</span>
    </div>
  );
}
