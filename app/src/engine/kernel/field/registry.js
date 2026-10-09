// kernel/field/registry.js — the field family registry (#1183 dish contract).
//
// Fields are pure (seed, x, y[, t]) → scalar — no pixel readback,
// deterministic. Entry: { id, family: 'field', reads, writes, costTier,
// create } with create(seed, opts) → field instance { kind, sample(nx, ny),
// … }.
//
// The existing free-function fields are migrated here as registered entries;
// the functions themselves are untouched — this file only declares them, so
// behavior is provably unchanged. combineFields stays a free combinator: it
// takes two field *instances*, not (seed, opts), so it is not a registrable
// source.

import { createRegistry } from '../registry.js';
import { makeConstantField, makeCaField, makeNoiseField } from './index.js';
import { createScentField, SCENT_COLS, SCENT_ROWS } from './scent.js';
import { makeQuadtreeField } from '../sample/quadtreeSignal.js';

export const FIELDS = createRegistry('field', {
  payloadKey: 'create',
  defaults: { reads: ['seed'], writes: ['scalars'], costTier: 0 },
});

/** Uniform field — the no-op case. create(seed, { value }). */
FIELDS.register({
  id: 'constant',
  reads: [],
  create: (seed, opts) => makeConstantField(opts?.value ?? 1),
});

/** Soft mask from a CA grid. create(seed, { grid, softness }). */
FIELDS.register({
  id: 'ca',
  reads: ['caGrid'],
  create: (seed, opts) => makeCaField(opts?.grid, { softness: opts?.softness ?? 1 }),
});

/** fBm density field. create(seed, { freq, octaves, lacunarity, gain, z }). */
FIELDS.register({
  id: 'noise',
  create: (seed, opts) => makeNoiseField(seed >>> 0, opts),
});

/**
 * Scent field (#287, bio-drives) — the shared invisible substrate for LEAK
 * and MOLD. Tier 0 is declared beside the definition in scent.js (structural
 * substrate, never shed); repeated here so the registry is the single
 * readable list. create(seed, { cols, rows }).
 */
FIELDS.register({
  id: 'scent',
  reads: ['deposits'],
  writes: ['scalars.scent'],
  costTier: 0,
  create: (seed, opts) => createScentField(opts?.cols ?? SCENT_COLS, opts?.rows ?? SCENT_ROWS),
});

/** Drifting noise field for one quadtree build. create(seed, { seedOffsets, z }). */
FIELDS.register({
  id: 'quadtree',
  reads: ['seed', 'audio'],
  create: (seed, opts) => makeQuadtreeField(seed, opts?.seedOffsets ?? null, opts?.z ?? 0),
});
