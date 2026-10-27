import { useEffect } from 'react';
import { useStore } from '../state/store.js';
import { Events, on } from '../composition/eventBus.js';
import { createRollGuard } from '../fx/rollGuard.js';
import { loisActivity } from '../curator/loisActivity.js';

// #1107 — binds fx/rollGuard.js to the running app. After a roll (KIN, CURATOR, the cold-open roll) it waits for
// the new frame to bake and present, reads a 96-px copy of it, and silently deals again if it is dead.
const SETTLE_MS = 450;
const CAPTURE = { width: 96, height: 67 };
const REDEAL = {
  chaos: (s) => s.kineticRoll(),
  rules: (s) => s.kineticRulesPass(),
  weather: (s) => s.kineticWeatherPass(),
  curate: (s) => s.curateUnlocked(),
};
const snap = () => { const s = useStore.getState(); return { seed: s.seed, paletteId: s.paletteId, layoutParams: s.layoutParams, layers: s.layers, undo: s.historyUndoStack }; };
const same = (a, b) => a.seed === b.seed && a.paletteId === b.paletteId && a.layoutParams === b.layoutParams && a.layers === b.layers && a.undo === b.undo;

export function useRollGuard(loopRef) {
  useEffect(() => {
    const guard = createRollGuard({
      settle: async () => {
        const loop = loopRef?.current;
        try { await loop?.waitForReady?.(5000); } catch { /* a frame that never got ready is judged as it stands */ }
        await new Promise((r) => setTimeout(r, SETTLE_MS));
      },
      capture: async () => {
        const loop = loopRef?.current;
        if (!loop?.captureFrame) return null;
        const f = await loop.captureFrame(CAPTURE);
        return f && f.pixels ? { pixels: f.pixels } : null;
      },
      unchanged: (before) => same(before, snap()),
      redeal: (kind) => {
        // the MACHINE re-deals, not the artist: the honest feed must not read the new seed, the undo or the roll as theirs
        loisActivity.machine(() => {
          const s = useStore.getState();
          if (s.historyUndoStack?.length) s.undo(); // the dead roll leaves; the new one takes its single undo slot
          (REDEAL[kind] || REDEAL.chaos)(useStore.getState());
        });
        return snap();
      },
    });
    const off = on(Events.ROLL_GUARD, ({ kind } = {}) => { guard.check(kind || 'chaos', snap()); });
    return () => { off?.(); guard.cancel(); };
  }, [loopRef]);
}
