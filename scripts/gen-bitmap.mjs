// Bitmap stamp pack generator — Persona Kernel P5 · HYBRID's bitmap type (#2385): one coarse-pixel variant of every
// treatable Latin letter, POEM-ONLY.
//
// The FONT RULING (glyph SHAPE changes are baked variants; runtime only moves stamps): the bitmap letters are made here,
// at bake, from the path data the Anton caps (assets-letterforms), Anton lowercase (assets-latin) and PT Serif
// (assets-serif) packs already carry. No font is read. Each outline is flattened, laid over ONE global lattice (the
// same pitch for every glyph, so the whole alphabet shares a pixel size, like a real bitmap face), and every lattice
// cell whose ink coverage clears the bar is switched on. The ink is emitted as one path of merged horizontal runs.
//
// Deterministic by construction: no random draw anywhere (a coverage count on a fixed lattice), so a regen is
// byte-identical (the bitmap selfcheck re-runs this bake in memory and compares). Lives in the stamp box every
// face generator uses: a 100-unit cell, caps 80 units tall (y 10..90), baseline y = 90.
//
// POEM-ONLY, like every face pack: catalogue members after the authored bake, excluded by id on every dealing
// surface (poets/placement.js BITMAP_STAMP_IDS joins POEM_ONLY_STAMP_IDS). Only HYBRID's bitmap draw ever names one —
// rayGunForm moves a treated stamp to ITS OWN LETTER's bitmap variant (a treated stamp keeps its `ch`). Run from the
// repo root:
//   node scripts/gen-bitmap.mjs
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ASSETS_LETTERS } from "../app/src/data/assets/assets-letterforms.js";
import { ASSETS_LATIN } from "../app/src/data/assets/assets-latin.js";
import { ASSETS_SERIF } from "../app/src/data/assets/assets-serif.js";

/** Lattice rows across the 80-unit cap height: the pixel pitch is 80 / BITMAP_CAP_ROWS stamp-box units. */
export const BITMAP_CAP_ROWS = 16;
export const BITMAP_PITCH = 80 / BITMAP_CAP_ROWS;
/** The baseline the lattice rows count up from (every face generator's baseline). */
const BASELINE = 90;
/** A cell is on when this share of it is ink (a 4x4 coverage grid per cell). */
const COVER_BAR = 0.5;
const SUB = 4;
const FLATTEN = 10; // segments per curve

const r2 = (n) => Math.round(n * 100) / 100;

/** 'typ_A' -> 'typ_bm_A', 'typ_l_a' -> 'typ_bm_l_a', 'typ_s_A' -> 'typ_bm_s_A'. */
export const bitmapId = (sourceId) => `typ_bm_${sourceId.slice(4)}`;

/** The source letters, in pack order: [sourceId, ch, face, svg] (the wear pack's own source list). */
export function bitmapSources() {
  const out = [];
  for (const a of ASSETS_LETTERS) {
    const m = /^typ_([A-Z])$/.exec(a.id);
    if (m) out.push({ id: a.id, ch: m[1], face: "anton", svg: a.svg });
  }
  for (const a of ASSETS_LATIN)
    if (a.tags.includes("lowercase"))
      out.push({ id: a.id, ch: a.glyph, face: "anton", svg: a.svg });
  for (const a of ASSETS_SERIF)
    out.push({ id: a.id, ch: a.glyph, face: "serif", svg: a.svg });
  return out;
}

const pathD = (svg) => {
  const m = /<path d="([^"]+)"/.exec(svg);
  if (!m) throw new Error("source stamp has no path");
  return m[1];
};

/** Flatten baked path data (absolute M/L/C/Q/Z) into closed polylines. */
function polylines(d) {
  const toks = d.match(/[MLCQZ]|-?\d*\.?\d+(?:e-?\d+)?/g);
  const rings = [];
  let cur = null;
  let x = 0;
  let y = 0;
  let i = 0;
  while (i < toks.length) {
    const t = toks[i++];
    const n = { M: 2, L: 2, C: 6, Q: 4, Z: 0 }[t];
    if (n === undefined) throw new Error(`unexpected token ${t}`);
    const p = toks.slice(i, i + n).map(Number);
    i += n;
    if (t === "M") {
      cur = [[p[0], p[1]]];
      rings.push(cur);
      x = p[0];
      y = p[1];
    } else if (t === "L") {
      cur.push([p[0], p[1]]);
      [x, y] = p;
    } else if (t === "Q") {
      for (let k = 1; k <= FLATTEN; k++) {
        const u = k / FLATTEN;
        const a = (1 - u) * (1 - u);
        const b = 2 * (1 - u) * u;
        const c = u * u;
        cur.push([a * x + b * p[0] + c * p[2], a * y + b * p[1] + c * p[3]]);
      }
      [x, y] = [p[2], p[3]];
    } else if (t === "C") {
      for (let k = 1; k <= FLATTEN; k++) {
        const u = k / FLATTEN;
        const a = (1 - u) ** 3;
        const b = 3 * (1 - u) ** 2 * u;
        const c = 3 * (1 - u) * u * u;
        const e = u ** 3;
        cur.push([
          a * x + b * p[0] + c * p[2] + e * p[4],
          a * y + b * p[1] + c * p[3] + e * p[5],
        ]);
      }
      [x, y] = [p[4], p[5]];
    }
  }
  return rings;
}

