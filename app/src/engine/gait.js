// engine/gait.js — #2328 (gait M2): the `kc-gait/1` record, its door, the join tree, and the evaluator.
//
// A GAIT is a portable motion record (docs/design/gait-spec.md §1): registered kineme drivers with amounts, per
// depth role (root / inner / leaf), plus structure — the phase cascade down the joins, and how a shape releases
// and rejoins when the field breaks it. It is named, reusable, and stored in the project document like a construct
// record (`gaitRecords`). Nothing here picks a gait: a gait is assigned by a test or a dev hook until M3.
//
// Pure and node-importable: no store, no clock, no randomness. Same record + tree + beat + seed → the same numbers.
//
// What this slice does NOT do (named so a later slice does not assume it):
//   - kineme.js is untouched. Its drivers read ONE amount per driver (ctx.amounts), so per-node amounts are produced
//     here and written to `soa.gaitAmounts` for the slice that wires pieces on stage (M1 #2327 / M4) to consume.
//   - The tree of a construct is DERIVED (see treeOf): a construct record stores each piece's placement, not its
//     parent. When M1 draws pieces down the ATTACH join tree it owns the real parent, and treeOf follows it.
import {
  getKinemeDriver,
  KINEME_DRIVERS,
  KINEME_PATTERNS,
  TRANSPORT_MODES,
  kinemePhase2,
  patternAmounts,
} from './kineme.js';
import { constructPartPoint } from './constructAssembler.js';
import { ATTACH_BOX } from './assetAttach.js';

export const GAIT_KIND = 'kc-gait/1';
/** A project keeps at most this many gait records; the oldest drop off (the construct and creature cap). */
export const MAX_GAIT_RECORDS = 64;
/** The depth roles a gait addresses (spec §1.2). */
export const GAIT_ROLES = Object.freeze(['root', 'inner', 'leaf']);
export const GAIT_SCATTERS = Object.freeze(['drift', 'burst', 'follow-flow']);
export const GAIT_PATHS = Object.freeze(['retrace', 'direct', 'arc']);
/** Release order is a gait's choice of which depth lets go first (used only when the field breaks the shape). */
export const GAIT_RELEASE_ORDERS = Object.freeze(['leaf-first', 'root-first', 'together']);
/**
 * The return easings. The spec names "the existing motion-file easings", but this repo has no easing registry, so the
 * closed set lives here until Matt names a source; an unknown ease is refused at the door like any unknown enum.
 */
export const GAIT_EASES = Object.freeze(['linear', 'inOut', 'inCubic', 'outCubic', 'outBack']);
/** With no audio tempo a gait runs on the kineme loop clock at this many beats a minute (spec §1.6). */
export const GAIT_DEFAULT_BPM = 120;

const MAX_NAME = 48;
const MAX_CASCADE_BEATS = 2;
const MAX_STAGGER_BEATS = 4;
const MAX_REJOIN_BEATS = 16;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round4 = (n) => Math.round(n * 1e4) / 1e4;
const oneOf = (list, v, fallback) => (list.includes(v) ? v : fallback);

// ── ids ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Canonical JSON: keys sorted at every depth, so the same gait always serialises to the same string. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

/** FNV-1a, 64 bit, over the UTF-8 bytes of a string: 16 lower-case hex digits. */
export function fnv64(text) {
  let h = FNV64_OFFSET;
  for (const byte of new TextEncoder().encode(text)) h = ((h ^ BigInt(byte)) * FNV64_PRIME) & MASK64;
  return h.toString(16).padStart(16, '0');
}

/** A gait's id: `gait:` + the FNV-64 of its canonical JSON without the id field. Same gait, same id. */
export function gaitIdFor(record) {
  const body = { ...(record || {}) };
  delete body.id;
  return `gait:${fnv64(canonicalJson(body))}`;
}

// ── the door ─────────────────────────────────────────────────────────────────────────────────────────────────

const camel = (id) => id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
/** The ctx.amounts key a driver reads its amount from ('brush-wobble' → brushWobble). */
export const driverAmountKey = (driverId) => camel(driverId);

function sanitizeRole(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const drivers = [];
  const seen = new Set();
  for (const d of Array.isArray(raw.drivers) ? raw.drivers : []) {
    if (!d || typeof d !== 'object' || typeof d.id !== 'string') continue;
    const driver = getKinemeDriver(d.id); // unknown ids are dropped (spec §2)
    if (!driver || seen.has(d.id) || !finite(d.amount)) continue;
    seen.add(d.id);
    // clamped to the driver's declared range; amount 0 stays 0 (the KINEME hard gate)
    drivers.push({ id: d.id, amount: round4(clamp(d.amount, driver.amountRange[0], driver.amountRange[1])) });
  }
  const role = { drivers };
  if (raw.transport && typeof raw.transport === 'object' && TRANSPORT_MODES.includes(raw.transport.mode)) {
    role.transport = { mode: raw.transport.mode };
  }
  if (typeof raw.rhythm === 'string' && KINEME_PATTERNS.includes(raw.rhythm)) role.rhythm = raw.rhythm;
  // A role that names nothing is the same as an absent one (absent = still).
  return drivers.length || role.transport || role.rhythm ? role : null;
}

