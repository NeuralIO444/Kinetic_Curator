// MIX bar (#280) — the crossfade control for voice switches.
//
// Tapping a voice chip opens a MIX: the live loop renders the interpolated
// blend while this slider shows (and scrubs) the position. Dragging pauses
// the auto-advance; ⏵ resumes it; ✕ bails out to the committed state.
import { useStore } from '../../state/store.js';
import { RangeRow } from '../../components/RangeRow.jsx';

export function MixBar() {
  const voiceMix = useStore((s) => s.voiceMix);
  const setVoiceMixT = useStore((s) => s.setVoiceMixT);
  const resumeVoiceMix = useStore((s) => s.resumeVoiceMix);
  const cancelVoiceMix = useStore((s) => s.cancelVoiceMix);
  if (!voiceMix) return null;

  const t = voiceMix.t ?? 0;
  const pct = Math.round(t * 100);

  return (
    <div className="mix-bar" role="group" aria-label="Voice mix">
      <span className="mix-label lbl">mix</span>
      <span className="mix-names" title="Crossfading between voices">
        {voiceMix.targetName || 'VOICE'}
      </span>
      <RangeRow layout="bare" tone="ink" className="mix-slider"
        className="mix-slider"
        min={0}
        max={1000}
        value={Math.round(t * 1000)}
        onChange={(v) => setVoiceMixT(v / 1000)}
        ariaLabel="Mix position"
        hint="Drag to scrub the crossfade"
      />
      <span className="mix-pct">{pct}%</span>
      {!voiceMix.auto && (
        <button className="mix-btn" onClick={resumeVoiceMix} title="Resume the crossfade">⏵</button>
      )}
      <button className="mix-btn" onClick={cancelVoiceMix} title="Cancel the mix — keep the committed state">✕</button>
    </div>
  );
}
