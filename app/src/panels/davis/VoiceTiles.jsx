// Voice tiles (#717) — the flagship Voices' one home: DAVIS, the composition
// machine. Night Migration / Chrome Parade / Deep Water / Dark Glass load
// their sealed factory state through the existing voice MIX (loadVoice →
// blendSeconds). Load only: no second mixer, no save-in-place, no edit badge
// on the chip itself. #734: the ✎ badge opens a dish that forks a copy. The
// MIX bar below is the same readout BUILD shows.
import { useState } from 'react';
import { useStore } from '../../state/store.js';
import { FLAGSHIP_VOICES } from '../../data/voices.js';
import { MixBar } from '../layout/MixBar.jsx';
import { VoiceDish } from './VoiceDish.jsx';

function FlagshipChip({ voice, active, onTap }) {
  const dots = voice.palette.swatches.slice(0, 4);
  return (
    <button
      className={`voice-chip flagship${active ? ' active' : ''}`}
      onClick={onTap}
      title={`${voice.title} — ${voice.vibe}`}
    >
      <span className="voice-dots" aria-hidden="true">
        {dots.map((c, i) => (
          <i key={i} style={{ background: c }} />
        ))}
      </span>
      {/* #735: the face prints the Voice title. SWARM/HYPE/MURM are ids and
          chassis names, banned as face labels (docs/TAXONOMY.md). */}
      <span className="voice-name">{voice.title}</span>
    </button>
  );
}

export function VoiceTiles() {
  const activeVoiceId = useStore((s) => s.activeVoiceId);
  const loadVoice = useStore((s) => s.loadVoice);
  const [editing, setEditing] = useState(null);
  const editVoice = FLAGSHIP_VOICES.find((v) => v.id === editing);
  return (
    <div className="voice-row davis-voices">
      <div className="voice-flagships">
        {FLAGSHIP_VOICES.map((v) => (
          <div key={v.id} className="voice-tile">
            <FlagshipChip voice={v} active={activeVoiceId === v.id} onTap={() => loadVoice(v.id)} />
            <button type="button" className={`voice-edit-badge ${editing === v.id ? 'active' : ''}`}
              aria-label={`Edit a copy of ${v.title}`} title={`Edit a copy of ${v.title} — saves as a new voice`}
              onClick={() => setEditing(editing === v.id ? null : v.id)}>✎</button>
          </div>
        ))}
      </div>
      {editVoice && <VoiceDish key={editVoice.id} voice={editVoice} onClose={() => setEditing(null)} />}
      <MixBar />
    </div>
  );
}
