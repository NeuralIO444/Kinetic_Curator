// RoomFaces.jsx — #1560 S1: what renders INSIDE the codec's two face windows.
//
// ── SLICE 2 SEAM ────────────────────────────────────────────────────────────────────────────────────────────────
// S2 (generative dither faces) replaces the internals of LoisFaceNow / DavisFaceNow and nothing else: the codec
// panel (RoomCodec), the window chrome, the name/state dressing and the transcript do not change. The inputs
// are the ones the duel always used — the honest face/state plus the mind overlay — so the swap is a rendering
// change, not a data change.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import { DavisSigil } from '../../components/DavisSigil.jsx';
import { loisLook } from '../../curator/mindFace.js';
import { blendStyles } from '../../hooks/useMindFaces.js';

/**
 * LOIS's face as it exists today (#1126/#1462): the honest kaomoji from the feed, with the mind's requested
 * face cross-fading over it for the blend's length (one bar) when the mind has asked for one — canonical and
 * invented states alike (loisLook). face: the honest glyph string · overlay: null | the mind overlay.
 */
export function LoisFaceNow({ face, overlay, barS }) {
  const look = overlay?.id ? loisLook(overlay.id) : null;
  const styles = blendStyles(overlay, barS);
  return (
    <span className="codec-face mind-blend" aria-hidden="true">
      <span className="mind-honest" style={styles.honest}>{face}</span>
      {look && <span className="mind-over" style={styles.mind}>{look.face}</span>}
    </span>
  );
}

/**
 * Davis's face as it exists today: the seed-drawn sigil. It turns at the tempo of the code it is handed (the
 * panel resolves which code — a requested canonical state turns at its own tempo, an invented one keeps his
 * honest tempo); still with no state or under reduced motion — DavisSigil owns that law.
 */
export function DavisFaceNow({ seed, code }) {
  return <DavisSigil seed={seed} code={code} />;
}
