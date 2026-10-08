// davisSigil.js — Davis's face: a mandala drawn from the seed (#1126).
//
// LOIS has one face and judges; Davis has infinite faces and generates. His is a generative kaleidoscope: eight-fold
// mirror symmetry, ornamental rings, seeded ornament, drawn in his colour (amber, KC-1 DS rule 6). A NEW SEED is a
// NEW FACE, and the face behaves its state: the medallion turns at the tempo of his mood (slow in FLOW, agitated in
// UGLY, barely turning in STUCK). Pure and canvas-agnostic: it draws through any 2D-context-shaped object, from a
// seeded stream, never Math.random. Port of docs/mockups/director-davis.html (the mandala and the tempo table).
import { mkRng } from '../engine/prng.js';

export const SIGIL_FOLDS = 8; // eight-fold mirror symmetry
export const SIGIL_SIZE = 96; // drawn at this many px square; the panel scales it with CSS
export const SIGIL_RINGS = Object.freeze([13, 25, 37]);

/** Seconds per full turn, by Davis state (the mockup's tempo table). No state: he is not turning. */
export const SIGIL_TEMPO_S = Object.freeze({ FLOW: 14, SEEDLING: 6, UGLY: 4, STUCK: 40, BLOOM: 9 });
export const sigilTempo = (code) => SIGIL_TEMPO_S[code] ?? null;

/** The ornaments of ONE wedge, a pure function of the scene seed; the drawing stamps them SIGIL_FOLDS times. */
export function sigilGeometry(seed) {
  const R = mkRng(((seed >>> 0) ^ 0x5d1a) >>> 0 || 1);
  const wedge = (Math.PI * 2) / SIGIL_FOLDS;
  const n = 24 + Math.floor(R() * 18);
  const els = [];
  for (let i = 0; i < n; i++) els.push({ r: 8 + R() * 32, a: R() * wedge, s: 1 + R() * 3.2, o: 0.25 + R() * 0.65, ring: R() < 0.3 });
  return { wedge, els };
}

/**
 * Draw the mandala. `rgb` is the colour as 'r,g,b'; the caller (a component) reads it from the design token.
 * The art is laid out on a SIGIL_SIZE square; `px` is the canvas's real pixel size, so a sharper screen gets a sharper
 * mandala (the coordinates scale, the picture does not change).
 * @param {CanvasRenderingContext2D} cx
 */
export function drawSigil(cx, geom, rgb = '255,205,130', px = SIGIL_SIZE) {
  const size = SIGIL_SIZE; const k = px / size;
  const C = size / 2; const { wedge, els } = geom;
  cx.clearRect(0, 0, px, px);
  cx.save(); cx.scale(k, k); cx.translate(C, C);
  // ornamental rings: rotationally symmetric, so invisible to the spin
  cx.strokeStyle = `rgba(${rgb},0.28)`; cx.lineWidth = 1;
  for (const r of SIGIL_RINGS) { cx.beginPath(); cx.arc(0, 0, r, 0, 7); cx.stroke(); }
  for (let k = 0; k < SIGIL_FOLDS; k++) {
    cx.save(); cx.rotate(k * wedge);
    for (const e of els) {
      const x = Math.cos(e.a) * e.r; const y = Math.sin(e.a) * e.r;
      cx.fillStyle = `rgba(${rgb},${e.o.toFixed(2)})`;
      cx.beginPath(); cx.arc(x, y, e.s, 0, 7); cx.fill();
      cx.beginPath(); cx.arc(x, -y, e.s * 0.65, 0, 7); cx.fill(); // the mirror half
      if (e.ring) { cx.strokeStyle = `rgba(${rgb},${(e.o * 0.7).toFixed(2)})`; cx.beginPath(); cx.arc(x, y, e.s + 2.5, 0, 7); cx.stroke(); }
    }
    cx.restore();
  }
  cx.fillStyle = `rgba(${rgb},0.95)`; cx.beginPath(); cx.arc(0, 0, 3.2, 0, 7); cx.fill();
  cx.restore();
}
