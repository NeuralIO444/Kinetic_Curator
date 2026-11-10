// poets/rayGunForm.js — RAY GUN (#2003): the poem-row type treatment.
//
// The pure transform: (standing form, { mode, seed }) -> the form as drawn
// under the treatment. Deterministic and seeded — the same (form, mode,
// seed) always deals the same blast, so a recorded take replays bit-for-bit.
//
// WHAT THIS IS: the sanctioned exception to the #1932 legibility floor.
// The floor governs everything the system DEALS (placement.js, untouched by
// this module — every dealt form still passes it forever). The ray gun is
// what the PERFORMER does to a dealt poem: a gesture on a standing form,
// armed only from the poem row, plain by default the way silence is the
// default. Matt's ruling on the dingbats question (2026-11-03): SHOT may go
// full Carson (word recoverability is NOT protected there — the poem may
// become pure texture); CARSON, GREIMAN and GRIT keep words recoverable.
// GRIT (#2010 P2 · SWISS GRIT) is the Ashworth half: the grid comes first,
// and the destruction is done TO the grid, by rule.
//
// WHERE IT LIVES (the record architecture): the treated stamp list is never
// stored. The standing form stays plain and carries the treatment record
// (`raygun: { mode, seed }`, carried through sanitizeFieldForm on the
// register marker's pattern); buildPlacements draws rayGunForm(plain,
// record) at the point where it honours the register. That is the only
// shape the current tree admits: the document door re-judges a stored form
// with the S4 gate (overlap is stillborn there), and this treatment's whole
// licence is to break overlap — so what persists is the RECORD, and the
// blast is recomputed from plain on every draw, never cumulative, exactly
// reversible by cycling back to plain (record absent).
//
// THE EXCEPTION'S OWN FLOOR (what the treatment may NOT break):
// 1. Glyph identity — every stamp keeps its `ch`; its FACE may move (ruling
//    D1, 2026-11-06, amending "no substitution, ever"): under a record that
//    names the wear axis (#2010 P1), a treated stamp's assetId may move to
//    ITS OWN letter's worn variant — torn or xerox, baked (placement.js
//    WEAR_STAMP_IDS). Never another letter, never a dingbat: `ch` is law.
//    Ghosts are added copies of the same letters, glyph-matched.
// 2. Word recoverability at CARSON, GREIMAN and GRIT — a word's glyphs keep
//    reading order along the row axis and stay a contiguous cluster: no
//    treated glyph centre (CARSON) and no word's treated centre-span
//    (GREIMAN) crosses the midpoint to a neighbouring word. GRIT re-sets
//    the poem, so its bound is stated on its own grid: every word keeps its
//    glyphs in order on consecutive columns, with one empty column between
//    words — its violations move glyphs only ACROSS the row axis. At SHOT
//    this bound is OFF, by the ruling.
// 3. The anchor — at CARSON/GREIMAN the first line's displacements are
//    halved (FIRST_LINE_FACTOR); at GRIT the first line takes no violation
//    and nothing is overprinted onto it; the poem-row identity chip always shows
//    the clean transcription regardless (it reads the deck, not the dish).
// And the door's stamp-level bounds hold for every treated stamp, by
// construction: centres on the dish, em within the door's (0, 0.3] and
// never under the legibility floor, total count under the door's cap.
//
// WORDS, GEOMETRICALLY: a form is a flat stamp list, so words are read off
// the geometry placement dealt. Rows share an exact baseline y. Within a
// row, placement's advances are exact constants: proportional recipes put
// TRACK (0.16 em) of air between a word's glyphs and TRACK + SPACE_ADV
// (0.58 em) across a space; the grid and square recipes put glyphs on an
// even pitch (a space is one empty pitch). Segmentation below uses exactly
// those constants — no statistics, no guessing.

import { mkRng } from '../engine/prng.js';
import { stampWidthEm, wearStampIdFor } from './placement.js';

/** The cycle, in tap order. Plain is the absence of the record. */
export const RAYGUN_MODES = Object.freeze(['carson', 'greiman', 'grit', 'shot']);

// The door's bounds, mirrored (fieldForm.js: sanitizeFieldForm's em
// ceiling, FIELD_MIN_LEGIBLE_EM, MAX_FIELD_STAMPS). Treated stamps obey
// them by construction; they are restated here so this module never
// imports the door (the door imports nothing from here either — the
// record's shape is a literal contract between the two, like 'whisper').
const EM_CAP = 0.3;
const EM_FLOOR = 0.01;
const COUNT_CAP = 200;

