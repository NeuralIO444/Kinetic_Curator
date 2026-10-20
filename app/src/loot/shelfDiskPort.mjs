// shelfDiskPort.mjs — #1591 (Keeps K3): the live wire between the
// store and the disk tier's export runner. LootRow registers the
// connected folder's backend here; from then on, whenever the
// collection's size, the soft bound, the export preference, or the
// folder's connected state changes, the runner checks the overflow
// and exports what the planner names (loot/shelfDiskRun.mjs) — so a
// crown that pushes the collection past its bound exports the
// longest-unstaged keep without waiting for a manual rescan, and a
// preferences.json edit that raises the bound simply stops the
// exports (nothing ever comes back uninvited; a return is a
// promotion, made by hand or by the fill).
//
// SHELF_SESSION_START_MS is this session's start: the planner never
// exports a keep staged since it began ("never exported under the
// artist"). The runner speaks its own (planned) stops on the shelf's
// line; an unplanned throw anywhere in the check is spoken by the
// wire itself (#1646) — once per episode, the episode closing when
// a run completes.

import { useStore } from '../state/store.js';
import { runShelfExports } from './shelfDiskRun.mjs';
import { ASSETS } from '../data/assets/index.js';
import { PALETTES } from '../data/palettes.js';

export const SHELF_SESSION_START_MS = Date.now();

const ASSETS_BY_ID = new Map(ASSETS.map((a) => [a.id, a]));
const PALETTES_BY_ID = new Map(PALETTES.map((p) => [p.id, p]));

let port = null; // { backend, root } — the connected folder
let running = false;
let unsubscribe = null;

let wireStopSpoken = false; // #1646 — the open episode: an unplanned stop already named

async function kick(runner = runShelfExports) {
  if (running || !port) return;
  running = true;
  try {
    await runner(useStore.getState, {
      backend: port.backend, root: port.root,
      sessionStartMs: SHELF_SESSION_START_MS,
      assetsById: ASSETS_BY_ID, palettesById: PALETTES_BY_ID,
    });
    wireStopSpoken = false; // a completed run closes the episode
  } catch {
    // #1646 — the runner names its planned stops (a refused write, a
    // bad read-back) and returns; anything else that throws — the
    // planner, the serializer, the store update — used to vanish
    // here, leaving a keep un-exported past its bound with no line,
    // under a header claiming the wire's silence was safe. One line
    // per episode, like the runner's own stops.
    if (!wireStopSpoken) {
      wireStopSpoken = true;
      useStore.getState().setShelfNotice('export check stopped early — a keep may be waiting to move to the disk; nothing was half-moved');
    }
  }
  finally { running = false; }
}

/** Ask the runner to check the overflow now (after a prefs read).
 * The runner is injectable so the port's own behaviour is checkable. */
export function kickShelfExports(runner) { return kick(runner); }

/** Register (or re-point) the connected folder and arm the watch. */
export function registerShelfDiskPort(backend, root) {
  if (!backend || !root) return;
  port = { backend, root };
  if (!unsubscribe) {
    let key = '';
    unsubscribe = useStore.subscribe(() => {
      const s = useStore.getState();
      const next = [
        (s.keeps || []).length,
        s.shelfPrefs?.collectionSoftBound ?? '',
        s.shelfExportPrefs?.onSoftBound ?? '',
        s.shelfDiskConnected ? 1 : 0,
        s.shelfDiskRoot || '',
      ].join('|');
      if (next !== key) { key = next; void kick(); }
    });
  }
  void kick();
}

/** The folder was forgotten: disarm. The files are not touched. */
export function clearShelfDiskPort() {
  port = null;
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}
