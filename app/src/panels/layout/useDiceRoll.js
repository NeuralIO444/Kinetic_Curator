// useDiceRoll.js — state hook behind the tasteful dice.
//
// Roll: uniform layout proposals across all 14 modes (the CURATE affinity
// table is ignored), casts dealt from asset metadata, Davis's state setting
// the wildness. LOIS shortlists 3 via the scorer interface; the performer
// crowns one. The crown lands in the keep ledger (future training data) and
// the dice's own crown log (learned compatibility).
import { useState } from 'react';
import { useStore } from '../../state/store.js';
import { ASSETS } from '../../data/assets/index.js';
import { rollDice } from '../../curator/dice.js';
import { createPersonaScorer } from '../../curator/diceScorer.js';
import { readCrowns, recordCrown } from '../../curator/diceCrowns.js';
import { loisActivity } from '../../curator/loisActivity.js';
import { resolveDavisState } from '../../curator/davisState.js';
import { captureKeepContext } from '../../curator/keepContext.js';

const assetsById = new Map(ASSETS.map((a) => [a.id, a]));
// The scorer is an interface ({ id, score }) — the MLX head swaps in here later.
const scorer = createPersonaScorer({ assetsById });

/** Owns the tray state. Render <DiceTile/> last in the mode grid, <DiceTray/> below it. */
export function useDiceRoll() {
  const [tray, setTray] = useState(null);
  const loadStubMode = useStore((s) => s.loadStubMode);
  const loadDiceCast = useStore((s) => s.loadDiceCast);
  const addKeep = useStore((s) => s.addKeep);

  const roll = () => {
    const davisCode = resolveDavisState(loisActivity.snapshot())?.code ?? null;
    setTray(rollDice({ assets: ASSETS, davisCode, scorer, crowns: readCrowns() }));
  };

  const crown = (finalist) => {
    const s = useStore.getState();
    // Layout axis rides the MIX road; shapes swap once, undoable.
    loadStubMode(finalist.layoutId);
    loadDiceCast(finalist.assetIds);
    // The keep ledger: what was crowned, as crowned (not a mid-blend snapshot).
    // #1140 — same record contract as captureFavorite: stream offsets (#305)
    // plus the session context. The crown used to drop the offsets.
    addKeep({
      seed: s.seed,
      seedOffsets: { ...(s.seedOffsets || {}) },
      timestamp: new Date().toISOString(),
      context: captureKeepContext(s.paletteId),
      config: {
        layout: { ...s.layoutParams, mode: finalist.layoutId },
        palette: { id: s.paletteId },
        assets: [...finalist.assetIds],
      },
    });
    // The dice's own log: the learned-compatibility training data.
    recordCrown({ layoutId: finalist.layoutId, assetIds: finalist.assetIds, davisCode: tray?.davisCode ?? null });
    setTray(null);
  };

  return { tray, roll, crown, dismiss: () => setTray(null) };
}
