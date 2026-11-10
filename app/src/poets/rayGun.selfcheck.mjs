// rayGun.selfcheck.mjs — RAY GUN (#2003), the poem-row type treatment, measured on the real machinery.
//
// THE SHAPE (and why): the treated stamp list is never stored. The standing form stays PLAIN and
// carries the treatment record (`raygun: { mode, seed }`, through sanitizeFieldForm on the register
// marker's pattern); buildPlacements draws rayGunForm(plain, record). A stored treated list could
// not exist in this tree: the door re-judges stored forms with the S4 gate, whose overlap rule the
// treatment exists to break. So what persists passes the door whole (pinned below), and the blast
// is recomputed from plain on every draw — never cumulative, exactly reversible.
//
// THE FLOOR (the exception's own, measured not eyeballed): glyph identity always (stamps keep
// ch/assetId; ghosts are glyph-matched additions); word recoverability at CARSON and GREIMAN —
// reading order preserved, words contiguous clusters inside their plain-geometry cells, the first
// line tighter-bound; SHOT's exemption from recoverability pinned as deliberately (Matt's ruling:
// SHOT may go full Carson — the poem may become pure texture). The door's stamp-level bounds hold
// for every treated stamp by construction: centres on the dish, em within (0.01, 0.3], count ≤ 200.
//
// Words are measured against DECK TRUTH (the piece's own lines), never against the module's own
// segmentation — the floor is checked by an independent reader.
import assert from 'node:assert';
import { useStore } from '../state/store.js';
import { resetDirector } from '../curator/director.js';
import { fieldFormForDeal, sanitizeFieldForm, POET_DECKS } from './fieldForm.js';
import { POEM_RAYGUN_BASE } from './poemRow.mjs';
import { rayGunForm, RAYGUN_MODES } from './rayGunForm.js';
import { stampWidthEm, ORNAMENT_STAMP_IDS } from './placement.js';
import { mkRng } from '../engine/prng.js';
import { rngForIndex, CH } from '../engine/kernel/rng.js';
import { buildPlacements, FIELD_EM_SCALE, WHISPER_ALPHA } from '../engine/buildPlacements.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// ── fixtures: real dealt forms across the whole deck ────────────────────
const deal = (decision, seed) => fieldFormForDeal(decision, mkRng(seed));
const fixtures = [];
for (const [poetId, deck] of Object.entries(POET_DECKS)) {
  for (const piece of deck) {
    const f = deal({ poetId, pieceId: piece.id }, 1234);
    if (f) fixtures.push({ label: `${poetId}/${piece.id}`, form: f });
    if (poetId === 'teijo') {
      const nat = deal({ poetId, pieceId: piece.id, script: 'kana' }, 99);
      if (nat) fixtures.push({ label: `teijo/${piece.id} native`, form: nat });
    }
    if (poetId === 'greenleaf') {
      const serif = deal({ poetId, pieceId: piece.id, face: 'serif' }, 77);
      if (serif) fixtures.push({ label: `greenleaf/${piece.id} serif`, form: serif });
      const sent = deal({ poetId, pieceId: piece.id, case: true }, 66);
      if (sent) fixtures.push({ label: `greenleaf/${piece.id} sentence`, form: sent });
      const brk = deal({ poetId, pieceId: piece.id, plateBreak: 'typ_o_sect' }, 55);
      if (brk) fixtures.push({ label: `greenleaf/${piece.id} plate-break`, form: brk });
    }
  }
}
// A whispered form: the register is the performer's toggle, never dealt — add it the way the store does.
{
  const base = deal({ poetId: 'teijo', pieceId: 't3' }, 3);
  const whispered = sanitizeFieldForm({ ...base, register: 'whisper' });
  assert.ok(whispered, 'the whispered fixture passes its door');
  fixtures.push({ label: 'teijo/t3 whispered', form: whispered });
}

