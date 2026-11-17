// poets/gibson.js — William Gibson deck. Pure data. Sparse, hard edges.
export const GIBSON = Object.freeze([
  { id: 'w1', lines: ['THE STREET', 'FINDS ITS OWN'], layout: 'single', density: 0.25 },
  { id: 'w2', lines: ['CHROME', 'AND THE CUT'], layout: 'single', density: 0.3 },
  { id: 'w3', lines: ['NIGHT CITY', 'KEEPS THE EDGE'], layout: 'two', density: 0.28 },
  { id: 'w4', lines: ['THE JACK', 'IS THE DOOR'], layout: 'single', density: 0.22 },
]);

// #2151 — the register-spanning cache (Matt, 2026-11-12/17): pieces from the cover pole (one word, or a short masthead)
// through the middle to the interior pole (dense paragraphs). Written for Matt's yes (2026-11-17). Not dealt yet: the
// #2151 build wires this cache into the deal; until then it is data only, so today's deals are unchanged.
// register: 'cover' | 'between' | 'interior'. A one-word piece rides the one-word exception ruled on #2151.
export const GIBSON_REGISTER = Object.freeze([
  { id: 'w5', register: 'cover', lines: ['ICEBREAKER'], layout: 'single', density: 0.15 },
  { id: 'w6', register: 'cover', lines: ['TRANSMISSION'], layout: 'single', density: 0.15 },
  { id: 'w7', register: 'cover', lines: ['SECONDHAND FUTURE'], layout: 'single', density: 0.18 },
  { id: 'w8', register: 'between', lines: ['THE MALL AT NIGHT', 'HOLDS ITS BREATH'], layout: 'two', density: 0.3 },
  { id: 'w9', register: 'between', lines: ['SIGNAL', 'NOISE', 'SIGNAL'], layout: 'two', density: 0.35 },
  { id: 'w10', register: 'between', lines: ['EVERY LOGO', 'A FLAG', 'EVERY FLAG', 'FOR SALE'], layout: 'two', density: 0.45 },
  {
    id: 'w11',
    register: 'interior',
    lines: [
      'RAIN ON THE OVERPASS',
      'AND THE SCREENS STILL LIT',
      'SOMEBODY SELLING MEMORY',
      'BY THE GRAM UNDER NEON',
      'THE CROWD MOVES LIKE DATA',
      'NOBODY LOOKS UP',
      'A DEAD SIGNAL HUMS',
      'IN THE WIRE OVERHEAD',
      'THE CITY DOES NOT SLEEP',
      'IT IDLES',
    ],
    layout: 'two',
    density: 0.88,
  },
  {
    id: 'w12',
    register: 'interior',
    lines: [
      'THE MARKET UNDER THE BRIDGE',
      'TRADES IN EYES AND LUNGS',
      'AND OLD CODE ON SCRATCHED DISKS',
      'A KID WITH A CHEAP DECK',
      'READS THE CROWD FOR WEAKNESS',
      'THE COPS FLY OVER',
      'LOW AND BORED',
      'SOMEWHERE A SERVER WAKES',
      'AND COUNTS US ALL',
      'AGAIN',
    ],
    layout: 'two',
    density: 0.9,
  },
]);