/** Bound 3: the first line's displacement magnitudes scale by this. */
const FIRST_LINE_FACTOR = 0.5;
/** Strict-order hair: treated centres stay this far inside their bounds. */
const ORDER_EPS = 1e-6;
/** Rows share an exact baseline in placement; this only absorbs float dust. */
const ROW_EPS = 1e-9;
/**
 * Proportional word-break threshold, in em of ink gap: within a word the
 * gap is exactly TRACK (0.16); across a space it is TRACK + SPACE_ADV
 * (0.58). 0.35 sits between the two constants.
 */
const WORD_GAP_SPLIT_EM = 0.35;
/** Grid/square word-break: a space is one empty pitch, so a break's centre distance exceeds 1.5 pitches. */
const GRID_SPLIT_RATIO = 1.5;

// CARSON — per-glyph, word-correlated (all magnitudes in the glyph's em).
const CARSON_STEP_EM = 0.25; // per-word baseline step, ±
const CARSON_JITTER_EM = 0.25; // per-glyph vertical jitter, ±
const CARSON_TILT_DEG = 12; // per-word tilt, ± (added to every glyph of the word)
const CARSON_GLYPH_ROT_DEG = 13; // per-glyph rotation, ± (tilt + this reaches the research's ±25°)
const CARSON_SCALE_MIN = 0.6;
const CARSON_SCALE_MAX = 1.8;
const CARSON_HERO_MIN = 2.2; // 1–2 hero glyphs per form scale to this range…
const CARSON_HERO_MAX = 3.0; // …(the em cap clamps the largest bases)
const CARSON_WALK_STEP_EM = 0.22; // tracking random-walk step, ±
const CARSON_WALK_MAX_EM = 0.3; // tracking random-walk clamp, ±
const CARSON_EDGE_P = 0.4; // chance a row-edge glyph pushes toward the dish edge (the crop)
const CARSON_EDGE_PUSH_EM = 0.5; // …by at most this much extra
const CARSON_DUP_P = 0.12; // misregistered-print duplicates: chance per glyph
const CARSON_DUP_DX_EM = 0.1; // duplicate offset, em
const CARSON_DUP_DY_EM = 0.06;

// GREIMAN — per-block (word) rigid similarity transforms.
const GREIMAN_SCALE_MIN = 0.7;
const GREIMAN_SCALE_MAX = 1.6;
const GREIMAN_ROT_MIN_DEG = 5;
const GREIMAN_ROT_MAX_DEG = 20;
const GREIMAN_STEP_EM = 0.5; // diagonal step per block from the form's middle block, in em
const GREIMAN_FLOAT_EM = 0.3; // per-block float offset, ±, in em
const GREIMAN_SNAP_P = 0.4; // chance a block's centre snaps to the coarse grid (the bitmap nod)
const GREIMAN_SNAP = 0.05; // the coarse grid, in unit dish space
const GREIMAN_ECHO_P = 0.5; // chance a block trails a whole-word echo
const GREIMAN_ECHO_EM = 1.2; // echo offset along the diagonal, in em
const GREIMAN_ECHO_SCALE = 0.62; // echo em relative to the block's treated em

// SHOT — the epicentre blast (recoverability OFF, by the ruling).
const SHOT_SIGMA = 0.38; // falloff length, in height units: f = exp(-d / SIGMA)
const SHOT_BLAST = 0.55; // displacement at the epicentre, in height units
const SHOT_GROW = 1.6; // em growth at the epicentre: em *= (1 + GROW * f)
const SHOT_SWIRL_DEG = 110; // tangential rotation at the epicentre, one seeded sign per blast
const SHOT_GHOST_F = 0.45; // falloff at/above which a glyph trails a ghost
const SHOT_GHOST_T = 0.45; // the ghost sits this far along the displacement vector
const SHOT_GHOST_SCALE = 0.6; // ghost em relative to the treated glyph's em

