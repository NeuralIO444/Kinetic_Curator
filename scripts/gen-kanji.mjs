// Kanji stamp pack generator — a CURATED kanji set as SVG stamp assets (#1998, FIELD stamps
// slice 2). Bakes glyph outlines from Zen Kaku Gothic New Bold (SIL Open Font License 1.1;
// https://github.com/Zen-Kakukaku/Kaku-Gothic — distributed via Google Fonts) into path data on
// the 100x100 viewBox convention, exactly as scripts/gen-kana.mjs does for the kana stamps.
// The font FILE is never committed — only path data lands in the repo. Run from the repo root:
//   node scripts/gen-kanji.mjs [/path/to/ZenKakuGothicNew-Bold.ttf]
// Requires the opentype.js devDependency (app/package.json).
//
// The set is CURATED (FIELD FONT RULING, 2026-10-31: kanji is curated-only, never full jōyō):
// 125 hand-picked characters, plus the iteration mark 々 (the kana pack's ー precedent:
// an orthographic mark the deck's writing needs — 長き日々 — baked on the same terms).
// The first table is every kanji Teijo's native lines
// (poets/teijo.js nativeLines) are written in; the rest are the season / nature / quiet
// vocabulary the poet decks live in (Greenleaf's snow, frost, river, stone, hill and field;
// Teijo's peonies, lips, tears and longing) — no filler, no character without a use in that
// world. These are POEM-ONLY stamps (FIELD): they join the catalogue after the authored bake
// (data/assets/index.js) so the census and the stage atlas resolve them, and the pool panel +
// every dealing surface exclude them by id — see poets/placement.js (KANJI_STAMP_IDS) and the
// kana pack's slice-1 discipline, which this pack rides unchanged.
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

// [kanji, slug] — the slug is the stamp id's tail (typ_j_<slug>); it is a reading or stem,
// disambiguated where readings collide (放 hou beside 花 hana, 長 nagai beside 眺 naga,
// 火 ka beside 日 hi, 実 jitsu beside 見 mi). Grouped by the world they serve.
const DECK = [
  // Every kanji Teijo's nativeLines are written in — the deal's own vocabulary.
  ['夏', 'natsu'], ['蝶', 'chou'], ['待', 'tai'], ['続', 'zoku'], ['手', 'te'],
  ['放', 'hou'], ['清', 'sei'], ['泉', 'sen'], ['水', 'mizu'], ['紅', 'beni'],
  ['唇', 'shin'], ['忘', 'wasu'], ['牡', 'bo'], ['丹', 'tan'], ['花', 'hana'],
  ['終', 'shuu'], ['日', 'hi'], ['眺', 'naga'], ['長', 'nagai'], ['秋', 'aki'],
  ['光', 'hikari'], ['小', 'ko'], ['道', 'michi'], ['上', 'ue'], ['止', 'toma'],
];
const SKY_WEATHER = [
  ['空', 'sora'], ['天', 'ten'], ['雲', 'kumo'], ['月', 'tsuki'], ['星', 'hoshi'],
  ['虹', 'niji'], ['雨', 'ame'], ['雪', 'yuki'], ['霜', 'shimo'], ['氷', 'koori'],
  ['露', 'tsuyu'], ['霧', 'kiri'], ['霞', 'kasumi'], ['風', 'kaze'], ['嵐', 'arashi'],
  ['晴', 'hare'], ['雷', 'rai'], ['朝', 'asa'], ['夜', 'yoru'], ['夕', 'yuu'],
  ['昼', 'hiru'],
];
const LAND_WATER = [
  ['川', 'kawa'], ['山', 'yama'], ['海', 'umi'], ['森', 'mori'], ['林', 'hayashi'],
  ['石', 'ishi'], ['岩', 'iwa'], ['砂', 'suna'], ['土', 'tsuchi'], ['田', 'ta'],
  ['野', 'no'], ['原', 'hara'], ['丘', 'oka'], ['島', 'shima'], ['波', 'nami'],
  ['浜', 'hama'], ['里', 'sato'], ['橋', 'hashi'],
];
const FLORA = [
  ['草', 'kusa'], ['木', 'ki'], ['竹', 'take'], ['梅', 'ume'], ['桜', 'sakura'],
  ['松', 'matsu'], ['柳', 'yanagi'], ['藤', 'fuji'], ['菊', 'kiku'], ['蓮', 'hasu'],
  ['苔', 'koke'], ['種', 'tane'], ['実', 'jitsu'], ['枝', 'eda'], ['根', 'ne'],
  ['葉', 'ha'],
];
const CREATURES = [
  ['鳥', 'tori'], ['魚', 'sakana'], ['虫', 'mushi'], ['鶴', 'tsuru'], ['蛍', 'hotaru'],
];
const MIND_WORD = [
  ['心', 'kokoro'], ['声', 'koe'], ['歌', 'uta'], ['詩', 'shi'], ['字', 'ji'],
  ['書', 'sho'], ['墨', 'sumi'], ['筆', 'fude'], ['紙', 'kami'], ['夢', 'yume'],
  ['影', 'kage'], ['闇', 'yami'], ['涙', 'namida'], ['恋', 'koi'], ['愛', 'ai'],
  ['思', 'omoi'], ['知', 'chi'], ['見', 'mi'], ['聞', 'bun'],
];
const TIME = [
  ['時', 'toki'], ['年', 'toshi'], ['昔', 'mukashi'], ['今', 'ima'], ['明', 'mei'],
];
const QUIET_DOMESTIC = [
  ['静', 'shizu'], ['寂', 'jaku'], ['眠', 'nemuri'], ['休', 'yasumi'], ['窓', 'mado'],
  ['門', 'mon'], ['舟', 'fune'], ['灯', 'akari'], ['香', 'kaori'], ['色', 'iro'],
  ['音', 'oto'], ['命', 'inochi'], ['春', 'haru'], ['冬', 'fuyu'], ['火', 'ka'],
  ['金', 'kin'],
];

