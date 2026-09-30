// Voice tiles (#717) — the flagship Voices' one home: DAVIS, the composition
// machine. Night Migration / Chrome Parade / Deep Water / Dark Glass load
// their sealed factory state through the existing voice MIX (loadVoice →
// blendSeconds). Load only: no second mixer, no save-in-place, no edit badge
// (that is #734). The MIX bar below is the same readout BUILD shows.
import { useStore } from '../../state/store.js';
import { FLAGSHIP_VOICES } from '../../data/voices.js';
import { MixBar } from '../layout/MixBar.jsx';

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
  return (
    <div className="voice-row davis-voices">
      <div className="voice-flagships">
        {FLAGSHIP_VOICES.map((v) => (
          <FlagshipChip key={v.id} voice={v} active={activeVoiceId === v.id} onTap={() => loadVoice(v.id)} />
        ))}
      </div>
      <MixBar />
    </div>
  );
}
