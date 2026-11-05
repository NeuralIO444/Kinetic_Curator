// poets/placement.js — FIELD S1 (#1902): the pure placement function.
//
// piece + layout mode + seeded rng -> a frozen stamp list in unit dish space.
// No stage, no clock, no Math.random: the rng is the caller's seeded stream, so
// a placement replays bit-for-bit (spec: "Deterministic. Seeded RNG only.").
//
// Unit dish space: y in [0, 1] (fraction of dish height, downward — canvas
// convention), x in [0, aspect] in HEIGHT units (x_px = x / aspect * canvasW),
// so a square module is square on a dish of the given aspect. Each stamp:
//   { assetId, ch, x, y, rotation, em }
// x/y are the stamp CENTRE; em is the glyph cap height as a fraction of dish
// height; rotation is degrees and is 0 under every shipped recipe (all four
// poets forbid free rotation — the value exists so the invariant is checkable).
//
// Glyph metrics: Anton is a condensed grotesque; letters sit on a shared
// advance so lines are measurable. A space is a placement GAP (wider advance,
// no stamp) — the charset law: A-Z + 0-9 exist as letter stamps, and (#1982)
// the kana set exists as poem-only stamps for eligible Teijo deals; any other
// character has no stamp and a line carrying one does not map.
//
// Recipes (spec table, docs/design/field-poets-spec-2026-10-31.md):
//   grid   Greenleaf — strict grid, even spacing, no rotation.
//   bands  Greenleaf/Teijo — stratified bands, locked baseline per line.
//   single Teijo/Gibson — one line module (the piece's lines joined by gaps),
//          locked baseline, generous negative space.
//   two    Gibson — two-line module, locked baselines, generous negative space.
//   square Rosselli — square CELLS packed edge-to-edge on both axes, module
//          origin snapped to the cell grid, no free rotation.
// Density scales spacing / module size monotonically per recipe (the spec's
// hot/cool behaviour in data form); it never changes the recipe's constraints.

import { ASSETS_LETTERS } from '../data/assets/assets-letterforms.js';
import { ASSETS_KANA } from '../data/assets/assets-kana.js';

/** The 36 letter stamps that exist. Any other character has no stamp. */
export const LETTER_STAMP_IDS = Object.freeze(new Set(ASSETS_LETTERS.map((a) => a.id)));

/** 'A' -> 'typ_A', '7' -> 'typ_7'; anything else -> null (no stamp exists). */
export function stampIdForChar(ch) {
  const id = `typ_${ch}`;
  return LETTER_STAMP_IDS.has(id) ? id : null;
}

/**
 * #1982 (FIELD stamps slice 1) — the kana stamps: 163 poem-only stamps baked
 * from the kana pack (46 basic + 25 dakuten/handakuten + 10 small per script,
 * plus the long-vowel mark). They exist for the poem system alone: the pack
 * joins the catalogue after the authored bake so the census and the stage
 * atlas resolve them, and the pool panel (panels/assetPoolLogic.js) and the
 * placeable pool (gl/liveResolve.mjs) exclude them by this same id set.
 */
export const KANA_STAMP_IDS = Object.freeze(new Set(ASSETS_KANA.map((a) => a.id)));
const KANA_ID_BY_CHAR = new Map(ASSETS_KANA.map((a) => [a.glyph, a.id]));

/** 'あ' -> 'typ_h_a', 'ガ' -> 'typ_k_ga'; anything else -> null (no kana stamp exists). */
export function kanaStampIdForChar(ch) {
  return KANA_ID_BY_CHAR.get(ch) ?? null;
}

/** Any glyph the poem system can stamp: a letter/digit stamp or a kana stamp. */
export function stampIdForGlyph(ch) {
  return stampIdForChar(ch) ?? kanaStampIdForChar(ch);
}

/** True when every non-space character of the line maps to an existing stamp. */
export function lineMapsToStamps(line) {
  for (const ch of String(line)) {
    if (ch === ' ') continue;
    if (!stampIdForGlyph(ch)) return false;
  }
  return true;
}

