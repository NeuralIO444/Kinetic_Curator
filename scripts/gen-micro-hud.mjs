// Micro-HUD ornament pack generator — tiny technical detail clusters in the
// spirit of sci-fi poster fine print (dotted grids, brackets, dials, spec
// bars). No live text anywhere: labels are abstract bars, so nothing depends
// on font rendering at micro sizes. Run: node scripts/gen-micro-hud.mjs
import { writeFileSync } from 'node:fs';

const I = 'var(--ink)';
const A = 'var(--accent)';
const SW = 4; // hairline-ish stroke on the 100x100 viewBox

const dot = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
const line = (x1, y1, x2, y2, stroke, w = SW) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}"/>`;
const path = (d, stroke, w = SW, fill = 'none') =>
  `<path d="${d}" stroke="${stroke}" stroke-width="${w}" fill="${fill}"/>`;
const rect = (x, y, w, h, stroke, sw = SW, fill = 'none', rx = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" stroke="${stroke}" stroke-width="${sw}" fill="${fill}"/>`;

function dotGrid(n, start, step, r, accentCenter) {
  let s = '';
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const f = accentCenter && i === mid && j === mid ? A : I;
    s += dot(start + i * step, start + j * step, r, f);
  }
  return s;
}

function tickRing(cx, cy, rOuter, rInner, count, stroke) {
  let s = '';
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + Math.cos(a) * rInner, y1 = cy + Math.sin(a) * rInner;
    const x2 = cx + Math.cos(a) * rOuter, y2 = cy + Math.sin(a) * rOuter;
    const r2 = (v) => Math.round(v * 10) / 10;
    s += line(r2(x1), r2(y1), r2(x2), r2(y2), stroke);
  }
  return s;
}

