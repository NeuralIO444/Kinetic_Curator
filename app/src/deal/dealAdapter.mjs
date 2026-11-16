// deal/dealAdapter.mjs — #2232: the one thing a host writes to use KINETIC and CURATOR as engines.
//
// An adapter is plain data and pure functions. It never touches a store, a clock or Math.random. The engines
// (kineticEngine.mjs, curatorEngine.mjs) never write state either: a host applies a pick itself — the stage through
// its store action, the WetLab through bankCreature. That is what lets any editor reuse them: an adapter and a button.
//
//   scopes        [{ id, label }, …] the ladder, narrowest first. What "wide" means in this editor.
//   defaultScope  the id a missing or unknown scope falls back to.
//   deal(scope, { seed, press, want, maxDraws, ctx })        → candidate[]   the wide deal (at most maxDraws)
//   near(candidate, cap, { seed, press, want, maxDraws, ctx }) → candidate[] the fine deal: each within `cap` of it
//   gate(candidate, ctx)   → boolean   hard viability; a candidate that fails dies in the hand (stillborn)
//   read(candidate, ctx)   → { total, … } the curator's measured read; `total` in [0, 1] orders the hand
//   key(candidate)         → string    the stable id (ties break on it; duplicates are dropped by it)

/** The members an adapter must carry, and what each must be. */
const FUNCTIONS = Object.freeze(['deal', 'near', 'gate', 'read', 'key']);

/**
 * Check an adapter's shape once, loudly, so a mistake surfaces at the seam and not inside a press.
 * Returns the adapter; throws a TypeError naming every problem.
 */
export function assertAdapter(adapter) {
  const bad = [];
  if (!adapter || typeof adapter !== 'object') throw new TypeError('deal adapter: not an object');
  const { scopes, defaultScope } = adapter;
  if (!Array.isArray(scopes) || scopes.length < 1) bad.push('scopes (a non-empty array)');
  else {
    const ids = scopes.map((s) => (s && typeof s.id === 'string' && s.id ? s.id : null));
    if (ids.some((id) => id === null)) bad.push('scopes (every entry needs a string id)');
    else if (new Set(ids).size !== ids.length) bad.push('scopes (ids must be unique)');
    else if (!ids.includes(defaultScope)) bad.push('defaultScope (must name one of the scopes)');
  }
  for (const name of FUNCTIONS) if (typeof adapter[name] !== 'function') bad.push(`${name} (a function)`);
  if (bad.length) throw new TypeError(`deal adapter: bad ${bad.join(', ')}`);
  return adapter;
}

/** An integer clamped into [lo, hi]; anything that is not a finite number falls back to `dflt`. */
export function clampInt(v, lo, hi, dflt) {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : dflt;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Collect a hand from raw candidates: the gate, the dedupe and the draw budget, in one place for both engines.
 * Reads at most `budget` candidates (a runaway adapter cannot blow the press). A candidate with no string key, or one
 * whose gate says no or throws, never enters the hand — it is counted, not carried. Order is the adapter's own.
 * `exclude` keys (the subject of a funnel) never enter.
 */
export function collectHand(adapter, raw, { want, budget, ctx, exclude = [] }) {
  const list = Array.isArray(raw) ? raw : [];
  const held = new Set(exclude);
  const hand = [];
  let draws = 0;
  let stillborn = 0;
  let duplicates = 0;
  for (; draws < list.length && draws < budget && hand.length < want; draws++) {
    const c = list[draws];
    let key;
    try {
      key = adapter.key(c);
    } catch {
      key = null;
    }
    if (typeof key !== 'string' || !key) {
      stillborn++;
      continue;
    }
    if (held.has(key)) {
      duplicates++;
      continue;
    }
    let ok = false;
    try {
      ok = adapter.gate(c, ctx) === true;
    } catch {
      ok = false;
    }
    if (!ok) {
      stillborn++;
      continue;
    }
    held.add(key);
    hand.push(c);
  }
  return { hand, draws, stillborn, duplicates };
}
