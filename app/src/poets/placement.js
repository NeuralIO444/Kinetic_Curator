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
// no stamp) — the charset law: only A-Z + 0-9 exist as typ_* stamps.
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

/** The 36 letter stamps that exist. Any other character has no stamp. */
export const LETTER_STAMP_IDS = Object.freeze(new Set(ASSETS_LETTERS.map((a) => a.id)));

/** 'A' -> 'typ_A', '7' -> 'typ_7'; anything else -> null (no stamp exists). */
export function stampIdForChar(ch) {
  const id = `typ_${ch}`;
  return LETTER_STAMP_IDS.has(id) ? id : null;
}

/** True when every non-space character of the line maps to an existing stamp. */
export function lineMapsToStamps(line) {
  for (const ch of String(line)) {
    if (ch === ' ') continue;
    if (!stampIdForChar(ch)) return false;
  }
  return true;
}

export const PLACEMENT_LAYOUTS = Object.freeze(['grid', 'bands', 'single', 'two', 'square']);

const ADV = 0.62; // glyph advance, em units (condensed grotesque)
const SPACE_ADV = 0.42; // a space: a gap, wider than nothing, narrower than a glyph
const MARGIN = 0.05; // dish margin, height units
const MAX_W = 0.88; // module max width, fraction of dish width (in height units: * aspect)
const MAX_H = 0.88; // module max height, fraction of dish height

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Advance width of a line in em units (spaces count as gaps). */
function lineAdvanceEm(line, adv, spaceAdv) {
  let w = 0;
  for (const ch of line) w += ch === ' ' ? spaceAdv : adv;
  return w;
}

/** Lay one line's stamps along a baseline. Returns stamps in unit space. */
function layLine(line, { ox, oy, em, adv, spaceAdv }) {
  const out = [];
  let cursor = 0;
  for (const ch of line) {
    const a = ch === ' ' ? spaceAdv : adv;
    if (ch !== ' ') {
      out.push(
        Object.freeze({
          assetId: stampIdForChar(ch),
          ch,
          x: ox + (cursor + adv / 2) * em,
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
    let em = 0.042 + 0.02 * density;
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
    const adv = ADV * (1 + 0.25 * density);
    let em = 0.04 + 0.018 * density;
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
    const adv = ADV;
    let em = 0.036 + 0.022 * density;
    const wEm = lineAdvanceEm(joined, adv, SPACE_ADV);
    em = fitEm(em, wEm, 1, asp);
    const { ox, oy } = moduleOrigin(draw, wEm * em, em, asp);
    stamps = layLine(joined, { ox, oy: oy + 0.5 * em, em, adv, spaceAdv: SPACE_ADV });
  } else if (layout === 'two') {
    // Two-line module, locked baselines, generous negative space.
    const adv = ADV;
    let em = 0.036 + 0.02 * density;
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
    let em = cellsWide > 0 ? (0.34 + 0.4 * density) / cellsWide : 0.05;
    const wEm = cellsWide; // in cell units where 1 cell == 1 em of advance
    const hEm = lines.length;
    em = fitEm(em, wEm, hEm, asp);
    const raw = moduleOrigin(draw, wEm * em, hEm * em, asp);
    const ox = Math.round(raw.ox / em) * em;
    const oy = Math.round(raw.oy / em) * em;
    lines.forEach((line, r) => {
      let cell = 0;
      for (const ch of line) {
        if (ch !== ' ') {
          stamps.push(
            Object.freeze({
              assetId: stampIdForChar(ch),
              ch,
              x: ox + (cell + 0.5) * em,
              y: oy + (r + 0.5) * em,
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
