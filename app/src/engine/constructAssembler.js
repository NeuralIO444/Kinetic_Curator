// engine/constructAssembler.js — #2108 (constructs, slice 1; spec docs/design/constructs-spec.md): the construct assembler.
//
// A CONSTRUCT is a new static design shape built from a style's simple shapes (docs/design/constructs-spec.md).
// Matt's rulings (2026-11-16, §8): a construct is 12–16 primitives from ONE style's small vocabulary, joined at
// their ATTACH points and reused with scale and rotation. Its pieces are its recipe, so the same list that
// builds it is the list the field later breaks it into.
//
// Data only: the assembler deals a RECORD, and the composer (slice 2, below) turns a record into ONE pool
// tile's drawing; the door and the bank (slice 4, below) keep records in the project document. Nothing on
// stage reads one yet (the deal is its own slice).
//
// Pure and deterministic (spec §4): no clock, no Math.random. Every draw rides the registered 'construct'
// string channel — its own stream, so a construct deal never re-keys a creature deal sharing the seed — keyed
// by the style, the vocabulary and its points. Same seed + style + vocabulary ⇒ the identical record, byte
// for byte.
//
// A sibling of the creature assembler, never a branch in it: no head, no limbs, no genome, no rig. The
// H / L roles a point may carry are creature grammar; here a point is only where shapes join.

import { hashU01 } from './kernel/rng.js';
import { sanitizeAttachPoints, ATTACH_BOX, MAX_ATTACH } from './assetAttach.js';
import { constructVocabularyIds } from './constructRules.js'; // the style's closed vocabulary, as data
import { assetCostScore, COST_WARNING_THRESHOLD } from '../assets/ingest.js'; // the price of a drawing, whoever drew it

export const CONSTRUCT_KIND = 'kc-construct/1';
/** The string channel every construct draw rides (registered in kernel/rng.js STRING_CHANNEL_GROUPS). */
export const CONSTRUCT_CHANNEL = 'construct';
/** A construct is built from this many primitives (Matt, 2026-11-16: 12–16 pieces per construct). */
export const CONSTRUCT_MIN_PARTS = 12;
export const CONSTRUCT_MAX_PARTS = 16;
/** A style's vocabulary is small and reused: at most this many primitives are read from a rule. */
export const MAX_VOCABULARY = 32;
/** The scale range a joined piece is dealt in, relative to the first piece (1). */
export const PART_SCALE = Object.freeze({ min: 0.35, max: 0.8 });
/** The turns a piece may take when its style names none: quarter turns. */
export const DEFAULT_ROTATIONS = Object.freeze([0, 90, 180, 270]);
/** The margin the finished composition keeps inside the box, in box units. */
export const CONSTRUCT_MARGIN = 4;

/** The pool id a construct's tile takes: the overlay's `user:` namespace + the record id. */
export const constructTileId = (recordId) => `user:${recordId}`;
/** True for a construct tile's pool id. Its own shape, so no consumer mistakes it for a creature tile. */
export const isConstructTileId = (id) => typeof id === 'string' && /^user:cn-[0-9a-f]{8}$/.test(id);

/** FNV-1a of a string: a stable 32-bit key. */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;
const validId = (id) => typeof id === 'string' && !!id && id.length <= 120;

/** The rule's vocabulary, made honest: unique ids, sanitized points, in the order given, at most MAX_VOCABULARY. */
function readVocabulary(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const v of raw) {
    if (!v || !validId(v.id) || seen.has(v.id) || out.length >= MAX_VOCABULARY) continue;
    seen.add(v.id);
    // Roles are creature grammar: a construct reads plain points only.
    out.push({ id: v.id, points: sanitizeAttachPoints(v.points).map((p) => ({ x: p.x, y: p.y })) });
  }
  return out;
}

function readRotations(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_ROTATIONS];
  const out = [];
  for (const r of raw) {
    if (typeof r !== 'number' || !Number.isFinite(r)) continue;
    const d = r2(((r % 360) + 360) % 360);
    if (!out.includes(d) && out.length < 24) out.push(d);
  }
  return out.length ? out : [...DEFAULT_ROTATIONS];
}

function readScale(raw) {
  const min = Number(raw?.min);
  const max = Number(raw?.max);
  if (!(min > 0) || !(max >= min) || max > 1) return { ...PART_SCALE };
  return { min, max };
}

/** The construct key: what the record is a pure function of (besides the seed). */
const constructKey = (style, vocab, rotations, scale) =>
  `${style}|${vocab.map((v) => `${v.id}:${v.points.map((p) => `${p.x},${p.y}`).join(';')}`).join('|')}|${rotations.join(',')}|${scale.min},${scale.max}`;

