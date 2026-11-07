// Plate letter stamp pack generator — A–Z + a–z in Fraunces, instanced for
// display, as SVG stamp assets (#2005, the clean plate). Bakes glyph outlines
// from a STATIC INSTANCE of the Fraunces variable font (SIL Open Font
// License 1.1; The Fraunces Project Authors —
// https://github.com/undercasetype/Fraunces) into path data on the 100x100
// viewBox convention, on the letterform bake's reference (the face's own 'H'
// cap height ~80 units). This is the PLATE face: a variable serif drawn for
// display sizes, instanced at its largest optical size — fine hairlines and
// soft serifs that only exist at that end of the axis — dealt only when the
// Director calls a plate (poets/fieldForm.js). The font FILES are never
// committed — only path data lands in the repo. Run from the repo root:
//   node scripts/gen-plate.mjs [/path/to/FrauncesPlate.ttf]
//
// The instance is pinned, in two steps, both recorded here so the bake is
// reproducible: the generated stamp file below is byte-identical across a
// fresh fetch + fresh instancing (verified for #2005's staging: md5
// 9b74c180e2c07008582487f40f07dbbc both times). The instanced TTF's own
// container md5 is NOT a pin — fonttools stamps head-table times into it,
// so two instancings of the same source differ as containers while their
// glyph outlines (all this generator reads) are identical.
//   1. Variable source (google/fonts, OFL tree):
//      https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf
//      md5 df89c7ab0af2020b3949cf8a4bece47a (360,440 bytes; axes opsz 9–144,
//      wght 100–900, SOFT 0–100, WONK 0–1; defaults opsz 9 / wght 900 /
//      WONK 1 — an unpinned axis falls to the DEFAULT, so every axis is
//      pinned explicitly below).
//   2. Instancing (fonttools 4.46.0):
//      python3 -m fontTools.varLib.instancer -o FrauncesPlate.ttf \
//        Fraunces-var.ttf opsz=144 wght=400 SOFT=0 WONK=0
//      (the recorded bake's instance: 72,680 bytes, fully static — no fvar
//      remains). opsz 144 is the display end (the letterforms are drawn
//      for this scale); wght 400 is the regular of the issue's
//      light-to-regular range; SOFT 0 keeps the serifs crisp; WONK 0 keeps
//      the standard letterforms (WONK is the quirky alternate set — a
//      plate is set clean, not wonky).
// Requires the opentype.js devDependency (app/package.json).
//
// These are POEM-ONLY stamps (FIELD): catalogue members after the authored
// bake, excluded by id on every dealing surface — see poets/placement.js
// (PLATE_STAMP_IDS, POEM_ONLY_STAMP_IDS). Letter stamps are face-bound: a
// plate stamp is honest only inside a plate-declared form under Whittier
// (greenleaf); digits and punctuation stamps are face-shared and are NOT
// duplicated here.
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from '../app/node_modules/opentype.js/dist/opentype.mjs';

const FONT_PATH = process.argv[2] || '/tmp/FrauncesPlate.ttf';
const TARGET_H = 80; // cap height in viewBox units — the letterforms' convention
const FS = 1000; // source raster size for precision

const r2 = (n) => Math.round(n * 100) / 100;

function transformCommands(commands, cx, cy, s) {
  const t = (x, y) => [r2((x - cx) * s + 50), r2((y - cy) * s + 50)];
  let d = '';
  for (const c of commands) {
    if (c.type === 'M' || c.type === 'L') {
      const [x, y] = t(c.x, c.y);
      d += `${c.type}${x} ${y}`;
    } else if (c.type === 'C') {
      const [x1, y1] = t(c.x1, c.y1);
      const [x2, y2] = t(c.x2, c.y2);
      const [x, y] = t(c.x, c.y);
      d += `C${x1} ${y1} ${x2} ${y2} ${x} ${y}`;
    } else if (c.type === 'Q') {
      const [x1, y1] = t(c.x1, c.y1);
      const [x, y] = t(c.x, c.y);
      d += `Q${x1} ${y1} ${x} ${y}`;
    } else if (c.type === 'Z') {
      d += 'Z';
    } else {
      throw new Error(`unsupported path command: ${c.type}`);
    }
  }
  return d;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const font = parse(readFileSync(FONT_PATH));
// Reference cap height from the plate face's own 'H' — the letterform
// convention, so 1 em of plate cap height equals 1 em of Anton or PT Serif
// cap height on the dish.
const refBox = font.getPath('H', 0, 0, FS).getBoundingBox();
const scale = TARGET_H / (refBox.y2 - refBox.y1);

const entries = [];
function bake(ch) {
  const glyph = font.charToGlyph(ch);
  if (!glyph || glyph.index === 0) throw new Error(`font has no glyph: ${ch}`);
  const path = font.getPath(ch, 0, 0, FS);
  const bb = path.getBoundingBox();
  if (!(bb.x2 > bb.x1) || !(bb.y2 > bb.y1)) throw new Error(`empty glyph: ${ch}`);
  const cx = (bb.x1 + bb.x2) / 2;
  const cy = (bb.y1 + bb.y2) / 2;
  const d = transformCommands(path.commands, cx, cy, scale);
  // One property per line — the letterform pack's (prettier-clean) shape, so
  // a regen lands format:check-clean with no follow-up pass.
  entries.push(
    `  {\n` +
      `    id: 'typ_f_${ch}',\n` +
      `    category: 'geometric',\n` +
      `    tags: ['type', 'letter', 'fraunces'],\n` +
      `    weight: 'medium',\n` +
      `    density: 'solid',\n` +
      `    scale: [0.3, 1.2],\n` +
      `    rotate: 'free',\n` +
      `    glyph: '${ch}',\n` +
      `    svg: \`<path d="${d}" fill="var(--ink)"/>\`,\n` +
      `  },`,
  );
}

for (const ch of LETTERS) bake(ch);

const out = `// Plate letter stamp pack — A–Z + a–z in Fraunces (display instance), POEM-ONLY (the clean plate, #2005).
// Generated by scripts/gen-plate.mjs — edit the generator, not this file.
// Glyph outlines baked from a pinned static instance of Fraunces (SIL Open Font
// License 1.1, Copyright 2018 The Fraunces Project Authors,
// https://github.com/undercasetype/Fraunces): the variable font instanced at
// opsz 144 / wght 400 / SOFT 0 / WONK 0 — see the generator for the pinned
// fetch, the instancing command, and both md5s. The font files themselves are
// NOT shipped; only path data is committed. Each glyph is centered on the
// 100x100 viewBox, cap height ~80 units on the face's own 'H' reference — the
// letterform pack's convention, so a plate em, a serif em and an Anton em are
// the same cap height on the dish. Path data (never <text>), so every raster
// of these stamps is font-independent (#1970). The face is Whittier's alone,
// and only on a plate: letter stamps are face-bound, digits and punctuation
// are face-shared (the base packs serve them in a plate form unchanged).
// Colors: var(--ink) primary (var(--accent) resolves at bake for tint combos).
export const ASSETS_PLATE = [\n${entries.join('\n')}\n];\n`;

writeFileSync('app/src/data/assets/assets-plate.js', out);
console.log('wrote', entries.length, 'plate assets');