/** The piece's own lines as the deal placed them (deck truth), ornament line included for a break. */
function faceLines(form) {
  const piece = POET_DECKS[form.poetId].find((p) => p.id === form.pieceId);
  if (form.script === 'kana') {
    return (piece.nativeLines?.length ? piece.nativeLines : piece.kanaLines) ?? piece.lines;
  }
  let lines = piece.lines;
  // a sentence-case deal places caseLines; they differ from lines only in case/punctuation of the glyphs
  const seqOf = (ls) => ls.join('').replace(/ /g, '');
  if (piece.caseLines?.length && seqOf(piece.caseLines) === form.stamps.map((s) => s.ch).join('')) lines = piece.caseLines;
  if (form.break) {
    const glyph = form.stamps.find((s) => ORNAMENT_STAMP_IDS.has(s.assetId)).ch;
    lines = [lines[0], glyph, ...lines.slice(1)];
  }
  return lines;
}

/** Word map from deck truth: [{ line, start, end }] stamp-index ranges in reading order. */
function wordMap(form) {
  const lines = faceLines(form);
  assert.equal(
    form.stamps.map((s) => s.ch).join(''),
    lines.join('').replace(/ /g, ''),
    'deck truth: the form’s glyph sequence is the piece’s lines, spaces removed',
  );
  const words = [];
  let idx = 0;
  lines.forEach((line, li) => {
    for (const w of line.split(' ')) {
      if (!w) continue;
      words.push({ line: li, start: idx, end: idx + [...w].length - 1 });
      idx += [...w].length;
    }
  });
  assert.equal(idx, form.stamps.length, 'deck truth: the word map covers every stamp');
  return words;
}

const halfInk = (s) => (stampWidthEm(s.assetId, s.ch) * s.em) / 2;
/** A word's cell on its row axis, from the PLAIN geometry (midpoints to neighbours; dish edges at the ends). */
function cellOf(form, words, w) {
  const rowWords = words.filter((x) => x.line === w.line);
  const wi = rowWords.indexOf(w);
  const first = form.stamps[w.start];
  const last = form.stamps[w.end];
  let lo = 0;
  let hi = form.aspect;
  if (wi > 0) {
    const plast = form.stamps[rowWords[wi - 1].end];
    lo = (first.x - halfInk(first) + plast.x + halfInk(plast)) / 2;
  }
  if (wi < rowWords.length - 1) {
    const nfirst = form.stamps[rowWords[wi + 1].start];
    hi = (last.x + halfInk(last) + nfirst.x - halfInk(nfirst)) / 2;
  }
  return { lo, hi };
}

const SEEDS = [7, 123456789];
const treated = (form, mode, seed) => rayGunForm(form, { mode, seed });

ok(`fixtures: ${fixtures.length} real dealt forms — all four poets, every layout, native, serif, sentence, plate-break, whispered`, () => {
  const poets = new Set(fixtures.map((f) => f.form.poetId));
  assert.deepEqual([...poets].sort(), ['gibson', 'greenleaf', 'rosselli', 'teijo']);
  const layouts = new Set(fixtures.map((f) => f.form.layout));
  for (const l of ['bands', 'single', 'two', 'grid', 'square']) assert.ok(layouts.has(l), `layout ${l} is exercised`);
  assert.ok(fixtures.some((f) => f.form.script === 'kana'), 'a native form stands');
  assert.ok(fixtures.some((f) => f.form.face === 'serif'), 'a serif form stands');
  assert.ok(fixtures.some((f) => f.form.break), 'a plate-break form stands');
  assert.ok(fixtures.some((f) => f.form.register === 'whisper'), 'a whispered form stands');
  for (const { label, form } of fixtures) assert.deepStrictEqual(sanitizeFieldForm(form), form, `${label}: a dealt form passes its own door exactly`);
});

ok('determinism: same (form, mode, seed) → identical output, per mode; a different seed deals a different blast', () => {
  for (const { label, form } of fixtures) {
    for (const mode of RAYGUN_MODES) {
      assert.deepStrictEqual(treated(form, mode, 7), treated(form, mode, 7), `${label}/${mode}: replay is bit-identical`);
      assert.notDeepStrictEqual(treated(form, mode, 7).stamps, treated(form, mode, 8).stamps, `${label}/${mode}: the seed is live`);
    }
  }
});

