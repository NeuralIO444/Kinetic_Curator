// poets/greenleaf.js — John Greenleaf deck. Pure data. Every character must exist as a typ_* asset.
// #2002 (FIELD stamps slice 3) — each piece also carries its sentence face
// (caseLines): the same words in lowercase + punctuation, the way the verse
// sits in a book — dealt only when the Director calls for the case face
// (fieldForm.js). Greenleaf carries it because his pieces ARE sentences
// (the other decks are fragments and shouts by design) — and because the
// serif deal reads the same deck data, a serif + case deal is Whittier in
// her book face at full orthography. The caps lines remain the deck's
// default face; a piece without caseLines deals caps in every room.
export const GREENLEAF = Object.freeze([
  {
    id: 'g1',
    lines: ['THE SNOW LIES QUIET', 'ON THE HILL'],
    caseLines: ['The snow lies quiet', 'on the hill.'],
    layout: 'grid',
    density: 0.35,
  },
  {
    id: 'g2',
    lines: ['MORNING FROST', 'HOLDS THE FIELD'],
    caseLines: ['Morning frost', 'holds the field.'],
    layout: 'bands',
    density: 0.4,
  },
  {
    id: 'g3',
    lines: ['THE RIVER KEEPS', 'ITS OWN TIME'],
    caseLines: ['The river keeps', 'its own time.'],
    layout: 'grid',
    density: 0.3,
  },
  {
    id: 'g4',
    lines: ['QUIET LIGHT', 'ON THE STONE'],
    caseLines: ['Quiet light', 'on the stone.'],
    layout: 'bands',
    density: 0.45,
  },
]);

// #2151 — the register-spanning cache (see gibson.js GIBSON_REGISTER). Data only until the #2151 build deals it.
export const GREENLEAF_REGISTER = Object.freeze([
  { id: 'g5', register: 'cover', lines: ['HARVEST'], caseLines: ['Harvest.'], layout: 'grid', density: 0.15 },
  {
    id: 'g6',
    register: 'cover',
    lines: ['MIDWINTER EVENING'],
    caseLines: ['Midwinter evening.'],
    layout: 'grid',
    density: 0.18,
  },
  { id: 'g7', register: 'cover', lines: ['APPLE ORCHARD'], caseLines: ['Apple orchard.'], layout: 'grid', density: 0.18 },
  {
    id: 'g8',
    register: 'between',
    lines: ['THE BARN DOOR OPEN', 'TO THE SUMMER RAIN'],
    caseLines: ['The barn door open', 'to the summer rain.'],
    layout: 'bands',
    density: 0.35,
  },
  {
    id: 'g9',
    register: 'between',
    lines: ['STARS', 'ABOVE THE PASTURE', 'WAIT'],
    caseLines: ['Stars', 'above the pasture', 'wait.'],
    layout: 'grid',
    density: 0.3,
  },
  {
    id: 'g10',
    register: 'between',
    lines: ['THE MILL WHEEL TURNS', 'THE MILLER SINGS', 'THE GRAIN COMES DOWN', 'AND DUSK COMES ON'],
    caseLines: ['The mill wheel turns,', 'the miller sings,', 'the grain comes down,', 'and dusk comes on.'],
    layout: 'bands',
    density: 0.5,
  },
  {
    id: 'g11',
    register: 'interior',
    lines: [
      'THE WIND HAS DRIFTED',
      'SNOW AGAINST THE DOOR',
      'AND THE OLD CLOCK',
      'COUNTS THE EVENING DOWN',
      'WE DRAW OUR CHAIRS',
      'CLOSE TO THE FIRE',
      'AND SPEAK OF SUMMERS',
      'LONG GONE BY',
      'WHILE OUTSIDE THE FIELDS',
      'LIE WHITE AND STILL',
    ],
    caseLines: [
      'The wind has drifted',
      'snow against the door,',
      'and the old clock',
      'counts the evening down.',
      'We draw our chairs',
      'close to the fire',
      'and speak of summers',
      'long gone by,',
      'while outside the fields',
      'lie white and still.',
    ],
    layout: 'bands',
    density: 0.88,
  },
  {
    id: 'g12',
    register: 'interior',
    lines: [
      'THE SCHOOLHOUSE STOOD',
      'BESIDE THE ROAD',
      'ITS WINDOWS BRIGHT',
      'WITH WINTER SUN',
      'WE CARVED OUR NAMES',
      'INTO THE DESKS',
      'AND LEARNED THE RIVERS',
      'OF THE WORLD',
      'BY HEART',
      'AND NEVER SAW',
      'A SINGLE ONE',
    ],
    caseLines: [
      'The schoolhouse stood',
      'beside the road,',
      'its windows bright',
      'with winter sun.',
      'We carved our names',
      'into the desks',
      'and learned the rivers',
      'of the world',
      'by heart,',
      'and never saw',
      'a single one.',
    ],
    layout: 'grid',
    density: 0.9,
  },
]);
