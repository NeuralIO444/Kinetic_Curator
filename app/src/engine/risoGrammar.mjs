// risoGrammar.mjs — RISO icon grammar (#2008): Martens-style icons composed by rule.
//
// Matt's ruling (2026-11-07, spec riso-glyph-expansion-spec-2026-11-07.md): the icons are
// composed by a GENERATIVE GRAMMAR from a small kit of primitive marks — seeded,
// deterministic, named constants for the grammar's quantities — NOT a fixed authored
// deck. This module is that grammar. It is pure: no clock, no Math.random, no globals.
// The same (seed, index) always composes the same icon, byte for byte.
//
// STORED vs RECOMPUTED (the spec's flagged question (a), settled by the stamp-bake
// survey — see STAGING-REPORT-2008.md): RECOMPUTED, on the RAY GUN precedent
// (poets/rayGunForm.js: the treated stamp list is never stored; the record is stored
// and the blast is recomputed from it on every draw). A composed icon is a pure
// function of (grammar, seed, index), so what persists anywhere is only the seed;
// the SVG is recomputed on demand. The one materialized artefact is the canonical
// set (data/assets/assets-riso.js), generated from RISO_CANON_SEED at module load
// exactly the way the pixel glyphs materialize from their grids — and the grammar
// selfcheck pins that the materialized set equals a fresh recomputation, so the
// catalogue can never drift from the grammar.
//
// MARKS, NOT LETTERFORMS: the kit holds only geometric marks (disc, ring, target,
// bars, cross, pixel square, arc, wedge). No primitive can render a letterform and
// no SVG this module emits contains <text> — the typography two-pole law is untouched.
//
// GEOMETRY: integer-only. Every coordinate, size and stroke below is an integer on
// the 100x100 asset viewBox, so a composed SVG is byte-stable by construction (no
// float formatting anywhere in the output).

import { mkRng } from './prng.js';
import { hashU32 } from './kernel/rng.js';

/** The canonical seed the catalogue set is composed from. A take that wants another
 *  family re-seeds; the grammar + seed fully determine every icon either way. */
export const RISO_CANON_SEED = 2008;
/** How many icons the canonical catalogue set holds. */
export const RISO_ICON_SET_SIZE = 24;
/** The grammar's version. Bumping it re-composes every icon; takes pin it beside the seed. */
export const RISO_GRAMMAR_VERSION = 1;

/** Anchor positions on the 3x3 composition grid, in asset units. */
export const RISO_ANCHORS = Object.freeze([25, 50, 75]);
/** Part sizes (radius / half-extent, asset units), smallest to largest. */
export const RISO_SIZE_TIERS = Object.freeze([9, 14, 20, 28]);
/** Stroke widths the kit draws with, asset units. */
export const RISO_STROKE_TIERS = Object.freeze([4, 6, 9]);
/** Rotation detents for a part, degrees. Quarter turns only — the Martens grid discipline. */
export const RISO_ROT_DETENTS = Object.freeze([0, 90, 180, 270]);
/** Most parts one icon may hold (the orbit rule: a centre + four satellites). */
export const RISO_MAX_PARTS = 5;
/** Probability a part draws in the accent slot instead of ink. */
export const RISO_ACCENT_SLOT_PROBABILITY = 0.22;
/** Probability the stack rule deals three marks instead of two. */
export const RISO_STACK_TRIPLE_PROBABILITY = 0.5;
/** The frame rule's outer ring size (radius, asset units). */
export const RISO_FRAME_OUTER_SIZE = 34;
/** Inset coordinate pair (asset units) the pair and grid rules place marks on —
 *  tighter than the anchor grid. */
export const RISO_INSET_COORDS = Object.freeze([28, 72]);
/** Coordinate pair (asset units) the two-mark stack deals on. */
export const RISO_STACK_PAIR_COORDS = Object.freeze([32, 68]);
/** Satellites the orbit rule deals: this minimum plus a seeded span (3 or 4). */
export const RISO_ORBIT_SATELLITE_MIN = 3;
export const RISO_ORBIT_SATELLITE_SPAN = 2;
/** Largest set `risoIconSet` will compose in one call (a safety bound, not a deal size). */
export const RISO_SET_COUNT_MAX = 256;

// ---------------------------------------------------------------------------
// The kit — primitive marks. Each builder takes (cx, cy, size, slot) and returns an
// SVG fragment; `slot` is the CSS var the bake substitutes ('var(--ink)' body,
// 'var(--accent)' speck — the library's two-slot convention).
// ---------------------------------------------------------------------------

const INK = 'var(--ink)';
const ACC = 'var(--accent)';

