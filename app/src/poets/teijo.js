// poets/teijo.js — Teijo Nakamura deck. Pure data.
// #1982 (FIELD stamps slice 1) — each piece also carries its kana rendering
// (kanaLines): the same images in Teijo's native script, dealt only when the
// Director calls for the kana script (a Japanese-context stage, genre gate
// in curator/fieldDirector.js). The Latin lines remain the deck's default
// face; a piece without kanaLines deals Latin in every room.
export const TEIJO = Object.freeze([
  {
    id: 't1',
    lines: ['SUMMER BUTTERFLY', 'I WAIT THEN', 'LET IT GO'],
    kanaLines: ['なつのちょう', 'まちつづけて', 'てをはなす'],
    layout: 'bands',
    density: 0.4,
  },
  {
    id: 't2',
    lines: ['CLEAR SPRING WATER', 'ROUGED LIPS', 'FORGOTTEN'],
    kanaLines: ['せいせんのしみず', 'べにのくちびる', 'わすらるる'],
    layout: 'bands',
    density: 0.35,
  },
  {
    id: 't3',
    lines: ['THE PEONIES', 'LOOK ALL DAY', 'LONG'],
    kanaLines: ['ぼたんのはな', 'ひねもすながむ', 'ながきひ'],
    layout: 'single',
    density: 0.5,
  },
  {
    id: 't4',
    lines: ['AUTUMN LIGHT', 'ON THE PATH', 'HOLDS STILL'],
    kanaLines: ['あきのひかり', 'こみちのうえ', 'とどまりて'],
    layout: 'bands',
    density: 0.4,
  },
]);