const assets = [
  { id: 'mic_bracket_tl', tags: ['hud', 'micro', 'bracket', 'corner'], rotate: 'fixed',
    svg: path('M10 34 L10 10 L34 10', I) },
  { id: 'mic_bracket_tr', tags: ['hud', 'micro', 'bracket', 'corner'], rotate: 'fixed',
    svg: path('M66 10 L90 10 L90 34', I) },
  { id: 'mic_bracket_bl', tags: ['hud', 'micro', 'bracket', 'corner'], rotate: 'fixed',
    svg: path('M10 66 L10 90 L34 90', I) },
  { id: 'mic_bracket_br', tags: ['hud', 'micro', 'bracket', 'corner'], rotate: 'fixed',
    svg: path('M66 90 L90 90 L90 66', I) },
  { id: 'mic_dotgrid_5', tags: ['hud', 'micro', 'dots', 'grid'], rotate: 'free',
    svg: dotGrid(5, 20, 15, 2.5, false) },
  { id: 'mic_dotgrid_3', tags: ['hud', 'micro', 'dots', 'grid'], rotate: 'free',
    svg: dotGrid(3, 25, 25, 3, true) },
  { id: 'mic_ticks_h', tags: ['hud', 'micro', 'ruler', 'ticks'], rotate: 'fixed',
    svg: line(10, 50, 90, 50, I) + [10, 26, 42, 58, 74, 90].map((x) => line(x, 42, x, 58, I)).join('') + dot(50, 50, 3, A) },
  { id: 'mic_ticks_ring', tags: ['hud', 'micro', 'dial', 'ticks'], rotate: 'free',
    svg: tickRing(50, 50, 40, 31, 12, I) + dot(50, 50, 3, A) },
  { id: 'mic_dial', tags: ['hud', 'micro', 'dial', 'gauge'], rotate: 'free',
    svg: `<circle cx="50" cy="50" r="34" fill="none" stroke="${I}" stroke-width="${SW}"/>`
      + tickRing(50, 50, 30, 24, 8, I)
      + line(50, 50, 68, 32, A, 5) + dot(50, 50, 4, I) },
  { id: 'mic_needle', tags: ['hud', 'micro', 'dial', 'needle'], rotate: 'free',
    svg: line(50, 50, 50, 24.5, A, 5) + dot(50, 50, 4, I) }, // #705 — needle-only part; dial face stays generator-internal
  { id: 'mic_crosshair', tags: ['hud', 'micro', 'target', 'sight'], rotate: 'free',
    svg: `<circle cx="50" cy="50" r="30" fill="none" stroke="${I}" stroke-width="${SW}"/>`
      + line(50, 8, 50, 28, I) + line(50, 72, 50, 92, I) + line(8, 50, 28, 50, I) + line(72, 50, 92, 50, I)
      + dot(50, 50, 3.5, A) },
  { id: 'mic_plus', tags: ['hud', 'micro', 'mark', 'plus'], rotate: 'fixed',
    svg: line(50, 30, 50, 70, I) + line(30, 50, 70, 50, I) },
  { id: 'mic_specbar_h', tags: ['hud', 'micro', 'bar', 'spec'], rotate: 'fixed',
    svg: Array.from({ length: 8 }, (_, i) =>
      rect(8 + i * 11, 44, 8, 12, 'none', 0, i < 5 ? I : A)).join('') },
  { id: 'mic_specbar_v', tags: ['hud', 'micro', 'bar', 'spec'], rotate: 'fixed',
    svg: Array.from({ length: 8 }, (_, i) =>
      rect(44, 8 + i * 11, 12, 8, 'none', 0, i < 3 ? A : I)).join('') },
  { id: 'mic_label', tags: ['hud', 'micro', 'label', 'plate'], rotate: 'fixed',
    svg: rect(14, 32, 72, 36, I, SW, 'none', 3)
      + [0, 1, 2].map((i) => rect(22, 40 + i * 9, i === 2 ? 30 : 56, 4, 'none', 0, i === 0 ? A : I)).join('') },
  { id: 'mic_tag', tags: ['hud', 'micro', 'label', 'tag'], rotate: 'fixed',
    svg: path('M20 50 L44 26 L84 26 L84 74 L44 74 Z', I) + dot(32, 50, 4, A) + rect(52, 44, 24, 5, 'none', 0, I) + rect(52, 55, 16, 5, 'none', 0, I) },
  { id: 'mic_chevrons', tags: ['hud', 'micro', 'chevron', 'direction'], rotate: 'fixed',
    svg: [0, 1, 2].map((i) => path(`M${28 + i * 20} 30 L${42 + i * 20} 50 L${28 + i * 20} 70`, i === 2 ? A : I, 5)).join('') },
  { id: 'mic_wave', tags: ['hud', 'micro', 'signal', 'wave'], rotate: 'fixed',
    svg: path('M8 50 L22 50 L30 30 L42 70 L54 30 L66 70 L74 50 L92 50', I, SW)
      + line(8, 50, 92, 50, I, 1.5) },
  { id: 'mic_target', tags: ['hud', 'micro', 'target', 'rings'], rotate: 'free',
    svg: `<circle cx="50" cy="50" r="36" fill="none" stroke="${I}" stroke-width="${SW}"/>`
      + `<circle cx="50" cy="50" r="20" fill="none" stroke="${I}" stroke-width="${SW}"/>`
      + dot(50, 50, 6, A) },
  { id: 'mic_arrow', tags: ['hud', 'micro', 'arrow', 'direction'], rotate: 'fixed',
    svg: line(16, 50, 76, 50, I, 5) + path('M58 32 L80 50 L58 68', I, 5) },
  { id: 'mic_cropmarks', tags: ['hud', 'micro', 'registration', 'crop'], rotate: 'free',
    svg: line(8, 24, 8, 8, I) + line(8, 8, 24, 8, I)
      + line(92, 24, 92, 8, I) + line(92, 8, 76, 8, I)
      + line(8, 76, 8, 92, I) + line(8, 92, 24, 92, I)
      + line(92, 76, 92, 92, I) + line(92, 92, 76, 92, I) },
];

