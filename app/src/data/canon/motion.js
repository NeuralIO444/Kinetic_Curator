// data/canon/motion.js — #2047 (Canon S3): layouts, flocking and animation as Canon records.
//
// These are real traditions with real names — phyllotaxis, Voronoi, the Lorenz attractor, the boiling line —
// but in the code they were bare ids, engine tables and five separate animation vocabularies that did not know
// what a style is. Their ids even collide: `flock`, `orbit`, `drift` and `pulse` each mean different things in
// different files. This module is the one vocabulary over all of them:
//
//   one NAMESPACED id per record      `layout:phyllotaxis`, `flock:lorenz`, `kineme:pulse`, `path:orbit`
//   its name and its TRADITION        the real lineage (who, when), or null where there honestly is none
//   its STYLE metadata                which Canon styles it belongs to
//
// Three rules it is built on:
//
// 1. NO SIXTH LIST. The ids are never retyped here. Every record is derived from the module that already owns
//    the vocabulary (the KINDS table below names each source). What this file adds is the descriptor — a
//    tradition keyed by the id the source declares. canonMotion.selfcheck fails if a source gains an id with no
//    descriptor, or a descriptor outlives its id.
// 2. THE ENGINE STAYS THE ENGINE. A flocking behaviour is still the steering row in engine/organisms/behave.js.
//    The Canon record is the descriptor the style layer names, sitting beside the code — it replaces nothing,
//    and no render path imports this module.
// 3. STYLE MEMBERSHIP IS WHAT THE STYLE ACTUALLY USES. A layout belongs to Op Art because Op Art's own looks and
//    family voices deal it — derived from the catalogues (the Book's rule: membership is derivation), with the
//    use counts kept so a weighted mix has something to weigh. Nothing here is a hand-assigned opinion.
//
// Old ids are aliased, never orphaned: a recipe says `behave: 'orbit'` and `mode: 'orbit'`; canonMotionForParam
// resolves each to its own record. A bare id resolves on its own only when exactly one vocabulary owns it.
import { LAYOUT_MODES } from '../layout-modes.js';
import { BEHAVE_IDS } from '../../engine/organisms/behave.js';
import { MOTION_MODES, isMotionActive } from '../voices.js';
import { KINEMES, DEFAULT_ASSET_KINEME } from '../kinemes.js';
import { CELL_KINEMES, ASSET_CELL_KINEME } from '../cellKinemes.js';
import { KINEME_PATTERNS, KINEME_DRIVERS, TRANSPORT_MODES, PATH_FAMILIES } from '../../engine/kineme.js';
import { BALLISTICS_CURVES } from '../../gl/audioBallistics.mjs';
import { COMPOSITION_PRESETS } from '../presets.js';
import { VOICE_DECK } from '../voiceDeck.js';
import { ASSETS } from '../assets/index.js';
import { assetRecords } from '../assetStyle.js';
import { CANON_STYLE_IDS, isCanonStyle } from './styles.js';

/** The three domains the issue names. */
export const CANON_MOTION_DOMAINS = Object.freeze(['layout', 'flocking', 'animation']);

// ── the descriptors: [tradition name, origin | null], keyed by the id the SOURCE declares ───────────────────────
// `origin` is the lineage — who and when. Null means there is no named tradition behind the word, and none is
// invented (the Canon's honesty rule: absent stays absent).
const T = (name, origin = null) => Object.freeze({ name, origin });