// GRIT (#2010 P2 · SWISS GRIT) — Ashworth's "hybrid of freeform with a Swiss aesthetic": the grid comes first, then
// ruled violations. A1 grid-then-destroy: the form is RE-SET on a strict modular grid (one size, columns on a fixed
// advance, rows on a baseline unit, flush left, straight), then a seeded subset of glyphs is moved exactly one
// baseline unit, one column drops a unit, and one row is overprinted onto its neighbour at full weight. A2 no house
// template: the grid's advance, baseline unit, leading and margins are drawn per record from the stream — every
// treatment draws its own grid. All magnitudes are in the set em (the form's median em, fitted to the dish).
const GRIT_ADVANCE_PAD = [0.08, 0.26]; // column advance = the form's widest ink + this pad, in em (monospaced discipline)
const GRIT_UNIT = [0.36, 0.44]; // the baseline unit, in em (em is cap height) — the one module every violation moves by
const GRIT_LEADING_UNITS = [6, 7]; // leading = this many baseline units (drawn: 6 or 7)…
// …and never tighter than this: the stage draws a field glyph's ink about 2.3 em tall (FIELD_EM_SCALE), so the Swiss
// base clears its own ink between rows — the discipline has to be legible before the violations can read as violence.
const GRIT_LEADING_MIN_EM = 2.6;
const GRIT_FIT = 0.88; // the set block fits within this share of the dish (each axis)
const GRIT_MARGIN = 0.06; // the minimum margin, as a share of the axis
const GRIT_SHIFT_P = 0.14; // chance a glyph (below the first line) moves exactly one unit up or down

// WEAR (#2010 P1 · TORN & XEROXED) — the shape lever, named in the record as `wear: 1` (an older record without it
// draws exactly as it always did, so every take recorded before P1 replays bit-for-bit). Per treated stamp, in output
// order, ONE draw off the wear stream — a stream of its own (WEAR_SALT on the record's seed), so the geometry above
// spends exactly the draws it always did: the blast is identical with wear on or off, only the faces move. GREIMAN is
// the clean digital pole (whole words, the bitmap nod) and stays unworn; CARSON wears some letters, SHOT most.
const WEAR_SALT = 0x57454152; // 'WEAR'
const WEAR_P = Object.freeze({
  carson: Object.freeze({ torn: 0.14, xerox: 0.24 }),
  shot: Object.freeze({ torn: 0.3, xerox: 0.32 }),
  // A5 systematic grit: degradation as a machine setting, not a gesture — every letter through the copier, none torn.
  grit: Object.freeze({ torn: 0, xerox: 1 }),
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** A stamp's ink half-width, in unit dish space (its own face's ruler). */
const halfInk = (s) => (stampWidthEm(s.assetId, s.ch) * s.em) / 2;

/**
 * Read the form's words off its geometry. Returns rows in reading order
 * (top to bottom), each { y, words } with words as arrays of stamp indices
 * in reading order. The ornament of a plate break is a row of its own in
 * placement, so it segments as a one-stamp word on its own row — it rides
 * the treatments as furniture, never merged into a word of letters.
 */
function segmentWords(stamps, layout) {
  const order = stamps
    .map((s, i) => i)
    .sort((a, b) => stamps[a].y - stamps[b].y || stamps[a].x - stamps[b].x || a - b);
  const rows = [];
  for (const i of order) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(stamps[i].y - row.y) <= ROW_EPS) row.items.push(i);
    else rows.push({ y: stamps[i].y, items: [i] });
  }
  const evenPitch = layout === 'grid' || layout === 'square';
  for (const row of rows) {
    row.items.sort((a, b) => stamps[a].x - stamps[b].x || a - b);
    let pitch = Infinity;
    if (evenPitch) {
      for (let k = 1; k < row.items.length; k++) {
        const dx = stamps[row.items[k]].x - stamps[row.items[k - 1]].x;
        if (dx > 0 && dx < pitch) pitch = dx;
      }
    }
    row.words = [];
    let word = [row.items[0]];
    for (let k = 1; k < row.items.length; k++) {
      const prev = stamps[row.items[k - 1]];
      const cur = stamps[row.items[k]];
      const dx = cur.x - prev.x;
      const isBreak = evenPitch
        ? Number.isFinite(pitch) && dx > GRID_SPLIT_RATIO * pitch
        : dx - halfInk(prev) - halfInk(cur) > WORD_GAP_SPLIT_EM * prev.em;
      if (isBreak) {
        row.words.push(word);
        word = [row.items[k]];
      } else word.push(row.items[k]);
    }
    row.words.push(word);
    delete row.items;
  }
  return rows;
}

/**
 * A word's cell on its row axis, in the PLAIN geometry: the interval
 * between the midpoints to the neighbouring words (the dish edges at the
 * row's ends). Bound 2 is stated over these cells.
 */
