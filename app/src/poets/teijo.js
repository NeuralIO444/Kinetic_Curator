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

// #2151 — the register-spanning cache (see gibson.js GIBSON_REGISTER). Data only until the #2151 build deals it.
// Every kanji in nativeLines is in the curated pack (data/assets/assets-kanji.js); the register selfcheck pins it.
export const TEIJO_REGISTER = Object.freeze([
  {
    id: 't5',
    register: 'cover',
    lines: ['MOONLIGHT'],
    kanaLines: ['つきあかり'],
    nativeLines: ['月あかり'],
    layout: 'single',
    density: 0.15,
  },
  {
    id: 't6',
    register: 'cover',
    lines: ['FIREFLY SEASON'],
    kanaLines: ['ほたるのころ'],
    nativeLines: ['蛍のころ'],
    layout: 'single',
    density: 0.18,
  },
  {
    id: 't7',
    register: 'cover',
    lines: ['CHERRY PETALS'],
    kanaLines: ['さくらのはな'],
    nativeLines: ['桜の花'],
    layout: 'single',
    density: 0.18,
  },
  {
    id: 't8',
    register: 'between',
    lines: ['MORNING DEW', 'ON THE BAMBOO'],
    kanaLines: ['あさつゆ', 'たけのうえ'],
    nativeLines: ['朝露', '竹の上'],
    layout: 'bands',
    density: 0.3,
  },
  {
    id: 't9',
    register: 'between',
    lines: ['STONE', 'MOSS', 'STILLNESS'],
    kanaLines: ['いし', 'こけ', 'しずけさ'],
    nativeLines: ['石', '苔', '静けさ'],
    layout: 'single',
    density: 0.3,
  },
  {
    id: 't10',
    register: 'between',
    lines: ['FIRST SNOW', 'THE INK STONE', 'COLD TO THE TOUCH'],
    kanaLines: ['はつゆき', 'すずり', 'てにつめたし'],
    nativeLines: ['はつ雪', 'すずり', '手につめたし'],
    layout: 'bands',
    density: 0.4,
  },
  {
    id: 't11',
    register: 'interior',
    lines: [
      'SPRING RAIN',
      'THE PATH TO THE RIVER',
      'GROWS SOFT',
      'SUMMER NIGHT',
      'ONE FIREFLY',
      'THEN THE DARK',
      'AUTUMN WIND',
      'THE MOUNTAIN',
      'CLOSER NOW',
    ],
    kanaLines: [
      'はるのあめ',
      'かわへのみち',
      'やわらかく',
      'なつのよる',
      'ほたるひとつ',
      'やみのなか',
      'あきのかぜ',
      'やま',
      'ちかくなり',
    ],
    nativeLines: ['春の雨', '川への道', 'やわらかく', '夏の夜', '蛍ひとつ', '闇のなか', '秋の風', '山', 'ちかくなり'],
    layout: 'bands',
    density: 0.88,
  },
  {
    id: 't12',
    register: 'interior',
    lines: [
      'PLUM BLOSSOM',
      'AN OLD TEMPLE GATE',
      'LEFT OPEN',
      'EVENING SKY',
      'CRANES CROSS',
      'WITHOUT A SOUND',
      'WILLOW',
      'THE WHOLE RIVER',
      'LEANING',
      'FALLING LEAVES',
      'I SWEEP',
      'AND SWEEP AGAIN',
    ],
    kanaLines: [
      'うめのはな',
      'ふるきてらのもん',
      'あけはなし',
      'ゆうぞら',
      'つるわたる',
      'おともなく',
      'やなぎ',
      'かわのすべて',
      'かたむけて',
      'おちばかな',
      'はくわれと',
      'またはきぬ',
    ],
    nativeLines: [
      '梅の花',
      'ふるきてらの門',
      'あけはなし',
      '夕空',
      '鶴わたる',
      '音もなく',
      '柳',
      '川のすべて',
      'かたむけて',
      'おち葉かな',
      'はくわれと',
      'またはきぬ',
    ],
    layout: 'bands',
    density: 0.9,
  },
]);