const LAYOUT = {
  random: T('Uniform random scatter'),
  grid: T('The modular grid', 'Swiss typographic grid systems, 1950s'),
  fibonacci: T('Fibonacci (golden-angle) spiral', 'Helmut Vogel, 1979'),
  phyllotaxis: T('Phyllotaxis', 'Botanical leaf arrangement; Vogel’s divergence-angle model, 1979'),
  radial: T('Radial symmetry'),
  truchet: T('Truchet tiling', 'Sébastien Truchet, 1704'),
  swarm: T('Boids', 'Craig Reynolds, 1987'),
  noise: T('Gradient-noise domain warp', 'Ken Perlin, 1985'),
  hype: T('Organism swarm', 'Named in homage to the HYPE generative framework'),
  stratified: T('Stratified (jittered) sampling', 'Robert Cook, 1986'),
  flow: T('Wave field'),
  brush: T('Brush line'),
  layers: T('Depth layering'),
  rails: T('Rails'),
  ca: T('Cellular automaton', 'von Neumann and Ulam, 1940s; Conway’s Life, 1970'),
  voronoi: T('Voronoi diagram', 'Georgy Voronoi, 1908'),
  lsystem: T('L-system', 'Aristid Lindenmayer, 1968'),
  dla: T('Diffusion-limited aggregation', 'Witten and Sander, 1981'),
  eden: T('Eden growth model', 'Murray Eden, 1961'),
  orbit: T('Orbital rings'),
  abacus: T('Abacus rows'),
  poisson: T('Poisson-disc sampling', 'Robert Bridson, 2007'),
  gaussian: T('Gaussian (normal) distribution', 'Carl Friedrich Gauss, 1809'),
  circlepack: T('Circle packing', 'Apollonian gasket, after Apollonius of Perga'),
  colonize: T('Space colonization', 'Runions, Lane and Prusinkiewicz, 2007'),
  'voronoi-cells': T('Voronoi cells', 'Georgy Voronoi, 1908'),
  streamline: T('Evenly-spaced streamlines', 'Jobard and Lefer, 1997'),
  murmuration: T('Starling murmuration', 'Runs on the boids engine (Reynolds, 1987)'),
};

const FLOCK = {
  cruise: T('Boids, loose', 'Craig Reynolds, 1987 — separation, alignment, cohesion'),
  flock: T('Boids, tight', 'Craig Reynolds, 1987'),
  orbit: T('Orbit around a pull point'),
  scatter: T('Dispersal'),
  mold: T('Slime-mould chemotaxis', 'Physarum trail model, Jeff Jones, 2010'),
  levy: T('Lévy flight', 'Paul Lévy; the foraging hypothesis, 1990s'),
  lorenz: T('Lorenz attractor', 'Edward Lorenz, 1963'),
  seek: T('Seek', 'Steering behaviours, Craig Reynolds, 1999'),
  flee: T('Flee', 'Steering behaviours, Craig Reynolds, 1999'),
};

const CHIP = {
  still: T('Held still'),
  drift: T('Slow current'),
  flow: T('Steady stream'),
  flock: T('Flocking'),
  orbit: T('Orbiting'),
  scatter: T('Restless scatter'),
  mold: T('Slow growth'),
};

const KINEME = {
  spin: T('Rotation'),
  rock: T('Pendulum rock'),
  pulse: T('Scale pulse'),
  blink: T('Blink'),
  bob: T('Bob'),
  bend: T('Travelling bend'),
};

const CELL = {
  'dial-sweep': T('Dial sweep', 'The instrument needle'),
  'wave-scroll': T('Waveform scroll', 'The oscilloscope trace'),
  'chevron-chase': T('Chase sequence', 'Marquee chase lights'),
  'spec-chase': T('Spectrum chase', 'The spectrum-analyser bar'),
  'line-boil': T('Line boil', 'Hand-drawn animation: the redrawn line that never sits still'),
  'wave-roll': T('Waveform roll', 'The oscilloscope trace'),
};

const PATTERN = {
  DRIFT: T('Drift'),
  SWELL: T('Breath swell'),
  THUMP: T('Beat thump'),
  ORGANIC: T('Organic rhythm', 'Gradient-noise field, after Perlin, 1985'),
  CADENCE: T('Cadence', 'Sine rhythm'),
};