/** Where a piece's own box point lands: T + R(r)·s·p. */
function place(part, p) {
  const a = (part.r * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: part.x + part.s * (c * p.x - s * p.y), y: part.y + part.s * (s * p.x + c * p.y) };
}

const BOX_CORNERS = Object.freeze([
  { x: 0, y: 0 },
  { x: ATTACH_BOX, y: 0 },
  { x: 0, y: ATTACH_BOX },
  { x: ATTACH_BOX, y: ATTACH_BOX },
]);

/**
 * Assemble a construct record from one style's rule.
 * @param {object} p
 *   style:      the Canon style id (required). One style per construct (spec §6).
 *   vocabulary: the style's primitives, [{ id, points }] — each an asset id and its ATTACH points (the artist's
 *               own, or the shape's AUTO points). Closed: nothing outside it enters the construct.
 *   seed:       the deal seed (uint32).
 *   rotations:  the turns (degrees) a piece may take; quarter turns when absent.
 *   scale:      { min, max } for joined pieces, relative to the first piece; PART_SCALE when absent.
 * @returns the record, or null when the style is missing or the vocabulary has no primitive that carries a point
 *   (nothing to join at — a construct is never a pile).
 */
export function assembleConstruct({ style, vocabulary = [], seed = 0, rotations = null, scale = null } = {}) {
  if (!validId(style)) return null;
  const vocab = readVocabulary(vocabulary);
  const jointed = vocab.filter((v) => v.points.length > 0);
  if (!jointed.length) return null;
  const turns = readRotations(rotations);
  const range = readScale(scale);
  const s0 = seed >>> 0;
  const key = constructKey(style, vocab, turns, range);
  const k = hash32(key);
  let n = 0;
  const draw = () => hashU01(s0, CONSTRUCT_CHANNEL, (k + n++) >>> 0);
  const pick = (list) => list[Math.floor(draw() * list.length) % list.length];

  const countSpan = CONSTRUCT_MAX_PARTS - CONSTRUCT_MIN_PARTS + 1;
  const count = CONSTRUCT_MIN_PARTS + (Math.floor(draw() * countSpan) % countSpan);
  // Pieces that carry two or more points keep the shape growing; a one-point piece is a leaf.
  const growers = jointed.filter((v) => v.points.length > 1);

  const parts = [];
  /** Join points still free: { x, y } in the working frame, with the way OUT of the piece that offers it. */
  const open = [];
  /** Every join ever made, so a shape that runs out of free points still joins at a real one. */
  const used = [];

  for (let i = 0; i < count; i++) {
    const remaining = count - i - 1;
    // While the shape must keep growing and is nearly out of free points, prefer a piece that adds some.
    const needGrower = growers.length > 0 && remaining > 0 && open.length <= 1;
    const prim = pick(needGrower ? growers : jointed);
    const own = Math.floor(draw() * prim.points.length) % prim.points.length;
    const sc = i === 0 ? 1 : range.min + draw() * (range.max - range.min);
    let join;
    if (i === 0) {
      join = { x: ATTACH_BOX / 2, y: ATTACH_BOX / 2, ox: 0, oy: 0 };
    } else if (open.length) {
      join = open.splice(Math.floor(draw() * open.length) % open.length, 1)[0];
    } else {
      join = pick(used);
    }
    // The turn. A piece joins facing OUT: its body lies on the far side of the join from the piece it joins,
    // so shapes abut and the construct grows outward instead of piling up. The turn is the allowed one nearest
    // to that; a join with no outward side (the first piece, or a point at a box centre) is dealt a turn.
    const vx = prim.points[own].x - ATTACH_BOX / 2;
    const vy = prim.points[own].y - ATTACH_BOX / 2;
    let r;
    if (Math.hypot(join.ox, join.oy) < 1e-6 || Math.hypot(vx, vy) < 1) {
      r = pick(turns);
    } else {
      // R(r)·v must point back at the host: the angle of −out, less the angle of v.
      const want = ((Math.atan2(-join.oy, -join.ox) - Math.atan2(vy, vx)) * 180) / Math.PI;
      const gap = (t) => Math.abs(((((t - want) % 360) + 540) % 360) - 180);
      r = turns.reduce((best, t) => (gap(t) < gap(best) - 1e-9 ? t : best), turns[0]);
    }
    // Place the piece so its own point sits on the join: T = join − R·s·own.
    const part = { asset: prim.id, own, x: 0, y: 0, s: sc, r };
    const off = place(part, prim.points[own]);
    part.x = join.x - off.x;
    part.y = join.y - off.y;
    parts.push(part);
    used.push(join);
    const centre = place(part, { x: ATTACH_BOX / 2, y: ATTACH_BOX / 2 });
    prim.points.forEach((p, j) => {
      if (j === own) return;
      const q = place(part, p);
      const d = Math.hypot(q.x - centre.x, q.y - centre.y);
      open.push({ x: q.x, y: q.y, ox: d > 1e-6 ? (q.x - centre.x) / d : 0, oy: d > 1e-6 ? (q.y - centre.y) / d : 0 });
    });
  }

  // Fit the whole composition into the box: uniform scale, centred, a margin kept. The bound is every piece's
  // own box (its drawing lives inside it), so nothing can be clipped by the tile.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const part of parts) {
    for (const c of BOX_CORNERS) {
      const q = place(part, c);
      x0 = Math.min(x0, q.x);
      y0 = Math.min(y0, q.y);
      x1 = Math.max(x1, q.x);
      y1 = Math.max(y1, q.y);
    }
  }
  const span = Math.max(x1 - x0, y1 - y0);
  const f = (ATTACH_BOX - 2 * CONSTRUCT_MARGIN) / span;
  const ox = (ATTACH_BOX - f * (x1 - x0)) / 2 - f * x0;
  const oy = (ATTACH_BOX - f * (y1 - y0)) / 2 - f * y0;
  const fit = (q) => ({ x: f * q.x + ox, y: f * q.y + oy });

  const outParts = parts.map((part) => {
    const t = fit(part);
    return { asset: part.asset, own: part.own, x: r2(t.x), y: r2(t.y), s: r4(part.s * f), r: part.r };
  });
  // The construct's own ATTACH points: the joins it left free, so it can join again (or serve as a creature
  // body — spec §1). At most MAX_ATTACH, in the order they were opened.
  const points = sanitizeAttachPoints(open.slice(0, MAX_ATTACH).map(fit));

  const body = { kind: CONSTRUCT_KIND, style, seed: s0, parts: outParts, points };
  const id = `cn-${hash32(`${key}#${s0}`).toString(16).padStart(8, '0')}`;
  return { id, ...body };
}

