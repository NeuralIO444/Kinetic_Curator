// useWetLabLadder.js — the WetLab ladder as React state (docs/design/wetlab-ladder-spec.md §4, §12; #2281).
//
// One place loads, opens and saves the artist's ladder so the rail and every strip read the same thing (#2283 calls
// `keepOn` from the creature and beast strips). Storage is the per-viewer preference (wetLabLadder.mjs LADDER_KEY),
// wrapped as FerroFluidChip wraps it: a blocked store reads as a new artist and a failed write just loses the nicety.
import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyLadder, keep, loadLadder, openForExisting, saveLadder } from './wetLabLadder.mjs';

const storage = () => (typeof localStorage !== 'undefined' ? localStorage : null);

/**
 * @param {{ creatures: number, beasts: number }} counts  what the project already holds; either > 0 opens every rung
 *   for an existing artist (§12.3). Read once, at the first mount.
 * @returns {{ ladder, keepOn(rung) → opened rung id | null }}
 */
export function useWetLabLadder({ creatures = 0, beasts = 0 } = {}) {
  const [ladder, setLadder] = useState(() => emptyLadder());
  const restored = useRef(false);
  // the ladder the next keep builds on: written only where the ladder is set (mount and keepOn), never in render
  const latest = useRef(null);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const next = openForExisting(loadLadder(storage()), { creatures, beasts });
    latest.current = next;
    setLadder(next);
    saveLadder(storage(), next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keepOn = useCallback((rung) => {
    const base = latest.current || emptyLadder();
    const r = keep(base, rung);
    if (JSON.stringify(r.ladder) !== JSON.stringify(base)) {
      latest.current = r.ladder;
      setLadder(r.ladder);
      saveLadder(storage(), r.ladder);
    }
    return r.opened;
  }, []);

  return { ladder, keepOn };
}
