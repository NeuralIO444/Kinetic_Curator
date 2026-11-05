// Kana stamp pack generator — hiragana + katakana as SVG stamp assets (#1982, FIELD stamps slice 1).
// Bakes glyph outlines from Zen Kaku Gothic New Bold (SIL Open Font License 1.1;
// https://github.com/Zen-Kakukaku/Kaku-Gothic — distributed via Google Fonts) into path data on the
// 100x100 viewBox convention, exactly as scripts/gen-letterforms.mjs does for the Latin stamps.
// The font FILE is never committed — only path data lands in the repo. Run from the repo root:
//   node scripts/gen-kana.mjs [/path/to/ZenKakuGothicNew-Bold.ttf]
// Requires the opentype.js devDependency (app/package.json).
//
// The set: the 46 basic kana of each script, the 25 dakuten/handakuten variants of each script
// (separate codepoints, so the letterform bake pattern carries them unchanged), the 10 small kana
// of each script (ぁ っ ゃ … — real words need them: ちょう, まって), and the katakana long-vowel
// mark ー. 163 stamps. These are POEM-ONLY stamps (FIELD): they join the catalogue after the
// authored bake (data/assets/index.js) so the census and the stage atlas resolve them, and the
// pool panel + placeable pool exclude them by id — see poets/placement.js (KANA_STAMP_IDS).
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from '../app/node_modules/opentype.js/dist/opentype.mjs';

const FONT_PATH = process.argv[2] || '/tmp/ZenKakuGothicNew-Bold.ttf';
const TARGET_H = 80; // glyph body height in viewBox units — the letterforms' cap-height convention
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

// [hiragana, slug] — katakana is the same table at +0x60 codepoint, same slugs.
const BASIC = [
  ['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'],
  ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
  ['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
  ['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to'],
  ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
  ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho'],
  ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
  ['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo'],
  ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
  ['わ', 'wa'], ['を', 'wo'], ['ん', 'n'],
];
const DAKUTEN = [
  ['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go'],
  ['ざ', 'za'], ['じ', 'ji'], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo'],
  ['だ', 'da'], ['ぢ', 'di'], ['づ', 'du'], ['で', 'de'], ['ど', 'do'],
  ['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo'],
  ['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po'],
];
const SMALL = [
  ['ぁ', 'xa'], ['ぃ', 'xi'], ['ぅ', 'xu'], ['ぇ', 'xe'], ['ぉ', 'xo'],
  ['っ', 'xtu'], ['ゃ', 'xya'], ['ゅ', 'xyu'], ['ょ', 'xyo'], ['ゎ', 'xwa'],
];

const font = parse(readFileSync(FONT_PATH));
// Reference body height from 'あ' so every glyph keeps its true relative size
// (the letterform bake's 'H' cap-height convention, carried to kana).
const refBox = font.getPath('あ', 0, 0, FS).getBoundingBox();
const scale = TARGET_H / (refBox.y2 - refBox.y1);

const entries = [];
function bake(ch, id, scriptTag) {
  const glyph = font.charToGlyph(ch);
  if (!glyph || glyph.index === 0) throw new Error(`font has no glyph: ${ch} (${id})`);
  const path = font.getPath(ch, 0, 0, FS);
  const bb = path.getBoundingBox();
  if (!(bb.x2 > bb.x1) || !(bb.y2 > bb.y1)) throw new Error(`empty glyph: ${ch}`);
  const cx = (bb.x1 + bb.x2) / 2;
  const cy = (bb.y1 + bb.y2) / 2;
  const d = transformCommands(path.commands, cx, cy, scale);
  // One property per line — the letterform pack's (prettier-clean) shape, so a
  // regen lands format:check-clean with no follow-up pass.
  entries.push(
    `  {\n` +
      `    id: '${id}',\n` +
      `    category: 'geometric',\n` +
      `    tags: ['type', 'kana', '${scriptTag}'],\n` +
      `    weight: 'medium',\n` +
      `    density: 'solid',\n` +
      `    scale: [0.3, 1.2],\n` +
      `    rotate: 'free',\n` +
      `    glyph: '${ch}',\n` +
      `    svg: \`<path d="${d}" fill="var(--ink)"/>\`,\n` +
      `  },`,
  );
}

for (const [ch, slug] of [...BASIC, ...DAKUTEN, ...SMALL]) {
  bake(ch, `typ_h_${slug}`, 'hiragana');
  bake(String.fromCodePoint(ch.codePointAt(0) + 0x60), `typ_k_${slug}`, 'katakana');
}
bake('ー', 'typ_k_long', 'katakana');

const out = `// Kana stamp pack — hiragana + katakana in a bold gothic, POEM-ONLY (FIELD stamps slice 1, #1982).
// Generated by scripts/gen-kana.mjs — edit the generator, not this file.
// Glyph outlines baked from Zen Kaku Gothic New Bold (SIL Open Font License 1.1,
// https://github.com/Zen-Kakukaku/Kaku-Gothic). The font file itself is NOT shipped;
// only path data is committed. Each glyph is centered on the 100x100 viewBox, body
// height ~80 units — the letterform pack's convention. Path data (never <text>), so
// every raster of these stamps is font-independent: the census confirms them with
// the bake's pinned-font raster exactly as it does the Anton letterforms (#1970).
// 46 basic + 25 dakuten/handakuten + 10 small per script, plus the long-vowel mark.
// Colors: var(--ink) primary (var(--accent) resolves at bake for tint combos).
export const ASSETS_KANA = [\n${entries.join('\n')}\n];\n`;

writeFileSync('app/src/data/assets/assets-kana.js', out);
console.log('wrote', entries.length, 'kana assets');