/** Where a record's piece puts a point of its own box, in the construct's box. For the composer and the tests. */
export const constructPartPoint = (part, p) => place(part, p);

// ── Slice 2: the construct as ONE pool tile ───────────────────────────────────────────────────────────────────
//
// The tile is a pure function of the record (spec §4): composing its drawing is string work, so the same
// record always bakes the same tile and a take that names the tile replays the shape exactly. Every piece is
// its primitive's own drawing inside one `<g transform>` — the creature tile's discipline, N times. On stage
// the whole composition costs one atlas cell.

/** A construct tile's pool category and source: what it is, said by the record rather than by its id. */
export const CONSTRUCT_CATEGORY = 'construct';
export const CONSTRUCT_SOURCE = 'construct';
/** True for a construct tile as a POOL RECORD — by what it is (category + source), never by its id. */
export const isConstructTile = (asset) =>
  !!asset && asset.category === CONSTRUCT_CATEGORY && asset.source === CONSTRUCT_SOURCE;

const validPart = (part) =>
  !!part &&
  validId(part.asset) &&
  [part.x, part.y, part.s, part.r].every((n) => typeof n === 'number' && Number.isFinite(n)) &&
  part.s > 0;

/**
 * The tile's SVG: each piece's own drawing, moved to its join — translate, then turn, then size, so a point p
 * of the piece's box lands at T + R(r)·s·p, exactly where the assembler placed it.
 * @param record  a construct record.
 * @param svgOf   (assetId) => that primitive's svg markup, or nothing when the pool no longer carries it.
 * @returns the markup, or null when any piece cannot be drawn: no tile without every piece (a construct with a
 *   hole in it is a different shape, and the record would no longer describe its tile).
 */
export function constructTileSvg(record, svgOf) {
  if (!record || !Array.isArray(record.parts) || !record.parts.length || typeof svgOf !== 'function') return null;
  let out = '';
  for (const part of record.parts) {
    if (!validPart(part)) return null;
    const svg = svgOf(part.asset);
    if (typeof svg !== 'string' || !svg) return null;
    out += `<g transform="translate(${part.x} ${part.y}) rotate(${part.r}) scale(${part.s})">${svg}</g>`;
  }
  return out;
}

/**
 * What the bake owes before it is banked (spec §5): the drawing's cost score, and whether it is over the
 * house warning line. Over the line is a warning to show, never a silent bake and never a refusal.
 */
export function constructCost(svg) {
  const score = assetCostScore(svg);
  return { score, over: score > COST_WARNING_THRESHOLD };
}

/**
 * The pool entry for a record — an ordinary pool asset. Returns null when the tile cannot be drawn.
 * `points` are the construct's own ATTACH points (the joins it left free), carried on the tile so a consumer
 * never has to guess them from the composed markup.
 */
