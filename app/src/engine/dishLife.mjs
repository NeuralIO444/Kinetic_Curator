// dishLife.mjs — DISH LIFE slice 1 (#1923): the culture core.
//
// A multi-state "Generations"-family cellular automaton over the dish grid. Cells are
// dead (0), alive (1), or decaying (2..STATES-1): a cell that fails to survive does not
// vanish, it ages through the decay states and only then dies, so colonies bloom and rot
// with tails instead of blinking. Decaying cells never count as neighbours and cannot be
// reborn until dead.
//
//   PURE + SEEDED — no clock, no Math.random, no globals. A culture is a pure function of
//   (grid, rule, bedrock, mask) and the number of steps taken; the only randomness is the
//   optional seedRandom fill, which draws on the registered 'dish-life' channel. Same
//   seed + same composition = same culture (golden in dishLife.selfcheck.mjs).
//
//   RIM — no wraparound. Cells beyond the grid are dead, and cells outside the optional
//   dish mask are glass: colonies die against it (a culture drying on the dish wall).
//
//   BEDROCK — locked / held elements are terrain (the #1923 integration contract). A
//   bedrock cell is never alive and never counted, so colonies flow around it; the culture
//   never consumes it.
//
//   FIELD — the core publishes its state as a readable field from the same pass that
//   computes the generation (the ruled one-way "dish field" contract): `field.level`
//   (0..1 per cell: 1 alive, fading to 0 through decay) and `field.activity` (0..1, how
//   recently the cell changed, eased). Consumers READ these; nothing here ever writes
//   another system's state. Arrays are reused in place — read them the frame you get
//   them, do not hold them across steps.
//
//   COST — typed arrays, double-buffered, zero allocation per step. A culture that was
//   never created costs nothing: this module has no module-level state.

import { hashU01 } from './kernel/rng.js';

/** Default Generations rule: Conway birth/survival with a 6-state life (alive + 4 decay + dead). */
export const DEFAULT_RULE = Object.freeze({ birth: [3], survive: [2, 3], states: 6 });

/**
 * The rule the idle pickup runs (#1923 slice 2 spike). Raw Conway (DEFAULT_RULE) fails on real
 * compositions: from a 30%-dense scene it collapses to scattered still-lifes by ~generation 12
 * and 83% of runs die or freeze inside 30 generations. B3/S234 keeps the colonies growing out
 * of the scene's own shape (every one of 138 preset runs stays alive and moving past 100
 * generations) with 8 states for long decay tails. It matures into a maze that fills the dish
 * (~generation 60-100), so the harvest must fire inside that arc.
 */
export const CULTURE_RULE = Object.freeze({ birth: [3], survive: [2, 3, 4], states: 8 });

/** Per-step easing of the activity field (higher = longer memory of change). */
export const ACTIVITY_KEEP = 0.7;

function lut(counts, max = 8) {
  const t = new Uint8Array(max + 1);
  for (const n of counts) if (Number.isInteger(n) && n >= 0 && n <= max) t[n] = 1;
  return t;
}

/** Normalise a rule: B/S neighbour-count lists (0..8) and a state count of 3..16. */
export function normalizeRule(r) {
  const o = r && typeof r === 'object' ? r : {};
  const states = Math.max(3, Math.min(16, Math.round(Number(o.states)) || DEFAULT_RULE.states));
  return {
    birth: Array.isArray(o.birth) ? o.birth : DEFAULT_RULE.birth,
    survive: Array.isArray(o.survive) ? o.survive : DEFAULT_RULE.survive,
    states,
  };
}

/**
 * Create a culture. `seed` is an optional Uint8Array(cols*rows) of states (0 dead, 1 alive,
 * >1 decaying; clamped to the rule). `mask` (Uint8Array, 1 = dish, 0 = glass) and `bedrock`
 * (Uint8Array, 1 = locked terrain) are optional and may be replaced later via the setters.
 */
export function createCulture({ cols, rows, rule, seed = null, mask = null, bedrock = null } = {}) {
  const w = Math.max(1, cols | 0);
  const h = Math.max(1, rows | 0);
  const n = w * h;
  const r = normalizeRule(rule);
  const c = {
    cols: w,
    rows: h,
    rule: r,
    gen: 0,
    cur: new Uint8Array(n),
    nxt: new Uint8Array(n),
    mask: mask && mask.length === n ? mask : null,
    bedrock: bedrock && bedrock.length === n ? bedrock : null,
    birthLut: lut(r.birth),
    surviveLut: lut(r.survive),
    field: { cols: w, rows: h, gen: 0, level: new Float32Array(n), activity: new Float32Array(n) },
  };
  if (seed && seed.length === n) {
    for (let i = 0; i < n; i++) c.cur[i] = Math.min(seed[i] | 0, r.states - 1);
  }
  clearBlocked(c, c.cur);
  publish(c, null);
  return c;
}