ok('markers ride unchanged: every non-stamp field of the form — poet, piece, layout, aspect, script, face, break, register — survives every treatment', () => {
  for (const { label, form } of fixtures) {
    const { stamps: _plain, ...want } = form;
    for (const mode of RAYGUN_MODES) {
      for (const seed of SEEDS) {
        const { stamps: _treated, ...got } = treated(form, mode, seed);
        assert.deepStrictEqual(got, want, `${label}/${mode}/${seed}: the form’s identity and markers stand`);
      }
    }
  }
});

ok('glyph identity + count accounting: the treated list is the plain list transformed in place, ghosts are glyph-matched additions, count stays under the door cap', () => {
  for (const { label, form } of fixtures) {
    const pairs = new Set(form.stamps.map((s) => `${s.assetId}|${s.ch}`));
    for (const mode of RAYGUN_MODES) {
      for (const seed of SEEDS) {
        const t = treated(form, mode, seed);
        assert.ok(t.stamps.length >= form.stamps.length, `${label}/${mode}: no glyph is ever lost`);
        assert.ok(t.stamps.length <= 200, `${label}/${mode}: the door's count cap holds (${t.stamps.length})`);
        for (let i = 0; i < form.stamps.length; i++) {
          assert.equal(t.stamps[i].ch, form.stamps[i].ch, `${label}/${mode}: stamp ${i} keeps its glyph`);
          assert.equal(t.stamps[i].assetId, form.stamps[i].assetId, `${label}/${mode}: stamp ${i} keeps its stamp id`);
        }
        for (const s of t.stamps) {
          assert.ok(pairs.has(`${s.assetId}|${s.ch}`), `${label}/${mode}: every treated stamp (ghosts included) is glyph-matched to a plain stamp`);
        }
      }
    }
  }
  // ghosts actually occur in every mode across the sample (the mechanisms are live, not vestigial)
  for (const mode of RAYGUN_MODES) {
    const extra = fixtures.reduce((sum, { form }) => sum + (treated(form, mode, 7).stamps.length - form.stamps.length), 0);
    assert.ok(extra > 0, `${mode}: ghost/echo/duplicate additions occur (${extra} across the fixtures)`);
  }
});

ok('door bounds by construction: every treated stamp’s centre is on the dish and its em inside the door’s (0.01, 0.3]', () => {
  for (const { label, form } of fixtures) {
    for (const mode of RAYGUN_MODES) {
      for (const seed of SEEDS) {
        for (const s of treated(form, mode, seed).stamps) {
          assert.ok(s.x >= 0 && s.x <= form.aspect && s.y >= 0 && s.y <= 1, `${label}/${mode}: centre on dish (${s.x}, ${s.y})`);
          assert.ok(s.em > 0.01 - 1e-9 && s.em <= 0.3, `${label}/${mode}: em ${s.em} inside the door's bounds`);
          assert.ok(Number.isFinite(s.rotation), `${label}/${mode}: rotation finite`);
        }
      }
    }
  }
});

ok('the record through the door: a form carrying a raygun record sanitizes whole — plain stamps, gate and all — and the record is normalized; dishonest records refuse the form', () => {
  for (const { label, form } of fixtures.slice(0, 8)) {
    for (const mode of RAYGUN_MODES) {
      const recorded = { ...form, raygun: { mode, seed: 42 } };
      assert.deepStrictEqual(sanitizeFieldForm(recorded), recorded, `${label}/${mode}: what persists passes the door exactly`);
    }
  }
  const form = fixtures[0].form;
  // extra keys on the record are dropped by normalization, like every marker
  assert.deepStrictEqual(sanitizeFieldForm({ ...form, raygun: { mode: 'carson', seed: 5, extra: 1 } }).raygun, { mode: 'carson', seed: 5 });
  for (const bad of [
    { mode: 'bogus', seed: 1 },
    { mode: 'CARSON', seed: 1 },
    { mode: 'carson' },
    { mode: 'carson', seed: -1 },
    { mode: 'carson', seed: 0x100000000 },
    { mode: 'carson', seed: 1.5 },
    { mode: 'carson', seed: '7' },
    null,
    'carson',
    ['carson', 7],
  ]) {
    assert.equal(sanitizeFieldForm({ ...form, raygun: bad }), null, `dishonest record refused whole: ${JSON.stringify(bad)}`);
  }
  const plain = sanitizeFieldForm(form);
  assert.ok(!('raygun' in plain), 'no record in, no record out — pre-#2003 documents sanitize byte-identically');
});

