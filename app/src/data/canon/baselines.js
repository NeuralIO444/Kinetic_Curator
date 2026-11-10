// data/canon/baselines.js — #2048 (Canon S5): the first baselines, as native records; #2060 adds The Designers Republic's.
//
// "Have the op-art, Warhol and Joshua Davis baselines" was a request the system could not hold: Op Art existed
// only as a Look-group tag and a chapter name, and no record anywhere said what any of the three IS in the
// instrument's own terms. These are those records. A baseline is a COMPLETE settings record — every value is a
// real control of the instrument, in its real units, and survives the validating door unchanged:
//
//   marks   — the asset pairing: categories and styles, the vocabulary the pool dealer already speaks
//   palette — a catalogue palette id, the palette-shift mode, the blend mode
//   motion  — the motion axis (state/rollScope.mjs MOTION_KEYS): behave, lifeDrift, noiseSpeed, wind, flap, breath
//   density — how much is on the plane: count, density, scale, alpha, zTiers
//   rules   — the structural law of the picture: the layout mode, mirror, overlap, bleed, jitter, displacement,
//             rotation — plus `extra`, any further real params the tradition needs (Davis's forces)
//
// `basis` says, in a sentence, what the numbers were taken from — so a reviewer can tell what is grounded in
// material already in the instrument and what is a first statement waiting for Matt's eye.
//
// The baseline is the anchor a mix is weighted against (#2049 and after). It is also a point in taste's space:
// baselineReadings scores any recipe against all of them (curator/tasteFeatures.js, canon/settings.js).
//
// NAMES POLICY (curator/personaTastes.js, renderProfiles.js): `label` is the surface alias; `identity.figures`
// is lineage kept in code only and never shown on the product surface.
//
// Pure data + pure readers. Applying a baseline to the stage is state/canonBaseline.mjs.
import { canonStyleRecord } from './styles.js';
import { feelAffinity } from './settings.js';
import { normalizeLayoutParams, validateLayoutParams, DEFAULT_LAYOUT_PARAMS } from '../layout-modes.js';
import { extractFeatures } from '../../curator/tasteFeatures.js';

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