function blocked(c, i) {
  return (c.mask && !c.mask[i]) || (c.bedrock && c.bedrock[i]);
}

function clearBlocked(c, buf) {
  if (!c.mask && !c.bedrock) return;
  for (let i = 0; i < buf.length; i++) if (blocked(c, i)) buf[i] = 0;
}

/** Replace the terrain (locked elements). A null clears it. Cells now blocked die at once. */
export function setBedrock(c, bedrock) {
  c.bedrock = bedrock && bedrock.length === c.cur.length ? bedrock : null;
  clearBlocked(c, c.cur);
}

/** Level of a state: 1 for alive, easing to 0 through the decay states, 0 for dead. */
function levelOf(state, states) {
  if (state === 0) return 0;
  if (state === 1) return 1;
  return 1 - (state - 1) / (states - 1);
}

function publish(c, prev) {
  const { level, activity } = c.field;
  const s = c.rule.states;
  const cur = c.cur;
  for (let i = 0; i < cur.length; i++) {
    level[i] = levelOf(cur[i], s);
    const changed = prev ? (prev[i] !== cur[i] ? 1 : 0) : 0;
    activity[i] = prev ? Math.max(changed, activity[i] * ACTIVITY_KEEP) : 0;
  }
  c.field.gen = c.gen;
}

/** Advance one generation in place. Returns the culture (same object). */
export function stepCulture(c) {
  const { cols: w, rows: h, cur, nxt, birthLut, surviveLut } = c;
  const last = c.rule.states - 1;
  for (let y = 0; y < h; y++) {
    const y0 = y > 0 ? (y - 1) * w : -1;
    const y1 = y * w;
    const y2 = y < h - 1 ? (y + 1) * w : -1;
    for (let x = 0; x < w; x++) {
      const i = y1 + x;
      if (blocked(c, i)) {
        nxt[i] = 0;
        continue;
      }
      const xl = x > 0 ? x - 1 : -1;
      const xr = x < w - 1 ? x + 1 : -1;
      let k = 0;
      if (y0 >= 0) {
        if (xl >= 0 && cur[y0 + xl] === 1) k++;
        if (cur[y0 + x] === 1) k++;
        if (xr >= 0 && cur[y0 + xr] === 1) k++;
      }
      if (xl >= 0 && cur[y1 + xl] === 1) k++;
      if (xr >= 0 && cur[y1 + xr] === 1) k++;
      if (y2 >= 0) {
        if (xl >= 0 && cur[y2 + xl] === 1) k++;
        if (cur[y2 + x] === 1) k++;
        if (xr >= 0 && cur[y2 + xr] === 1) k++;
      }
      const s = cur[i];
      if (s === 0) nxt[i] = birthLut[k] ? 1 : 0;
      else if (s === 1) nxt[i] = surviveLut[k] ? 1 : last >= 2 ? 2 : 0;
      else nxt[i] = s >= last ? 0 : s + 1;
    }
  }
  c.cur = nxt;
  c.nxt = cur;
  c.gen++;
  publish(c, cur);
  return c;
}

/** Fill a Uint8Array(cols*rows) with alive cells at `density` (0..1) from the seeded 'dish-life' channel. */
export function seedRandom(cols, rows, seed, density = 0.3) {
  const out = new Uint8Array(cols * rows);
  for (let i = 0; i < out.length; i++) out[i] = hashU01(seed, 'dish-life', i) < density ? 1 : 0;
  return out;
}

/** Cells in each state-class: { alive, decaying, dead }. */
export function population(c) {
  let alive = 0;
  let decaying = 0;
  for (let i = 0; i < c.cur.length; i++) {
    const s = c.cur[i];
    if (s === 1) alive++;
    else if (s > 1) decaying++;
  }
  return { alive, decaying, dead: c.cur.length - alive - decaying };
}

/** Total activity this generation (sum of the activity field) — the "is anything happening" read. */
export function totalActivity(c) {
  let t = 0;
  const a = c.field.activity;
  for (let i = 0; i < a.length; i++) t += a[i];
  return t;
}

/** FNV-1a over the state grid — the golden fingerprint. */
export function cultureHash(c) {
  let hsh = 0x811c9dc5;
  for (let i = 0; i < c.cur.length; i++) {
    hsh ^= c.cur[i];
    hsh = Math.imul(hsh, 0x01000193) >>> 0;
  }
  return hsh >>> 0;
}

/** An elliptical dish mask (1 inside, 0 on the glass) for a cols×rows grid. */
export function ellipseMask(cols, rows) {
  const m = new Uint8Array(cols * rows);
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const rx = Math.max(0.5, cols / 2);
  const ry = Math.max(0.5, rows / 2);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      m[y * cols + x] = dx * dx + dy * dy <= 1 ? 1 : 0;
    }
  return m;
}
