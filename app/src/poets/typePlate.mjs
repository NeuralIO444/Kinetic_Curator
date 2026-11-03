// poets/typePlate.mjs — #1928: the FIELD poem as a clean TYPE PLATE (Matt ruling, 2026-11-02).
//
// The poem is no longer marks on the dish. It is a plate: properly spaced type (poets/placement.js measures every
// glyph), held still, exempt from mirror / symmetry, ACCUM trails and FX finish chains, drawn over the finished frame
// on a quiet backing that guarantees it reads against whatever the stage is doing.
//
// This module is the pure half. `plateFromForm` turns a layer's fieldForm (document data, unchanged — no migration)
// and that layer's palette into a plate record in FRACTIONS of the frame (x of width, y and cap of height), so the
// renderer draws it at any target size. `paintPlate` draws a plate onto a 2D context with the baked glyph outlines
// (the same Anton paths the letter stamps carry), so what plays is what renders: the renderer composites the painted
// plate after the resolve on every exit — the live canvas and every byte readback (stills, captures, takes).

import { sanitizeFieldForm } from './fieldForm.js';
import { GLYPH_CAP_UNITS, glyphWidthEm } from './placement.js';
import { ASSETS_LETTERS } from '../data/assets/assets-letterforms.js';

/** The backing's opacity: quiet, but enough that ink always clears the marks behind it. */
export const PLATE_BACKING_ALPHA = 0.86;
/** Padding around the type block, in cap heights. */
export const PLATE_PAD_CAPS = 0.55;
/** Ink must clear the backing by at least this WCAG contrast ratio; otherwise the best-contrast palette colour wins. */
export const PLATE_MIN_CONTRAST = 4.5;

/** Each letter's outline as SVG path data in its 100-unit box (cap height y 10..90). */
export const GLYPH_PATHS = Object.freeze(
  Object.fromEntries(
    ASSETS_LETTERS.map((a) => [a.id.slice(4), (a.svg.match(/d="([^"]+)"/g) || []).map((m) => m.slice(3, -1)).join(' ')]),
  ),
);

const HEX = /^#[0-9a-fA-F]{6}$/;
const lin = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
/** Relative luminance of a #rrggbb colour (WCAG). */
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
/** WCAG contrast ratio between two #rrggbb colours. */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The plate's colours from a palette: the backing is the palette's ground (bg); the ink is the palette's ink when it
 * clears the ground, else the palette colour (ink or a swatch) with the best contrast, else pure black/white.
 */
export function plateColours(palette) {
  const bg = palette && HEX.test(palette.bg) ? palette.bg : '#000000';
  const candidates = [palette?.ink, ...(Array.isArray(palette?.swatches) ? palette.swatches : [])].filter(
    (c) => typeof c === 'string' && HEX.test(c),
  );
  let ink = candidates[0] && contrast(candidates[0], bg) >= PLATE_MIN_CONTRAST ? candidates[0] : null;
  if (!ink) {
    let best = null;
    for (const c of candidates) if (!best || contrast(c, bg) > contrast(best, bg)) best = c;
    ink = best && contrast(best, bg) >= PLATE_MIN_CONTRAST ? best : luminance(bg) > 0.18 ? '#000000' : '#ffffff';
  }
  return { ink: ink.toLowerCase(), backing: bg.toLowerCase() };
}

/**
 * A layer's form → its plate, or null (silence: no form, or a form its door refuses). Fractions of the frame:
 * glyph { ch, x, y, cap } centres; backing { x0, y0, x1, y1 } the padded bounds of the type, clamped to the frame.
 */
export function plateFromForm(fieldForm, palette) {
  const form = sanitizeFieldForm(fieldForm);
  if (!form) return null;
  const glyphs = form.stamps.map((s) => ({ ch: s.ch, x: s.x / form.aspect, y: s.y, cap: s.em }));
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let cap = 0;
  for (const s of form.stamps) {
    const hw = (glyphWidthEm(s.ch) * s.em) / 2;
    x0 = Math.min(x0, (s.x - hw) / form.aspect);
    x1 = Math.max(x1, (s.x + hw) / form.aspect);
    y0 = Math.min(y0, s.y - s.em / 2);
    y1 = Math.max(y1, s.y + s.em / 2);
    cap = Math.max(cap, s.em);
  }
  const padY = cap * PLATE_PAD_CAPS;
  const padX = padY / form.aspect;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const { ink, backing } = plateColours(palette);
  const plate = {
    poetId: form.poetId,
    pieceId: form.pieceId,
    glyphs,
    ink,
    backing: { x0: clamp01(x0 - padX), y0: clamp01(y0 - padY), x1: clamp01(x1 + padX), y1: clamp01(y1 + padY) },
    backingColour: backing,
    backingAlpha: PLATE_BACKING_ALPHA,
  };
  return { ...plate, key: plateKey(plate) };
}

/**
 * A plate's identity for texture caching: the poem and its geometry ONLY. Colours are not in the key — the texture
 * is a coverage mask the renderer tints per frame — so a palette change or a voice MIX (which animates the palette's
 * bg/ink every frame) never repaints the plate (#1928 review).
 */
export function plateKey(plate) {
  const r = (v) => Math.round(v * 1e5);
  const b = plate.backing;
  return [
    plate.poetId,
    plate.pieceId,
    `${r(b.x0)},${r(b.y0)},${r(b.x1)},${r(b.y1)}`,
    ...plate.glyphs.map((g) => `${g.ch}${r(g.x)},${r(g.y)},${r(g.cap)}`),
  ].join('|');
}

/**
 * "The poem", singular (Matt's ruling): from the per-layer plates in layer order, identical plates are one plate (a
 * layer with no snapshot of its own inherits the live poem, so the same poem can stand on several layers), and when
 * distinct poems stand the TOP-most is the one drawn. Returns the plate, or null.
 */
export function selectPlate(plates) {
  const list = (plates || []).filter(Boolean);
  return list.length ? list[list.length - 1] : null;
}

/** The mask's channels: glyph coverage in red, backing-only coverage in green (the renderer tints both). */
export const MASK_GLYPH = '#ff0000';
export const MASK_BACKING = '#00ff00';

/**
 * Paint a plate's COVERAGE MASK onto a 2D context of size w × h (top-left origin): the backing in pure green, then
 * each glyph's outline in pure red over it, scaled so its cap height is exactly `cap` of the frame height and centred
 * on its placed point. Uploaded premultiplied, red = glyph coverage and green = backing-only coverage, and the plate
 * shader tints them with the frame's ink and backing colours — so colour never repaints the mask. Pure drawing: no
 * clock, no randomness. `Path2DImpl` is injectable for tests.
 */
export function paintPlateMask(ctx, plate, w, h, Path2DImpl = globalThis.Path2D) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!plate) return;
  ctx.globalAlpha = 1;
  ctx.fillStyle = MASK_BACKING;
  const b = plate.backing;
  ctx.fillRect(b.x0 * w, b.y0 * h, (b.x1 - b.x0) * w, (b.y1 - b.y0) * h);
  ctx.fillStyle = MASK_GLYPH;
  for (const g of plate.glyphs) {
    const d = GLYPH_PATHS[g.ch];
    if (!d) continue;
    const k = (g.cap * h) / GLYPH_CAP_UNITS;
    ctx.setTransform(k, 0, 0, k, g.x * w - 50 * k, g.y * h - 50 * k);
    ctx.fill(new Path2DImpl(d));
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** '#rrggbb' → [r, g, b] in 0..1 (display-referred: the plate composites after the resolve). */
export const hexToUnit = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