const KIT_BUILDERS = {
  disc: (cx, cy, s, slot) => `<circle cx="${cx}" cy="${cy}" r="${s}" fill="${slot}"/>`,
  ring: (cx, cy, s, slot, w) =>
    `<circle cx="${cx}" cy="${cy}" r="${s}" fill="none" stroke="${slot}" stroke-width="${w}"/>`,
  target: (cx, cy, s, slot, w) =>
    `<circle cx="${cx}" cy="${cy}" r="${s}" fill="none" stroke="${slot}" stroke-width="${w}"/><circle cx="${cx}" cy="${cy}" r="${Math.max(3, Math.round(s / 3))}" fill="${slot}"/>`,
  plus: (cx, cy, s, slot, w) =>
    `<g stroke="${slot}" stroke-width="${w}" stroke-linecap="square"><path d="M${cx - s} ${cy} L${cx + s} ${cy}"/><path d="M${cx} ${cy - s} L${cx} ${cy + s}"/></g>`,
  cross: (cx, cy, s, slot, w) =>
    `<g stroke="${slot}" stroke-width="${w}" stroke-linecap="square"><path d="M${cx - s} ${cy - s} L${cx + s} ${cy + s}"/><path d="M${cx - s} ${cy + s} L${cx + s} ${cy - s}"/></g>`,
  pixel: (cx, cy, s, slot) => `<rect x="${cx - s}" y="${cy - s}" width="${s * 2}" height="${s * 2}" fill="${slot}"/>`,
  arc: (cx, cy, s, slot, w) =>
    `<path d="M${cx - s} ${cy} A${s} ${s} 0 0 1 ${cx + s} ${cy}" fill="none" stroke="${slot}" stroke-width="${w}" stroke-linecap="square"/>`,
  wedge: (cx, cy, s, slot) => `<path d="M${cx} ${cy - s} L${cx + s} ${cy + s} L${cx - s} ${cy + s} Z" fill="${slot}"/>`,
};

/** The kit census: the primitive marks the grammar may compose from. */
export const RISO_KIT = Object.freeze(Object.keys(KIT_BUILDERS));

// ---------------------------------------------------------------------------
// The rules — composition shapes. Each rule consumes the rng stream in a FIXED
// order (parts left-to-right, each part: kit, size, rotation, slot), so the stream
// position never depends on a drawn value's branch.
// ---------------------------------------------------------------------------

function drawPart(rng, cx, cy, sizeTierCap) {
  const kit = RISO_KIT[Math.min(RISO_KIT.length - 1, Math.floor(rng() * RISO_KIT.length))];
  const tier = Math.min(sizeTierCap, Math.floor(rng() * RISO_SIZE_TIERS.length));
  const size = RISO_SIZE_TIERS[Math.max(0, tier)];
  const rot = RISO_ROT_DETENTS[Math.min(RISO_ROT_DETENTS.length - 1, Math.floor(rng() * RISO_ROT_DETENTS.length))];
  const slot = rng() < RISO_ACCENT_SLOT_PROBABILITY ? ACC : INK;
  const stroke =
    RISO_STROKE_TIERS[Math.min(RISO_STROKE_TIERS.length - 1, Math.floor(rng() * RISO_STROKE_TIERS.length))];
  return { kit, cx, cy, size, rot, slot, stroke };
}

const RULE_BUILDERS = {
  // One bold mark, centred, large.
  single: (rng) => [drawPart(rng, RISO_ANCHORS[1], RISO_ANCHORS[1], 3)],
  // Two marks side by side on the middle row.
  pair: (rng) => [
    drawPart(rng, RISO_INSET_COORDS[0], RISO_ANCHORS[1], 2),
    drawPart(rng, RISO_INSET_COORDS[1], RISO_ANCHORS[1], 2),
  ],
  // Two or three marks down the middle column.
  stack: (rng) => {
    const three = rng() < RISO_STACK_TRIPLE_PROBABILITY;
    const ys = three ? RISO_ANCHORS : RISO_STACK_PAIR_COORDS;
    return ys.map((y) => drawPart(rng, RISO_ANCHORS[1], y, three ? 1 : 2));
  },
  // A centre mark with three or four satellites on the anchor ring.
  orbit: (rng) => {
    const parts = [drawPart(rng, RISO_ANCHORS[1], RISO_ANCHORS[1], 2)];
    const corners = [
      [RISO_ANCHORS[0], RISO_ANCHORS[0]],
      [RISO_ANCHORS[2], RISO_ANCHORS[0]],
      [RISO_ANCHORS[0], RISO_ANCHORS[2]],
      [RISO_ANCHORS[2], RISO_ANCHORS[2]],
    ];
    const n = RISO_ORBIT_SATELLITE_MIN + Math.floor(rng() * RISO_ORBIT_SATELLITE_SPAN);
    for (let i = 0; i < n; i++) parts.push(drawPart(rng, corners[i][0], corners[i][1], 1));
    return parts;
  },
  // Four small marks on the 2x2 inset cells.
  grid: (rng) =>
    [
      [RISO_INSET_COORDS[0], RISO_INSET_COORDS[0]],
      [RISO_INSET_COORDS[1], RISO_INSET_COORDS[0]],
      [RISO_INSET_COORDS[0], RISO_INSET_COORDS[1]],
      [RISO_INSET_COORDS[1], RISO_INSET_COORDS[1]],
    ].map(([x, y]) => drawPart(rng, x, y, 1)),
  // A framing ring with one centred mark inside it.
  frame: (rng) => {
    const outer = {
      kit: 'ring',
      cx: RISO_ANCHORS[1],
      cy: RISO_ANCHORS[1],
      size: RISO_FRAME_OUTER_SIZE,
      rot: RISO_ROT_DETENTS[0],
      slot: INK,
      stroke: RISO_STROKE_TIERS[1],
    };
    // Consume the same per-part draws so the stream shape is uniform across rules.
    drawPart(rng, RISO_ANCHORS[1], RISO_ANCHORS[1], 0);
    return [outer, drawPart(rng, RISO_ANCHORS[1], RISO_ANCHORS[1], 2)];
  },
};