export const CANON_BASELINES = deepFreeze([
  {
    id: 'op-art',
    label: 'OP ART',
    style: 'op', // the Canon style it anchors (identity comes from that record — declared once, #2044)
    identity: null,
    basis:
      'The Op Art style’s own measured settings (data/canon/settings.js) and its grid look CHECKER SHIFT: ' +
      'a hard, unjittered lattice, near-full opacity, almost no motion — the vibration is optical, not animated.',
    settings: {
      marks: { categories: ['radial', 'dots', 'linework'], styles: ['op'] },
      palette: { id: 'static-bloom', shift: 'band', blend: 'difference' },
      motion: { behave: 'cruise', lifeDrift: 0.06, noiseSpeed: 0.12, wind: 0.1, flap: 0, breath: 0 },
      density: { count: 400, density: 98, scale: [0.35, 0.6], alpha: [85, 100], zTiers: 2 },
      rules: {
        mode: 'grid',
        mirror: 'x',
        overlap: true,
        bleed: true,
        jitter: 0,
        displacement: 0,
        rotate: [0, 0],
        extra: {},
      },
    },
  },
  {
    id: 'warhol',
    label: 'SILKSCREEN',
    style: null, // no Canon style is Pop yet — the baseline stands on its own identity
    identity: {
      movement: 'Pop Art — the serial silkscreen',
      period: '1962–1968',
      place: 'New York (the Factory)',
      figures: ['Andy Warhol'],
      note: 'One motif, repeated in a grid, flat colour, slightly off register, perfectly still.',
    },
    basis:
      'Authored from the tradition — the instrument held no Pop material to measure. Few large marks of one ' +
      'size on a strict grid, no rotation, full opacity, no overlap, a small displacement for the off-register ' +
      'screen, and no motion at all. The palette is the nearest flat, saturated, light-ground one in the catalogue.',
    settings: {
      marks: { categories: ['stamps', 'floral'], styles: [] },
      palette: { id: 'persona-benjamin', shift: 'zone', blend: 'normal' },
      motion: { behave: 'cruise', lifeDrift: 0, noiseSpeed: 0.1, wind: 0, flap: 0, breath: 0 },
      density: { count: 48, density: 100, scale: [1.6, 1.6], alpha: [100, 100], zTiers: 1 },
      rules: {
        mode: 'grid',
        mirror: 'off',
        overlap: false,
        bleed: false,
        jitter: 0,
        displacement: 6,
        rotate: [0, 0],
        extra: {},
      },
    },
  },
  {
    id: 'davis',
    label: 'OVERLAP', // the persona's standing alias (curator/personaTastes.js)
    style: null,
    identity: {
      movement: 'Dynamic abstraction — generative collage',
      period: '1995–present',
      place: 'New York',
      figures: ['Joshua Davis'],
      note: 'Controlled chaos: maximum density of legible modules, translucent overlap, deep layering.',
    },
    basis:
      'The centre of the Davis render profile’s ranges (curator/renderProfiles.js), the persona palette, and ' +
      'the structure of the house ORIGIN look (the phi spiral and its asset pairing).',
    settings: {
      marks: { categories: ['organic', 'radial', 'stamps'], styles: ['organic', 'op'] },
      palette: { id: 'persona-davis', shift: 'band', blend: 'normal' },
      motion: { behave: 'cruise', lifeDrift: 0.5, noiseSpeed: 0.75, wind: 1.1, flap: 0.5, breath: 0.3 },
      density: { count: 490, density: 100, scale: [0.65, 1.9], alpha: [42, 85], zTiers: 7 },
      rules: {
        mode: 'fibonacci',
        mirror: 'off',
        overlap: true,
        bleed: false,
        jitter: 30,
        displacement: 30,
        rotate: [-90, 90],
        extra: {
          noiseFreq: 0.0065,
          particleCount: 210,
          swarmCohesion: 1.2,
          gravityWells: 1.5,
          damping: 0.945,
        },
      },
    },
  },
  {
    id: 'tdr',
    label: 'MAXIMUM MINIMAL',
    style: 'techno', // sits beside the Techno style (its asset families); the studio's own identity is declared here
    identity: {
      movement: 'Maximum minimalism — record-sleeve and interface graphics',
      period: '1986 onward',
      place: 'Sheffield',
      figures: ['Ian Anderson', 'The Designers Republic'],
      note: 'Geometric vector marks at information density: the icon system as texture, flat colour on paper white.',
    },
    basis:
      'Authored from the tradition — Techno has no Looks or voices to measure yet (data/canon/settings.js is null for it). ' +
      'Many small flat marks on a strict rail structure, no rotation, no jitter, full opacity, a hard overlap-free ' +
      'field, and quick but unvarying motion for the high-tempo information rhythm. The palette is the catalogue’s ' +
      'flat signage one (paper ground, red / navy / orange / black).',
    settings: {
      marks: { categories: ['geometric', 'scanlines', 'stamps'], styles: ['techno', 'swiss'] },
      palette: { id: 'transit', shift: 'zone', blend: 'normal' },
      motion: { behave: 'cruise', lifeDrift: 0.08, noiseSpeed: 0.6, wind: 0.15, flap: 0, breath: 0 },
      density: { count: 460, density: 100, scale: [0.3, 0.9], alpha: [100, 100], zTiers: 3 },
      rules: {
        mode: 'rails',
        mirror: 'off',
        overlap: false,
        bleed: true,
        jitter: 0,
        displacement: 0,
        rotate: [0, 0],
        extra: {},
      },
    },
  },
  {
    id: 'swiss',
    label: 'GRID LAW',
    style: 'swiss', // identity comes from that Canon style's record (declared once, #2044)
    identity: null,
    basis:
      'Measured, not authored: the mean of the 11 Looks and Voices that make up this style (data/canon/settings.js), rounded to the instrument’s own units — its most-used layout, mean density, scale, opacity, rotation and jitter, and its most-used palette (persona-molnar).',
    settings: {
      marks: { categories: ['geometric', 'linework'], styles: ['swiss'] },
      palette: { id: 'persona-molnar', shift: 'zone', blend: 'normal' },
      motion: { behave: 'cruise', lifeDrift: 0.11, noiseSpeed: 0.2, wind: 0.37, flap: 0.26, breath: 0.02 },
      density: { count: 134, density: 74, scale: [0.3, 1.3], alpha: [65, 100], zTiers: 2 },
      rules: {
        mode: 'grid',
        mirror: 'off',
        overlap: true,
        bleed: false,
        jitter: 7,
        displacement: 0,
        rotate: [-45, 60],
        extra: {},
      },
    },
  },
  {
    id: 'bauhaus',
    label: 'PRIMARY FORM',
    style: 'bauhaus', // identity comes from that Canon style's record (declared once, #2044)
    identity: null,
    basis:
      'Measured, not authored: the mean of the 10 Looks and Voices that make up this style (data/canon/settings.js), rounded to the instrument’s own units — its most-used layout, mean density, scale, opacity, rotation and jitter, and its most-used palette (vortex-rwb).',
    settings: {
      marks: { categories: ['geometric', 'radial'], styles: ['bauhaus'] },
      palette: { id: 'vortex-rwb', shift: 'band', blend: 'normal' },
      motion: { behave: 'cruise', lifeDrift: 0.17, noiseSpeed: 0.26, wind: 0.46, flap: 0.33, breath: 0.07 },
      density: { count: 93, density: 70, scale: [0.4, 1.6], alpha: [65, 100], zTiers: 3 },
      rules: {
        mode: 'radial',
        mirror: 'off',
        overlap: true,
        bleed: false,
        jitter: 11,
        displacement: 0,
        rotate: [-60, 80],
        extra: {},
      },
    },
  },
  {
    id: 'japanese',
    label: 'HELD EMPTY',
    style: 'japanese', // identity comes from that Canon style's record (declared once, #2044)
    identity: null,
    basis:
      'Measured, not authored: the mean of the 12 Looks and Voices that make up this style (data/canon/settings.js), rounded to the instrument’s own units — its most-used layout, mean density, scale, opacity, rotation and jitter, and its most-used palette (sepia-plate).',
    settings: {
      marks: { categories: ['floral', 'organic', 'radial'], styles: ['japanese'] },
      palette: { id: 'sepia-plate', shift: 'band', blend: 'normal' },
      motion: { behave: 'cruise', lifeDrift: 0.16, noiseSpeed: 0.29, wind: 0.52, flap: 0.3, breath: 0.05 },
      density: { count: 121, density: 68, scale: [0.5, 1.6], alpha: [55, 98], zTiers: 3 },
      rules: {
        mode: 'poisson',
        mirror: 'off',
        overlap: true,
        bleed: false,
        jitter: 11,
        displacement: 1,
        rotate: [-60, 60],
        extra: {},
      },
    },
  },
  {
    id: 'grunge',
    label: 'PHOTOCOPY',
    style: 'grunge', // identity comes from that Canon style's record (declared once, #2044)
    identity: null,
    basis:
      'Measured, not authored: the mean of the 12 Looks and Voices that make up this style (data/canon/settings.js), rounded to the instrument’s own units — its most-used layout, mean density, scale, opacity, rotation and jitter, and its most-used palette (dirty).',
    settings: {
      marks: { categories: ['stamps', 'fragments', 'scanlines'], styles: ['grunge'] },
      palette: { id: 'dirty', shift: 'zone', blend: 'normal' },
      motion: { behave: 'cruise', lifeDrift: 0.2, noiseSpeed: 0.43, wind: 0.62, flap: 0.41, breath: 0.02 },
      density: { count: 206, density: 78, scale: [0.3, 1.4], alpha: [55, 100], zTiers: 4 },
      rules: {
        mode: 'random',
        mirror: 'off',
        overlap: true,
        bleed: false,
        jitter: 22,
        displacement: 9,
        rotate: [-80, 80],
        extra: {},
      },
    },
  },
  {
    id: 'engraved',
    label: 'COPPER LINE',
    style: 'engraved', // identity comes from that Canon style's record (declared once, #2044)
    identity: null,
    basis:
      'Measured, not authored: the mean of the 11 Looks and Voices that make up this style (data/canon/settings.js), rounded to the instrument’s own units — its most-used layout, mean density, scale, opacity, rotation and jitter, and its most-used palette (lithograph).',
    settings: {
      marks: { categories: ['radial', 'linework'], styles: ['engraved'] },
      palette: { id: 'lithograph', shift: 'zone', blend: 'normal' },
      motion: { behave: 'cruise', lifeDrift: 0.14, noiseSpeed: 0.21, wind: 0.4, flap: 0.29, breath: 0.13 },
      density: { count: 118, density: 74, scale: [0.4, 1.4], alpha: [60, 100], zTiers: 3 },
      rules: {
        mode: 'circlepack',
        mirror: 'off',
        overlap: true,
        bleed: false,
        jitter: 9,
        displacement: 0,
        rotate: [-85, 85],
        extra: {},
      },
    },
  },
  {
    id: 'memphis',
    label: 'CONFETTI',
    style: 'memphis', // identity comes from that Canon style's record (declared once, #2044)
    identity: null,
    basis:
      'Measured, not authored: the mean of the 10 Looks and Voices that make up this style (data/canon/settings.js), rounded to the instrument’s own units — its most-used layout, mean density, scale, opacity, rotation and jitter, and its most-used palette (petri-bloom).',
    settings: {
      marks: { categories: ['geometric', 'dots', 'linework'], styles: ['memphis'] },
      palette: { id: 'petri-bloom', shift: 'split', blend: 'normal' },
      motion: { behave: 'cruise', lifeDrift: 0.2, noiseSpeed: 0.33, wind: 0.57, flap: 0.36, breath: 0.06 },
      density: { count: 165, density: 74, scale: [0.3, 1.3], alpha: [65, 100], zTiers: 3 },
      rules: {
        mode: 'random',
        mirror: 'off',
        overlap: true,
        bleed: false,
        jitter: 14,
        displacement: 2,
        rotate: [-115, 115],
        extra: {},
      },
    },
  },
  {
    id: 'marks',
    label: 'PIGMENT WALL',
    style: 'marks', // identity comes from that Canon style's record (declared once, #2044)
    identity: null,
    basis:
      'Measured, not authored: the mean of the 13 Looks and Voices that make up this style (data/canon/settings.js), rounded to the instrument’s own units — its most-used layout, mean density, scale, opacity, rotation and jitter, and its most-used palette (ochre-wall).',
    settings: {
      marks: { categories: ['stamps', 'linework', 'dots'], styles: ['marks'] },
      palette: { id: 'ochre-wall', shift: 'band', blend: 'normal' },
      motion: { behave: 'cruise', lifeDrift: 0.1, noiseSpeed: 0.17, wind: 0.32, flap: 0.25, breath: 0.03 },
      density: { count: 62, density: 61, scale: [0.4, 1.4], alpha: [55, 95], zTiers: 3 },
      rules: {
        mode: 'poisson',
        mirror: 'off',
        overlap: true,
        bleed: false,
        jitter: 15,
        displacement: 2,
        rotate: [-65, 65],
        extra: {},
      },
    },
  },
]);

