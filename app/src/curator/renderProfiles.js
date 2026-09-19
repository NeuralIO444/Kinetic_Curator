// renderProfiles.js — persona render profiles for the Curator.
//
// PR #375's scorer could TASTE candidates but not DRAW them: every persona
// picked from the same engine soup, so switching voices never jumped in
// color, style, or rendering. A render profile gives a persona a visual
// language at GENERATION time: a palette (catalog id), generation biases
// (persona-shaped ranges for the randomized keys), and forces (hard-set
// params like glow-off). The profile dreams each candidate in the persona's
// voice; the #375 scorer then ranks those shaped candidates as before.
//
// SOURCE OF TRUTH for aesthetics: ~/workspace/your_files/personas/<slug>.md
// (NOT in this repo — they live in the user's files). Each profile is an
// HONEST INTERPRETATION: `rationale` says what was chosen and why, `gaps`
// lists what the persona file asks for that the current engine cannot
// express. Nothing is faked: every bias is a subset of randomizeKey's real
// ranges (app/src/state/paramUtils.js), every force is a real layoutParams
// key, every palette is a real catalog entry in app/src/data/palettes.js.
//
// Only 4 of the 10 personas have profiles — the proving set Matt named
// (Davis, Karl Benjamin, Casey Reas, Ernst Haeckel). The other 6 keep the
// #375 behavior: scoring only, no generation shaping. A future MLX ranker
// replaces the scorer, not these profiles.
//
// DISPLAY POLICY (Matt's IP caution): profile `name` fields keep the real
// artist name as honest lineage IN CODE ONLY — the product surface shows
// the TE-style alias from personaTastes.js (voice selector, "persona pick:
// <alias>" hint). The persona palette catalog names are the aliases for
// the same reason.

export const RENDER_PROFILE_IDS = ['davis', 'benjamin', 'reas', 'haeckel'];