function wordCell(stamps, words, wi, aspect) {
  const word = words[wi];
  const first = stamps[word[0]];
  const last = stamps[word[word.length - 1]];
  const inkL = first.x - halfInk(first);
  const inkR = last.x + halfInk(last);
  let lo = 0;
  let hi = aspect;
  if (wi > 0) {
    const pw = words[wi - 1];
    const plast = stamps[pw[pw.length - 1]];
    lo = (inkL + plast.x + halfInk(plast)) / 2;
  }
  if (wi < words.length - 1) {
    const nw = words[wi + 1];
    const nfirst = stamps[nw[0]];
    hi = (inkR + nfirst.x - halfInk(nfirst)) / 2;
  }
  return { lo, hi };
}

// ── CARSON — the smash, per glyph, correlated by word ───────────────────
function carson(stamps, rows, rng, aspect) {
  const out = stamps.map((s) => ({ ...s }));
  const ghosts = [];
  // Heroes are dealt form-wide first (fixed draw order): 1–2 glyphs.
  const heroCount = 1 + (rng() < 0.5 ? 1 : 0);
  const heroes = new Set();
  while (heroes.size < Math.min(heroCount, stamps.length)) heroes.add(Math.floor(rng() * stamps.length));
  rows.forEach((row, r) => {
    const rowScale = r === 0 ? FIRST_LINE_FACTOR : 1;
    row.words.forEach((word, wi) => {
      const cell = wordCell(stamps, row.words, wi, aspect);
      const step = (rng() * 2 - 1) * CARSON_STEP_EM * rowScale;
      const tilt = (rng() * 2 - 1) * CARSON_TILT_DEG;
      let walk = 0;
      word.forEach((idx, k) => {
        const s = stamps[idx];
        if (k > 0) {
          walk = clamp(
            walk + (rng() * 2 - 1) * CARSON_WALK_STEP_EM * rowScale,
            -CARSON_WALK_MAX_EM * rowScale,
            CARSON_WALK_MAX_EM * rowScale,
          );
        }
        const jitter = (rng() * 2 - 1) * CARSON_JITTER_EM * rowScale;
        const rot = (rng() * 2 - 1) * CARSON_GLYPH_ROT_DEG;
        let scale = CARSON_SCALE_MIN + rng() * (CARSON_SCALE_MAX - CARSON_SCALE_MIN);
        if (heroes.has(idx)) scale = CARSON_HERO_MIN + rng() * (CARSON_HERO_MAX - CARSON_HERO_MIN);
        let dx = walk * s.em;
        // The crop: a row-edge glyph may push toward its dish edge. The
        // cell clamp below decides how much of the push survives — only
        // the row's outer words have cells that reach an edge.
        const isRowFirst = wi === 0 && k === 0;
        const isRowLast = wi === row.words.length - 1 && k === word.length - 1;
        if (isRowFirst && rng() < CARSON_EDGE_P) dx -= rng() * CARSON_EDGE_PUSH_EM * s.em * rowScale;
        if (isRowLast && rng() < CARSON_EDGE_P) dx += rng() * CARSON_EDGE_PUSH_EM * s.em * rowScale;
        // Bound 2, enforced per glyph: the treated centre stays inside
        // the word's cell AND strictly between its neighbours' plain
        // centres, so reading order can never invert.
        let lo = cell.lo;
        let hi = cell.hi;
        if (k > 0) lo = Math.max(lo, stamps[word[k - 1]].x + ORDER_EPS);
        if (k < word.length - 1) hi = Math.min(hi, stamps[word[k + 1]].x - ORDER_EPS);
        const nx = clamp(s.x + dx, lo, Math.max(lo, hi));
        const ny = clamp(s.y + (step + jitter) * s.em, 0, 1);
        out[idx] = {
          ...s,
          x: nx,
          y: ny,
          rotation: s.rotation + tilt + rot,
          em: clamp(s.em * scale, EM_FLOOR, EM_CAP),
        };
        // The misregistered double-print: a sparse same-size duplicate,
        // offset a hair off the treated glyph.
        if (rng() < CARSON_DUP_P && out.length + ghosts.length < COUNT_CAP) {
          ghosts.push({
            ...out[idx],
            x: clamp(nx + CARSON_DUP_DX_EM * s.em, 0, aspect),
            y: clamp(ny + CARSON_DUP_DY_EM * s.em, 0, 1),
          });
        }
      });
    });
  });
  return [...out, ...ghosts];
}

