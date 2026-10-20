// UnlockTreeSection — #1630: the unlock tree at the bottom of BUILD.
// An RPG skill-tree readout for everything in BUILD that can stand greyed
// or Davis-only: each node says what it is, whether it is lit right now,
// and what lights it. READ-ONLY by law — nothing here applies an effect,
// changes a value, or grants access; Davis's moves stay his. The catalogue
// and every condition live in unlockTree.mjs (pure, selfchecked against
// the gating sources); this file only gathers the live state the tree
// reads: the current Look (mode / symmetry / material), the pattern-below
// test LayoutSliders uses, the hand-made voice count VoicesShelf uses,
// and Davis's tier standing from the presence view (the same readout the
// dev panel's MIND tab reads — tier only; the score stays backstage).
import { useEffect, useState } from 'react';
import { useStore } from '../../state/store.js';
import { nearestPatternBelow } from '../../pattern/ground.js';
import { nearestWeatherAbove } from '../../gl/dishWeather.mjs'; // #1183 weather: is there haze over this layer?
import { isEarned } from '../../state/earnedVoices.js';
import { MAX_USER_VOICES } from '../../state/slices/voiceSlice.js';
import { getPresenceView, subscribePresence } from '../../curator/mindPresenceLive.js';
import { buildUnlockTree } from './unlockTree.mjs';

const STATE_WORD = Object.freeze({ lit: 'LIT', dark: 'DARK', his: 'HIS' });
const STATE_PIP = Object.freeze({ lit: '▪', dark: '▫', his: '◆' });

export function UnlockTreeSection({ layoutParams }) {
  const [view, setView] = useState(getPresenceView);
  useEffect(() => subscribePresence(() => setView(getPresenceView())), []);
  const hasGround = useStore((st) => !!nearestPatternBelow(st.layers, st.activeLayerId));
  const hasWeather = useStore((st) => !!nearestWeatherAbove(st.layers, st.activeLayerId));
  const voiceCount = useStore((s) => s.userVoices).filter((v) => !isEarned(v)).length;

  const davisRow = view && Array.isArray(view.rows) ? view.rows.find((r) => r.label === 'DAVIS') : null;
  const groups = buildUnlockTree({
    mode: layoutParams.mode,
    symmetry: layoutParams.symmetry,
    material: layoutParams.material,
    hasGround,
    hasWeather,
    voiceCount,
    voiceCap: MAX_USER_VOICES,
    davis: davisRow ? { tier: davisRow.tier, cool: davisRow.cool } : null,
  });

  return (
    <div className="unlock-tree">
      {groups.map((g) => (
        <div key={g.id} className="unlock-group">
          <div className="param-subheader ttl">{g.title}</div>
          {g.note && <div className="unlock-note">{g.note}</div>}
          {g.nodes.map((n) => (
            <div key={n.id} className={`unlock-node is-${n.state}`}>
              <div className="unlock-head">
                <span className="unlock-pip" aria-hidden="true">{STATE_PIP[n.state]}</span>
                <span className="unlock-name">{n.name}</span>
                <span className="unlock-state">{STATE_WORD[n.state]}</span>
              </div>
              <div className="unlock-line">{n.line}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