export const RENDER_PROFILES = [
  {
    id: 'davis',
    name: 'Joshua Davis',
    paletteId: 'persona-davis',
    rationale:
      'Davis is controlled chaos: maximum density of legible modules, wide ' +
      'size variety, translucent overlap (alpha kept mid-to-full), deep ' +
      'layering (zTiers high) to fake his drop-shadow depth, moderate flow ' +
      'so compositions feel alive but not formless. Palette: acid brights ' +
      'and jewel tones on near-black — his praystation screen ground — per ' +
      'the persona file ("acid brights, jewel tones, tuned duotone runs") ' +
      'and Matt\'s reference of hot translucent ribbons.',
    gaps: [
      'No vector-module library: the engine\'s marks are generic sprites, ' +
      'not Davis\'s hand-illustrated blobs/botanicals/skulls. Density and ' +
      'overlap approximate the collage; the modules themselves don\'t exist.',
      'No weighted-probability asset instancing or rare "hard-to-acquire" ' +
      'color gating — every mark draws from the same pool.',
      'No drop-shadows: zTiers layering fakes depth over flat fills, but ' +
      'there is no actual shadow pass.',
      'No viewer-proximity mutation behaviors.',
    ],
    biases: {
      count: [380, 600],
      scale: [[0.3, 1.0], [1.0, 2.8]],
      rotate: [[-180, 0], [0, 180]],
      alpha: [[25, 60], [70, 100]],
      jitter: [0, 60],
      density: [80, 120],
      zTiers: [4, 10],
      noiseFreq: [0.003, 0.010],
      noiseSpeed: [0.3, 1.2],
      displacement: [0, 60],
      particleCount: [120, 300],
      swarmCohesion: [0.4, 2.0],
      gravityWells: [0.5, 2.5],
      damping: [0.92, 0.97],
    },
    forces: {},
  },
  {
    id: 'benjamin',
    name: 'Karl Benjamin',
    paletteId: 'persona-benjamin',
    rationale:
      'Benjamin is color-as-subject inside hard structure: fewer, larger, ' +
      'fully opaque flat shapes (alpha pinned near 100), near-zero jitter ' +
      'and displacement, minimal layering (zTiers 1–3), near-static motion. ' +
      'The signature move is the FORCES: accumulationOptics forced to 0 ' +
      '(no bloom/halation — Benjamin has no atmospheric effects) and ' +
      'accumulation forced off (no trails — every field is a finished flat ' +
      'state). Palette: burning red, aqua, bright green, golden yellow, ' +
      'zinging violet, burgundy, umber, ink on a quiet neutral ground — ' +
      'per Ray Zone ("grid of primary colors, yellow, aqua and bright ' +
      'green... against a quietly neutral background") and the persona ' +
      'file ("browns, greens, grays, burgundies electrified by zinging ' +
      'violets and burning yellow-reds").',
    gaps: [
      'No true polygons: the engine cannot draw tape-hard geometric cells, ' +
      'grids, or stripes. Large opaque marks with zero glow and zero ' +
      'trails are the closest honest approximation of flat hard-edge fields.',
      'No neighbor-aware color tension: Benjamin chooses each cell\'s color ' +
      'against its neighbors; the engine fills from the palette pool with ' +
      'no adjacency logic.',
      'No black-latticework compositions.',
    ],
    biases: {
      count: [60, 220],
      scale: [[0.8, 1.0], [1.6, 3.0]],
      rotate: [[-90, 0], [0, 90]],
      alpha: [[50, 60], [95, 100]],
      jitter: [0, 15],
      density: [60, 110],
      zTiers: [1, 3],
      noiseFreq: [0.002, 0.006],
      noiseSpeed: [0.1, 0.4],
      displacement: [0, 20],
      particleCount: [50, 120],
      swarmCohesion: [0.2, 1.0],
      gravityWells: [0.1, 1.0],
      damping: [0.94, 0.98],
    },
    forces: { accumulationOptics: 0, accumulation: false },
  },
  {
    id: 'reas',
    name: 'Casey Reas',
    paletteId: 'persona-reas',
    rationale:
      'Reas is the engine\'s native tongue: thousands of tiny simple marks ' +
      'following flow rules until emergence appears. Count pushed to the ' +
      'engine cap, scale tiny, flow energy high, damping low so motion never ' +
      'settles, swarm cohesion and gravity wells up for emergent clustering. ' +
      'Trails forced ON (accumulation: true) — the mark as a trace of ' +
      'behavior, his dual-surface "soft accumulating strokes" reading. ' +
      'Palette: strict monochrome, white/gray on black — his Process 18 ' +
      'bitforms reading ("simple white lines rapidly dart and cluster ' +
      'across a black background").',
    gaps: [
      'Count caps at 600; Reas fields run to thousands of elements. ' +
      'Density is as close as the engine gets.',
      'No erasure sweep: Reas\'s periodic background-colored wave that ' +
      'wipes accumulated trails while live elements persist doesn\'t exist.',
      'No dual-surface rendering (hard 1px lines AND painterly accumulation ' +
      'of the same simulation side by side).',
      'No plain-language instruction panel executed literally.',
    ],
    biases: {
      count: [300, 600],
      scale: [[0.1, 0.4], [1.0, 1.2]],
      rotate: [[-180, 0], [0, 180]],
      alpha: [[40, 60], [70, 100]],
      jitter: [0, 40],
      density: [70, 120],
      zTiers: [1, 4],
      noiseFreq: [0.004, 0.012],
      noiseSpeed: [0.6, 2.0],
      displacement: [0, 80],
      particleCount: [150, 300],
      swarmCohesion: [1.0, 4.0],
      gravityWells: [0.8, 3.0],
      damping: [0.90, 0.94],
    },
    forces: { accumulation: true },
  },
  {
    id: 'haeckel',
    name: 'Ernst Haeckel',
    paletteId: 'persona-haeckel',
    rationale:
      'Haeckel is symmetry as organizing law on a void ground: bilateral ' +
      'symmetry forced on (the engine\'s closest to his radial/bilateral ' +
      'plates — there is no radial mode), fine small marks at high counts ' +
      'for stipple-like detail density, calm near-static motion (slow ' +
      'ornamental breathing only), restrained density so the specimen sits ' +
      'on void rather than full-bleed. Glow forced to 0 — engraving is ' +
      'matte, never luminous. Palette: ink-black on cream paper with muted ' +
      'green, delicate pink, sepia, blue-grey, amber — per the persona file ' +
      'and the Art Forms in Nature review ("delicate, filigreed lines, ' +
      'colored gently with muted green, delicate pink, and sepia").',
    gaps: [
      'No radial symmetry mode: SYMMETRY_MODES is none/bilateral/stamp. ' +
      'Bilateral is forced as the closest; true n-fold radial specimen ' +
      'arrangement is impossible today.',
      'No stipple engraving: particleCount approximates fine detail ' +
      'density, but the engine cannot render curvature-proportional ' +
      'stipple or cross-hatching.',
      'No taxonomic labels, plate numerals, or serif caption graphics.',
      'No organism legibility: the engine\'s marks are abstract; Haeckel\'s ' +
      'anatomy (radiolarians, medusae, lattice shells) has no counterpart.',
    ],
    biases: {
      count: [200, 500],
      scale: [[0.1, 0.5], [1.0, 1.2]],
      rotate: [[-180, 0], [0, 180]],
      alpha: [[45, 60], [85, 100]],
      jitter: [0, 30],
      density: [40, 90],
      zTiers: [2, 5],
      noiseFreq: [0.002, 0.008],
      noiseSpeed: [0.1, 0.5],
      displacement: [0, 40],
      particleCount: [200, 300],
      swarmCohesion: [0.2, 1.2],
      gravityWells: [0.5, 2.0],
      damping: [0.94, 0.98],
    },
    forces: { symmetry: 'bilateral', accumulationOptics: 0 },
  },
];

