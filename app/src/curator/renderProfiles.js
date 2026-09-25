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
// All 10 personas have profiles now: the 4 proving voices Matt named
// first (Davis, Karl Benjamin, Casey Reas, Ernst Haeckel) plus the six
// built from the deep research dossiers (Molnar, Mohr, Anadol, Menkman,
// Oxman, Stock). Stock is dual-mode (tubes / vorticity field) — `modes`
// rolls one per candidate. A future MLX ranker replaces the scorer, not
// these profiles.
//
// Motion biases (wind / flap / breath / lifeDrift) and `behave` forces are a
// DRAFT (#518 b): first-pass taste read off each persona's rationale, meant to
// be tuned by ear after playing — not measurements.
//
// DISPLAY POLICY (Matt's IP caution): profile `name` fields keep the real
// artist name as honest lineage IN CODE ONLY — the product surface shows
// the TE-style alias from personaTastes.js (voice selector, "persona pick:
// <alias>" hint). The persona palette catalog names are the aliases for
// the same reason.

export const RENDER_PROFILE_IDS = ['davis', 'benjamin', 'reas', 'haeckel',
  'molnar', 'mohr', 'anadol', 'menkman', 'oxman', 'stock'];

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
      wind: [0.6, 1.6],
      flap: [0.3, 0.7],
      breath: [0.1, 0.5],
      lifeDrift: [0.3, 0.7],
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
      wind: [0.2, 0.5],
      flap: [0.05, 0.2],
      breath: [0, 0.1],
      lifeDrift: [0.1, 0.25],
    },
    forces: { accumulationOptics: 0, accumulation: false, behave: 'cruise' },
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
      wind: [1.0, 2.0],
      flap: [0.4, 0.9],
      breath: [0.2, 0.6],
      lifeDrift: [0.5, 0.9],
    },
    forces: { accumulation: true, behave: 'flock' },
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
      wind: [0.2, 0.6],
      flap: [0.05, 0.25],
      breath: [0.4, 0.8],
      lifeDrift: [0.15, 0.4],
    },
    forces: { symmetry: 'bilateral', accumulationOptics: 0, behave: 'orbit' },
  },
  {
    id: 'molnar',
    name: 'Vera Molnár',
    paletteId: 'persona-molnar',
    rationale:
      'Molnár is programmed order with a wry 1% disturbance: dense uniform ' +
      'thin marks in narrow rotation bands (the 0°/45°/90° dash vocabulary ' +
      'approximated by tight rotate spreads), near-static motion, flat ' +
      'plotter fields, glow and trails forced off — the finished work ' +
      'bears no trace of struggle. Palette: her (Des)Ordres, 1974 full ' +
      'color set (pink, red, green, orange, yellow, purple, blue, ink) on ' +
      'warm plotter paper — per the research dossier, which corrects the ' +
      'near-monochrome reputation as incomplete.',
    gaps: [
      'No plotter-line drawing: the engine scatters sprites, it cannot ' +
      'draw sequential uniform line segments or the labyrinthine dash ' +
      'maze register.',
      'No 1%-disturbance logic: her signature tilted/erased element is a ' +
      'deliberate single delta, not random jitter.',
      'No serial-variant presentation: one algorithm, a family of ' +
      'variations shown side by side.',
      'Near-static, but not frozen: the engine always breathes a little.',
    ],
    biases: {
      count: [200, 600],
      scale: [[0.1, 0.4], [1.0, 1.4]],
      rotate: [[-45, 0], [0, 45]],
      alpha: [[50, 60], [90, 100]],
      jitter: [0, 20],
      density: [80, 120],
      zTiers: [1, 2],
      noiseFreq: [0.002, 0.008],
      noiseSpeed: [0.1, 0.3],
      displacement: [0, 20],
      particleCount: [50, 150],
      swarmCohesion: [0.2, 1.0],
      gravityWells: [0.1, 1.0],
      damping: [0.95, 0.98],
      wind: [0.2, 0.5],
      flap: [0.05, 0.2],
      breath: [0, 0.15],
      lifeDrift: [0.1, 0.3],
    },
    forces: { accumulationOptics: 0, accumulation: false, behave: 'cruise' },
  },
  {
    id: 'mohr',
    name: 'Manfred Mohr',
    paletteId: 'persona-mohr',
    rationale:
      'Mohr is iron discipline: sparse bold forms floating in generous ' +
      'negative space (density pushed low), opaque marks, tight jitter, ' +
      'slow inevitable motion, flat matte — glow and trails forced off. ' +
      'Diagonal rotation bands nod to his diagonal-path slash across the ' +
      'square. Palette: the late register — flat black ground, expanded ' +
      'white, contour grays, with acid green / signal blue / rose magenta ' +
      'thin diagonals, color as a named parameter (his "2 of 24 fields ' +
      'are white" rule spirit).',
    gaps: [
      'No cube/hypercube geometry: the engine cannot construct the ' +
      'combinatorial edge-sets or diagonal paths that are his entire motif.',
      'No faint construction lines or hairline rules as system evidence.',
      'The early (1962–1999) black-on-warm-paper register is not ' +
      'expressed — this profile takes the late flat-black lineage.',
      'No systematic enumeration: rows that progressively remove ' +
      'contour lines until the cube dissolves.',
    ],
    biases: {
      count: [60, 240],
      scale: [[0.6, 1.0], [1.0, 2.2]],
      rotate: [[-45, 0], [0, 45]],
      alpha: [[50, 60], [95, 100]],
      jitter: [0, 15],
      density: [30, 70],
      zTiers: [1, 3],
      noiseFreq: [0.002, 0.008],
      noiseSpeed: [0.1, 0.5],
      displacement: [0, 25],
      particleCount: [50, 120],
      swarmCohesion: [0.2, 1.0],
      gravityWells: [0.1, 1.0],
      damping: [0.95, 0.98],
      wind: [0.2, 0.7],
      flap: [0.05, 0.3],
      breath: [0, 0.2],
      lifeDrift: [0.1, 0.3],
    },
    forces: { accumulationOptics: 0, accumulation: false, behave: 'cruise' },
  },
  {
    id: 'anadol',
    name: 'Refik Anadol',
    paletteId: 'persona-anadol',
    rationale:
      'Anadol is weather, not drawing: full-bleed soft translucent masses ' +
      '(low alpha floors), large scales, deep parallax layering (zTiers ' +
      'high), ceaseless surging motion, effervescent particle surf, ' +
      'damping low so nothing ever freezes — a static frame is a bug. ' +
      'Luminosity forced up (accumulationOptics 0.2, at the top of the ' +
      'usable GLOW range) with trails on: color reads as emitted light on ' +
      'the LED wall. Palette: the dark lineage — Unsupervised / Melting ' +
      'Memories deep purple-black ground, petal magenta, crimson depth, ' +
      'pollen gold, glacier teal, coral ribbon, lagoon cyan, dusk salmon, ' +
      'ember orange.',
    gaps: [
      'No volumetric fluid rendering: the engine\'s marks have edges; ' +
      'his masses are continuous and edgeless everywhere.',
      'No chapter logic or slow cross-dissolves between animation styles.',
      'No latent-space walk: the palette is fixed, not derived from a ' +
      'dataset per press.',
      'The white-ground Nature Dreams chapter is not expressed — this ' +
      'profile takes the dark lineage.',
    ],
    biases: {
      count: [150, 400],
      scale: [[0.8, 1.0], [1.6, 3.0]],
      rotate: [[-180, 0], [0, 180]],
      alpha: [[15, 40], [70, 90]],
      jitter: [20, 100],
      density: [80, 120],
      zTiers: [5, 10],
      noiseFreq: [0.003, 0.009],
      noiseSpeed: [0.8, 2.0],
      displacement: [60, 150],
      particleCount: [150, 300],
      swarmCohesion: [0.2, 1.0],
      gravityWells: [0.2, 1.5],
      damping: [0.90, 0.94],
      wind: [1.2, 2.0],
      flap: [0.5, 0.9],
      breath: [0.3, 0.7],
      lifeDrift: [0.6, 0.9],
    },
    forces: { accumulationOptics: 0.2, accumulation: true, behave: 'flock' },
  },
  {
    id: 'menkman',
    name: 'Rosa Menkman',
    paletteId: 'persona-menkman',
    rationale:
      'Menkman is rupture as format: hard opaque rectilinear blocks ' +
      '(rotation pinned near zero — no diagonals of intent), damage that ' +
      'runs to the edges (density high), displacement high so every smear ' +
      'has a vector, trails forced ON as datamosh P-frame propagation, ' +
      'glow forced to 0 — anti-aliasing is the enemy. Palette: the ground ' +
      'stays neutral (ink black) and the color is evidence — acid green ' +
      'pixel-sort columns, bone white, and the JPEG2000 wavelet-fringe ' +
      'error set (magenta, blue, yellow, green, cyan).',
    gaps: [
      'No host image to rupture: her glitch needs a recognizable source ' +
      'so the break reads as a break; the engine generates abstraction ' +
      'with no source frame.',
      'No macroblock geometry, DCT blocks, codec tear lines, or genuine ' +
      'datamosh propagation — the engine has no codec layer.',
      'No forensic-compare presentation (one source × N formats).',
    ],
    biases: {
      count: [200, 500],
      scale: [[0.3, 0.8], [1.0, 2.0]],
      rotate: [[-15, 0], [0, 15]],
      alpha: [[50, 60], [90, 100]],
      jitter: [0, 50],
      density: [70, 120],
      zTiers: [1, 4],
      noiseFreq: [0.002, 0.010],
      noiseSpeed: [0.5, 1.5],
      displacement: [40, 120],
      particleCount: [100, 250],
      swarmCohesion: [0.2, 1.5],
      gravityWells: [0.1, 1.5],
      damping: [0.90, 0.95],
      wind: [0.6, 2.0],
      flap: [0.2, 0.9],
      breath: [0, 0.3],
      lifeDrift: [0.3, 0.9],
    },
    forces: { accumulationOptics: 0, accumulation: true, behave: 'scatter' },
  },
  {
    id: 'oxman',
    name: 'Neri Oxman',
    paletteId: 'persona-oxman',
    rationale:
      'Oxman is one structure grown in a void: density pushed low so a ' +
      'single coherent form floats in generous neutral space (her ' +
      'white-on-white gallery staging), bilateral symmetry forced for the ' +
      'chrysalis read, swarm cohesion and gravity wells high so fibers ' +
      'gather to the structure, motion near-static (a slow growth arc), ' +
      'glow forced to 0 — matte, never glossy. Palette: material colors ' +
      'only — cocoon white ground, silk shadow, chitin amber, biopolymer ' +
      'umber, honey deposit, bone rib, weathered fiber, aperture dark.',
    gaps: [
      'No deposition-path line: her "line" is thread courses and ' +
      'extrusion ridges, not drawn marks.',
      'No material translucency or hygroscopic darkening: engine marks ' +
      'are lit sprites, not amber membranes with visible weave.',
      'No growth/decay lifecycle: programmed decay and endings don\'t ' +
      'exist in the live loop.',
      'No environmental scalar fields driving fiber density.',
    ],
    biases: {
      count: [100, 350],
      scale: [[0.5, 1.0], [1.0, 2.5]],
      rotate: [[-180, 0], [0, 180]],
      alpha: [[50, 60], [80, 100]],
      jitter: [0, 30],
      density: [20, 50],
      zTiers: [3, 6],
      noiseFreq: [0.002, 0.008],
      noiseSpeed: [0.1, 0.3],
      displacement: [0, 30],
      particleCount: [100, 250],
      swarmCohesion: [1.5, 4.0],
      gravityWells: [1.0, 3.0],
      damping: [0.95, 0.98],
      wind: [0.6, 1.4],
      flap: [0.3, 0.7],
      breath: [0.4, 0.8],
      lifeDrift: [0.4, 0.8],
    },
    forces: { accumulationOptics: 0, symmetry: 'bilateral', behave: 'mold' },
  },
  {
    id: 'stock',
    name: 'Mark Stock',
    paletteId: 'persona-stock',
    rationale:
      'Stock works in TWO real modes and the profile honors both: per ' +
      'candidate it rolls (A) the lit tube sculpture — a coherent tangle ' +
      'floating in a void (density low, cohesion and wells high, calm ' +
      'motion) — or (B) the full-frame vorticity field — all-over ' +
      'turbulence (count and density maxed, displacement high, never ' +
      'settling). Both read photographic, so glow stays forced off. ' +
      'Palette: one catalog entry compromises the two stagings — deep ' +
      'warm charcoal ground (Dynamo\'s taupe void meets Magma 19\'s char) ' +
      'carrying tube bone, ember core, olive/copper streamlines, vortex ' +
      'blue, eddy green, magma red, slate void.',
    gaps: [
      'No streamline tubes: the engine cannot render tapering 3D ' +
      'cylinders with real light transport.',
      'No vorticity colormap: the engine has no fluid simulation; ' +
      'turbulence is faked with flow fields and displacement.',
      'No energetic arc: birth, peak turbulence, decay — the live loop ' +
      'is perpetual.',
      'One palette compromises the two grounds; the true taupe void ' +
      'and true char ground each want their own entry.',
    ],
    modes: {
      tubes: {
        note: 'Mode A — lit streamline-tube sculpture floating in a void.',
        biases: {
          count: [150, 350],
          scale: [[0.4, 1.0], [1.0, 2.4]],
          rotate: [[-180, 0], [0, 180]],
          alpha: [[50, 60], [80, 100]],
          jitter: [0, 40],
          density: [25, 60],
          zTiers: [4, 8],
          noiseFreq: [0.002, 0.008],
          noiseSpeed: [0.2, 0.8],
          displacement: [0, 60],
          particleCount: [100, 250],
          swarmCohesion: [1.5, 4.0],
          gravityWells: [1.0, 3.0],
          damping: [0.93, 0.97],
          wind: [0.4, 1.0],
          flap: [0.1, 0.4],
          breath: [0, 0.3],
          lifeDrift: [0.2, 0.5],
        },
        forces: { accumulationOptics: 0, accumulation: false, behave: 'cruise' },
      },
      field: {
        note: 'Mode B — full-frame vorticity colormap field, edge to edge.',
        biases: {
          count: [300, 600],
          scale: [[0.3, 1.0], [1.0, 2.8]],
          rotate: [[-180, 0], [0, 180]],
          alpha: [[30, 60], [70, 100]],
          jitter: [10, 80],
          density: [90, 120],
          zTiers: [2, 5],
          noiseFreq: [0.003, 0.012],
          noiseSpeed: [0.6, 1.6],
          displacement: [40, 120],
          particleCount: [150, 300],
          swarmCohesion: [0.2, 1.2],
          gravityWells: [0.2, 1.5],
          damping: [0.90, 0.95],
          wind: [1.2, 2.0],
          flap: [0.3, 0.7],
          breath: [0, 0.2],
          lifeDrift: [0.4, 0.8],
        },
        forces: { accumulationOptics: 0, accumulation: false, behave: 'orbit' },
      },
    },
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
const randInt = (lo, hi, rng) => Math.floor(lo + rng() * (hi - lo + 1));

function rollBias(key, spec, rng) {
  switch (key) {
    case 'count':
    case 'jitter':
    case 'density':
    case 'zTiers':
    case 'displacement':
    case 'particleCount':
      return randInt(spec[0], spec[1], rng);
    case 'scale': {
      const [[a, b], [c, d]] = spec;
      return [r2(a + rng() * (b - a)), r2(c + rng() * (d - c))];
    }
    case 'rotate': {
      const [[a, b], [c, d]] = spec;
      return [Math.floor(a + rng() * (b - a + 1)), Math.floor(c + rng() * (d - c + 1))];
    }
    case 'alpha': {
      const [[a, b], [c, d]] = spec;
      return [Math.floor(a + rng() * (b - a + 1)), Math.floor(c + rng() * (d - c + 1))];
    }
    case 'noiseFreq': {
      const [a, b] = spec;
      return r4(a + rng() * (b - a));
    }
    case 'noiseSpeed':
    case 'swarmCohesion':
    case 'gravityWells':
    case 'damping':
    case 'wind':
    case 'flap':
    case 'breath':
    case 'lifeDrift': {
      const [a, b] = spec;
      return r2(a + rng() * (b - a));
    }
    default:
      return undefined;
  }
}

/**
 * Dream one candidate in the persona's visual language. Pure: returns a new
 * object, never mutates the input. Unknown/null profile id → returns the
 * input UNCHANGED (same reference) — the "off" path is a no-op by design.
 * Profiles with `modes` (currently only stock: tube sculpture vs vorticity
 * field) roll one mode per candidate.
 */
export function applyRenderProfile(candidate, profileId, rng = Math.random) {
  const profile = getRenderProfile(profileId);
  if (!profile) return candidate;
  let { biases, forces } = profile;
  if (profile.modes) {
    const keys = Object.keys(profile.modes);
    const mode = profile.modes[keys[Math.floor(rng() * keys.length)]];
    biases = mode.biases;
    forces = mode.forces;
  }
  const out = { ...candidate };
  for (const [key, spec] of Object.entries(biases)) {
    if (key in out) {
      const v = rollBias(key, spec, rng);
      if (v !== undefined) out[key] = v;
    }
  }
  for (const [key, value] of Object.entries(forces)) {
    out[key] = value;
  }
  return out;
}
