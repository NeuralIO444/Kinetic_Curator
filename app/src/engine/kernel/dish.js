// kernel/dish.js — the dish: shared world state, filled once at placement (#1183).
//
// One dish per placement. Channels:
//   points   — named point sets ({ marks, seeds, … }); written once at
//              placement (init-time CPU), read per frame. Never mutated
//              per frame.
//   fields   — named field instances (flow, force)
//   scalars  — named scalar/density fields
//   ground   — the pattern tile function (x, y) → color; the same function
//              the renderer paints with (slice-1 one-source-of-truth rule)
//   features — world features [{ id, kind, x, y, radius }]
//   tone     — global tone state
//
// Identity: every entity carries { id, family, source } — family is
// mark | shape | feature | …, source is the producing module (asset id,
// pattern id, sampler id). Modules target queried sets via select(), never
// hardcoded wiring: dish.select({ family: 'shape', source: 'pattern:quilt' })
// is the shapes of one pattern; dish.select({ family: 'mark' }) is everything.
//
// Cost: identity is IDs on arrays that already exist — free at placement.
// Selections are precomputed at fill time; select() never searches, so
// per-frame queries stay cheap. Re-query only when the set changes (new
// pattern, new asset) — i.e. refill, which rebuilds the index.

/**
 * @param {{ seed: number }} opts
 */
export function createDish({ seed }) {
  const dish = {
    seed: seed >>> 0,
    points: {},
    fields: {},
    scalars: {},
    ground: null,
    features: [],
    tone: {},
    /**
     * Precomputed selection. query = { family, source? }.
     * Returns the indexed array (shared reference — do not mutate), or []
     * when nothing matches. Never searches: the index is built at fill time.
     */
    select(query = {}) {
      const { family, source } = query;
      if (typeof family !== 'string' || !family) return [];
      const key = source ? `${family}\x00${source}` : family;
      return dish._index.get(key) || [];
    },
  };
  // Non-enumerable so the dish serializes cleanly (JSON of a dish is its
  // channels, not its lookup tables).
  Object.defineProperty(dish, '_index', { value: new Map(), enumerable: false });
  Object.defineProperty(dish, '_sets', { value: new Map(), enumerable: false });
  return dish;
}

function indexEntity(index, e) {
  if (!e || typeof e.family !== 'string' || !e.family) return;
  let arr = index.get(e.family);
  if (!arr) index.set(e.family, (arr = []));
  arr.push(e);
  if (typeof e.source === 'string' && e.source) {
    const key = `${e.family}\x00${e.source}`;
    let sarr = index.get(key);
    if (!sarr) index.set(key, (sarr = []));
    sarr.push(e);
  }
}

/**
 * Fill one named point set and rebuild the selection index. Called once at
 * placement by the orchestrator — never per frame. Refilling a name
 * replaces its entities (no double-counting).
 *
 * @param {object} dish  from createDish
 * @param {string} name  e.g. 'marks'
 * @param {Array<{ id: string, family: string, source?: string }>} entities
 */
export function fillDishPoints(dish, name, entities) {
  if (typeof name !== 'string' || !name) {
    throw new Error('[dish] point-set name must be a non-empty string');
  }
  const list = Array.isArray(entities) ? entities : [];
  dish._sets.set(name, list);
  dish.points[name] = list;
  const index = dish._index;
  index.clear();
  for (const set of dish._sets.values()) {
    for (const e of set) indexEntity(index, e);
  }
  return list;
}
