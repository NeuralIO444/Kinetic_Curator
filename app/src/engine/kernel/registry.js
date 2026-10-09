// kernel/registry.js — the declared module registry factory (#1183, dish contract).
//
// Every engine module declares, at registration: id, family, reads, writes,
// costTier. One registry per family (samplers, fields, weather, features,
// …); the factory carries the validation so each family registry is a thin
// instance. UI renders from these registries — a new module is a new tile,
// zero panel changes.
//
// Entry: { id, family, reads, writes, costTier, ...payload }
//   family    — set by the factory, never by the caller
//   reads     — dish keys the module samples (default [])
//   writes    — dish keys the module produces (default [])
//   costTier  — 0|1|2|3, the governor's shed ladder (default 0 = structural,
//               never shed). No module runs without a declared cost.
//   payload   — family-specific: samplers carry `fn`, fields/weather/
//               features carry `create`
//
// Fail-closed: empty ids, missing payloads, non-string reads/writes, and
// out-of-range tiers throw, naming the offender. Re-declaring an id with a
// conflicting declaration (different reads/writes/costTier) throws; an
// identical re-declaration is a no-op that refreshes the payload — Vite HMR
// re-executes import-time registration with fresh closures (#551), and that
// must not throw.

const VALID_TIERS = new Set([0, 1, 2, 3]);

function isStringArray(v) {
  return Array.isArray(v) && v.every((r) => typeof r === 'string');
}

/** The comparable declaration: everything but the payload closure. */
function sigOf(entry) {
  return JSON.stringify({
    id: entry.id,
    family: entry.family,
    reads: entry.reads,
    writes: entry.writes,
    costTier: entry.costTier,
  });
}

/**
 * @param {string} family  e.g. 'sampler', 'field', 'weather', 'feature'
 * @param {{ payloadKey?: string, defaults?: { reads?: string[], writes?: string[], costTier?: number } }} [opts]
 */
export function createRegistry(family, { payloadKey = 'fn', defaults = {} } = {}) {
  if (typeof family !== 'string' || !family) {
    throw new Error('[registry] family must be a non-empty string');
  }
  if (typeof payloadKey !== 'string' || !payloadKey) {
    throw new Error(`[registry:${family}] payloadKey must be a non-empty string`);
  }
  const entries = new Map();

  function register(decl) {
    if (!decl || typeof decl !== 'object') {
      throw new Error(`[registry:${family}] declaration must be an object`);
    }
    const { id } = decl;
    if (typeof id !== 'string' || !id) {
      throw new Error(`[registry:${family}] id must be a non-empty string`);
    }
    const payload = decl[payloadKey];
    if (payload === undefined || payload === null) {
      throw new Error(`[registry:${family}] "${id}": missing ${payloadKey}`);
    }
    const reads = decl.reads === undefined ? (defaults.reads ?? []) : decl.reads;
    const writes = decl.writes === undefined ? (defaults.writes ?? []) : decl.writes;
    const costTier = decl.costTier === undefined ? (defaults.costTier ?? 0) : decl.costTier;
    if (!isStringArray(reads)) {
      throw new Error(`[registry:${family}] "${id}": reads must be an array of strings`);
    }
    if (!isStringArray(writes)) {
      throw new Error(`[registry:${family}] "${id}": writes must be an array of strings`);
    }
    if (!VALID_TIERS.has(costTier)) {
      throw new Error(`[registry:${family}] "${id}": costTier must be an integer 0–3 (got ${String(costTier)})`);
    }
    const entry = Object.freeze({
      id,
      family,
      reads: Object.freeze([...reads]),
      writes: Object.freeze([...writes]),
      costTier,
      [payloadKey]: payload,
    });
    const prev = entries.get(id);
    if (prev && sigOf(prev) !== sigOf(entry)) {
      throw new Error(`[registry:${family}] "${id}" re-declared with a conflicting declaration`);
    }
    entries.set(id, entry);
    return id;
  }

  /** The declaration for one id, or undefined when undeclared. */
  function get(id) {
    return entries.get(id);
  }

  /** Every registered id, in registration order. */
  function list() {
    return [...entries.keys()];
  }

  /** Every declaration, in registration order. */
  function all() {
    return [...entries.values()];
  }

  return { family, register, get, list, all };
}