/** Even-odd point-in-outline over every ring. */
function inside(rings, px, py) {
  let on = false;
  for (const ring of rings) {
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const [xa, ya] = ring[a];
      const [xb, yb] = ring[b];
      if (ya > py !== yb > py && px < ((xb - xa) * (py - ya)) / (yb - ya) + xa) on = !on;
    }
  }
  return on;
}

/** One letter's bitmap ink: the path data of merged horizontal runs of lit lattice cells. */
export function bitmapPath(srcSvg) {
  const rings = polylines(pathD(srcSvg));
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const ring of rings)
    for (const [x, y] of ring) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  const P = BITMAP_PITCH;
  // Columns centred on the glyph's own ink centre; rows counted from the shared baseline (up and below it).
  const cols = Math.max(1, Math.round((x1 - x0) / P));
  const left = (x0 + x1) / 2 - (cols * P) / 2;
  const rowTop = Math.floor((BASELINE - y0) / P + 1e-9); // rows above the baseline reached by the ink
  const rowBot = Math.ceil((y1 - BASELINE) / P - 1e-9); // rows below it (descenders)
  const runs = [];
  for (let r = -rowBot; r <= rowTop; r++) {
    // row r spans y in [BASELINE - (r + 1) P, BASELINE - r P]
    const yTop = BASELINE - (r + 1) * P;
    let runStart = -1;
    for (let c = 0; c <= cols; c++) {
      let on = false;
      if (c < cols) {
        let hit = 0;
        for (let sy = 0; sy < SUB; sy++)
          for (let sx = 0; sx < SUB; sx++)
            if (inside(rings, left + c * P + ((sx + 0.5) / SUB) * P, yTop + ((sy + 0.5) / SUB) * P)) hit++;
        on = hit / (SUB * SUB) >= COVER_BAR;
      }
      if (on && runStart < 0) runStart = c;
      if (!on && runStart >= 0) {
        runs.push([left + runStart * P, yTop, (c - runStart) * P]);
        runStart = -1;
      }
    }
  }
  return runs
    .map(([x, y, w]) => `M${r2(x)} ${r2(y)}h${r2(w)}v${r2(P)}h${r2(-w)}z`)
    .join("");
}

/** The whole pack's source text — the generator's one output (the selfcheck compares a regen against the file). */
export function bitmapPackSource() {
  const entries = bitmapSources().map((src) => {
    const d = bitmapPath(src.svg);
    if (!d) throw new Error(`${src.id}: no ink survived the lattice`);
    return (
      `  {\n` +
      `    id: '${bitmapId(src.id)}',\n` +
      `    category: 'geometric',\n` +
      `    tags: ['type', 'letter', 'bitmap'${src.face === "serif" ? ", 'serif'" : ""}],\n` +
      `    weight: 'medium',\n` +
      `    density: 'solid',\n` +
      `    scale: [0.3, 1.2],\n` +
      `    rotate: 'free',\n` +
      `    glyph: '${src.ch}',\n` +
      `    bitmapOf: '${src.id}',\n` +
      `    svg: \`<path d="${d}" fill="var(--ink)"/>\`,\n` +
      `  },`
    );
  });
  return `// Bitmap stamp pack — Persona Kernel P5 · HYBRID's bitmap type (#2385): one coarse-pixel variant of every treatable Latin letter, POEM-ONLY.
// Generated by scripts/gen-bitmap.mjs — edit the generator, not this file.
// Derived from the baked path data of the Anton caps (assets-letterforms), the Anton lowercase (assets-latin) and the
// PT Serif letters (assets-serif) — no font is read; see those packs for their faces' licences (SIL OFL 1.1). Each
// outline is laid over one global ${BITMAP_CAP_ROWS}-row-per-cap lattice and every cell with enough ink is switched on; the ink is one
// path of merged horizontal runs. Only HYBRID's bitmap draw names these (poets/rayGunForm.js), as a treated stamp's own letter.
// Colors: var(--ink) primary.
export const ASSETS_BITMAP = [\n${entries.join("\n")}\n];\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync("app/src/data/assets/assets-bitmap.js", bitmapPackSource());
  console.log("wrote", bitmapSources().length, "bitmap assets");
}
