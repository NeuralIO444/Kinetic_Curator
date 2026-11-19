// HornStrip.jsx — #2388 (Persona Kernel P8): the horns join THE ROOM. A strip of three smaller tiles directly under
// the kc-voice/1 channel — BLAST, HYBRID, SWISS GRIT — in the codec's own tile grammar (face, lowercase callsign,
// state word). COVER and OVERLAP stay the big flanking tiles (RoomCodec.jsx).
//
// Readout only, like the rest of the room: nothing here is a button, nothing acts. A face is a pure picture of a
// resolved state (curator/hornFaces.js — each state a measurement) drawn by curator/hornFaceGeometry.js. There is NO
// timer, interval, frame loop or random draw in this file: a face changes when its measured state changes, and a
// state change eases with a CSS transition (reduced motion shortens it globally, tokens.css). Callsigns only (R6).
import { FACE_BOX, blastGeometry, hybridGeometry, gritGeometry } from '../../curator/hornFaceGeometry.js';

function BlastFace({ s }) {
  const { cells } = blastGeometry(s);
  return (
    <svg className="horn-svg blast-face" viewBox={`0 0 ${FACE_BOX} ${FACE_BOX}`} aria-hidden="true">
      {cells.map((c, i) => (
        <rect
          key={i}
          className="horn-cell"
          style={{ x: c.x, y: c.y, width: c.w, height: c.h, opacity: c.o, transform: `rotate(${c.rot}deg)` }}
        />
      ))}
    </svg>
  );
}

function HybridFace({ s }) {
  const { layers } = hybridGeometry(s);
  return (
    <svg className="horn-svg hybrid-face" viewBox={`0 0 ${FACE_BOX} ${FACE_BOX}`} aria-hidden="true">
      {layers.map((l, li) => (
        <g key={li} style={{ opacity: l.o }} transform={`translate(${l.dx} ${l.dy})`}>
          {l.cells.map((c, i) => (
            <rect key={i} x={c.x} y={c.y} width={c.s} height={c.s} fill={`hsl(${c.hue} 85% 62%)`} />
          ))}
        </g>
      ))}
    </svg>
  );
}

function GritFace({ s }) {
  const g = gritGeometry(s);
  const { frame, lines, fill, speckles, marks } = g;
  const end = frame.x + frame.s;
  return (
    <svg className="horn-svg grit-face" viewBox={`0 0 ${FACE_BOX} ${FACE_BOX}`} aria-hidden="true">
      <rect className="horn-fill" style={{ x: fill.x, y: fill.y, width: fill.s, height: fill.s }} />
      <rect className="horn-frame" x={frame.x} y={frame.y} width={frame.s} height={frame.s} />
      {lines.map((p) => (
        <g key={p} className="horn-rule">
          <line x1={p} y1={frame.y} x2={p} y2={end} />
          <line x1={frame.x} y1={p} x2={end} y2={p} />
        </g>
      ))}
      {marks && (
        <g className="horn-marks">
          <line x1={frame.x - 4} y1={frame.y} x2={frame.x + 3} y2={frame.y} />
          <line x1={frame.x} y1={frame.y - 4} x2={frame.x} y2={frame.y + 3} />
          <line x1={end - 3} y1={end} x2={end + 4} y2={end} />
          <line x1={end} y1={end - 3} x2={end} y2={end + 4} />
        </g>
      )}
      {speckles.map((p, i) => (
        <circle key={i} className="horn-grit" cx={p.x} cy={p.y} r={p.r} />
      ))}
    </svg>
  );
}

const FACES = { carson: BlastFace, greiman: HybridFace, ashworth: GritFace };
const KEY = { carson: 'blast', greiman: 'hybrid', ashworth: 'grit' };

/** @param {{ horns: ReturnType<typeof import('../../curator/hornFaces.js').resolveHorns> }} props */
export function HornStrip({ horns }) {
  return (
    <div className="room-horns" role="group" aria-label="The horns">
      {horns.map((h) => {
        const Face = FACES[h.id];
        return (
          <div
            key={h.id}
            className={`horn-tile horn-${KEY[h.id]}`}
            data-horn={KEY[h.id]}
            data-code={h.code}
            data-degree={h.degree}
            role="img"
            aria-label={`${h.callsign}, ${h.word}`}
          >
            <div className="horn-face-slot">
              <Face s={h} />
            </div>
            <div className="horn-dressing">
              <span className="horn-name">{h.tile}</span>
              <span className="horn-state act">{h.word}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