ok('CARSON floor (measured): reading order never inverts, every treated centre stays inside its word’s cell, displacement caps hold — first line at half bound', () => {
  // the module's parameter ranges, restated: walk ±0.30 em, row-edge push +0.50 em, vertical step+jitter ±0.50 em
  for (const { label, form } of fixtures) {
    const words = wordMap(form);
    for (const seed of SEEDS) {
      const t = treated(form, 'carson', seed);
      for (const w of words) {
        const rowScale = w.line === 0 ? 0.5 : 1;
        const cell = cellOf(form, words, w);
        const rowWords = words.filter((x) => x.line === w.line);
        let prevX = -Infinity;
        for (let i = w.start; i <= w.end; i++) {
          const s = t.stamps[i];
          const p = form.stamps[i];
          assert.ok(s.x > prevX, `${label}: order holds within the word at stamp ${i}`);
          prevX = s.x;
          assert.ok(s.x >= cell.lo - 1e-9 && s.x <= cell.hi + 1e-9, `${label}: stamp ${i} centre ${s.x} inside its cell [${cell.lo}, ${cell.hi}]`);
          const isRowEdge = (w === rowWords[0] && i === w.start) || (w === rowWords[rowWords.length - 1] && i === w.end);
          const dxCap = (0.3 + (isRowEdge ? 0.5 : 0)) * p.em * rowScale + 1e-9;
          const dyCap = 0.5 * p.em * rowScale + 1e-9;
          assert.ok(Math.abs(s.x - p.x) <= dxCap, `${label}: |dx| ${Math.abs(s.x - p.x)} within ${dxCap} (line ${w.line})`);
          assert.ok(Math.abs(s.y - p.y) <= dyCap, `${label}: |dy| ${Math.abs(s.y - p.y)} within ${dyCap} (line ${w.line})`);
        }
      }
    }
  }
});

ok('CARSON is per-glyph, not a block move: some word’s internal geometry is no single similarity transform', () => {
  let witnesses = 0;
  for (const { form } of fixtures) {
    const words = wordMap(form);
    const t = treated(form, 'carson', 7);
    for (const w of words) {
      if (w.end - w.start < 2) continue;
      const ratios = [];
      for (let a = w.start; a <= w.end; a++) {
        for (let b = a + 1; b <= w.end; b++) {
          const d0 = Math.abs(form.stamps[a].x - form.stamps[b].x);
          if (d0 > 1e-9) ratios.push(Math.abs(t.stamps[a].x - t.stamps[b].x) / d0);
        }
      }
      if (ratios.length > 1 && Math.max(...ratios) - Math.min(...ratios) > 0.02) witnesses++;
    }
  }
  assert.ok(witnesses > 20, `the smash is genuinely per-glyph (${witnesses} non-rigid words across the fixtures)`);
});

