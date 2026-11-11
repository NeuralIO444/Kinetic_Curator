// BackendIndicator — #2078: the footer backend indicator (Matt's ruling, 2026-11-10).
//
// A single letter in the footer's right cluster, beside the ≡ Settings and
// ? Help micro-buttons, in the same faded micro style: O while a linked
// Ollama answers, A while Apple Intelligence answers, R on the rules. It
// renders the mind's published status (mind:status — the payload startMind
// stamps from the backend chain's own info()), seeded from getMindStatus()
// so a late mount reads the current state, and it holds no selection logic
// of its own: the glyph can only ever name the backend the chain names.
//
// It is standing state, like the seed readout beside it: it never pops,
// flashes, or announces a switch — when the backend changes, the letter is
// simply different, the way the seed is different after a re-roll.
//
// Click (never a dead click): when the DEV panel is reachable — the #2077
// runtime gate, read through devPanelAvailable(), never a local guess —
// the click asks for the panel at its MEGAMIND tab through the devTabs
// request channel. When it is not (a release build with Dev mode off), the
// click opens Settings, where the Dev mode toggle lives. The hover title
// names the state, the detail, and which of those the click will do
// (backendIndicator.mjs holds the ruled strings).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Events, on } from '../composition/eventBus.js';
import { devPanelAvailable } from '../composition/PanelRegistry.js';
import { devModeOn, onDevModeChange } from '../composition/devMode.mjs';
import { getMindStatus } from '../curator/mindLive.js';
import { backendRoute, indicatorFor } from '../curator/backendIndicator.mjs';

export function BackendIndicator({ onOpenSettings }) {
  const [status, setStatus] = useState(() => getMindStatus());
  useEffect(() => on(Events.MIND_STATUS, (p) => setStatus(p)), []);
  // The click's destination is the #2077 gate; subscribing re-renders the
  // letter's title the moment Dev mode flips, like the Shell's tab strip.
  useSyncExternalStore(onDevModeChange, devModeOn);
  const panelAvailable = devPanelAvailable();
  const { glyph, title } = indicatorFor(status, panelAvailable);
  const onClick = async () => {
    if (backendRoute(panelAvailable) === 'megamind') {
      // The Shell's own idiom for reaching into dev-land: a dynamic import,
      // so no dev chunk is pulled into the eager path.
      const { requestDevPanel } = await import('../panels/devTabs.mjs');
      requestDevPanel('megamind');
    } else if (typeof onOpenSettings === 'function') {
      onOpenSettings();
    }
  };
  return (
    <button type="button" className="micro-btn" title={title} style={{ opacity: 0.45 }} onClick={onClick}>
      {glyph}
    </button>
  );
}
