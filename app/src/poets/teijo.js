// poets/teijo.js — Teijo Nakamura deck. Pure data.
// #1982 (FIELD stamps slice 1) — each piece also carries its kana rendering
// (kanaLines): the same images in Teijo's native script, dealt only when the
// Director calls for the kana script (a Japanese-context stage, genre gate
// in curator/fieldDirector.js). The Latin lines remain the deck's default
// face; a piece without kanaLines deals Latin in every room.
// #1998 (FIELD stamps slice 2) — each piece also carries its native rendering
// in real Japanese orthography (nativeLines): kanji and kana mixed the way
// Japanese is actually written. The native deal serves nativeLines when the
// piece carries them and falls back to kanaLines — one native face, two
// depths of it (fieldForm.js). Every kanji here is in the curated pack
// (data/assets/assets-kanji.js); the fieldKanji suite pins that coverage.
export const TEIJO = Object.freeze([
  {
    id: 't1',
    lines: ['SUMMER BUTTERFLY', 'I WAIT THEN', 'LET IT GO'],
    kanaLines: ['なつのちょう', 'まちつづけて', 'てをはなす'],
    nativeLines: ['夏の蝶', '待ち続けて', '手を放して'],
    layout: 'bands',
    density: 0.4,
  },
  {
    id: 't2',
    lines: ['CLEAR SPRING WATER', 'ROUGED LIPS', 'FORGOTTEN'],
    kanaLines: ['せいせんのしみず', 'べにのくちびる', 'わすらるる'],
    nativeLines: ['清泉の清水', '紅の唇', '忘らるる'],
    layout: 'bands',
    density: 0.35,
  },
  {
    id: 't3',
    lines: ['THE PEONIES', 'LOOK ALL DAY', 'LONG'],
    kanaLines: ['ぼたんのはな', 'ひねもすながむ', 'ながきひ'],
    nativeLines: ['牡丹の花', '終日眺めて', '長き日々'],
    layout: 'single',
    density: 0.5,
  },
  {
    id: 't4',
    lines: ['AUTUMN LIGHT', 'ON THE PATH', 'HOLDS STILL'],
    kanaLines: ['あきのひかり', 'こみちのうえ', 'とどまりて'],
    nativeLines: ['秋の光り', '小道の上に', '止まりて'],
    layout: 'bands',
    density: 0.4,
  },
]);