ok('GREIMAN floor (measured): words move as rigid blocks — pairwise distances scale by exactly the block’s scale, rotation delta uniform — and every block’s treated span stays inside its cell', () => {
  for (const { label, form } of fixtures) {
    const words = wordMap(form);
    for (const seed of SEEDS) {
      const t = treated(form, 'greiman', seed);
      for (const w of words) {
        const cell = cellOf(form, words, w);
        const xs = [];
        for (let i = w.start; i <= w.end; i++) xs.push(t.stamps[i].x);
        assert.ok(Math.min(...xs) >= cell.lo - 1e-9 && Math.max(...xs) <= cell.hi + 1e-9, `${label}: block span inside its cell`);
        // first-line anchor: a first-line block's rotation is bound at half the general ±20°
        const rotCap = (w.line === 0 ? 10 : 20) + 1e-9;
        const rd0 = t.stamps[w.start].rotation - form.stamps[w.start].rotation;
        assert.ok(Math.abs(rd0) <= rotCap, `${label}: block rotation ${rd0} within ${rotCap} (line ${w.line})`);
        if (w.end > w.start) {
          const scale = t.stamps[w.start].em / form.stamps[w.start].em;
          for (let a = w.start; a <= w.end; a++) {
            assert.ok(Math.abs(t.stamps[a].rotation - form.stamps[a].rotation - rd0) <= 1e-9, `${label}: rotation uniform within the block`);
            for (let b = a + 1; b <= w.end; b++) {
              const d0 = Math.hypot(form.stamps[a].x - form.stamps[b].x, form.stamps[a].y - form.stamps[b].y);
              const d1 = Math.hypot(t.stamps[a].x - t.stamps[b].x, t.stamps[a].y - t.stamps[b].y);
              assert.ok(Math.abs(d1 - scale * d0) <= 1e-9 * Math.max(1, d0), `${label}: block is rigid (pair ${a},${b})`);
            }
          }
        }
      }
    }
  }
});

ok('SHOT exemption (Matt’s ruling, pinned): recoverability is OFF — order breaks and displacements dwarf the CARSON/GREIMAN caps — while glyph identity and the door bounds still hold', () => {
  let orderBreaks = 0;
  let maxDisp = 0;
  for (const { form } of fixtures) {
    const words = wordMap(form);
    for (const seed of SEEDS) {
      const t = treated(form, 'shot', seed);
      for (let i = 0; i < form.stamps.length; i++) {
        maxDisp = Math.max(maxDisp, Math.hypot(t.stamps[i].x - form.stamps[i].x, t.stamps[i].y - form.stamps[i].y));
      }
      for (const w of words) {
        let prevX = -Infinity;
        for (let i = w.start; i <= w.end; i++) {
          if (t.stamps[i].x <= prevX) orderBreaks++;
          prevX = t.stamps[i].x;
        }
      }
    }
  }
  assert.ok(orderBreaks >= 10, `SHOT breaks reading order freely (${orderBreaks} inversions across the sample) — the exemption is real`);
  assert.ok(maxDisp > 0.25, `SHOT displaces up to ${maxDisp.toFixed(3)} dish units (the CARSON vertical cap is ≈0.05 at poem sizes)`);
});

ok('recompute from plain: the module never mutates its input, and a dishonest or absent record returns the form untouched', () => {
  for (const { label, form } of fixtures) {
    const snapshot = JSON.parse(JSON.stringify(form));
    treated(form, 'carson', 7);
    treated(form, 'greiman', 8);
    treated(form, 'shot', 9);
    assert.deepStrictEqual(form, snapshot, `${label}: the plain form is never displaced by drawing a treatment`);
    assert.equal(rayGunForm(form, undefined), form);
    assert.equal(rayGunForm(form, { mode: 'bogus', seed: 1 }), form);
    assert.equal(rayGunForm(form, { mode: 'carson', seed: -1 }), form);
    assert.equal(rayGunForm(null, { mode: 'carson', seed: 1 }), null);
  }
});

// ── the gesture on the real store (the poemRow fixture pattern) ─────────
const S = () => useStore.getState();
const BASE = S();
const standing = deal({ poetId: 'teijo', pieceId: 't3' }, 3);
function reset(extra = {}) {
  resetDirector();
  useStore.setState({
    seed: 0x1918,
    // #1932: the room stands in a type-native look (swiss 'raster') so poems may stand at all.
    layoutParams: { ...BASE.layoutParams, composition: 'raster', fieldForm: standing },
    lockedParams: {},
    poemDeal: 0,
    raygunTap: 0,
    curatePress: 0,
    historyUndoStack: [],
    historyRedoStack: [],
    kineticChapterId: null,
    kineticLanding: null,
    kineticRound: null,
    kineticNotch: null,
    ...extra,
  });
}
const withoutPoem = (lp) => {
  const { fieldForm, ...rest } = lp;
  return rest;
};
const expectedSeed = (tap) => {
  const st = S();
  return Math.floor(rngForIndex(st.seed, CH.curate, POEM_RAYGUN_BASE + tap, st.seedOffsets)() * 0x100000000) >>> 0;
};

