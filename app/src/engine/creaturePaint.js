// engine/creaturePaint.js — creature PAINT, slice P3 (docs/design/creature-paint-drive-spec.md §1.3, §1.7; #2340).
//
// applyMaterial draws a creature's MATERIAL over a drawing (its body, or one of its dealt parts). Matt's rulings
// (2026-11-17, on #2340):
//   - the pattern lies OVER the art: the drawing keeps every mark of its own; hatch or stipple is added inside its
//     silhouette. A material with no pattern ('none') changes nothing.
//   - the tone colours ONLY the pattern, and only through the two palette tokens every asset draws with
//     (var(--ink) / var(--accent)), so the room colours a painted creature like everything else.
//   - drawn with elements the overlay door already trusts (assets/ingest.js): the pattern is ONE plain <path>
//     (hatch = lines, stipple = round-capped dots), clipped to the drawing's own shapes by a <clipPath>. No
//     <pattern>, no <mask> — the door refuses both, and a banked tile carrying them would vanish on reload.
//
// The clip is the drawing's own shapes, each carrying its ancestors' transforms (a transform attribute takes a
// list), so the pattern follows the art even inside nested groups. A clip uses a shape's FILL area: a body drawn
// only in thin strokes shows little pattern (accepted with the ruling).
//
// Pure and deterministic: the same drawing + material gives the identical markup. No clock, no randomness.
import { materialById } from '../data/canon/materials.js';

/** The drawing's box (every pool asset draws in 0 0 100 100); the pattern overhangs it so a turned part stays filled. */
const BOX = Object.freeze({ min: -20, max: 120 });
/** Hatch: diagonal lines this far apart; stipple: dots on a staggered grid this far apart. */
export const HATCH_GAP = 5;
export const STIPPLE_GAP = 5;
/** Stroke widths of the pattern marks, in the drawing's units. */
const HATCH_WIDTH = 0.7;
const STIPPLE_WIDTH = 1.3;

const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line']);
/** Geometry attributes a clip shape keeps; paint, style and ids are dropped (a clip draws no paint). */
const GEOMETRY = new Set([
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'width',
  'height',
  'points',
  'x1',
  'y1',
  'x2',
  'y2',
]);

function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const attrsOf = (tag) => {
  const out = [];
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(tag))) out.push([m[1], m[3] ?? m[4] ?? '']);
  return out;
};

/**
 * The drawing's shapes as clip children: every shape element, geometry only, with the transforms of every group
 * around it (and its own) composed into one transform list. Shapes inside <defs> or an existing <clipPath> are not
 * drawn, so they are not part of the silhouette. Returns '' when the drawing has no shape.
 */
export function silhouetteShapes(svg) {
  const s = String(svg || '');
  const stack = []; // one entry per open element: its transform ('' if none) and whether it hides its children
  const out = [];
  const re = /<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(s))) {
    const [, closing, rawName, rest, selfClose] = m;
    const name = rawName.toLowerCase();
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--)
        if (stack[i].name === name) {
          stack.length = i;
          break;
        }
      continue;
    }
    const attrs = attrsOf(rest);
    const own = (attrs.find(([k]) => k === 'transform') || [])[1] || '';
    const hidden = stack.some((e) => e.hides);
    if (SHAPES.has(name) && !hidden) {
      const chain = [...stack.map((e) => e.transform), own].filter(Boolean).join(' ');
      const geo = attrs.filter(([k]) => GEOMETRY.has(k)).map(([k, v]) => `${k}="${v}"`);
      if (geo.length) out.push(`<${name} ${geo.join(' ')}${chain ? ` transform="${chain}"` : ''}/>`);
    }
    if (!selfClose && name !== 'svg')
      stack.push({ name, transform: own, hides: name === 'defs' || name === 'clippath' || name === 'title' });
  }
  return out.join('');
}

const n = (v) => Math.round(v * 100) / 100;

/** The pattern as one path's `d`: hatch lines at 45°, or a staggered grid of zero-length (round-capped) dots. */
export function patternPath(pattern) {
  const { min, max } = BOX;
  const segs = [];
  if (pattern === 'hatch') {
    // lines y = x + c, for c across the box, clipped to the overhang square
    for (let c = min - max; c <= max - min; c += HATCH_GAP) {
      const x0 = Math.max(min, min - c);
      const x1 = Math.min(max, max - c);
      if (x1 > x0) segs.push(`M${n(x0)} ${n(x0 + c)}L${n(x1)} ${n(x1 + c)}`);
    }
  } else if (pattern === 'stipple') {
    let row = 0;
    for (let y = min; y <= max; y += STIPPLE_GAP, row++)
      for (let x = min + (row % 2 ? STIPPLE_GAP / 2 : 0); x <= max; x += STIPPLE_GAP) segs.push(`M${n(x)} ${n(y)}h0`);
  }
  return segs.join('');
}

/**
 * A drawing with a material painted over it. `material` is a material id (a creature's MATERIAL gene value) or a
 * material record. Returns the drawing UNCHANGED for no material, an unknown one, a material whose pattern is
 * 'none', or a drawing with no shape to paint inside.
 */
export function applyMaterial(svg, material) {
  if (typeof svg !== 'string' || !svg) return svg;
  const mat = typeof material === 'string' ? materialById(material) : material ? materialById(material.id) : null;
  if (!mat || mat.pattern === 'none') return svg;
  const clip = silhouetteShapes(svg);
  const d = patternPath(mat.pattern);
  if (!clip || !d) return svg;
  const id = `kcm-${hash32(`${mat.id}|${svg}`).toString(16).padStart(8, '0')}`;
  const width = mat.pattern === 'hatch' ? HATCH_WIDTH : STIPPLE_WIDTH;
  return (
    `${svg}<defs><clipPath id="${id}">${clip}</clipPath></defs>` +
    `<path d="${d}" fill="none" stroke="var(--${mat.tone})" stroke-width="${width}" stroke-linecap="round" ` +
    `clip-path="url(#${id})"/>`
  );
}

/** A creature record's material id (its MATERIAL gene), or null. */
export function recordMaterial(record) {
  const g = record && Array.isArray(record.genome) ? record.genome.find((x) => x && x.family === 'MATERIAL') : null;
  return g && materialById(g.value) ? g.value : null;
}
