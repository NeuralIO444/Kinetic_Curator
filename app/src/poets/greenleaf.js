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