export function getRenderProfile(id) {
  return RENDER_PROFILES.find((p) => p.id === id) ?? null;
}

// ─── biased rolling ─────────────────────────────────────────────────────
// Mirrors randomizeKey's distribution shapes (app/src/state/paramUtils.js)
// but rolls inside the profile's ranges. Specs: int scalars [lo, hi],
// range pairs [[lo1, hi1], [lo2, hi2]], float scalars [lo, hi] with the
// same decimal precision randomizeKey uses.

const r2 = (v) => +(v.toFixed(2));
const r4 = (v) => +(v.toFixed(4));
const randInt = (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1));

function rollBias(key, spec) {
  switch (key) {
    case 'count':
    case 'jitter':
    case 'density':
    case 'zTiers':
    case 'displacement':
    case 'particleCount':
      return randInt(spec[0], spec[1]);
    case 'scale': {
      const [[a, b], [c, d]] = spec;
      return [r2(a + Math.random() * (b - a)), r2(c + Math.random() * (d - c))];
    }
    case 'rotate': {
      const [[a, b], [c, d]] = spec;
      return [Math.floor(a + Math.random() * (b - a + 1)), Math.floor(c + Math.random() * (d - c + 1))];
    }
    case 'alpha': {
      const [[a, b], [c, d]] = spec;
      return [Math.floor(a + Math.random() * (b - a + 1)), Math.floor(c + Math.random() * (d - c + 1))];
    }
    case 'noiseFreq': {
      const [a, b] = spec;
      return r4(a + Math.random() * (b - a));
    }
    case 'noiseSpeed':
    case 'swarmCohesion':
    case 'gravityWells':
    case 'damping': {
      const [a, b] = spec;
      return r2(a + Math.random() * (b - a));
    }
    default:
      return undefined;
  }
}

/**
 * Dream one candidate in the persona's visual language. Pure: returns a new
 * object, never mutates the input. Unknown/null profile id → returns the
 * input UNCHANGED (same reference) — the "off" path is a no-op by design.
 */
export function applyRenderProfile(candidate, profileId) {
  const profile = getRenderProfile(profileId);
  if (!profile) return candidate;
  const out = { ...candidate };
  for (const [key, spec] of Object.entries(profile.biases)) {
    if (key in out) {
      const v = rollBias(key, spec);
      if (v !== undefined) out[key] = v;
    }
  }
  for (const [key, value] of Object.entries(profile.forces)) {
    out[key] = value;
  }
  return out;
}
