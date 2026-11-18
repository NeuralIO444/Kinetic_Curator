// engine/gait.js — #2328 (GAIT M2; spec docs/design/gait-spec.md §2–§3, rulings 1, 2, 6, 8): the gait record.
//
// A GAIT is a portable motion record (ruling 1): named, reusable, worn by any asset or construct (creatures, beasts
// and glyphs get their adapters in M5). It is addressed by join-tree depth — root, inner, leaf (ruling 2) — and its
// phase cascades down the joins, so one gait gives follow-through and overlapping action. Its contents are
// REGISTERED kineme drivers only, with amounts, per depth role, plus structure (ruling 8). The clock is beats
// (ruling 6).
//
// This slice is data and pure functions: the record, its sanitizer, its content id, the door and the bank, the
// join-tree adapter for constructs and plain assets, the beat clock, and the evaluator. No picking yet — a gait is
// assigned only by a test (M3 adds the Canon defaults, the QUEEN's pick and the take event). Nothing on stage
// reads a gait yet, so every render is byte-identical.
//
// Pure and deterministic: no clock, no Math.random. The one seeded draw (a wearer's phase) rides the registered
// 'gait' string channel.

import { hashU01 } from './kernel/rng.js';
import { getKinemeDriver, KINEME_PATTERNS, TRANSPORT_MODES } from './kineme.js';
import { constructPartPoint } from './constructAssembler.js';

export const GAIT_KIND = 'kc-gait/1';
/** The string channel a wearer's phase rides (registered in kernel/rng.js STRING_CHANNEL_GROUPS). */
export const GAIT_CHANNEL = 'gait';
/** Depth roles, root to leaf (ruling 2). */
export const GAIT_ROLES = Object.freeze(['root', 'inner', 'leaf']);
/** A project keeps at most this many gait records; the oldest drop off (the construct-record cap). */
export const MAX_GAIT_RECORDS = 64;
/** At most this many drivers per role (there are five registered today; this is headroom, not a target). */
export const MAX_DRIVERS_PER_ROLE = 8;
/** The tempo a gait runs at with no audio (ruling 6: the kineme loop clock at a default BPM). */
export const GAIT_DEFAULT_BPM = 120;
/** Beats of phase delay per depth step, at most (a cascade longer than a beat per joint reads as lag, not overlap). */
export const GAIT_CASCADE_MAX = 1;
/** Break-up structure (ruling 3: the field decides when, the gait decides how). Used from M4 on. */
export const GAIT_RELEASE_ORDERS = Object.freeze(['leaf-first', 'root-first', 'together']);
export const GAIT_SCATTERS = Object.freeze(['drift', 'burst', 'follow-flow']);
export const GAIT_PATHS = Object.freeze(['retrace', 'direct', 'arc']);
export const GAIT_EASES = Object.freeze(['linear', 'outCubic', 'inOutCubic', 'outBack']);
export const GAIT_STAGGER_MAX = 4; // beats between released depths
export const GAIT_REJOIN_BEATS = Object.freeze({ min: 0.25, max: 16 });
/** A construct piece joins a parent where its own ATTACH point lands on one of the parent's (box units). */
export const JOIN_EPS = 0.05;

const NAME_MAX = 40;
const GAIT_ID_RE = /^gait:[0-9a-f]{16}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r4 = (n) => Math.round(n * 10000) / 10000;

// ── the content id ───────────────────────────────────────────────────────────────────────────────────────────────