ok('the cycle: plain → carson → greiman → shot → plain, seeds from the dedicated ray-gun stream, the stamps never move, one undo step per tap', () => {
  reset();
  const modes = ['carson', 'greiman', 'shot'];
  for (let tap = 0; tap < 3; tap++) {
    const want = expectedSeed(tap);
    S().cyclePoemRaygun();
    const f = S().layoutParams.fieldForm;
    assert.deepStrictEqual(f.raygun, { mode: modes[tap], seed: want, wear: 1 }, `tap ${tap}: ${modes[tap]} armed with the stream's seed`);
    const { raygun: _r, ...rest } = f;
    assert.deepStrictEqual(rest, standing, 'the form under the record is the plain standing form, exactly');
    assert.equal(S().raygunTap, tap + 1);
    assert.equal(S().poemDeal, 0, 'a tap draws nothing from the poem-deal streams');
    assert.equal(S().historyUndoStack.length, tap + 1, 'one undo step per tap');
  }
  S().cyclePoemRaygun();
  assert.deepStrictEqual(S().layoutParams.fieldForm, standing, 'the full cycle returns the EXACT original form — record absent, not nulled');
  assert.equal(S().raygunTap, 3, 'clearing back to plain draws no seed');
  S().undo();
  assert.deepStrictEqual(S().layoutParams.fieldForm.raygun, { mode: 'shot', seed: expectedSeed(2), wear: 1 }, 'undo restores the record the tap replaced');
});

ok('the cycle: refused with no poem standing — nothing moves, no undo entry, no seed drawn', () => {
  reset({ layoutParams: withoutPoem(BASE.layoutParams) });
  const lp = S().layoutParams;
  S().cyclePoemRaygun();
  assert.equal(S().layoutParams, lp);
  assert.equal(S().historyUndoStack.length, 0);
  assert.equal(S().raygunTap, 0);
});

ok('seed-stream isolation: cycling the gun never perturbs the poem deals — a cycled session re-deals the identical next poem', () => {
  reset();
  S().cyclePoemRaygun();
  S().cyclePoemRaygun();
  S().cyclePoemRaygun();
  S().cyclePoemRaygun(); // full circle, back to plain
  S().redealPoem();
  const cycled = S().layoutParams.fieldForm;
  reset();
  S().redealPoem();
  assert.deepStrictEqual(S().layoutParams.fieldForm, cycled, 'the deal stream is bit-identical whether or not the gun was fired');
});

ok('persistence: a re-deal deals a PLAIN form — the treatment resets with the poem', () => {
  reset();
  S().cyclePoemRaygun();
  assert.ok(S().layoutParams.fieldForm.raygun, 'armed before the re-deal');
  S().redealPoem();
  const f = S().layoutParams.fieldForm;
  assert.ok(!f || !('raygun' in f), 'the re-dealt form (or silence) carries no record');
});

ok('persistence: HOLD preserves a treated form — the record rides the held value through the passes, and the gesture works on a held form', () => {
  reset();
  S().cyclePoemRaygun();
  const treatedStanding = S().layoutParams.fieldForm;
  S().togglePoemHold();
  for (let i = 0; i < 3; i++) S().kineticVoicePass();
  assert.deepStrictEqual(S().layoutParams.fieldForm, treatedStanding, 'HOLD carries the form — record and all — past every pass');
  S().cyclePoemRaygun();
  assert.equal(S().layoutParams.fieldForm.raygun.mode, 'greiman', 'the gun cycles on a held form (the whisper precedent)');
});

