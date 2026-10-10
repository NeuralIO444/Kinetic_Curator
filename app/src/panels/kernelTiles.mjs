// kernelTiles.mjs — registry → tile descriptors (#1233).
//
// The KERNEL tab renders one tile per module registered in the kernel
// registries — never from a hardcoded list. A module registered in
// field/weather/feature registry.js appears as a tile with zero panel-code
// edits; this seam (not the JSX) is what the node selfcheck covers, so the
// claim is tested, not asserted.
//
// Tile descriptor: { id, family, face, tier, reads, writes, decl }.
// `face` is the ≤4-char deadpan face (KC-1 DS: deadpan copy on controls);
// `decl` is the frozen registry entry — its `create` is how the probe
// instantiates the module, so the panel never imports a constructor
// directly (the reviewer's kernel acceptance: call sites read the
// registry instead of importing the constructor).

import { FIELDS } from '../engine/kernel/field/registry.js';
import { WEATHER } from '../engine/kernel/weather/registry.js';
import { FEATURES } from '../engine/kernel/feature/registry.js';

/** ≤4-char deadpan face for a module id (KC-1 DS: deadpan copy on controls). */
export function tileFace(id) {
  return String(id).toUpperCase().slice(0, 4);
}

/**
 * The tile rows for a list of registries: [{ family, tiles }], one tile per
 * registered module, in registration order. Empty registries contribute no
 * row — no tile, no crash.
 */
export function tileRowsFor(registries) {
  const rows = [];
  for (const reg of registries) {
    const tiles = reg.all().map((d) => ({
      id: d.id,
      family: d.family,
      face: tileFace(d.id),
      tier: d.costTier,
      reads: [...d.reads],
      writes: [...d.writes],
      decl: d,
    }));
    if (tiles.length) rows.push({ family: reg.family, tiles });
  }
  return rows;
}

/** The live kernel roster: FIELD / WEATHER / FEATURE rows, registry-driven. */
export function registryTileRows() {
  return tileRowsFor([FIELDS, WEATHER, FEATURES]);
}

/** Live counts per family, for the honest header line (discrete → TE). */
export function registryCounts() {
  return [
    { family: 'field', n: FIELDS.list().length },
    { family: 'weather', n: WEATHER.list().length },
    { family: 'feature', n: FEATURES.list().length },
  ];
}

/**
 * Deterministic probe of a field entry: instantiate through the registry's
 * own `create` and read sample(0.5, 0.5) — the (seed, x, y) → scalar shape
 * the field registry declares. Read-only: no engine state is touched, and
 * the same seed always returns the same value. Returns null when the entry
 * has no field-sample shape (weather/feature entries) or probes non-finite.
 * Throws propagate — the panel catches and shows ERR rather than crashing.
 */
export function probeField(decl, seed) {
  const inst = decl.create(seed >>> 0);
  if (!inst || typeof inst.sample !== 'function') return null;
  const v = inst.sample(0.5, 0.5);
  return Number.isFinite(v) ? v : null;
}