/**
 * Validate one record. Returns a normalised copy carrying only the known fields, or null. A record whose name or
 * shape is wrong is refused WHOLE (the construct door's rule); unknown drivers are the one thing dropped quietly.
 * A record that carries an id must carry its own content hash — an id that lies refuses the record.
 */
export function sanitizeGait(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.kind !== GAIT_KIND) return null;
  if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > MAX_NAME) return null;
  if (raw.canon != null && !(typeof raw.canon === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(raw.canon))) return null;
  if (raw.parent != null && !(typeof raw.parent === 'string' && /^gait:[0-9a-f]{16}$/.test(raw.parent))) return null;
  if (!finite(raw.cascade)) return null;
  const roles = {};
  for (const name of GAIT_ROLES) {
    const role = sanitizeRole(raw.roles && raw.roles[name]);
    if (role) roles[name] = role;
  }
  const rel = raw.release && typeof raw.release === 'object' ? raw.release : {};
  const rej = raw.rejoin && typeof raw.rejoin === 'object' ? raw.rejoin : {};
  const record = {
    kind: GAIT_KIND,
    name: raw.name.trim(),
    canon: raw.canon ?? null,
    parent: raw.parent ?? null,
    roles,
    cascade: round4(clamp(raw.cascade, 0, MAX_CASCADE_BEATS)),
    release: {
      order: oneOf(GAIT_RELEASE_ORDERS, rel.order, 'leaf-first'),
      stagger: round4(clamp(finite(rel.stagger) ? rel.stagger : 0, 0, MAX_STAGGER_BEATS)),
      scatter: oneOf(GAIT_SCATTERS, rel.scatter, 'drift'),
    },
    rejoin: {
      ease: oneOf(GAIT_EASES, rej.ease, 'inOut'),
      beats: round4(clamp(finite(rej.beats) ? rej.beats : 1, 0, MAX_REJOIN_BEATS)),
      path: oneOf(GAIT_PATHS, rej.path, 'retrace'),
    },
  };
  const id = gaitIdFor(record);
  if (raw.id !== undefined && raw.id !== id) return null;
  return { id, ...record };
}

/** The project's gait list: every entry re-validated, de-duplicated by id (first wins), capped (newest kept). */
export function sanitizeGaitRecords(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    const rec = sanitizeGait(r);
    if (!rec || seen.has(rec.id)) continue;
    seen.add(rec.id);
    out.push(rec);
  }
  return out.slice(-MAX_GAIT_RECORDS);
}

/** Bank one gait: the new list, or the SAME list when nothing changes (a dishonest record, or one already banked). */
export function bankGait(bank, record) {
  const cur = Array.isArray(bank) ? bank : [];
  const rec = sanitizeGait(record);
  if (!rec || cur.some((r) => r && r.id === rec.id)) return cur;
  return [...cur, rec].slice(-MAX_GAIT_RECORDS);
}

// ── the join tree ────────────────────────────────────────────────────────────────────────────────────────────

/** The depth role of a node: depth 0 is the root, the deepest is the leaf, the rest are inner (spec §3). */
export const roleOfDepth = (depth, maxDepth) => (depth === 0 ? 'root' : depth === maxDepth ? 'leaf' : 'inner');

function withRoles(nodes) {
  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
  return { nodes: nodes.map((n) => ({ ...n, role: roleOfDepth(n.depth, maxDepth) })), maxDepth };
}

/**
 * The join tree a gait addresses: `{ nodes: [{ id, parent, depth, role }], maxDepth }`, parents listed before
 * children. A plain asset (and, until M5, a glyph) is one root node.
 *
 * A construct's tree is DERIVED: the record keeps each piece's placement but not which piece it joined. Pieces were
 * made in join order, so piece 0 is the root and every later piece hangs off the nearest EARLIER piece (centre to
 * centre, ties to the earlier one). That is the one honest reading of the record today; M1 (#2327) draws pieces
 * down the real ATTACH join tree and this adapter then reads the parent it records.
 */
