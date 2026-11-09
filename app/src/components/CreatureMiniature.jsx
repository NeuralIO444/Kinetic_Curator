/**
 * CreatureMiniature.jsx — #1872 (creatures, of #1848): the body-language sketch, a creature playing live
 * in miniature. Built as a reusable component on purpose: the WetLab Big Lab's centered creature stage
 * (#2034) reuses this same component — the sketch is not a WetLab-panel one-off.
 *
 * The miniature invents nothing: for a creature record it renders the scene contract's own expansion
 * (cultivate.model's sketchInstancesAt — Davis deals the parts from the stage's pile, Lois's gait poses
 * the bones), and for a linkage body it draws the #1865 solver's own gait sweep (linkageSketchAt —
 * poseLinkage's bars in the tile frame). The play is seeded (the record's deal, the contract's phase), so
 * the same creature on the same stage plays the same way; only the clock is the room's. Continuous motion
 * renders Davis (KC-1 DS): the creature simply moves.
 */
import { useEffect, useState } from 'react';
import { sketchInstancesAt, linkageSketchAt } from './cultivate.model.mjs';

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {{ subject: { kind: 'record', record: object, bodyAsset: object|null } |
 *                      { kind: 'linkage', measures: object },
 *           stageIds?: string[], overlay?: Array, seed?: number,
 *           svgOf?: (id: string) => string|null, size?: number }} props
 *   svgOf resolves an asset id to its SVG drawing (the pool's, plus the creature tile's own id).
 */
export function CreatureMiniature({ subject, stageIds = [], overlay = [], seed = 0, svgOf = () => null, size = 176 }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = (now) => {
      setT((now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!subject) return null;
  if (subject.kind === 'linkage') {
    const pose = linkageSketchAt(subject.measures, t);
    return (
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-label="linkage gait sketch"
        data-testid="creature-miniature"
        style={{ background: '#0a0a0a', border: '1px solid var(--line)', display: 'block' }}
      >
        {pose && (
          <path
            d={pose.map((p) => `M${r2(p.x)} ${r2(p.y)}L${r2(p.tx)} ${r2(p.ty)}`).join('')}
            fill="none"
            stroke="var(--ink)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        )}
      </svg>
    );
  }
  const instances = sketchInstancesAt(
    { record: subject.record, bodyAsset: subject.bodyAsset, stageIds, overlay, seed },
    t,
  );
  return (
    <svg
      viewBox="-55 -55 110 110"
      width={size}
      height={size}
      role="img"
      aria-label="creature body-language sketch"
      data-testid="creature-miniature"
      style={{ background: '#0a0a0a', border: '1px solid var(--line)', display: 'block' }}
    >
      {instances.map((i) => {
        const svg = svgOf(i.asset);
        if (!svg) return null;
        return (
          <g
            key={i.key}
            transform={`translate(${i.x} ${i.y}) rotate(${i.rotation}) scale(${i.scaleX} ${i.scaleY})`}
            opacity={i.opacity}
          >
            <svg
              x={-50}
              y={-50}
              width={100}
              height={100}
              viewBox="0 0 100 100"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </g>
        );
      })}
    </svg>
  );
}
