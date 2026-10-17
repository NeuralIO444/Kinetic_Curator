// SkeletonOverlay.jsx — Phase 2 S1: the DEV-ONLY creature skeleton overlay. It mounts only with
// ?debug=skeleton on the URL (the ?debug=stress pattern, curator/stressLive.js), so the shipped
// instrument carries no extra chrome and draws no extra pixels unless the flag is on. It draws the
// last resolved frame's bone graphs (gl/liveResolve.mjs publishes them via getLastSkeletons) as
// lines and joint dots over the live canvas: spine in amber, fore chains in teal, hind chains in
// violet, the head joint ringed red with its H, each chain root dotted with its L.
//
// The mapping matches the render path: the canvas element letterboxes its scene with
// object-fit: contain (styles/canvas.css), which an SVG viewBox with preserveAspectRatio
// "xMidYMid meet" reproduces exactly; inside it, the same viewport transform liveLoop applies —
// zoom about the canvas centre, then pan. The loop's breath sway is NOT applied: during heavy
// BREATH the bones can sit a few px off the marks. This is a builder's ruler, not a performer surface.
import { useEffect, useState } from 'react';
import { getLastSkeletons } from '../gl/liveResolve.mjs';

const CHAIN_COLOR = { fore: '#4dd0e1', hind: '#b388ff' };

export function SkeletonOverlay({ zoom, pan, canvasW, canvasH }) {
  const [skels, setSkels] = useState(getLastSkeletons());
  // The resolver publishes per frame with no subscription API: a light poll keeps the overlay current
  // (the StressReadout precedent).
  useEffect(() => {
    const id = setInterval(() => setSkels(getLastSkeletons()), 100);
    return () => clearInterval(id);
  }, []);
  const list = (skels || []).filter(Boolean);
  if (!list.length) return null;
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const z = zoom || 1;
  const transform = `translate(${pan.x} ${pan.y}) translate(${cx} ${cy}) scale(${z}) translate(${-cx} ${-cy})`;
  const sw = 1.5 / z;
  const r = 3 / z;
  return (
    <>
      <svg
        aria-label="Creature skeletons (debug)"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 2, pointerEvents: 'none' }}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <g transform={transform}>
          {list.map((skel, si) => (
            <g key={si}>
              {skel.bones.map((b) => (
                <g key={b.id}>
                  <line
                    x1={b.base.x} y1={b.base.y} x2={b.tip.x} y2={b.tip.y}
                    stroke={b.chain ? (CHAIN_COLOR[b.chain] || '#4dd0e1') : '#ffd166'}
                    strokeWidth={sw}
                  />
                  <circle cx={b.base.x} cy={b.base.y} r={r} fill="#fff" />
                  {b.marker === 'H' && (
                    <>
                      <circle cx={b.tip.x} cy={b.tip.y} r={r * 2} fill="none" stroke="#ff5252" strokeWidth={sw} />
                      <text x={b.tip.x + r * 3} y={b.tip.y} fill="#ff5252" fontSize={10 / z} fontFamily="ui-monospace, Menlo, monospace">H</text>
                    </>
                  )}
                  {b.marker === 'L' && (
                    <text x={b.base.x + r * 2} y={b.base.y - r * 2} fill="#fff" fontSize={10 / z} fontFamily="ui-monospace, Menlo, monospace">L</text>
                  )}
                </g>
              ))}
            </g>
          ))}
        </g>
      </svg>
      <span style={{ position: 'absolute', left: 8, top: 8, zIndex: 2, pointerEvents: 'none', font: '10px ui-monospace, Menlo, monospace', color: '#ffd166' }}>
        SKELETON (debug)
      </span>
    </>
  );
}