const entries = assets.map((a) => {
  const svg = a.svg.replace(/`/g, '\\`');
  return `  { id: '${a.id}', category: 'geometric', tags: [${a.tags.map((t) => `'${t}'`).join(', ')}], weight: 'light', density: 'sparse', scale: [0.12, 0.4], rotate: '${a.rotate}',\n    svg: \`${svg}\` },`;
});

// ---- #705 UV strips: frame-exact cell animation for the 5 animated ornaments.
// Cell 0 is always the canonical frame — pixel-identical to today's bake.
// Shed and freeze pin cell 0; Director RATE is the master control.

// Dial: 8 cells, needle sweeps full 360° in 45° steps. Cell 0 = today's needle.
// Today's needle endpoint (68,32): 45° clockwise from 12, length √(18²+18²).
const DIAL_LEN = Math.hypot(68 - 50, 50 - 32);
const DIAL_A0 = Math.atan2(68 - 50, 50 - 32); // 45° — computed from today's art
const r1 = (v) => Math.round(v * 10) / 10;
const dialFace = `<circle cx="50" cy="50" r="34" fill="none" stroke="${I}" stroke-width="${SW}"/>`
  + tickRing(50, 50, 30, 24, 8, I);
const dialNeedle = (a) =>
  line(50, 50, r1(50 + DIAL_LEN * Math.sin(a)), r1(50 - DIAL_LEN * Math.cos(a)), A, 5);
const dialStrip = Array.from({ length: 8 }, (_, i) =>
  dialFace + dialNeedle(DIAL_A0 + (i * Math.PI) / 4) + dot(50, 50, 4, I));

// Chevrons: 4 cells. Cell 0 = today (accent on chevron 3); cell 3 = accent flash.
const chevXs = [28, 48, 68];
const chevCell = (accents) =>
  chevXs.map((x, i) => path(`M${x} 30 L${x + 14} 50 L${x} 70`, accents.includes(i) ? A : I, 5)).join('');
const chevStrip = [chevCell([2]), chevCell([0]), chevCell([1]), chevCell([0, 1, 2])];

// Spec bars: 8 cells, 3-bar accent window slides and wraps. Cell 0 = today.
const specHStrip = Array.from({ length: 8 }, (_, k) =>
  Array.from({ length: 8 }, (_, i) =>
    rect(8 + i * 11, 44, 8, 12, 'none', 0, [(5 + k) % 8, (6 + k) % 8, (7 + k) % 8].includes(i) ? A : I)).join(''));
const specVStrip = Array.from({ length: 8 }, (_, k) =>
  Array.from({ length: 8 }, (_, i) =>
    rect(44, 8 + i * 11, 12, 8, 'none', 0, [k % 8, (1 + k) % 8, (2 + k) % 8].includes(i) ? A : I)).join(''));

// Wave: 6 cells × 4 units = one exact 24-unit tooth period. Cell 0 = today's
// path verbatim. Teeth scroll left; the pattern is 24-periodic so the interior
// teeth wrap seamlessly (peaks stay on x≡6 mod 24).
const waveBase = [[8, 50], [22, 50], [30, 30], [42, 70], [54, 30], [66, 70], [74, 50], [92, 50]];
const waveExt = [];
for (let x = 102, peak = true; x <= 140; x += 12, peak = !peak) waveExt.push([x, peak ? 30 : 70]);
const waveArt = waveBase.concat(waveExt);
const waveStrip = Array.from({ length: 6 }, (_, i) => {
  const s = 4 * i;
  // Cell 0: base only — string-identical to today's bake. Other cells add the
  // extension teeth needed to cover the visible window mid-scroll.
  const pts = i === 0 ? waveBase : waveArt.filter(([x]) => x <= 100 + s + 12);
  const d = pts.map(([x, y], j) => `${j === 0 ? 'M' : 'L'}${r1(x - s)} ${y}`).join(' ');
  return path(d, I, SW) + line(r1(8 - s), 50, r1(92 - s), 50, I, 1.5);
});

const strips = {
  mic_dial: dialStrip,
  mic_chevrons: chevStrip,
  mic_specbar_h: specHStrip,
  mic_specbar_v: specVStrip,
  mic_wave: waveStrip,
};

const stripEntries = Object.entries(strips).map(([id, cells]) =>
  `  '${id}': [\n${cells.map((c) => `    \`${c.replace(/`/g, '\\`')}\`,`).join('\n')}\n  ],`);

const stripsOut = `// Micro-HUD UV strips — frame-exact cell animation for the 5 animated ornaments (#705).
// Generated by scripts/gen-micro-hud.mjs — edit the generator, not this file.
// AUTHORed track: deterministic, frame-exact. Cell 0 is always the canonical
// frame (pixel-identical to today's single-cell bake); shed and freeze pin
// cell 0. The asset id never changes — only the UV window moves.
// Cell counts: mic_dial 8 (dial-sweep), mic_chevrons 4 (chevron-chase),
// mic_specbar_h/v 8 (spec-chase), mic_wave 6 (wave-scroll).
export const MICRO_HUD_STRIPS = {\n${stripEntries.join('\n')}\n};\n`;

writeFileSync('app/src/data/assets/assets-micro-hud-strips.js', stripsOut);
console.log('wrote', Object.keys(strips).length, 'strips');

const out = `// Micro-HUD ornament pack — tiny technical detail clusters for sci-fi
// poster fine print: brackets, dot grids, dials, spec bars, labels, marks.
// Generated by scripts/gen-micro-hud.mjs — edit the generator, not this file.
// No live text: labels are abstract bars (illegible microtype would not
// survive grain/dither). Colors: var(--ink) primary, var(--accent) secondary.
// All assets on a 100x100 viewBox, authored at micro scale [0.12, 0.4].
export const ASSETS_MICRO = [\n${entries.join('\n')}\n];\n`;

writeFileSync('app/src/data/assets/assets-micro-hud.js', out);
console.log('wrote', assets.length, 'assets');
