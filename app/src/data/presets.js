import { resolveLookId } from './taxonomy.js';
// Each chip is a designer brief. params must make that brief visible on click.
export const PRESET_GROUPS = [
  { id: 'firstlight', label: 'First Light' },
  { id: 'showcase', label: 'Showcase' },
  { id: 'classic', label: 'Classic' },
  { id: 'rendah',  label: 'Rendah Mag' },
  { id: 'ca',      label: 'Cellular Automaton' },
  { id: 'davis',   label: 'Ghost-Lineage' },
  { id: 'bio',     label: 'Bio-Drives' },
];

export const COMPOSITION_PRESETS = [
  {
    id: 'praystation', name: 'ORIGIN', group: 'classic',
    desc: 'Dense glyph bloom — phi spiral, slow breath, no boids',
    categories: ['organic', 'radial', 'stamps'], paletteShift: 'band',
    params: {
      mode: 'fibonacci', count: 240, scale: [0.4, 1.5], rotate: [-55, 55], alpha: [40, 96],
      zTiers: 4, jitter: 12, density: 82, bleed: false, mirror: false, overlap: true,
      lifeDrift: 0.18, noiseSpeed: 0.2, displacement: 8, flap: 0.12, wind: 0.2, behave: 'cruise',
    },
  },
  {
    id: 'fujimoto-prism', name: 'FUJIMOTO PRISM', group: 'rendah',
    desc: 'Hard scan — dense grid, zone color',
    categories: ['geometric', 'linework', 'crystalline'], paletteShift: 'zone',
    params: {
      mode: 'grid', count: 280, scale: [0.28, 1.35], rotate: [-90, 90], alpha: [22, 70],
      zTiers: 5, jitter: 16, density: 92, bleed: true, mirror: true, overlap: true,
      lifeDrift: 0.06, displacement: 6, behave: 'cruise',
    },
  },
  // --- Rendah style pack: six one-click voices translating the magazine's
  // world and its featured artists. Data-only — every mode and param
  // referenced already exists. Presets are layout-only per #555: palettes
  // are paired by name in each desc (bio-preset convention), never carried.
  {
    id: 'kurokawa-scan', name: 'KUROKAWA SCAN', group: 'rendah',
    desc: 'Glitch minimalism — sparse particle field, hard grid scanlines, one signal color on black. Pair with GLITCH.',
    categories: ['geometric', 'linework', 'dots'], paletteShift: 'zone',
    params: {
      mode: 'grid', count: 200, scale: [0.2, 0.9], rotate: [-90, 90], alpha: [30, 85],
      zTiers: 3, jitter: 4, density: 85, bleed: false, mirror: false, overlap: true,
      lifeDrift: 0.05, displacement: 0, behave: 'cruise',
    },
  },
  {
    id: 'ink-nebula', name: 'INK NEBULA', group: 'rendah',
    desc: 'Cosmic liquid ink — flow-field plumes colliding, pigment bleeding across the cast. Pair with INK NEBULA.',
    categories: ['organic', 'dots'], paletteShift: 'band',
    params: {
      mode: 'flow', count: 320, scale: [0.3, 1.2], rotate: [-45, 45], alpha: [30, 90],
      zTiers: 4, jitter: 14, density: 88, bleed: true, mirror: false, overlap: true,
      lifeDrift: 0.2, noiseSpeed: 0.3, displacement: 24, wind: 0.4, behave: 'cruise',
    },
  },
  {
    id: 'megacity', name: 'MEGACITY', group: 'rendah',
    desc: 'Stacked dusk — six mirrored depth tiers, amber windows in concrete haze, dramatic light. Pair with MEGACITY.',
    categories: ['geometric', 'linework'], paletteShift: 'zone',
    params: {
      mode: 'layers', count: 340, scale: [0.5, 1.6], rotate: [-8, 8], alpha: [45, 95],
      zTiers: 6, jitter: 6, density: 94, bleed: false, mirror: true, overlap: true,
      lifeDrift: 0.04, displacement: 0, behave: 'cruise',
    },
  },
  {
    id: 'dirty-signal', name: 'DIRTY SIGNAL', group: 'rendah',
    desc: 'Dirty and vibey — scattered hype organisms, scorched highlights, built for heavy grain. Pair with DIRTY.',
    categories: ['organic', 'dots'], paletteShift: 'zone',
    params: {
      mode: 'hype', count: 260, scale: [0.4, 1.4], rotate: [-70, 70], alpha: [40, 100],
      zTiers: 4, jitter: 16, density: 88, bleed: true, mirror: false, overlap: true,
      lifeDrift: 0.18, noiseSpeed: 0.3, displacement: 22, behave: 'scatter',
      particleCount: 240,
    },
  },
  {
    id: 'rendah-cover', name: 'RENDAH COVER', group: 'rendah',
    desc: 'Cover star — bold graphic forms on dark neutrals, one red hit. The magazine identity as a voice. Pair with RENDAH.',
    categories: ['geometric', 'linework'], paletteShift: 'split',
    params: {
      mode: 'grid', count: 240, scale: [0.4, 1.2], rotate: [-90, 90], alpha: [40, 95],
      zTiers: 4, jitter: 10, density: 90, bleed: false, mirror: false, overlap: true,
      lifeDrift: 0.08, displacement: 4, behave: 'cruise',
    },
  },
  {
    id: 'nastplas-bloom', name: 'NASTPLAS BLOOM', group: 'rendah',
    desc: 'Layered CGI bloom — mirrored hype scatter, zone-colored UV saturation, reality vs abstraction. Pair with NEONOIR.',
    categories: ['organic', 'dots'], paletteShift: 'zone',
    params: {
      mode: 'hype', count: 300, scale: [0.35, 1.3], rotate: [-60, 60], alpha: [45, 100],
      zTiers: 5, jitter: 12, density: 90, bleed: true, mirror: true, overlap: true,
      lifeDrift: 0.15, noiseSpeed: 0.25, displacement: 16, behave: 'scatter',
      particleCount: 260,
    },
  },
  {
    id: 'ghost-recoil', name: 'GHOST RECOIL ABACUS TOTEM', group: 'davis',
    desc: 'Abacus rows — near-zero rotate',
    categories: ['geometric', 'fragments', 'stamps'], paletteShift: 'split',
    params: {
      mode: 'abacus', count: 300, scale: [0.38, 1.1], rotate: [-4, 4], alpha: [38, 95],
      zTiers: 4, jitter: 3, density: 90, bleed: false, mirror: false, overlap: true,
      lifeDrift: 0.06, displacement: 0, behave: 'cruise',
    },
  },
  // --- #220 showcase library: 10 opinionated engine-mode presets.
  // Each pairs with the same-id catalog palette (see data/palettes.js) and a
  // render-proof project JSON under docs/presets/. One preset per engine
  // mode, pulled from existing systems — no invented modes.
  {
    // was: murmuration — Look id moved so it no longer collides with voice id murmuration (Deep Water). Alias in taxonomy.js.
    id: 'dusk-flock', name: 'DUSK FLOCK', group: 'showcase',
    desc: 'Dusk flock — cohesive swarm boids, tight damping, split ink on deep indigo',
    categories: ['organic', 'dots'], paletteShift: 'split',
    params: {
      mode: 'swarm', count: 300, scale: [0.3, 0.9], rotate: [-30, 30], alpha: [50, 100],
      zTiers: 5, jitter: 16, density: 88, bleed: true, mirror: false, overlap: true,
      particleCount: 280, swarmCohesion: 0.6, damping: 0.96, gravityWells: 0.4,
      lifeDrift: 0.12, displacement: 10, behave: 'flock',
    },
  },
  // #704 — CHIAROSCURO, the layout axis of the dark-glass mode. Pairs with the
  // same-id palette (data/palettes.js) the way the Rendah pack does: this chip
  // sets the layout, the palette chip sets the colour. Axes stay separate
  // (#555), so stepping into the mode is two deliberate presses, not one chip
  // that quietly swaps everything.
  {
    id: 'chiaroscuro', name: 'CHIAROSCURO', group: 'showcase',
    desc: 'Dark glass — a few large facets turning slowly, most of the plate left dark',
    categories: ['crystalline', 'geometric'], paletteShift: 'zone',
    params: {
      // SPARSE and LARGE are the whole brief: chiaroscuro is mostly dark, and
      // a high count tiles the plate until there is no dark left for the light
      // to be carved out of. The sparsest, largest, slowest preset in the set.
      // count 24, not 64: measured on the real canvas, 64 large facets TILE the
      // disc and only 22% of the plate is left dark — sparse on paper, dense in
      // the picture. At 24 the plate is 69% dark and the facets read as objects
      // in a room rather than a pattern.
      mode: 'fibonacci', count: 24, scale: [1.6, 3.0], rotate: [-180, 180], alpha: [70, 100],
      zTiers: 5, jitter: 42, density: 50, bleed: false, mirror: false, overlap: true,
      // 'normal', not 'screen': screen lifts every overlap toward white and the
      // dark ground is the point. Facets must occlude, not glow through.
      blendMode: 'normal',
      // Measured, not guessed: at the glow maximum this plate blows out to a
      // near-white bloom (mean luminance 0.24, 15%% of the frame above 0.75) and
      // the dark ground the mode is built on is gone. These values keep the
      // wake and the glow while the plate stays dark (mean 0.126, 1.4%% bright),
      // and they are stable over a long set rather than creeping brighter.
      accumulation: true, accumulationFade: 14, accumulationOptics: 0.08,
      lifeDrift: 0.10, noiseSpeed: 0.10, displacement: 8,
      flap: 0.1, wind: 0.35, behave: 'cruise',
    },
  },
  {
    id: 'neon-brood', name: 'NEON BROOD', group: 'showcase',
    desc: 'Blacklight organism — moth·hype at full scatter, zone-colored neon on black',
    categories: ['organic', 'biosynthetic', 'dots'], paletteShift: 'zone',
    params: {
      mode: 'hype', count: 240, scale: [0.5, 1.4], rotate: [-70, 70], alpha: [40, 100],
      zTiers: 4, jitter: 14, density: 85, bleed: true, mirror: false, overlap: true,
      lifeDrift: 0.2, displacement: 20, behave: 'scatter',
    },
  },
  {
    id: 'petri-bloom', name: 'PETRI BLOOM', group: 'showcase',
    desc: 'Agar colonies — mirrored CA, band coloring on a pale ground',
    categories: ['organic', 'dots'], paletteShift: 'band',
    params: {
      mode: 'ca', count: 400, scale: [0.25, 0.7], rotate: [-20, 20], alpha: [60, 100],
      zTiers: 3, jitter: 6, density: 92, bleed: false, mirror: true, overlap: true,
      lifeDrift: 0.1, displacement: 4, behave: 'cruise',
    },
  },
  {
    id: 'river-delta', name: 'RIVER DELTA', group: 'showcase',
    desc: 'Sediment flow — banded flow-field drift, soft blobs marbling over linework',
    categories: ['linework', 'organic'], paletteShift: 'band',
    params: {
      mode: 'flow', count: 420, scale: [0.4, 1.2], rotate: [-45, 45], alpha: [36, 92],
      zTiers: 4, jitter: 12, density: 90, bleed: true, mirror: false, overlap: true,
      lifeDrift: 0.1, noiseSpeed: 0.25, displacement: 30, behave: 'cruise',
    },
  },
  {
    id: 'static-bloom', name: 'STATIC BLOOM', group: 'showcase',
    desc: 'Phosphor interference — noise-warped dots, hard split with red/green hits',
    categories: ['dots'], paletteShift: 'split',
    params: {
      mode: 'noise', count: 500, scale: [0.2, 0.8], rotate: [-90, 90], alpha: [28, 80],
      zTiers: 5, jitter: 20, density: 95, bleed: true, mirror: false, overlap: true,
      lifeDrift: 0.08, displacement: 120, noiseFreq: 0.01, behave: 'scatter',
    },
  },
  {
    id: 'strata', name: 'STRATA', group: 'showcase',
    desc: 'Geological cut — mirrored layers mode, zone coloring, ochre over shale',
    categories: ['geometric', 'linework'], paletteShift: 'zone',
    params: {
      mode: 'layers', count: 320, scale: [0.6, 1.8], rotate: [-10, 10], alpha: [50, 95],
      zTiers: 6, jitter: 8, density: 96, bleed: false, mirror: true, overlap: true,
      lifeDrift: 0.05, displacement: 0, behave: 'cruise',
    },
  },
  {
    id: 'transit', name: 'TRANSIT', group: 'showcase',
    desc: 'Metro diagram — rails with full rotation, five-line zone coloring on paper',
    categories: ['linework', 'geometric'], paletteShift: 'zone',
    params: {
      mode: 'rails', count: 260, scale: [0.3, 1.0], rotate: [-90, 90], alpha: [50, 100],
      zTiers: 4, jitter: 10, density: 88, bleed: true, mirror: false, overlap: true,
      lifeDrift: 0.06, displacement: 6, behave: 'cruise',
    },
  },
  {
    id: 'solar-max', name: 'SOLAR MAX', group: 'showcase',
    desc: 'Coronal storm — mirrored radial bloom, band coloring from corona white to ember',
    categories: ['radial', 'organic'], paletteShift: 'band',
    params: {
      mode: 'radial', count: 360, scale: [0.5, 1.6], rotate: [-35, 35], alpha: [44, 98],
      zTiers: 4, jitter: 10, density: 86, bleed: true, mirror: true, overlap: true,
      lifeDrift: 0.22, displacement: 14, behave: 'cruise',
    },
  },
  {
    id: 'perihelion', name: 'PERIHELION', group: 'showcase',
    desc: 'Deep orbit burn — orbit rails on near-black, one ember accent against cold greys',
    categories: ['radial', 'dots'], paletteShift: 'split',
    params: {
      mode: 'orbit', count: 300, scale: [0.3, 1.1], rotate: [-100, 100], alpha: [34, 90],
      zTiers: 3, jitter: 4, density: 90, bleed: true, mirror: false, overlap: true,
      lifeDrift: 0.1, displacement: 0, behave: 'orbit',
    },
  },
  // --- #287 bio-drives: Oxman behavior through the creature systems.
  // Each preset is a voice for one drive. Palettes are paired by name in the
  // desc — presets don't carry palettes (paletteId is separate state).
  {
    id: 'bio-hunger', name: 'HUNGER', group: 'bio',
    desc: 'METABOLISM up — the cast tires, hungers, and clumps as it feeds. Pair with a dark palette.',
    categories: ['radial'], paletteShift: 'zone',
    params: {
      mode: 'hype', count: 220, scale: [0.4, 1.2], rotate: [-40, 40], alpha: [50, 100],
      zTiers: 4, jitter: 12, density: 85, bleed: true, mirror: false, overlap: true,
      lifeDrift: 0.15, noiseSpeed: 0.35, displacement: 18, behave: 'flock',
      particleCount: 200, metabolism: 1.4, breath: 0.15, graze: 0,
    },
  },
  {
    id: 'bio-mold', name: 'MOLD BLOOM', group: 'bio',
    desc: 'Slime-mold foraging — chemotaxis climbs its own scent trails. Slow. Pair with PETRI BLOOM.',
    categories: ['radial', 'linework'], paletteShift: 'band',
    params: {
      mode: 'hype', count: 260, scale: [0.3, 0.9], rotate: [-30, 30], alpha: [55, 100],
      zTiers: 4, jitter: 10, density: 88, bleed: true, mirror: false, overlap: true,
      lifeDrift: 0.1, noiseSpeed: 0.15, displacement: 8, behave: 'mold',
      particleCount: 240, metabolism: 1.0, breath: 0.1, graze: 0,
    },
  },
  {
    id: 'bio-graze', name: 'GRAZERS', group: 'bio',
    desc: 'Grazers erase — bg-stamped agents mow trails through the accumulation. Leave ACCUM on.',
    categories: ['radial', 'linework'], paletteShift: 'band',
    params: {
      mode: 'hype', count: 200, scale: [0.4, 1.1], rotate: [-45, 45], alpha: [50, 100],
      zTiers: 4, jitter: 12, density: 85, bleed: true, mirror: false, overlap: true,
      lifeDrift: 0.12, noiseSpeed: 0.3, displacement: 16, behave: 'cruise',
      particleCount: 180, metabolism: 0.8, breath: 0.1, graze: 0.55,
      accumulation: true, accumulationFade: 8,
    },
  },
  {
    id: 'bio-leak', name: 'PIGMENT LEAK', group: 'bio',
    desc: 'Neighbors trade pigment as they crowd — colors bleed across the cast. Pair with KILN COLUMNS (a leak palette).',
    categories: ['organic', 'dots'], paletteShift: 'band',
    params: {
      mode: 'hype', count: 240, scale: [0.35, 1.0], rotate: [-40, 40], alpha: [55, 100],
      zTiers: 4, jitter: 10, density: 90, bleed: true, mirror: false, overlap: true,
      lifeDrift: 0.12, noiseSpeed: 0.3, displacement: 14, behave: 'flock',
      particleCount: 220, metabolism: 1.0, breath: 0.1, graze: 0,
    },
  },
  {
    id: 'bio-breath', name: 'BREATHING', group: 'bio',
    desc: 'The cast breathes — scale swells with each agent’s energy. Tired creatures breathe shallow.',
    categories: ['radial', 'organic'], paletteShift: 'zone',
    params: {
      mode: 'hype', count: 180, scale: [0.4, 1.2], rotate: [-30, 30], alpha: [50, 100],
      zTiers: 4, jitter: 12, density: 85, bleed: true, mirror: false, overlap: true,
      lifeDrift: 0.08, noiseSpeed: 0.2, displacement: 10, behave: 'cruise',
      particleCount: 160, metabolism: 0.6, breath: 0.9, graze: 0,
    },
  },
  {
    id: 'bio-coral', name: 'CORAL GARDEN', group: 'bio',
    desc: 'Coral garden — mold foragers drift through Haeckel corals and plumes. Pair with CYANOTYPE.',
    categories: ['radial', 'linework'], paletteShift: 'band',
    params: {
      mode: 'hype', count: 220, scale: [0.35, 1.1], rotate: [-50, 50], alpha: [50, 100],
      zTiers: 4, jitter: 14, density: 86, bleed: true, mirror: false, overlap: true,
      lifeDrift: 0.1, noiseSpeed: 0.18, displacement: 12, behave: 'mold',
      particleCount: 200, metabolism: 0.8, breath: 0.3, graze: 0,
    },
  },
  { // #834 — LIVING REEF showcases the DLA growth organism (#720): the aggregate
    // crystallizes Haeckel corals from a seed while the trail becomes the artwork.
    // Growth knobs ride along so the mode-gated sliders wake up with the look.
    id: 'bio-reef', name: 'LIVING REEF', group: 'bio',
    desc: 'Living reef — DLA growth crystallizes coral arms from a seed; the trail is the artwork. Pair with TIDEPOOL.',
    categories: ['organic', 'radial'], paletteShift: 'band',
    params: {
      mode: 'dla', count: 200, scale: [0.35, 1.1], rotate: [-45, 45], alpha: [45, 95],
      zTiers: 4, jitter: 10, density: 88, bleed: true, mirror: false, overlap: true,
      lifeDrift: 0.12, noiseSpeed: 0.2, displacement: 10, behave: 'cruise',
      growthRate: 4, growthBranch: 0.85,
    },
  },
  {
    id: 'bio-plate-litho', name: 'PLATE · LITHO', group: 'bio',
    desc: 'Specimen plate — Haeckel bodies pinned on a grid. Pair with LITHOGRAPH and watch the trails fall to the paper.',
    categories: ['radial'], paletteShift: 'band',
    params: {
      mode: 'grid', count: 120, scale: [0.5, 1.3], rotate: [-15, 15], alpha: [60, 100],
      zTiers: 3, jitter: 6, density: 90, bleed: false, mirror: false, overlap: false,
      lifeDrift: 0.05, noiseSpeed: 0.12, displacement: 4,
      metabolism: 0.2, breath: 0.2, graze: 0,
      accumulation: true, accumulationFade: 12,
    },
  },
  {
    id: 'bio-plate-sepia', name: 'PLATE · SEPIA', group: 'bio',
    desc: 'Radial organisms as plate specimens — six-fold mirrored fans. Pair with SEPIA PLATE.',
    categories: ['radial', 'linework'], paletteShift: 'band',
    params: {
      mode: 'hype', count: 160, scale: [0.4, 1.1], rotate: [-25, 25], alpha: [55, 100],
      zTiers: 4, jitter: 8, density: 88, bleed: false, mirror: false, overlap: false,
      lifeDrift: 0.06, noiseSpeed: 0.14, displacement: 6, behave: 'cruise', symmetry: 'radial-6',
      particleCount: 144, metabolism: 0.3, breath: 0.25, graze: 0,
      accumulation: true, accumulationFade: 12,
    },
  },
  // --- #284 Smoke Study voice: the flow-field voice. A voice, not an engine —
  // every knob below already existed; the only new UI is the FLOW slider.
  // Pairs with the SMOKE catalog palette (applied on click via paletteId).
  {
    id: 'smoke-study', name: 'SMOKE STUDY', group: 'showcase',
    desc: 'Flow-field smoke — 400 hairline particles on a slow noise field, curl-advected ACCUM trails, monochrome. Built for Loop Capture.',
    categories: ['dots'], paletteShift: 'band',
    // Palette + asset pool pair as one voice: monochrome SMOKE palette and
    // tiny dots only, so the preset is one click, not a setup chore.
    paletteId: 'smoke',
    assetIds: ['dot_single_01', 'dot_speckle_01'],
    params: {
      mode: 'swarm', count: 400, scale: [0.12, 0.35], rotate: [-20, 20], alpha: [10, 35],
      zTiers: 3, jitter: 8, density: 90, bleed: true, mirror: false, overlap: true,
      particleCount: 400, swarmCohesion: 0, damping: 0.98, gravityWells: 0,
      noiseFreq: 0.003, noiseSpeed: 0.15, wind: 1,
      lifeDrift: 0.1, displacement: 0, behave: 'cruise',
      accumulation: true, accumulationFade: 17, accumulationOptics: 0.15,
      accumulationTunnel: 0, accumulationPrism: 0, accumulationFlow: 0.3,
    },
  },
  // --- First Light (#707): starter presets for the living boot. Bounded,
  // tasteful, calm — the instrument wakes up playing, never screaming.
  // Each carries its palette + a small asset pool; the boot composer picks
  // 2–3 of the pool at random. Layout-only in the popup per #555.
  {
    id: 'first-light', name: 'FIRST LIGHT', group: 'firstlight',
    desc: 'Gentle wake-up — warm fibonacci bloom, slow breath, soft shapes.',
    categories: ['organic', 'radial'], paletteShift: 'band',
    paletteId: 'praystation',
    assetIds: ['org_blob_01', 'rad_rings_01', 'org_petal_02'],
    params: {
      mode: 'fibonacci', count: 200, scale: [0.4, 1.4], rotate: [-60, 60], alpha: [40, 90],
      zTiers: 4, jitter: 12, density: 80, bleed: false, mirror: false, overlap: true,
      lifeDrift: 0.15, noiseSpeed: 0.2, displacement: 8, wind: 0.2, behave: 'cruise',
    },
  },
  {
    id: 'grid-talk', name: 'GRID TALK', group: 'firstlight',
    desc: 'Quiet machine — sparse dark grid, small signals blinking through.',
    categories: ['geometric', 'dots'], paletteShift: 'zone',
    paletteId: 'v01d',
    assetIds: ['geo_hex_01', 'mic_dotgrid_5', 'line_dash_01'],
    params: {
      mode: 'grid', count: 160, scale: [0.3, 1.0], rotate: [-90, 90], alpha: [30, 80],
      zTiers: 3, jitter: 6, density: 85, bleed: false, mirror: true, overlap: true,
      lifeDrift: 0.06, noiseSpeed: 0.1, displacement: 0, wind: 0.1, behave: 'cruise',
    },
  },
  {
    id: 'pond', name: 'POND', group: 'firstlight',
    desc: 'Still water — slow flow field, organic shapes drifting like leaves.',
    categories: ['organic', 'linework'], paletteShift: 'band',
    paletteId: 'tidepool',
    assetIds: ['org_blob_02', 'line_squiggle_01', 'org_drop_01'],
    params: {
      mode: 'flow', count: 220, scale: [0.3, 1.2], rotate: [-45, 45], alpha: [30, 85],
      zTiers: 4, jitter: 14, density: 85, bleed: true, mirror: false, overlap: true,
      lifeDrift: 0.18, noiseSpeed: 0.25, displacement: 16, wind: 0.3, behave: 'cruise',
    },
  },
  {
    id: 'paper-storm', name: 'PAPER STORM', group: 'firstlight',
    desc: 'Playful scatter — bright confetti shapes tumbling on paper.',
    categories: ['geometric', 'stamps'], paletteShift: 'band',
    paletteId: 'solar-max',
    assetIds: ['geo_star5_01', 'geo_tri_01', 'stamp_glyph_01'],
    params: {
      mode: 'grid', count: 180, scale: [0.35, 1.1], rotate: [-90, 90], alpha: [35, 85],
      zTiers: 3, jitter: 18, density: 78, bleed: false, mirror: false, overlap: true,
      lifeDrift: 0.12, noiseSpeed: 0.15, displacement: 6, wind: 0.25, behave: 'cruise',
    },
  },
];

export function getPreset(id) {
  const canon = resolveLookId(id);
  return COMPOSITION_PRESETS.find(p => p.id === canon) || COMPOSITION_PRESETS[0];
}

export function getPresetsByGroup() {
  return PRESET_GROUPS.map(g => ({
    ...g,
    presets: COMPOSITION_PRESETS.filter(p => p.group === g.id),
  }));
}