export const PLACEMENT_LAYOUTS = Object.freeze(['grid', 'bands', 'single', 'two', 'square']);

/**
 * #1928 — the type plate's metrics are MEASURED from the baked glyphs, not guessed. Every letter stamp is drawn in a
 * 100-unit box with its cap height spanning GLYPH_CAP_UNITS (y 10..90), so 1 em of cap height = 80 box units. A glyph's
 * advance is its own ink width plus TRACK — proportional, so an M or W never overruns its neighbour (the old flat 0.62 em
 * advance was narrower than M/W at 0.78–0.80 em, and with the stage scale 2.3x too large every word collided).
 */
export const GLYPH_CAP_UNITS = 80;
const inkWidthEm = (svg) => {
  const nums = (svg.match(/d="([^"]+)"/g) || []).join(' ').match(/-?\d+(?:\.\d+)?/g) || [];
  const xs = nums.filter((_, i) => i % 2 === 0).map(Number);
  return xs.length ? (Math.max(...xs) - Math.min(...xs)) / GLYPH_CAP_UNITS : 0.5;
};
const GLYPH_W = (() => {
  const out = {};
  for (const a of ASSETS_LETTERS) out[a.id.slice(4)] = inkWidthEm(a.svg);
  // #1982 — kana measured by the same ruler (the kana pack bakes to the same
  // 100-unit box, body height = GLYPH_CAP_UNITS), keyed by the glyph itself.
  for (const a of ASSETS_KANA) out[a.glyph] = inkWidthEm(a.svg);
  return Object.freeze(out);
})();
/**
 * The widest LETTER's ink width, em units (W). The grid and square recipes use it as their even
 * cell — deliberately letters only: those recipes are the Latin poets' (Greenleaf's grid,
 * Rosselli's quadro), and a kana deal rides the proportional recipes (bands/single), where each
 * glyph advances by its own measured width. Kana widths never move a Latin placement.
 */
export const GLYPH_MAX_W = Math.max(...ASSETS_LETTERS.map((a) => GLYPH_W[a.id.slice(4)]));
/** A glyph's ink width in em units (0 for a space or a character with no stamp). */
export const glyphWidthEm = (ch) => GLYPH_W[ch] ?? 0;
const TRACK = 0.16; // letterspacing between glyphs, em units — air a plate reads through
const ADV = GLYPH_MAX_W + TRACK; // the grid's even cell: the widest glyph plus tracking, so no glyph overruns
/**
 * Rosselli's square cell, in em (cap heights), on BOTH axes: wide enough for the widest glyph plus tracking, and a
 * touch of leading so packed rows never kiss. Cells stay square and edge-to-edge — the quadro is the cell grid.
 */
export const SQUARE_CELL = Math.max(1.12, GLYPH_MAX_W + TRACK);
const SPACE_ADV = 0.42; // a space: a gap, wider than nothing, narrower than a glyph
const MARGIN = 0.05; // dish margin, height units
const MAX_W = 0.88; // module max width, fraction of dish width (in height units: * aspect)
const MAX_H = 0.88; // module max height, fraction of dish height

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * A glyph's advance in em units. `adv` null = proportional (its own width + TRACK); a number = an even cell (grid),
 * which must be at least the glyph's width + TRACK, so even cells never overlap either.
 */
const advanceOf = (ch, adv, spaceAdv) =>
  ch === ' '
    ? adv == null
      ? spaceAdv
      : adv // on a strict grid a word break is one empty cell, so words never run together
    : adv == null
      ? glyphWidthEm(ch) + TRACK
      : Math.max(adv, glyphWidthEm(ch) + TRACK);

