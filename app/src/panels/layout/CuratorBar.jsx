// Curator bar — the taste-guided re-roll over unlocked params.
// Rolls CURATE_CANDIDATES scenes, keeps the curator engine's pick.
// The voice select chooses which persona tastes the candidates ("off" =
// honest dice roll). The hint always says who picked.
import { useState } from 'react';
import { emit, Events } from '../../composition/eventBus.js';
import { getActiveCurator, curatorHint } from '../../curator/curate.js';
import { useStore } from '../../state/store.js';
import { getRenderProfile } from '../../curator/renderProfiles.js';
import {
  PERSONA_TASTES,
  getActivePersonaId,
  setActivePersona,
} from '../../curator/taste.js';

export function CuratorBar({ lockCount }) {
  const [voice, setVoice] = useState(getActivePersonaId() ?? 'off');
  const curator = getActiveCurator();
  const hint = curatorHint(curator);
  const onVoice = (e) => {
    const v = e.target.value;
    setActivePersona(v === 'off' ? null : v);
    setVoice(v === 'off' ? 'off' : getActivePersonaId() ?? 'off');
  };
  const onCurate = () => {
    emit(Events.LAYOUT_CURATE);
    // The persona brings its palette: switch the global palette to the
    // profile's catalog entry so the color jumps with the voice. Skipped
    // when already there — repeat presses don't wipe swatch overrides or
    // stack undo entries. "off" never touches the palette.
    const profile = getRenderProfile(getActivePersonaId());
    if (profile) {
      const st = useStore.getState();
      if (st.paletteId !== profile.paletteId) st.setPaletteId(profile.paletteId);
    }
  };
  return (
    <div className="randomize-bar">
      <button className="randomize-btn" onClick={onCurate}>
        Curator
      </button>
      <select
        className="curator-voice-select"
        value={voice}
        onChange={onVoice}
        title="Persona voice tasting the candidates — off means a plain dice roll"
        onClick={(e) => e.stopPropagation()}
      >
        <option value="off">voice: off</option>
        {PERSONA_TASTES.map((p) => (
          <option key={p.id} value={p.id}>voice: {p.alias}</option>
        ))}
      </select>
      <span className="randomize-hint">{lockCount > 0 ? `${lockCount} locked · ` : ''}{hint}</span>
    </div>
  );
}