const CURATED = [...DECK, ...SKY_WEATHER, ...LAND_WATER, ...FLORA, ...CREATURES, ...MIND_WORD, ...TIME, ...QUIET_DOMESTIC];
if (new Set(CURATED.map(([ch]) => ch)).size !== CURATED.length) throw new Error('curated list: duplicate kanji');
if (new Set(CURATED.map(([, slug]) => slug)).size !== CURATED.length) throw new Error('curated list: duplicate slug');

const font = parse(readFileSync(FONT_PATH));
// Reference body height from 'あ' — the SAME reference scripts/gen-kana.mjs uses,
// so kanji and kana share one scale and a mixed form's glyphs sit at true relative size.
const refBox = font.getPath('あ', 0, 0, FS).getBoundingBox();
const scale = TARGET_H / (refBox.y2 - refBox.y1);

const entries = [];
function bake(ch, id) {
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
      `    tags: ['type', 'kanji'],\n` +
      `    weight: 'medium',\n` +
      `    density: 'solid',\n` +
      `    scale: [0.3, 1.2],\n` +
      `    rotate: 'free',\n` +
      `    glyph: '${ch}',\n` +
      `    svg: \`<path d="${d}" fill="var(--ink)"/>\`,\n` +
      `  },`,
  );
}

for (const [ch, slug] of CURATED) bake(ch, `typ_j_${slug}`);
bake('々', 'typ_j_noma'); // the iteration mark (nicknamed ノマ) — 日々, 人々; the deck writes 長き日々

const out = `// Kanji stamp pack — a CURATED set (125 kanji + the iteration mark 々) in a bold gothic, POEM-ONLY (FIELD stamps slice 2, #1998).
// Generated by scripts/gen-kanji.mjs — edit the generator, not this file.
// Glyph outlines baked from Zen Kaku Gothic New Bold (SIL Open Font License 1.1,
// https://github.com/Zen-Kakukaku/Kaku-Gothic). The font file itself is NOT shipped;
// only path data is committed. Each glyph is centered on the 100x100 viewBox, body
// height ~80 units on the SAME reference (あ) the kana pack bakes to, so a mixed
// kanji+kana form sits at true relative size. Path data (never <text>), so every
// raster of these stamps is font-independent: the census confirms them with the
// bake's pinned-font raster exactly as it does the kana stamps (#1970).
// The set is curated, never full jōyō (FIELD FONT RULING, 2026-10-31): Teijo's
// native-line kanji first, then the season / nature / quiet vocabulary of the decks.
// Colors: var(--ink) primary (var(--accent) resolves at bake for tint combos).
export const ASSETS_KANJI = [\n${entries.join('\n')}\n];\n`;

writeFileSync('app/src/data/assets/assets-kanji.js', out);
console.log('wrote', entries.length, 'kanji assets');
