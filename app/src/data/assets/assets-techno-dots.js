// assets-techno-dots.js — #2107 (Matt, 2026-11-18): the Techno chapter's DOTS, as recipes. Nothing here is drawn:
// every record is composed, at load, from marks the library already carries — a dot field from the organic/geo dots
// pack (dot_*), framed by a readout mark from the micro-HUD pack (mic_*). The svg is the two source svgs verbatim,
// the dots inset by a plain translate/scale so the frame stays clear; nothing is redrawn or retraced.
//
// Why they exist: SCAN SWEEP (the techno look that asks for scanlines + dots) found 3 scanlines and 0 dots in the
// Techno deck — under the pool minimum of 4 — and so dealt a mixed pool. These four give the deck its dots.
//
// The ids take the `mic_` prefix, so assetStyle files them in the micro-HUD family (style techno, the family rule
// wins first); their category is `dots`. Their tags are canonical-vocabulary terms (hud, dot, grid, ring).
// TECHNO_DOT_RECIPES is the provenance table — which existing marks each record is made from.
import { ASSETS_PART1 } from './assets-organic-geo.js';
import { ASSETS_MICRO } from './assets-micro-hud.js';

/** id → the existing marks it is composed from: `dots` (the field, inset) and `frame` (the readout, verbatim). */
export const TECHNO_DOT_RECIPES = Object.freeze({
  mic_dots_grid: Object.freeze({ dots: 'dot_field_01', frame: 'mic_cropmarks', tags: ['hud', 'dots', 'grid'] }),
  mic_dots_halftone: Object.freeze({ dots: 'dot_field_04', frame: 'mic_cropmarks', tags: ['hud', 'dots', 'halftone'] }),
  mic_dots_ring: Object.freeze({ dots: 'dot_ring_01', frame: 'mic_crosshair', tags: ['hud', 'dots', 'ring'] }),
  mic_dots_speckle: Object.freeze({ dots: 'dot_speckle_01', frame: 'mic_cropmarks', tags: ['hud', 'speckle'] }),
});

/** The inset that keeps a 100×100 dot field inside a readout frame (the frames ink their outer ~24 units). */
const INSET = { mic_cropmarks: 'translate(16 16) scale(0.68)', mic_crosshair: null };

const byId = new Map([...ASSETS_PART1, ...ASSETS_MICRO].map((a) => [a.id, a]));

function compose(id, { dots, frame, tags }) {
  const d = byId.get(dots);
  const f = byId.get(frame);
  if (!d || !f) throw new Error(`assets-techno-dots: ${id} names a missing source (${dots}, ${frame})`);
  const inset = INSET[frame];
  const field = inset ? `<g transform="${inset}">${d.svg}</g>` : d.svg;
  return {
    id,
    category: 'dots',
    tags: [...tags],
    weight: 'light',
    density: 'medium',
    scale: [0.12, 0.4], // the micro-HUD pack's own scale band
    rotate: 'fixed',
    svg: `${field}${f.svg}`,
  };
}

export const ASSETS_TECHNO_DOTS = Object.entries(TECHNO_DOT_RECIPES).map(([id, r]) => compose(id, r));
