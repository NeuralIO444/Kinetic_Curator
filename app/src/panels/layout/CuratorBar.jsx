// Curator bar — the taste-guided re-roll over unlocked params.
// Rolls CURATE_CANDIDATES scenes, keeps the curator engine's pick.
// The voice select chooses which persona tastes the candidates ("off" =
// honest dice roll). The hint always says who picked.
import { useState } from 'react';
import { emit, Events } from '../../composition/eventBus.js';
import { getActiveCurator, curatorHint } from '../../curator/curate.js';
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
  return (
    <div className="randomize-bar">
      <button className="randomize-btn" onClick={() => emit(Events.LAYOUT_CURATE)}>
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
          <option key={p.id} value={p.id}>voice: {p.name.toLowerCase()}</option>
        ))}
      </select>
      <span className="randomize-hint">{lockCount > 0 ? `${lockCount} locked · ` : ''}{hint}</span>
    </div>
  );
}