export function constructTile(record, svgOf) {
  const svg = constructTileSvg(record, svgOf);
  if (!svg || !validId(record.style) || !/^cn-[0-9a-f]{8}$/.test(record.id)) return null;
  return {
    id: constructTileId(record.id),
    category: CONSTRUCT_CATEGORY,
    weight: 'medium',
    tags: ['construct', record.style],
    compound: true,
    source: CONSTRUCT_SOURCE,
    svg,
    points: sanitizeAttachPoints(record.points).map((p) => ({ x: p.x, y: p.y })),
    cost: constructCost(svg),
  };
}

// ── Slice 4: the record door and the bank ─────────────────────────────────────────────────────────────────────
//
// Matt's ruling (2026-11-16): a project saves construct RECORDS only — the recipes. A tile is never saved: it is
// drawn into the pool from its record (constructTile, above), so constructs never use the import overlay's slots.
//
// The door is the trust boundary (records live in the project document, which can be hand-edited or arrive from
// an older build). The creature door's rule, kept: a record dishonest in any particular is refused WHOLE, never
// half-loaded. One style per construct is mechanical here (spec §6): a piece outside its style's vocabulary
// refuses the record, and the record shape has no second-style field.

/** A project keeps at most this many construct records; the oldest drop off (Matt, 2026-11-15: the creature cap). */
export const MAX_CONSTRUCT_RECORDS = 64;
/** A piece's position is a box coordinate; a fitted piece's origin can sit outside the box, but never far. */
const PART_POS_LIMIT = 2 * ATTACH_BOX;

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * Validate one record. Returns a normalized copy carrying only the known fields, or null.
 * @param vocabularyOf (styleId) => that style's primitive ids; the Canon data by default. A style with no
 *   vocabulary is not a construct style, so its records are refused.
 */
export function sanitizeConstructRecord(raw, vocabularyOf = constructVocabularyIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.kind !== CONSTRUCT_KIND) return null;
  if (typeof raw.id !== 'string' || !/^cn-[0-9a-f]{8}$/.test(raw.id)) return null;
  if (!Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed > 0xffffffff) return null;
  if (!validId(raw.style)) return null;
  const vocab = new Set(vocabularyOf(raw.style) || []);
  if (!vocab.size) return null;
  if (!Array.isArray(raw.parts)) return null;
  if (raw.parts.length < CONSTRUCT_MIN_PARTS || raw.parts.length > CONSTRUCT_MAX_PARTS) return null;
  const parts = [];
  for (const p of raw.parts) {
    if (!p || typeof p !== 'object' || !vocab.has(p.asset)) return null;
    if (!Number.isInteger(p.own) || p.own < 0 || p.own >= MAX_ATTACH) return null;
    if (![p.x, p.y, p.s, p.r].every(finite)) return null;
    if (Math.abs(p.x) > PART_POS_LIMIT || Math.abs(p.y) > PART_POS_LIMIT) return null;
    if (!(p.s > 0) || p.s > 1 || p.r < 0 || p.r >= 360) return null;
    parts.push({ asset: p.asset, own: p.own, x: r2(p.x), y: r2(p.y), s: r4(p.s), r: r2(p.r) });
  }
  // The construct's own points: honest ATTACH points, plain (a role is creature grammar and a lie here).
  if (!Array.isArray(raw.points) || raw.points.length > MAX_ATTACH) return null;
  if (raw.points.some((p) => p && p.role !== undefined)) return null;
  const points = sanitizeAttachPoints(raw.points);
  if (points.length !== raw.points.length) return null;
  return { id: raw.id, kind: CONSTRUCT_KIND, style: raw.style, seed: raw.seed, parts, points };
}

/** The project's record list: every entry re-validated, de-duplicated by id (first wins), capped (newest kept). */
export function sanitizeConstructRecords(raw, vocabularyOf = constructVocabularyIds) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    const rec = sanitizeConstructRecord(r, vocabularyOf);
    if (!rec || seen.has(rec.id)) continue;
    seen.add(rec.id);
    out.push(rec);
  }
  return out.slice(-MAX_CONSTRUCT_RECORDS);
}

/**
 * Bank one record: the new list, or the SAME list when nothing changes (a dishonest record, or one already
 * banked). At the cap the oldest drops off — a construct is dealt, not hand-made, so the bank rolls forward.
 */
export function bankConstructRecord(bank, record, vocabularyOf = constructVocabularyIds) {
  const cur = Array.isArray(bank) ? bank : [];
  const rec = sanitizeConstructRecord(record, vocabularyOf);
  if (!rec || cur.some((r) => r && r.id === rec.id)) return cur;
  return [...cur, rec].slice(-MAX_CONSTRUCT_RECORDS);
}
