// Voice tiles (#717, #1153) — the voices the triad has EARNED.
//
// The four factory flagships are retired from the picker (they still open an old project that names one). A tile
// here is a find: Davis's BLOOM minted it from the artist's own work (state/earnedVoices.js), and it reads as frozen
// history (KC-1 DS rule 9): the palette's four swatches, a deadpan name from the scene, and the number of rolls it
// took, a count and never a tier word. Nothing on a tile breathes. Until the first find there is ONE starter voice so
// the row is never empty; it retires itself when the first find lands. Tap loads through the existing voice MIX (a
// voice carrying a layer stack brings its tracks back when the MIX lands, in one undo).
import { useStore } from '../../state/store.js';
import { FLAGSHIP_VOICES } from '../../data/voices.js';
import { earnedVoices } from '../../state/earnedVoices.js';
import { MixBar } from '../layout/MixBar.jsx';

// the one built-in left in the picker: the first flagship, as the starter
const STARTER = FLAGSHIP_VOICES[0];

function Tile({ id, swatches, name, line, title, active, kind, onTap }) {
  return (
    <div className="voice-tile">
      <button className={`voice-chip ${kind}${active ? ' active' : ''}`} onClick={onTap} title={title} data-voice-id={id}>
        <span className="voice-dots" aria-hidden="true">
          {swatches.slice(0, 4).map((c, i) => (<i key={i} style={{ background: c }} />))}
        </span>
        {/* #735: the face prints the Voice title or its deadpan name, never a chassis id (SWARM/HYPE/MURM) */}
        <span className="voice-name">{name}</span>
        <span className="voice-rolls name">{line}</span>
      </button>
    </div>
  );
}

export function VoiceTiles() {
  const activeVoiceId = useStore((s) => s.activeVoiceId);
  const loadVoice = useStore((s) => s.loadVoice);
  const userVoices = useStore((s) => s.userVoices);
  const found = earnedVoices(userVoices);
  return (
    <div className="voice-row davis-voices">
      <div className="voice-flagships">
        {found.length === 0 ? (
          <Tile id={STARTER.id} kind="starter" swatches={STARTER.palette.swatches} name={STARTER.title} line="starter"
            title={`${STARTER.title} — ${STARTER.vibe} The starter voice: it steps aside when the first find is made.`}
            active={activeVoiceId === STARTER.id} onTap={() => loadVoice(STARTER.id)} />
        ) : found.map((v) => (
          <Tile key={v.id} id={v.id} kind="earned" swatches={v.state.palette.swatches} name={v.name}
            line={`after ${v.earned.rolls} · ${v.state.params.count}`} title={`${v.name} — ${v.earned.caption || `after ${v.earned.rolls} rolls`}`}
            active={activeVoiceId === v.id} onTap={() => loadVoice(v.id)} />
        ))}
      </div>
      <MixBar />
    </div>
  );
}