/** Canonical JSON: object keys sorted at every level, so the same gait always serialises the same way. */
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (isObj(v))
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`)
      .join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
}

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;
/** FNV-1a 64 of a string's UTF-16 code units, as 16 hex digits. */
function fnv64(str) {
  let h = FNV64_OFFSET;
  for (let i = 0; i < str.length; i++) {
    h ^= BigInt(str.charCodeAt(i));
    h = (h * FNV64_PRIME) & MASK64;
  }
  return h.toString(16).padStart(16, '0');
}

/** The content id of a gait: everything but the id itself, canonically. Same gait, same id (spec §2). */
export function gaitIdFor(gait) {
  const body = isObj(gait) ? { ...gait } : {};
  delete body.id;
  return `gait:${fnv64(canonicalJson(body))}`;
}

// ── the sanitizer (the door) ─────────────────────────────────────────────────────────────────────────────────────

function sanitizeRole(raw) {
  if (!isObj(raw)) return null;
  const drivers = [];
  const seen = new Set();
  for (const d of Array.isArray(raw.drivers) ? raw.drivers : []) {
    if (!isObj(d) || typeof d.id !== 'string' || seen.has(d.id) || drivers.length >= MAX_DRIVERS_PER_ROLE) continue;
    const decl = getKinemeDriver(d.id); // ruling 8: registered drivers only — an unknown id is dropped, never kept
    if (!decl || !fin(d.amount)) continue;
    seen.add(d.id);
    drivers.push({ id: d.id, amount: r4(clamp(d.amount, decl.amountRange[0], decl.amountRange[1])) });
  }
  const out = { drivers };
  if (KINEME_PATTERNS.includes(raw.rhythm)) out.rhythm = raw.rhythm;
  if (isObj(raw.transport) && TRANSPORT_MODES.includes(raw.transport.mode))
    out.transport = { mode: raw.transport.mode };
  return out;
}

/**
 * Validate one gait. Returns a normalized copy carrying only the known fields, with its content id recomputed, or
 * null when it is not a gait at all (wrong kind, no name). Inside a gait the door is forgiving: an unknown driver,
 * a bad amount or an unknown structure value is dropped or defaulted, so an older or hand-edited record still loads
 * as the nearest honest gait. The id is ALWAYS recomputed: a record never keeps an id its content does not earn.
 */
export function sanitizeGait(raw) {
  if (!isObj(raw) || raw.kind !== GAIT_KIND) return null;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
  const roles = {};
  if (isObj(raw.roles))
    for (const role of GAIT_ROLES) {
      const r = sanitizeRole(raw.roles[role]);
      if (r) roles[role] = r;
    }
  const rel = isObj(raw.release) ? raw.release : {};
  const rej = isObj(raw.rejoin) ? raw.rejoin : {};
  const body = {
    kind: GAIT_KIND,
    name: raw.name.trim().slice(0, NAME_MAX),
    canon: typeof raw.canon === 'string' && raw.canon ? raw.canon.slice(0, NAME_MAX) : null,
    parent: typeof raw.parent === 'string' && GAIT_ID_RE.test(raw.parent) ? raw.parent : null,
    roles,
    cascade: fin(raw.cascade) ? r4(clamp(raw.cascade, 0, GAIT_CASCADE_MAX)) : 0,
    release: {
      order: GAIT_RELEASE_ORDERS.includes(rel.order) ? rel.order : GAIT_RELEASE_ORDERS[0],
      stagger: fin(rel.stagger) ? r4(clamp(rel.stagger, 0, GAIT_STAGGER_MAX)) : 0,
      scatter: GAIT_SCATTERS.includes(rel.scatter) ? rel.scatter : GAIT_SCATTERS[0],
    },
    rejoin: {
      ease: GAIT_EASES.includes(rej.ease) ? rej.ease : GAIT_EASES[0],
      beats: fin(rej.beats) ? r4(clamp(rej.beats, GAIT_REJOIN_BEATS.min, GAIT_REJOIN_BEATS.max)) : 1,
      path: GAIT_PATHS.includes(rej.path) ? rej.path : GAIT_PATHS[0],
    },
  };
  return { id: gaitIdFor(body), ...body };
}

/** The project's gait list: every entry re-validated, de-duplicated by id (first wins), capped (newest kept). */
export function sanitizeGaitRecords(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    const g = sanitizeGait(r);
    if (!g || seen.has(g.id)) continue;
    seen.add(g.id);
    out.push(g);
  }
  return out.slice(-MAX_GAIT_RECORDS);
}

/** Bank one gait: the new list, or the SAME list when nothing changes (not a gait, or already banked). */
export function bankGaitRecord(bank, gait) {
  const cur = Array.isArray(bank) ? bank : [];
  const g = sanitizeGait(gait);
  if (!g || cur.some((r) => r && r.id === g.id)) return cur;
  return [...cur, g].slice(-MAX_GAIT_RECORDS);
}

// ── the join-tree adapter (spec §3) ──────────────────────────────────────────────────────────────────────────────

/**
 * The role of a depth in a tree whose deepest node is `maxDepth`: 0 → root, maxDepth → leaf, else inner. A tree of
 * one node is all root.
 */
export function roleOfDepth(depth, maxDepth) {
  if (depth <= 0) return 'root';
  return depth >= maxDepth ? 'leaf' : 'inner';
}

const node = (id, parent, depth) => ({ id, parent, depth });

/**
 * A wearer's join tree: { nodes: [{ id, parent, depth }], maxDepth }. Node i is the wearer's i-th mark (for a
 * construct, its i-th piece, in record order), so the tree lines up with the marks it addresses.
 *   'asset'      one root node (spec: plain assets are root only).
 *   'construct'  one node per piece. The record keeps no parent links, so the tree is DERIVED: the assembler
 *                joins piece i by laying its own ATTACH point on a point an earlier piece offered, so piece i's
 *                parent is the earliest piece with a point within JOIN_EPS of where piece i's own point lands.
 *                Pure — a function of the record and the pieces' points, with no change to the record's format.
 *                opts.pointsOf(assetId) → that primitive's ATTACH points ([{x, y}], box units) is required.
 * Returns null for an unknown kind or a construct whose pieces' points are not supplied.
 */
export function treeOf(kind, record, opts = {}) {
  if (kind === 'asset') return { nodes: [node(0, -1, 0)], maxDepth: 0 };
  if (kind !== 'construct') return null;
  const parts = record && Array.isArray(record.parts) ? record.parts : null;
  const pointsOf = typeof opts.pointsOf === 'function' ? opts.pointsOf : null;
  if (!parts || !parts.length || !pointsOf) return null;
  const placed = [];
  for (const part of parts) {
    const pts = pointsOf(part.asset);
    if (!Array.isArray(pts) || !pts.length) return null;
    placed.push(pts.map((p) => constructPartPoint(part, p)));
  }
  const nodes = [node(0, -1, 0)];
  let maxDepth = 0;
  for (let i = 1; i < parts.length; i++) {
    const own = placed[i][parts[i].own] || placed[i][0];
    let parent = -1;
    for (let j = 0; j < i && parent < 0; j++)
      if (placed[j].some((q) => Math.abs(q.x - own.x) <= JOIN_EPS && Math.abs(q.y - own.y) <= JOIN_EPS)) parent = j;
    if (parent < 0) parent = 0; // a join the rounding lost (never seen in the house set): hang it on the root
    const depth = nodes[parent].depth + 1;
    if (depth > maxDepth) maxDepth = depth;
    nodes.push(node(i, parent, depth));
  }
  return { nodes, maxDepth };
}

// ── the clock (ruling 6) ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * The gait's beat time. The QUEEN's tempo drives it when there is one: `beatPos` (beats since the show's beat
 * origin) wins; otherwise the driver clock at `bpm`; with no audio, the driver clock at GAIT_DEFAULT_BPM.
 */
export function gaitBeatTime({ beatPos = null, bpm = null, driverSec = 0 } = {}) {
  if (fin(beatPos)) return beatPos;
  const tempo = fin(bpm) && bpm > 0 ? bpm : GAIT_DEFAULT_BPM;
  return (fin(driverSec) ? driverSec : 0) * (tempo / 60);
}

/** A wearer's phase, in beats [0, 1): one draw per wearer, so every node of one wearer shares it exactly. */
export const gaitPhase = (seed) => hashU01(seed >>> 0, GAIT_CHANNEL, 0);

// ── the evaluator (spec §3) ──────────────────────────────────────────────────────────────────────────────────────

/**
 * The per-node driver amounts and beat times of one wearer, ready for the drivers (the wiring is M3/M5's). Pure.
 *   amounts[driverId][k]  the amount node k's role gives that driver (0 where the role does not name it)
 *   beat[k]               node k's beat time: beatTime − (the wearer's phase + depth × cascade). A leaf lags the
 *                         root by exactly depth × cascade beats (follow-through, overlapping action).
 *   active                false when every amount is 0 — the KINEME hard gate: nothing is written, and the soa
 *                         is never touched, so amount 0 everywhere is today's render exactly.
 * @param soa      the wearer's marks; soa.n must equal the tree's node count (node k ↔ slot k). Never mutated.
 * @param gait     a sanitized gait
 * @param tree     treeOf(...) for the wearer
 * @param beatTime gaitBeatTime(...)
 * @param seed     the wearer's seed (its phase)
 * @returns { active, amounts, beat } or null on a malformed call (a tree that does not line up with the marks)
 */
export function evaluateGait(soa, gait, tree, beatTime, seed = 0) {
  const n = soa ? soa.n | 0 : 0;
  if (!gait || !tree || !Array.isArray(tree.nodes) || tree.nodes.length !== n || !fin(beatTime)) return null;
  const amounts = {};
  let active = false;
  for (const role of GAIT_ROLES) {
    const r = gait.roles && gait.roles[role];
    if (!r) continue;
    for (const d of r.drivers || []) if (d.amount > 0) active = true;
  }
  if (!active) return { active: false, amounts, beat: null };
  const beat = new Float64Array(n);
  const phase0 = gaitPhase(seed);
  const cascade = fin(gait.cascade) ? gait.cascade : 0;
  let wrote = false;
  for (let k = 0; k < n; k++) {
    const { depth } = tree.nodes[k];
    beat[k] = beatTime - (phase0 + depth * cascade);
    const r = gait.roles[roleOfDepth(depth, tree.maxDepth)];
    if (!r) continue;
    for (const d of r.drivers) {
      if (!(d.amount > 0)) continue;
      if (!amounts[d.id]) amounts[d.id] = new Float64Array(n);
      amounts[d.id][k] = d.amount;
      wrote = true;
    }
  }
  // a gait whose moving roles this wearer has no node for (leaf drivers on a one-node asset) moves nothing: inactive
  if (!wrote) return { active: false, amounts: {}, beat: null };
  return { active: true, amounts, beat };
}