/** Advance width of a line in em units (spaces count as gaps). The last glyph's tracking is not counted. */
function lineAdvanceEm(line, adv, spaceAdv) {
  let w = 0;
  for (const ch of line) w += advanceOf(ch, adv, spaceAdv);
  return Math.max(0, w - (line.length && line.at(-1) !== ' ' ? TRACK : 0));
}

/** Lay one line's stamps along a baseline. Returns stamps in unit space. */
function layLine(line, { ox, oy, em, adv, spaceAdv }) {
  const out = [];
  let cursor = 0;
  for (const ch of line) {
    const a = advanceOf(ch, adv, spaceAdv);
    if (ch !== ' ') {
      out.push(
        Object.freeze({
          assetId: stampIdForGlyph(ch),
          ch,
          // the glyph's ink centred in its own advance (minus the trailing track)
          x: ox + (cursor + (a - TRACK) / 2) * em,
          y: oy,
          rotation: 0,
          em,
        }),
      );
    }
    cursor += a;
  }
  return out;
}

/** Seeded module origin: uniform inside the margins, module fully on the dish. */
function moduleOrigin(rng, w, h, aspect) {
  const spanX = Math.max(0, aspect - 2 * MARGIN - w);
  const spanY = Math.max(0, 1 - 2 * MARGIN - h);
  return { ox: MARGIN + rng() * spanX, oy: MARGIN + rng() * spanY };
}

/** Shrink em so the module fits the dish's fit box; returns the fit em. */
function fitEm(em, wEm, hEm, aspect) {
  let f = em;
  const w = wEm * f;
  if (w > MAX_W * aspect) f *= (MAX_W * aspect) / w;
  const h = hEm * f;
  if (h > MAX_H) f *= MAX_H / h;
  return f;
}

/**
 * Place one piece. `piece` is a deck entry { id, lines, layout, density }
 * (density may be the deal's adjusted value). `rng` is a seeded () => [0,1).
 * Draw order is fixed per recipe and documented per branch — a given
 * (piece, seed) always deals the same form.
 */