const DRIVER = {
  breath: T('Breathing swell'),
  drift: T('Wander'),
  pulse: T('Scale thump'),
  'brush-wobble': T('Boiled brush edge', 'Hand-drawn animation: the line boil'),
  'palette-breath': T('Palette oscillation', 'After the HYPE framework’s colour oscillator'),
};

const TRANSPORT = {
  still: T('Anchored'),
  flow: T('Curl-noise flow', 'Bridson, Houriham and Nordenstam, 2007'),
  path: T('Path transport'),
};

const PATH = {
  orbit: T('Orbit path'),
  spiral: T('Spiral path'),
  sweep: T('Sweep path'),
  lissajous: T('Lissajous figure', 'Nathaniel Bowditch, 1815; Jules Lissajous, 1857'),
};

const RESPONSE = {
  linear: T('Linear response'),
  exponential: T('Exponential response'),
  logarithmic: T('Logarithmic response'),
  'peak-hold': T('Peak hold', 'Audio meter ballistics: the peak programme meter'),
};

// ── the kinds: one row per vocabulary, each naming the module that owns it ──────────────────────────────────────
// `param` is the recipe key that names this vocabulary (layoutParams.<param>), when one does.
// `source()` returns the owner's records as [{ id, name?, ...own fields }] — derived, never retyped.
const named = (list) => list.map((r) => ({ ...r }));
const bare = (ids) => ids.map((id) => ({ id }));

const KINDS = Object.freeze(
  [
    {
      kind: 'layout',
      domain: 'layout',
      owner: 'data/layout-modes.js LAYOUT_MODES',
      param: 'mode',
      source: () => named(LAYOUT_MODES),
      describe: LAYOUT,
    },
    {
      kind: 'flock',
      domain: 'flocking',
      owner: 'engine/organisms/behave.js BEHAVE_IDS',
      param: 'behave',
      source: () => bare(BEHAVE_IDS),
      describe: FLOCK,
    },
    {
      kind: 'chip',
      domain: 'animation',
      owner: 'data/voices.js MOTION_MODES',
      param: null,
      source: () => named(MOTION_MODES),
      describe: CHIP,
    },
    {
      kind: 'kineme',
      domain: 'animation',
      owner: 'data/kinemes.js KINEMES',
      param: null,
      source: () => named(KINEMES),
      describe: KINEME,
    },
    {
      kind: 'cell',
      domain: 'animation',
      owner: 'data/cellKinemes.js CELL_KINEMES',
      param: null,
      source: () => named(CELL_KINEMES),
      describe: CELL,
    },
    {
      kind: 'pattern',
      domain: 'animation',
      owner: 'engine/kineme.js KINEME_PATTERNS',
      param: 'kinemePattern',
      source: () => bare(KINEME_PATTERNS),
      describe: PATTERN,
    },
    {
      kind: 'driver',
      domain: 'animation',
      owner: 'engine/kineme.js KINEME_DRIVERS',
      param: null,
      source: () => named(KINEME_DRIVERS),
      describe: DRIVER,
    },
    {
      kind: 'transport',
      domain: 'animation',
      owner: 'engine/kineme.js TRANSPORT_MODES',
      param: 'transport',
      source: () => bare(TRANSPORT_MODES),
      describe: TRANSPORT,
    },
    {
      kind: 'path',
      domain: 'animation',
      owner: 'engine/kineme.js PATH_FAMILIES',
      param: 'transportPath',
      source: () => bare(PATH_FAMILIES),
      describe: PATH,
    },
    {
      kind: 'response',
      domain: 'animation',
      owner: 'gl/audioBallistics.mjs BALLISTICS_CURVES',
      param: 'audioResponse',
      source: () => bare(BALLISTICS_CURVES),
      describe: RESPONSE,
    },
  ].map(Object.freeze),
);