// ── GREIMAN — the float, per word-block, rigid ──────────────────────────
function greiman(stamps, rows, rng, aspect) {
  const out = stamps.map((s) => ({ ...s }));
  const ghosts = [];
  // One diagonal for the whole form (the Weingart step direction):
  // up and to the right in dish space (y grows downward).
  const ang = ((10 + rng() * 25) * Math.PI) / 180;
  const dirX = Math.cos(ang);
  const dirY = -Math.sin(ang);
  const totalBlocks = rows.reduce((n, row) => n + row.words.length, 0);
  const midBlock = (totalBlocks - 1) / 2;
  let blockIndex = 0;
  rows.forEach((row, r) => {
    const rowScale = r === 0 ? FIRST_LINE_FACTOR : 1;
    row.words.forEach((word, wi) => {
      const cell = wordCell(stamps, row.words, wi, aspect);
      const em0 = stamps[word[0]].em;
      let scale = GREIMAN_SCALE_MIN + rng() * (GREIMAN_SCALE_MAX - GREIMAN_SCALE_MIN);
      const rot = (GREIMAN_ROT_MIN_DEG + rng() * (GREIMAN_ROT_MAX_DEG - GREIMAN_ROT_MIN_DEG)) * (rng() < 0.5 ? -1 : 1) * rowScale;
      // The block's centre and its plain centre-span on the row axis.
      let cx = 0;
      let cy = 0;
      let spanL = Infinity;
      let spanR = -Infinity;
      for (const idx of word) {
        cx += stamps[idx].x;
        cy += stamps[idx].y;
        spanL = Math.min(spanL, stamps[idx].x);
        spanR = Math.max(spanR, stamps[idx].x);
      }
      cx /= word.length;
      cy /= word.length;
      // Bound 2 wins over the scale range: a block whose treated span
      // cannot fit its cell scales down until it can (still rigid).
      const span = spanR - spanL;
      if (span > 0) scale = Math.min(scale, (cell.hi - cell.lo) / span);
      const stepMag = (blockIndex - midBlock) * GREIMAN_STEP_EM * em0 * rowScale;
      let ncx = cx + dirX * stepMag + (rng() * 2 - 1) * GREIMAN_FLOAT_EM * em0 * rowScale;
      let ncy = cy + dirY * stepMag + (rng() * 2 - 1) * GREIMAN_FLOAT_EM * em0 * rowScale;
      if (rng() < GREIMAN_SNAP_P) {
        ncx = Math.round(ncx / GREIMAN_SNAP) * GREIMAN_SNAP;
        ncy = Math.round(ncy / GREIMAN_SNAP) * GREIMAN_SNAP;
      }
      ncx = clamp(ncx, cell.lo, cell.hi);
      ncy = clamp(ncy, 0, 1);
      const rad = (rot * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      const placed = word.map((idx) => {
        const s = stamps[idx];
        const dx = s.x - cx;
        const dy = s.y - cy;
        const px = ncx + scale * (cos * dx - sin * dy);
        const py = ncy + scale * (sin * dx + cos * dy);
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        return { idx, s, px, py };
      });
      // Span-fit: one rigid translation puts the block's whole treated
      // span inside its cell (x) and the dish (y) — bound 2, exactly.
      let shiftX = 0;
      if (minX < cell.lo) shiftX = cell.lo - minX;
      if (maxX + shiftX > cell.hi) shiftX = cell.hi - maxX;
      let shiftY = 0;
      if (minY < 0) shiftY = -minY;
      if (maxY + shiftY > 1) shiftY = 1 - maxY;
      for (const p of placed) {
        out[p.idx] = {
          ...p.s,
          x: p.px + shiftX,
          y: p.py + shiftY,
          rotation: p.s.rotation + rot,
          em: clamp(p.s.em * scale, EM_FLOOR, EM_CAP),
        };
      }
      // The echo: the whole word again, trailing back along the diagonal
      // at a smaller em — depth without per-stamp alpha (there is none).
      if (rng() < GREIMAN_ECHO_P) {
        for (const p of placed) {
          if (out.length + ghosts.length >= COUNT_CAP) break;
          ghosts.push({
            ...out[p.idx],
            x: clamp(p.px + shiftX - dirX * GREIMAN_ECHO_EM * em0, 0, aspect),
            y: clamp(p.py + shiftY - dirY * GREIMAN_ECHO_EM * em0, 0, 1),
            em: clamp(out[p.idx].em * GREIMAN_ECHO_SCALE, EM_FLOOR, EM_CAP),
          });
        }
      }
      blockIndex++;
    });
  });
  return [...out, ...ghosts];
}

// ── GRIT — the Swiss grid, then the ruled violations (Ashworth) ─────────
function grit(stamps, rows, rng, aspect) {
  // The set em: the form's median em (one size — Swiss discipline).
  const ems = stamps.map((s) => s.em).sort((a, b) => a - b);
  let em = ems[Math.floor(ems.length / 2)];
  let wMax = 0;
  for (const s of stamps) wMax = Math.max(wMax, stampWidthEm(s.assetId, s.ch));
  // A2 — this record's own grid, drawn in a fixed order.
  const between = (r) => r[0] + rng() * (r[1] - r[0]);
  let adv = (wMax + between(GRIT_ADVANCE_PAD)) * em;
  let unit = between(GRIT_UNIT) * em;
  const leadUnits = rng() < 0.5 ? GRIT_LEADING_UNITS[0] : GRIT_LEADING_UNITS[1];
  let lead = Math.max(unit * leadUnits, GRIT_LEADING_MIN_EM * em);
  const marginX = rng();
  const marginY = rng();
  // The columns: glyph k of a row on the next column; a word break is one empty column.
  const cols = rows.map((row) => {
    const out = [];
    let c = 0;
    row.words.forEach((word, wi) => {
      if (wi > 0) c++;
      for (const idx of word) out.push([idx, c++]);
    });
    return out;
  });
  const maxCol = cols.reduce((m, row) => Math.max(m, row.length ? row[row.length - 1][1] : 0), 0);
  // Fit the block to the dish: one factor on every module (the grid's proportions hold).
  const blockW = maxCol * adv + wMax * em;
  const blockH = (rows.length - 1) * lead + em + 2 * unit;
  const k = Math.min(1, (GRIT_FIT * aspect) / blockW, GRIT_FIT / blockH);
  em *= k;
  adv *= k;
  unit *= k;
  lead *= k;
  const setEm = clamp(em, EM_FLOOR, EM_CAP);
  const w = maxCol * adv + wMax * em;
  const h = (rows.length - 1) * lead + em;
  // Flush left, top-weighted: the free space is shared out asymmetrically (Swiss), never centred.
  const mx = GRIT_MARGIN * aspect;
  const my = GRIT_MARGIN;
  const x0 = mx + (wMax * em) / 2 + marginX * 0.5 * Math.max(0, aspect - 2 * mx - w);
  const y0 = my + em / 2 + unit + marginY * 0.4 * Math.max(0, 1 - 2 * my - h - 2 * unit);
  // The ruled violations, drawn in a fixed order: the dropped column, the overprinted row, then per glyph.
  const dropCol = Math.floor(rng() * (maxCol + 1));
  // Three rows or more: a two-row poem has no neighbour to spare but the anchor, so it takes no overprint.
  let overSrc = -1;
  let overDst = -1;
  if (rows.length > 2) {
    overSrc = 1 + Math.floor(rng() * (rows.length - 1));
    overDst = overSrc < rows.length - 1 ? overSrc + 1 : overSrc - 1;
  }
  const out = stamps.map((s) => ({ ...s }));
  cols.forEach((row, r) => {
    for (const [idx, c] of row) {
      let dy = 0;
      if (r > 0) {
        if (c === dropCol) dy = unit;
        else if (rng() < GRIT_SHIFT_P) dy = rng() < 0.5 ? -unit : unit;
      }
      out[idx] = {
        ...stamps[idx],
        x: clamp(x0 + c * adv, 0, aspect),
        y: clamp(y0 + r * lead + dy, 0, 1),
        rotation: 0,
        em: setEm,
      };
    }
  });
  // The overprint: a whole row printed again onto its neighbour's baseline, at full weight (C4 in miniature).
  const ghosts = [];
  if (overSrc >= 0) {
    for (const [idx] of cols[overSrc]) {
      if (out.length + ghosts.length >= COUNT_CAP) break;
      ghosts.push({ ...out[idx], y: clamp(out[idx].y + (overDst - overSrc) * lead, 0, 1) });
    }
  }
  return [...out, ...ghosts];
}

// ── SHOT — the blast. Bound 2 is OFF here, by Matt's ruling. ────────────
function shot(stamps, rng, aspect) {
  const out = stamps.map((s) => ({ ...s }));
  const ghosts = [];
  const cx = (0.25 + rng() * 0.5) * aspect;
  const cy = 0.25 + rng() * 0.5;
  const swirl = (rng() < 0.5 ? -1 : 1) * SHOT_SWIRL_DEG;
  stamps.forEach((s, idx) => {
    let ux = s.x - cx;
    let uy = s.y - cy;
    const d = Math.hypot(ux, uy);
    let f;
    if (d < 1e-6) {
      const a = rng() * Math.PI * 2;
      ux = Math.cos(a);
      uy = Math.sin(a);
      f = 1;
    } else {
      ux /= d;
      uy /= d;
      f = Math.exp(-d / SHOT_SIGMA);
    }
    const mag = SHOT_BLAST * f;
    const nx = clamp(s.x + ux * mag, 0, aspect);
    const ny = clamp(s.y + uy * mag, 0, 1);
    const nem = clamp(s.em * (1 + SHOT_GROW * f), EM_FLOOR, EM_CAP);
    out[idx] = { ...s, x: nx, y: ny, rotation: s.rotation + swirl * f, em: nem };
    // Ghosts trail along the displacement vector, between the plain
    // position and the blasted one, at a smaller em.
    if (f >= SHOT_GHOST_F && out.length + ghosts.length < COUNT_CAP) {
      ghosts.push({
        ...out[idx],
        x: clamp(s.x + ux * mag * SHOT_GHOST_T, 0, aspect),
        y: clamp(s.y + uy * mag * SHOT_GHOST_T, 0, 1),
        em: clamp(nem * SHOT_GHOST_SCALE, EM_FLOOR, EM_CAP),
      });
    }
  });
  return [...out, ...ghosts];
}

/**
 * Apply a treatment record to a standing form. `record` is the form's
 * ray-gun record { mode, seed, wear? } (the shape sanitizeFieldForm carries;
 * `wear: 1` names the P1 wear axis — absent, the treatment is geometry only).
 * Returns a NEW form whose stamps are the treated materialisation: the
 * plain list, transformed in place (stamp i of the output is stamp i of
 * the input, same ch — same assetId unless the record names the wear axis,
 * which may move it to its own letter's worn variant), with ghost duplicates appended. Every
 * other field of the form — poet, piece, layout, aspect, and the script /
 * register / face / break markers — rides unchanged. An absent or
 * dishonest record, or a form with no stamps, returns the form itself:
 * this function never throws and never invents a treatment.
 */
export function rayGunForm(form, record) {
  if (!form || typeof form !== 'object' || !Array.isArray(form.stamps) || form.stamps.length === 0) return form ?? null;
  const mode = record && typeof record === 'object' ? record.mode : undefined;
  const seed = record && typeof record === 'object' ? record.seed : undefined;
  if (!RAYGUN_MODES.includes(mode) || !Number.isInteger(seed) || seed < 0) return form;
  const rng = mkRng(seed);
  const aspect = Number.isFinite(form.aspect) && form.aspect > 0 ? form.aspect : 10 / 7;
  const rows = segmentWords(form.stamps, form.layout);
  const stamps =
    mode === 'carson'
      ? carson(form.stamps, rows, rng, aspect)
      : mode === 'greiman'
        ? greiman(form.stamps, rows, rng, aspect)
        : mode === 'grit'
          ? grit(form.stamps, rows, rng, aspect)
          : shot(form.stamps, rng, aspect);
  return { ...form, stamps: record.wear === 1 ? wear(stamps, mode, seed) : stamps };
}

/**
 * The wear pass: move treated stamps to their own letter's torn / xerox
 * variant. One draw per stamp off the wear stream, in output order, whether
 * or not the stamp has a variant (so a digit or a kana glyph spends its draw
 * and the letters after it land the same). Geometry and `ch` never move.
 */
function wear(stamps, mode, seed) {
  const p = WEAR_P[mode];
  if (!p) return stamps;
  const rng = mkRng((seed ^ WEAR_SALT) >>> 0);
  return stamps.map((s) => {
    const u = rng();
    const kind = u < p.torn ? 'torn' : u < p.torn + p.xerox ? 'xerox' : null;
    const id = kind ? wearStampIdFor(s.assetId, kind) : null;
    return id ? { ...s, assetId: id } : s;
  });
}