export function placePiece(piece, rng, { aspect = 10 / 7 } = {}) {
  const lines = Array.isArray(piece?.lines) ? piece.lines.map((l) => String(l)) : [];
  const layout = PLACEMENT_LAYOUTS.includes(piece?.layout) ? piece.layout : 'bands';
  const density = clamp01(piece?.density ?? 0.4);
  const draw = typeof rng === 'function' ? rng : () => 0.5;
  const asp = Number.isFinite(aspect) && aspect > 0 ? aspect : 10 / 7;

  let stamps = [];
  if (layout === 'grid') {
    // Even advance for every glyph (the grid is the law); spacing widens a
    // little with density (Greenleaf hot: "slightly wider spacing").
    const adv = ADV * (1 + 0.35 * density);
    let em = 0.062 + 0.03 * density; // #1928: em is now TRUE cap height (exact stage scale); sized to read as a plate
    const pitchEm = 1.5;
    const wEm = Math.max(0, ...lines.map((l) => lineAdvanceEm(l, adv, SPACE_ADV)));
    const hEm = lines.length > 0 ? (lines.length - 1) * pitchEm + 1 : 0;
    em = fitEm(em, wEm, hEm, asp);
    const { ox, oy } = moduleOrigin(draw, wEm * em, hEm * em, asp);
    lines.forEach((line, r) => {
      stamps.push(...layLine(line, { ox, oy: oy + (r * pitchEm + 0.5) * em, em, adv, spaceAdv: SPACE_ADV }));
    });
  } else if (layout === 'bands') {
    // Stratified bands: each line its own band on a locked baseline, bands
    // separated by air; each band's x-offset is dealt (stratified, not justified).
    const adv = null; // #1928: proportional (each band is a run of type, not a grid)
    let em = 0.06 + 0.027 * density;
    const pitchEm = 1.9;
    const wEm = Math.max(0, ...lines.map((l) => lineAdvanceEm(l, adv, SPACE_ADV)));
    const hEm = lines.length > 0 ? (lines.length - 1) * pitchEm + 1 : 0;
    em = fitEm(em, wEm, hEm, asp);
    const { ox, oy } = moduleOrigin(draw, wEm * em, hEm * em, asp);
    lines.forEach((line, r) => {
      const lw = lineAdvanceEm(line, adv, SPACE_ADV) * em;
      const slack = Math.max(0, wEm * em - lw);
      const lineOx = ox + draw() * slack;
      stamps.push(...layLine(line, { ox: lineOx, oy: oy + (r * pitchEm + 0.5) * em, em, adv, spaceAdv: SPACE_ADV }));
    });
  } else if (layout === 'single') {
    // One-line module: the piece's lines join into a single locked baseline
    // (line breaks become gaps). Generous negative space: the module is
    // small against the dish and fit-clamped well inside it.
    const joined = lines.join(' ');
    const adv = null; // #1928: proportional
    let em = 0.054 + 0.033 * density;
    const wEm = lineAdvanceEm(joined, adv, SPACE_ADV);
    em = fitEm(em, wEm, 1, asp);
    const { ox, oy } = moduleOrigin(draw, wEm * em, em, asp);
    stamps = layLine(joined, { ox, oy: oy + 0.5 * em, em, adv, spaceAdv: SPACE_ADV });
  } else if (layout === 'two') {
    // Two-line module, locked baselines, generous negative space.
    const adv = null; // #1928: proportional
    let em = 0.054 + 0.03 * density;
    const pitchEm = 1.45;
    const wEm = Math.max(0, ...lines.map((l) => lineAdvanceEm(l, adv, SPACE_ADV)));
    const hEm = lines.length > 0 ? (lines.length - 1) * pitchEm + 1 : 0;
    em = fitEm(em, wEm, hEm, asp);
    const { ox, oy } = moduleOrigin(draw, wEm * em, hEm * em, asp);
    lines.forEach((line, r) => {
      stamps.push(...layLine(line, { ox, oy: oy + (r * pitchEm + 0.5) * em, em, adv, spaceAdv: SPACE_ADV }));
    });
  } else {
    // square — Rosselli: square cells (advance == pitch == em in cell units),
    // letters packed edge-to-edge, module origin snapped to the cell grid.
    const cellOf = (line) => [...line].length; // every character is one cell; spaces are empty cells
    const cellsWide = Math.max(0, ...lines.map(cellOf));
    // #1928: a cell is square and must hold the widest glyph with tracking, so the cell is CELL em on both axes
    // (letters still pack edge-to-edge on the cell grid — Rosselli's quadro — but never into each other).
    const CELL = SQUARE_CELL;
    let em = cellsWide > 0 ? (0.34 + 0.4 * density) / (cellsWide * CELL) : 0.05;
    const wEm = cellsWide * CELL;
    const hEm = lines.length * CELL;
    em = fitEm(em, wEm, hEm, asp);
    const raw = moduleOrigin(draw, wEm * em, hEm * em, asp);
    const step = CELL * em;
    // snap to the cell grid; if the snap pushed the module past the far margin, step back whole cells — the origin
    // stays on the grid and the module stays on the dish
    let ox = Math.round(raw.ox / step) * step;
    let oy = Math.round(raw.oy / step) * step;
    while (ox + wEm * em > asp - MARGIN + 1e-12 && ox - step >= 0) ox -= step;
    while (oy + hEm * em > 1 - MARGIN + 1e-12 && oy - step >= 0) oy -= step;
    lines.forEach((line, r) => {
      let cell = 0;
      for (const ch of line) {
        if (ch !== ' ') {
          stamps.push(
            Object.freeze({
              assetId: stampIdForGlyph(ch),
              ch,
              x: ox + (cell + 0.5) * step,
              y: oy + (r + 0.5) * step,
              rotation: 0,
              em,
            }),
          );
        }
        cell += 1;
      }
    });
  }

  return Object.freeze({ layout, stamps: Object.freeze(stamps) });
}