/** The vocabularies the Canon spans: `{ kind, domain, owner, param }`, in registry order. */
export const CANON_MOTION_KINDS = Object.freeze(
  KINDS.map(({ kind, domain, owner, param }) => Object.freeze({ kind, domain, owner, param })),
);

/** The five animation vocabularies, by the module that owns each (the issue's count — pinned by selfcheck). */
export const CANON_ANIMATION_VOCABULARIES = Object.freeze([
  ...new Set(KINDS.filter((k) => k.domain === 'animation').map((k) => k.owner.split(' ')[0])),
]);

const SEP = ':';
/** The namespaced id of a record: `<kind>:<id>`. */
export const canonMotionId = (kind, id) => `${kind}${SEP}${id}`;

// ── style membership: what each style's own looks, family voices and assets actually use ────────────────────────
// Sources are the single-style ones, so a use is unambiguous: a Look in a style group, a family-variant voice,
// an asset with its derived style. (Multi-style flagships and tiles are deliberately not counted — a voice that
// is Memphis AND Japanese says nothing specific about either.)
function tally() {
  const uses = new Map(); // namespaced id -> Map(styleId -> { looks, voices, assets })
  const add = (kind, id, style, axis) => {
    if (!isCanonStyle(style)) return;
    const key = canonMotionId(kind, id);
    if (!uses.has(key)) uses.set(key, new Map());
    const m = uses.get(key);
    if (!m.has(style)) m.set(style, { looks: 0, voices: 0, assets: 0 });
    m.get(style)[axis]++;
  };
  const byParam = KINDS.filter((k) => k.param);
  const own = (o, k) => o && Object.hasOwn(o, k) && typeof o[k] === 'string';
  // a recipe NAMES a value only when it sets the key itself — an inherited default is not a choice
  for (const look of COMPOSITION_PRESETS) {
    if (!isCanonStyle(look.group)) continue;
    for (const k of byParam) if (own(look.params, k.param)) add(k.kind, look.params[k.param], look.group, 'looks');
  }
  for (const v of VOICE_DECK) {
    if (v.kind !== 'family') continue;
    const style = v.def.family;
    for (const k of byParam) if (own(v.def.params, k.param)) add(k.kind, v.def.params[k.param], style, 'voices');
    const chip = MOTION_MODES.find((m) => isMotionActive(v.def.params, m));
    if (chip) add('chip', chip.id, style, 'voices');
  }
  const styleOfAsset = new Map(assetRecords(ASSETS).map((r) => [r.id, r.style]));
  for (const [assetId, id] of Object.entries(DEFAULT_ASSET_KINEME))
    add('kineme', id, styleOfAsset.get(assetId), 'assets');
  for (const [assetId, id] of Object.entries(ASSET_CELL_KINEME)) add('cell', id, styleOfAsset.get(assetId), 'assets');
  return uses;
}

function build() {
  const uses = tally();
  const total = (u) => u.looks + u.voices + u.assets;
  const out = [];
  for (const k of KINDS) {
    for (const src of k.source()) {
      const d = k.describe[src.id];
      if (!d) throw new Error(`canon/motion: ${k.owner} declares "${src.id}" with no Canon descriptor`);
      const id = canonMotionId(k.kind, src.id);
      const m = uses.get(id) || new Map();
      // style order: most used first, Canon declaration order breaking ties — stable, data-only
      const styles = [...m.keys()].sort(
        (a, b) => total(m.get(b)) - total(m.get(a)) || CANON_STYLE_IDS.indexOf(a) - CANON_STYLE_IDS.indexOf(b),
      );
      out.push(
        Object.freeze({
          id,
          kind: k.kind,
          domain: k.domain,
          localId: src.id,
          name: typeof src.name === 'string' && src.name ? src.name : src.id,
          tradition: d,
          styles: Object.freeze(styles),
          styleUse: Object.freeze(Object.fromEntries(styles.map((s) => [s, Object.freeze({ ...m.get(s) })]))),
          param: k.param,
          owner: k.owner,
          source: Object.freeze(src),
        }),
      );
    }
    for (const key of Object.keys(k.describe)) {
      if (!k.source().some((s) => s.id === key))
        throw new Error(`canon/motion: descriptor "${k.kind}:${key}" names an id ${k.owner} no longer declares`);
    }
  }
  return Object.freeze(out);
}

