// node src/poets/poemRegister.selfcheck.mjs
// #2151 — the register-spanning poem cache (Matt, 2026-11-12/17): each poet's *_REGISTER pieces span the cover pole (one
// word, or a short masthead) through the middle to the interior pole (dense paragraphs). Data only until the #2151 build
// deals it. Pinned: every piece is well formed and names its register; ids never collide with the dealt deck; every
// glyph in every face exists as a stamp (a placement drops nothing); every piece passes the readability gate on a range
// of seeds; every Latin face that is not one word reaches the poem minimum, and the interior pole never passes the
// stamp ceiling; the cache really spans the line; today's dealt decks are untouched by it.
import assert from 'node:assert/strict';
import { placePiece } from './placement.js';
import { gateFieldForm, FIELD_POEM_MIN_STAMPS, MAX_FIELD_STAMPS, POET_DECKS } from './fieldForm.js';
import { GIBSON, GIBSON_REGISTER } from './gibson.js';
import { GREENLEAF, GREENLEAF_REGISTER } from './greenleaf.js';
import { ROSSELLI, ROSSELLI_REGISTER } from './rosselli.js';
import { TEIJO, TEIJO_REGISTER } from './teijo.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const lcg = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const REGISTERS = { gibson: [GIBSON, GIBSON_REGISTER], greenleaf: [GREENLEAF, GREENLEAF_REGISTER], rosselli: [ROSSELLI, ROSSELLI_REGISTER], teijo: [TEIJO, TEIJO_REGISTER] };
const KINDS = new Set(['cover', 'between', 'interior']);
const glyphs = (lines) => lines.join('').replace(/\s/g, '').length;
const oneWord = (lines) => lines.length === 1 && !/\s/.test(lines[0].trim());
const facesOf = (p) => [
  ['latin', p.lines, {}],
  ...(p.caseLines ? [['case', p.caseLines, {}], ['serif', p.caseLines, { face: 'serif' }]] : []),
  ...(p.nativeLines ? [['native', p.nativeLines, { kana: true }]] : []),
  ...(p.kanaLines ? [['kana', p.kanaLines, { kana: true }]] : []),
];

ok('every piece is well formed, names its register, and never collides with the dealt deck', () => {
  for (const [poet, [deck, reg]] of Object.entries(REGISTERS)) {
    assert.ok(Array.isArray(reg) && Object.isFrozen(reg) && reg.length >= 6, poet);
    const ids = new Set(deck.map((p) => p.id));
    for (const p of reg) {
      assert.ok(!ids.has(p.id), `${poet}/${p.id}: unique id`);
      ids.add(p.id);
      assert.ok(KINDS.has(p.register), `${poet}/${p.id}: register`);
      assert.ok(Array.isArray(p.lines) && p.lines.length > 0 && p.lines.every((l) => l === l.toUpperCase()));
      assert.ok(p.density > 0 && p.density <= 1);
      for (const k of ['caseLines', 'kanaLines', 'nativeLines'])
        if (p[k]) assert.equal(p[k].length, p.lines.length, `${poet}/${p.id}: ${k} line for line`);
    }
  }
});

ok('every glyph in every face is a stamp, and every placement passes the gate', () => {
  for (const [poet, [, reg]] of Object.entries(REGISTERS))
    for (const p of reg)
      for (const [face, lines, o] of facesOf(p))
        for (let seed = 1; seed <= 6; seed++) {
          const { stamps } = placePiece({ ...p, lines }, lcg(seed), { face: o.face });
          assert.equal(stamps.length, glyphs(lines), `${poet}/${p.id} ${face}: no glyph dropped`);
          const g = gateFieldForm(stamps, { allowKana: !!o.kana, face: o.face });
          assert.ok(g.ok, `${poet}/${p.id} ${face} seed ${seed}: the gate (${JSON.stringify(g)})`);
        }
});

ok('a Latin face that is not one word reaches the poem minimum; nothing passes the ceiling', () => {
  for (const [poet, [, reg]] of Object.entries(REGISTERS))
    for (const p of reg) {
      for (const [face, lines] of facesOf(p)) assert.ok(glyphs(lines) <= MAX_FIELD_STAMPS, `${poet}/${p.id} ${face}`);
      if (!oneWord(p.lines)) assert.ok(glyphs(p.lines) >= FIELD_POEM_MIN_STAMPS, `${poet}/${p.id}: over the minimum`);
    }
});

ok('each cache spans the line: one-word covers, a middle, and dense interiors', () => {
  for (const [poet, [, reg]] of Object.entries(REGISTERS)) {
    const covers = reg.filter((p) => p.register === 'cover');
    const inside = reg.filter((p) => p.register === 'interior');
    assert.ok(covers.some((p) => oneWord(p.lines)), `${poet}: a one-word cover`);
    assert.ok(reg.some((p) => p.register === 'between'), `${poet}: a middle`);
    assert.ok(inside.length >= 2 && inside.every((p) => p.lines.length >= 9), `${poet}: dense interiors`);
    assert.ok(Math.max(...inside.map((p) => p.density)) > Math.max(...covers.map((p) => p.density)));
  }
});

ok('today\'s dealt decks are untouched by the cache', () => {
  assert.equal(POET_DECKS.gibson, GIBSON);
  assert.equal(POET_DECKS.greenleaf, GREENLEAF);
  assert.equal(POET_DECKS.rosselli, ROSSELLI);
  assert.equal(POET_DECKS.teijo, TEIJO);
  for (const deck of [GIBSON, GREENLEAF, ROSSELLI, TEIJO]) assert.equal(deck.length, 4);
});

console.log(`[selfcheck] poemRegister (#2151 cache): ${n} cases passed`);