export function treeOf(kind, record) {
  if (kind === 'construct') {
    const parts = Array.isArray(record?.parts) ? record.parts : [];
    const centre = parts.map((p) => constructPartPoint(p, { x: ATTACH_BOX / 2, y: ATTACH_BOX / 2 }));
    const nodes = [];
    for (let i = 0; i < parts.length; i++) {
      if (i === 0) {
        nodes.push({ id: 'p0', parent: null, depth: 0 });
        continue;
      }
      let best = 0;
      let bestD = Infinity;
      for (let j = 0; j < i; j++) {
        const d = Math.hypot(centre[i].x - centre[j].x, centre[i].y - centre[j].y);
        if (d < bestD - 1e-9) {
          bestD = d;
          best = j;
        }
      }
      nodes.push({ id: `p${i}`, parent: `p${best}`, depth: nodes[best].depth + 1 });
    }
    return nodes.length ? withRoles(nodes) : withRoles([{ id: 'root', parent: null, depth: 0 }]);
  }
  return withRoles([{ id: 'root', parent: null, depth: 0 }]);
}

// ── the beat clock ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * The beat time a gait runs on, in beats. The Queen's tempo (a `{ bpm }` estimate) sets the beat length; with no
 * audio tempo it falls back to GAIT_DEFAULT_BPM over the kineme loop clock's seconds (`driverTimeSec`).
 */
export function gaitBeatTime({ driverSec, bpm } = {}) {
  const sec = finite(driverSec) ? driverSec : 0;
  const rate = finite(bpm) && bpm > 0 ? bpm : GAIT_DEFAULT_BPM;
  return (sec * rate) / 60;
}

// ── the evaluator ────────────────────────────────────────────────────────────────────────────────────────────

/** The shaped beat pulse 0..1 for a phase (THUMP reads it): 1 on the beat, falling away. */
function beatPulse(beatTime, phase) {
  const f = (((beatTime - phase) % 1) + 1) % 1;
  return (1 - f) * (1 - f);
}

const AMOUNT_KEYS = () => KINEME_DRIVERS.map((d) => driverAmountKey(d.id));

/**
 * Per-node driver amounts for one moment. Pure.
 *
 *   soa       the stage SoA, or null. When it carries `gaitNode` (slot → node index into tree.nodes) the amounts are
 *             also written per slot to `soa.gaitAmounts` ({ [amountKey]: Float64Array(n) }), ahead of the drivers.
 *   gait      a sanitised record (or null: no gait, every amount 0).
 *   tree      treeOf(...)
 *   beatTime  beats (gaitBeatTime)
 *   seed      the project seed: the per-node phase source
 *
 * Phase = the node's seed-hash phase + depth × cascade, in beats, so each step down the joins lags the one above it
 * (follow-through). A node whose role names no drivers, or whose amounts are all 0, gets amounts of exactly 0 and
 * no pattern is applied to it — amount 0 everywhere is today's render (the KINEME_SPEC hard gate).
 *
 * @returns {{ any: boolean, nodes: Array<{ id, depth, role, phase, rhythm, amounts }> }}
 */
export function evaluateGait(soa, gait, tree, beatTime, seed) {
  const keys = AMOUNT_KEYS();
  const beat = finite(beatTime) ? beatTime : 0;
  const cascade = gait && finite(gait.cascade) ? gait.cascade : 0;
  const treeNodes = tree && Array.isArray(tree.nodes) ? tree.nodes : [];
  let any = false;
  const nodes = treeNodes.map((node, index) => {
    const role = gait && gait.roles ? gait.roles[node.role] : null;
    const base = Object.fromEntries(keys.map((k) => [k, 0]));
    let live = false;
    for (const d of role ? role.drivers : []) {
      if (d.amount > 0) live = true;
      base[driverAmountKey(d.id)] = d.amount;
    }
    const phase = kinemePhase2(seed | 0, index)[0] + node.depth * cascade;
    let amounts = base;
    if (live && role.rhythm) {
      const shaped = patternAmounts(base, role.rhythm, beatPulse(beat, phase));
      amounts = { ...base, breath: shaped.breath, drift: shaped.drift, pulse: shaped.pulse };
    }
    if (live) any = true;
    return { id: node.id, depth: node.depth, role: node.role, phase, rhythm: (role && role.rhythm) || null, amounts };
  });
  if (soa && soa.gaitNode && soa.n > 0) {
    const n = soa.n | 0;
    const out = soa.gaitAmounts && soa.gaitAmounts[keys[0]]?.length >= n ? soa.gaitAmounts : {};
    for (const k of keys) out[k] = out[k]?.length >= n ? out[k].fill(0, 0, n) : new Float64Array(n);
    for (let slot = 0; slot < n; slot++) {
      const node = nodes[soa.gaitNode[slot]];
      if (!node) continue;
      for (const k of keys) out[k][slot] = node.amounts[k];
    }
    soa.gaitAmounts = out;
  }
  return { any, nodes };
}