/** Every layout, flocking and animation record, in registry order. */
export const CANON_MOTION = build();

const BY_ID = new Map(CANON_MOTION.map((r) => [r.id, r]));
const BY_LOCAL = new Map();
for (const r of CANON_MOTION) {
  if (!BY_LOCAL.has(r.localId)) BY_LOCAL.set(r.localId, []);
  BY_LOCAL.get(r.localId).push(r);
}
const KIND_BY_PARAM = new Map(KINDS.filter((k) => k.param).map((k) => [k.param, k.kind]));

/** Every record a bare (un-namespaced) id could mean — more than one for the colliding ids. */
export function canonMotionCandidates(localId) {
  return [...(BY_LOCAL.get(localId) || [])];
}

/** The bare ids that mean different things in different vocabularies (`flock`, `orbit`, `drift`, `pulse`, …). */
export const CANON_MOTION_COLLISIONS = Object.freeze(
  [...BY_LOCAL.entries()].filter(([, rs]) => rs.length > 1).map(([id]) => id),
);

/**
 * One record. Accepts a namespaced id (`flock:orbit`), or a bare id when exactly one vocabulary owns it
 * (`phyllotaxis`). A colliding bare id returns null — ask canonMotionCandidates, or resolve it through the
 * recipe key that named it (canonMotionForParam). Null for anything unknown.
 */
export function canonMotion(ref) {
  if (typeof ref !== 'string' || !ref) return null;
  if (BY_ID.has(ref)) return BY_ID.get(ref);
  const candidates = BY_LOCAL.get(ref);
  return candidates && candidates.length === 1 ? candidates[0] : null;
}

/**
 * The record a standing recipe names: the recipe key says which vocabulary, so the old bare id needs no
 * rename (`mode: 'orbit'` → layout:orbit, `behave: 'orbit'` → flock:orbit, `transportPath: 'orbit'` → path:orbit).
 */
export function canonMotionForParam(param, value) {
  const kind = KIND_BY_PARAM.get(param);
  return kind && typeof value === 'string' ? BY_ID.get(canonMotionId(kind, value)) || null : null;
}

/** The recipe keys that name a Canon motion vocabulary. */
export const CANON_MOTION_PARAMS = Object.freeze([...KIND_BY_PARAM.keys()]);

/** Every Canon motion record a recipe names, by recipe key: `{ mode: <record>, behave: <record>, … }`. */
export function canonMotionOfRecipe(layoutParams) {
  const out = {};
  for (const param of CANON_MOTION_PARAMS) {
    const r = canonMotionForParam(param, layoutParams?.[param]);
    if (r) out[param] = r;
  }
  return out;
}

/** The records of one kind (`'layout'`, `'flock'`, `'kineme'`, …) or one domain (`'animation'`). */
export function canonMotionWhere({ kind, domain } = {}) {
  return CANON_MOTION.filter((r) => (!kind || r.kind === kind) && (!domain || r.domain === domain));
}

/**
 * "Which layouts / animations belong to style X": the records the style's own looks, family voices and assets
 * use, most-used first. Narrow with `domain` or `kind`. [] for an unknown style.
 */
export function canonMotionForStyle(styleId, { kind, domain } = {}) {
  if (!isCanonStyle(styleId)) return [];
  const weight = (r) => {
    const u = r.styleUse[styleId];
    return u.looks + u.voices + u.assets;
  };
  return canonMotionWhere({ kind, domain })
    .filter((r) => r.styles.includes(styleId))
    .sort((a, b) => weight(b) - weight(a));
}