/** The baseline ids, in declaration order. */
export const CANON_BASELINE_IDS = Object.freeze(CANON_BASELINES.map((b) => b.id));

const BY_ID = new Map(CANON_BASELINES.map((b) => [b.id, b]));

/** A baseline record by id, or null. */
export function canonBaseline(id) {
  return BY_ID.get(id) || null;
}

/**
 * A baseline's art-history identity: its own, or — when it anchors a Canon style — that style's (declared
 * once, in data/canon/styles.js; never copied here).
 */
export function baselineIdentity(baselineOrId) {
  const b = typeof baselineOrId === 'string' ? canonBaseline(baselineOrId) : baselineOrId;
  if (!b) return null;
  return b.identity || canonStyleRecord(b.style)?.identity || null;
}

/**
 * The baseline as a recipe: the layout params its settings spell out, laid over the instrument's defaults and
 * passed through the validating door — exactly what the stage would hold. `{ layoutParams, paletteId, pairing }`.
 */
export function baselineRecipe(baselineOrId) {
  const b = typeof baselineOrId === 'string' ? canonBaseline(baselineOrId) : baselineOrId;
  if (!b) return null;
  const { marks, palette, motion, density, rules } = b.settings;
  const { extra, ...structure } = rules;
  const params = {
    ...DEFAULT_LAYOUT_PARAMS,
    ...structure,
    ...extra,
    ...density,
    ...motion,
    paletteShift: palette.shift,
    blendMode: palette.blend,
  };
  delete params.composition; // a baseline is not a Look — it claims no composition id
  return {
    layoutParams: validateLayoutParams({ ...params, composition: DEFAULT_LAYOUT_PARAMS.composition }).params,
    paletteId: palette.id,
    pairing: { categories: [...marks.categories], styles: [...marks.styles] },
  };
}

/** A baseline's point in taste's feature space (the 19 features of its recipe). */
export function baselineFeel(baselineOrId) {
  const r = baselineRecipe(baselineOrId);
  return r ? extractFeatures(r.layoutParams) : null;
}

/**
 * Score a candidate recipe (layout params) against every baseline: `{ 'op-art': 0..1, warhol: 0..1, davis: 0..1, tdr: 0..1 }`
 * — 1 is the baseline itself. The same closeness measure the Book's read-back uses (feelAffinity).
 */
export function baselineReadings(layoutParams) {
  const features = extractFeatures(normalizeLayoutParams(layoutParams ?? {}));
  return Object.fromEntries(CANON_BASELINES.map((b) => [b.id, feelAffinity(features, baselineFeel(b))]));
}

/** The baseline a recipe reads closest to: `{ id, reading }`. */
export function nearestBaseline(layoutParams) {
  const readings = baselineReadings(layoutParams);
  const [id, reading] = Object.entries(readings).sort((a, b) => b[1] - a[1])[0];
  return { id, reading };
}