ok('persistence: KEEP banks the form with its record — the keeper re-renders treated, and the keep key stays marker-blind like the register’s', () => {
  reset();
  S().cyclePoemRaygun();
  const rec = S().layoutParams.fieldForm.raygun;
  S().keepPoem();
  const keeps = S().layoutParams.poemKeeps;
  assert.equal(keeps.length, 1);
  assert.deepStrictEqual(keeps[0].raygun, rec, 'the banked keeper carries the treatment record');
  assert.deepStrictEqual(
    rayGunForm(keeps[0], keeps[0].raygun).stamps,
    rayGunForm(S().layoutParams.fieldForm, rec).stamps,
    'the keeper re-renders the identical treated materialisation',
  );
  const { raygun: _r, ...plainStanding } = S().layoutParams.fieldForm;
  assert.deepStrictEqual(plainStanding, standing);
});

ok('persistence: a recorded take replays treated — the record rides the project document and returns through the door', () => {
  reset();
  S().cyclePoemRaygun();
  S().cyclePoemRaygun();
  const armed = S().layoutParams.fieldForm;
  const doc = JSON.parse(JSON.stringify(serializeProject(S())));
  const back = parseProject(doc);
  assert.ok(back.ok, back.error);
  assert.deepStrictEqual(back.doc.layoutParams.fieldForm, armed, 'the record survives save/load exactly');
  const clean = sanitizeFieldForm(back.doc.layoutParams.fieldForm);
  assert.deepStrictEqual(clean.raygun, armed.raygun, 'and the door hands it back — a loaded form re-renders treated');
  assert.deepStrictEqual(rayGunForm(clean, clean.raygun), rayGunForm(armed, armed.raygun));
});

// ── the draw: buildPlacements applies the record ────────────────────────
ok('the draw: buildPlacements renders the treated list for a recorded form, the plain list for a plain one, and WHISPER still quiets a treated form', () => {
  const assets = [
    { id: 'a', weight: 'heavy' },
    { id: 'b', weight: 'medium' },
    { id: 'c', weight: 'light' },
  ];
  const palette = { swatches: ['#111', '#222', '#333', '#444'] };
  const caps = { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true };
  const lpBase = {
    mode: 'grid',
    composition: 'raster',
    count: 40,
    scale: [0.4, 0.8],
    rotate: [0, 45],
    alpha: [60, 100],
    jitter: 10,
    density: 100,
    zTiers: 1,
    bleed: false,
    mirror: false,
    overlap: true,
    displacement: 0,
    noiseFreq: 0.005,
    noiseSpeed: 0.5,
  };
  const fieldItemsOf = (layoutParams) =>
    buildPlacements({ layoutParams, seed: 0x1a4f, activeAssets: assets, palette, caps, canvasW: 1000, canvasH: 700 }).items.filter(
      (it) => typeof it.key === 'string' && it.key.startsWith('field-'),
    );
  const geom = (items) => items.map((it) => [it.x, it.y, it.scale, it.rotation]);
  const wantGeom = (form) =>
    form.stamps.map((s) => [(s.x / form.aspect) * 1000, s.y * 700, s.em * FIELD_EM_SCALE, s.rotation]);

  const plainItems = fieldItemsOf({ ...lpBase, fieldForm: standing });
  assert.deepStrictEqual(geom(plainItems), wantGeom(standing), 'plain: the drawn list is the dealt list');

  const rec = { mode: 'carson', seed: 4242 };
  const recorded = { ...standing, raygun: rec };
  const treatedItems = fieldItemsOf({ ...lpBase, fieldForm: recorded });
  const treatedForm = rayGunForm(sanitizeFieldForm(recorded), rec);
  assert.equal(treatedItems.length, treatedForm.stamps.length, 'treated: ghosts join the item list');
  assert.ok(treatedItems.length > plainItems.length, 'treated: the blast adds its duplicates');
  assert.deepStrictEqual(geom(treatedItems), wantGeom(treatedForm), 'treated: every item sits at the blast’s geometry');

  const whispered = fieldItemsOf({ ...lpBase, fieldForm: { ...recorded, register: 'whisper' } });
  assert.equal(whispered[0].alpha, plainItems[0].alpha * WHISPER_ALPHA, 'whisper + ray gun compose: the register still sets the alpha');
  assert.deepStrictEqual(geom(whispered), wantGeom(treatedForm), 'and the blast still sets the geometry');
});

console.log(`rayGun.selfcheck: ${n} checks passed`);
