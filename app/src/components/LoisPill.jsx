// LoisPill — the LOIS face pill (#1001).
//
// One fixed pill, immediately left of the LIVE pill in the master bar.
// Always the same width; only the face, the three-letter code, and the
// color change. The faces are a state light, not a portrait. CRIT (signal
// red) is PARKED on #954 — never rendered here.
//
// State comes from the existing bus + loisActivity instrumentation (the
// honest feed). This component records nothing new except trigger hold
// windows and the seen-seed set for revisit detection; it writes nothing
// to the store and changes nothing visible except itself.
//
// Ref values are only read inside effects/handlers (react-hooks/refs);
// render reads the derived `code` state.
import { useEffect, useState } from 'react';
import { Events, on } from '../composition/eventBus.js';
import { useStore } from '../state/store.js';
import { loisActivity } from '../curator/loisActivity.js';
import {
  deriveLoisPill,
  loisPillText,
  LOIS_PILL_META,
  LOIS_PILL_NOD_MS,
  LOIS_PILL_LEAN_HOLD_MS,
  LOIS_PILL_VIBE_HOLD_MS,
} from '../curator/loisPill.js';

const SEEN_SEED_CAP = 60;

export function LoisPill() {
  const [code, setCode] = useState('AWAY');

  useEffect(() => {
    const st = {
      nodUntil: 0,
      leanUntil: 0,
      vibeUntil: 0,
      seenSeeds: new Set(),
    };
    const now = () => Date.now();

    const derive = () => {
      const snap = loisActivity.snapshot();
      setCode(
        deriveLoisPill({
          now: now(),
          nodUntil: st.nodUntil,
          vibeUntil: st.vibeUntil,
          leanUntil: st.leanUntil,
          dwellMs: snap.dwellMs,
          idleMs: snap.idleMs,
        }),
      );
    };
    const lean = () => {
      st.leanUntil = now() + LOIS_PILL_LEAN_HOLD_MS;
      derive();
    };

    const unsubs = [
      // NOD: the keep — F or the star. Deliberate, persisted, full recipe.
      // (#996's K-keep is a separate endorsement; the NOD flash stays on
      // the favorite until that issue says otherwise.)
      on(Events.DAVIS_FAVORITE, (p) => {
        if (!p || typeof p !== 'object') return;
        if (p.action === 'add') {
          st.nodUntil = now() + LOIS_PILL_NOD_MS;
          derive();
        } else if (p.action === 'recall') {
          // LEAN: recalling a favorite — sizing the wall.
          lean();
        }
      }),
      // LEAN: a Curator press — walking into the crit room.
      on(Events.LAYOUT_CURATE, () => lean()),
      // LEAN: browsing the palette strip.
      on(Events.PALETTE_LOCK, () => lean()),
      on(Events.PALETTE_HARMONY, () => lean()),
    ];

    // Seed revisit → VIBE flash; palette-id change → LEAN (browsing).
    let prevSeed = useStore.getState().seed ?? null;
    let prevPalette = useStore.getState().paletteId ?? null;
    if (prevSeed != null) st.seenSeeds.add(prevSeed);
    const unsubStore = useStore.subscribe((cur) => {
      const seed = cur.seed ?? null;
      if (seed !== prevSeed) {
        if (seed != null) {
          if (st.seenSeeds.has(seed)) st.vibeUntil = now() + LOIS_PILL_VIBE_HOLD_MS;
          if (st.seenSeeds.size >= SEEN_SEED_CAP) st.seenSeeds.clear();
          st.seenSeeds.add(seed);
        }
        prevSeed = seed;
        derive();
      }
      const pal = cur.paletteId ?? null;
      if (pal !== prevPalette) {
        prevPalette = pal;
        lean();
      }
    });

    // Time-based derivation: flash expiry, dwell VIBE. 500ms is plenty —
    // the shortest window (NOD, 2.6s) still reads as a flash.
    derive();
    const timer = setInterval(derive, 500);
    return () => {
      for (const u of unsubs) {
        try {
          u();
        } catch {
          /* already gone */
        }
      }
      unsubStore();
      clearInterval(timer);
    };
  }, []);

  const m = LOIS_PILL_META[code];

  return (
    <div
      className={`lois-pill lois-${code.toLowerCase()}`}
      title={`LOIS ${m.mood}`}
      style={{ color: m.color, borderColor: m.border }}
      aria-label={`Lois: ${m.mood}`}
    >
      {loisPillText(code)}
    </div>
  );
}
