// poets/rosselli.js — Amelia Rosselli deck. Pure data. Quadro / square bias.
export const ROSSELLI = Object.freeze([
  { id: 'r1', lines: ['SQUARE OF LIGHT', 'HOLDS THE CUT'], layout: 'square', density: 0.7 },
  { id: 'r2', lines: ['THE FRAME', 'IS THE MEASURE'], layout: 'square', density: 0.65 },
  { id: 'r3', lines: ['DENSE LINE', 'EDGE TO EDGE'], layout: 'square', density: 0.8 },
  { id: 'r4', lines: ['METRICAL SPACE', 'ONE BLOCK'], layout: 'square', density: 0.75 },
]);

// #2151 — the register-spanning cache (see gibson.js GIBSON_REGISTER). Data only until the #2151 build deals it.
export const ROSSELLI_REGISTER = Object.freeze([
  { id: 'r5', register: 'cover', lines: ['MEASURE'], layout: 'square', density: 0.2 },
  { id: 'r6', register: 'cover', lines: ['CONTRAPPUNTO'], layout: 'square', density: 0.2 },
  { id: 'r7', register: 'cover', lines: ['EQUAL TEMPERAMENT'], layout: 'square', density: 0.22 },
  { id: 'r8', register: 'between', lines: ['THE PAGE', 'A ROOM WITH NO DOOR'], layout: 'square', density: 0.5 },
  { id: 'r9', register: 'between', lines: ['NOTE', 'AND', 'REST', 'AND', 'NOTE'], layout: 'square', density: 0.55 },
  {
    id: 'r10',
    register: 'between',
    lines: ['I COUNT', 'THE SYLLABLES', 'LIKE COINS', 'THAT DO NOT SPEND'],
    layout: 'square',
    density: 0.65,
  },
  {
    id: 'r11',
    register: 'interior',
    lines: [
      'EACH LINE THE SAME LENGTH',
      'EACH LENGTH A CAGE',
      'I FILL THE CAGE',
      'TO THE EDGE AND STOP',
      'THE FRAME DECIDES',
      'WHAT THE VOICE MAY SAY',
      'SPACE IS A NUMBER',
      'AND THE NUMBER HOLDS',
      'WORD AGAINST WORD',
      'UNTIL THE SQUARE IS FULL',
    ],
    layout: 'square',
    density: 0.9,
  },
  {
    id: 'r12',
    register: 'interior',
    lines: [
      'ROW ONE THE SEA',
      'ROW TWO THE WAR',
      'ROW THREE THE MOTHER',
      'ROW FOUR THE PIANO',
      'ROW FIVE THE NAME',
      'I CANNOT KEEP',
      'ROW SIX THE SAME',
      'AS ROW ONE',
      'THE GRID REPEATS',
      'WHAT I REFUSE',
    ],
    layout: 'square',
    density: 0.92,
  },
]);
