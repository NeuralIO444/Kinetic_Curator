// app/src/engine/beastTile.js — #1962 BEAST S3b step 2: a Strandbeest becomes a pool tile.
//
// A beast is not a creature RECORD (no attach points, no genome block, no breeding — the S1 measure genes breed in
// their own slice); it is an ordinary wet-lab pool tile carrying `rig.linkage` (engine/beastRig.js). The artist presses
// ASSEMBLE A BEAST; the seeded measures are dealt inside the S2 gate (a stillbirth is never minted), and the tile's
// thumbnail is the linkage itself at rest. Placed on the stage it expands at contract time (creatureRig.expandBeast).
// Pure and deterministic: same seed + same ordinal → the same animal, so a re-press never banks a duplicate.

import { MEASURE_RANGES, MEASURE_IDS, wildTypeMeasures } from './jansenMeasures.js';
import { sanitizeMeasures } from './beastBuilder.js';
import { isStillborn } from './jansenSolver.js';
import { poseLinkage } from './beastRig.js';
import { mkRng } from './prng.js';

/** How far a dealt bar strays from the wild type (± this fraction of its range, capped at the range). */
export const BEAST_STRAY = 0.12;
/** Attempts to find a feasible animal before the wild type stands in (the Jansen basin is narrow; most strays live). */
export const BEAST_TRIES = 40;
const BEAST_ID_RE = /^user:beast-[0-9a-f]{8}$/;
export const isBeastTileId = (id) => typeof id === 'string' && BEAST_ID_RE.test(id);

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The seeded measures of the nth beast on a seed: the wild type, each bar strayed by up to BEAST_STRAY of its range
 * (k's band is ±2% and stays that way), legCount and scale dealt across their ranges. Always feasible — the S2 gate runs
 * here, so no stillbirth is minted by the button.
 */
export function dealBeastMeasures(seed, ordinal = 0) {
  const wild = sanitizeMeasures(wildTypeMeasures());
  for (let tryN = 0; tryN < BEAST_TRIES; tryN++) {
    const rng = mkRng(hash32(`beast|${seed >>> 0}|${ordinal}|${tryN}`) || 1);
    const raw = { ...wild };
    for (const id of MEASURE_IDS) {
      const r = MEASURE_RANGES[id];
      raw[id] = wild[id] + (rng() * 2 - 1) * BEAST_STRAY * (r.max - r.min);
    }
    const lc = MEASURE_RANGES.legCount;
    raw.legCount = lc.min + Math.floor(rng() * (lc.max - lc.min + 1));
    const sc = MEASURE_RANGES.scale;
    raw.scale = sc.min + rng() * (sc.max - sc.min);
    const m = sanitizeMeasures(raw);
    if (!isStillborn(m, m.scale)) return m;
  }
  return wild;
}

const r2 = (n) => Math.round(n * 100) / 100;

/** The tile's thumbnail: the linkage's bars at rest, in the tile box — what the pool shows in place of a body. */
export function beastTileSvg(measures) {
  const pose = poseLinkage({ measures, phase: 0 }, 0);
  if (!pose) return null;
  const d = pose.map((p) => `M${r2(p.x)} ${r2(p.y)}L${r2(p.tx)} ${r2(p.ty)}`).join('');
  return `<path d="${d}" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round"/>`;
}

/** The overlay entry for a measure set, or null for a stillbirth. Shape of creatureTile (a wet-lab creature tile). */
export function beastTile(measures) {
  const m = sanitizeMeasures(measures);
  if (!m || isStillborn(m, m.scale)) return null;
  const svg = beastTileSvg(m);
  if (!svg) return null;
  const key = JSON.stringify(m);
  return {
    id: `user:beast-${hash32(key).toString(16).padStart(8, '0')}`,
    category: 'creature',
    weight: 'medium',
    tags: ['creature', 'wetlab', 'beast'],
    compound: true,
    source: 'wetlab',
    svg,
    rig: { body: '', bones: [], linkage: { measures: m, phase: 0 } },
  };
}