/** The rule census: the composition shapes the grammar may deal. */
export const RISO_RULES = Object.freeze(Object.keys(RULE_BUILDERS));

/** Render one part to its SVG fragment (rotation wraps the fragment when non-zero). */
function partSvg(part) {
  const body = KIT_BUILDERS[part.kit](part.cx, part.cy, part.size, part.slot, part.stroke);
  return part.rot ? `<g transform="rotate(${part.rot} ${part.cx} ${part.cy})">${body}</g>` : body;
}

/**
 * Compose one icon. Pure and deterministic: the same (seed, index) always returns
 * the same record, byte for byte.
 * @returns {{ seed:number, index:number, rule:string, parts:Array, svg:string }}
 */
export function composeRisoIcon(seed, index) {
  const s = seed >>> 0 || RISO_CANON_SEED;
  const i = Math.max(0, index | 0);
  const rng = mkRng(hashU32(s, 'riso-icon', i) || 1);
  const rule = RISO_RULES[Math.min(RISO_RULES.length - 1, Math.floor(rng() * RISO_RULES.length))];
  const parts = RULE_BUILDERS[rule](rng);
  const svg = parts.map(partSvg).join('');
  return { seed: s, index: i, rule, parts, svg };
}

/** The catalogue id for one composed icon. */
export const risoIconId = (seed, index) => `riso_${(seed >>> 0 || RISO_CANON_SEED).toString(36)}_${index | 0}`;

/**
 * One composed icon as a catalogue record — the exact asset shape the stamp bake
 * consumes ({ id, category, tags, weight, density, scale, rotate, svg }), so the
 * FIELD/pattern machinery instances it identically to a deck stamp.
 */
export function risoIconRecord(seed, index) {
  const icon = composeRisoIcon(seed, index);
  return {
    id: risoIconId(seed, index),
    category: 'stamps',
    tags: ['riso', 'grain'], // both canonicalize to 'print' — the riso family is a print family
    weight: 'medium',
    density: 'medium',
    scale: [0.4, 1.2],
    rotate: 'free',
    svg: icon.svg,
    riso: { seed: icon.seed, index: icon.index, rule: icon.rule, grammar: RISO_GRAMMAR_VERSION },
  };
}

/** A whole composed set: `count` records from one seed, in index order. */
export function risoIconSet(seed = RISO_CANON_SEED, count = RISO_ICON_SET_SIZE) {
  const n = Math.max(0, Math.min(RISO_SET_COUNT_MAX, count | 0));
  return Array.from({ length: n }, (_, i) => risoIconRecord(seed, i));
}

/** djb2-xor over a string — the byte-level set fingerprint the selfcheck pins. */
export function risoHashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

/** Byte-level fingerprint of a composed set (ids + SVGs, in order). */
export function risoSetHash(seed = RISO_CANON_SEED, count = RISO_ICON_SET_SIZE) {
  return risoHashString(
    risoIconSet(seed, count)
      .map((r) => `${r.id}|${r.svg}`)
      .join('\n'),
  );
}

/** Grammar census, for pins: kit size, rule count, part bounds, detent counts. */
export const RISO_CENSUS = Object.freeze({
  kit: RISO_KIT.length,
  rules: RISO_RULES.length,
  maxParts: RISO_MAX_PARTS,
  sizeTiers: RISO_SIZE_TIERS.length,
  strokeTiers: RISO_STROKE_TIERS.length,
  rotDetents: RISO_ROT_DETENTS.length,
  setSize: RISO_ICON_SET_SIZE,
});
