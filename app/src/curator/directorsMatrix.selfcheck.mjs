// directorsMatrix.selfcheck.mjs — the 20 rooms are the document, character for character (#1126).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { DIRECTORS_MATRIX, roomFor } from './directorsMatrix.js';
import { LOIS_FACES } from './loisFace.js';
import { DAVIS_STATES } from './davisState.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const doc = readFileSync(new URL('../../../docs/research/directors-copy-matrix-2026-10-07.md', import.meta.url), 'utf8');
const parsed = [...doc.matchAll(/## Room (\d+): LOIS (\S.*?) (NOD|VIBE|BURN|AWAY) × Davis (FLOW|SEEDLING|UGLY|STUCK|BLOOM)\n\nVerdict: (.+?) — (.+?)\n\n\*\*LOIS:\*\* (.+?)\n\n\*\*Davis:\*\* (.+?)(?:\n|$)/g)];

ok('the document has 20 rooms and the data has exactly those 20, in the same words', () => {
  assert.equal(parsed.length, 20, 'the document parses to 20 rooms');
  const seen = new Set();
  for (const [, num, kao, lois, davis, verdict, verdictLine, loisLine, davisLine] of parsed) {
    const r = DIRECTORS_MATRIX[lois]?.[davis];
    assert.ok(r, `room ${num} (${lois} x ${davis}) exists`);
    assert.equal(r.n, Number(num)); assert.equal(r.verdict, verdict); assert.equal(r.verdictLine, verdictLine);
    assert.equal(r.davis, davisLine, `room ${num}: Davis's line is the document's`);
    assert.equal(r.lois, loisLine.startsWith('*(silent') ? null : loisLine, `room ${num}: LOIS's line is the document's`);
    assert.equal(kao, LOIS_FACES[lois].face, `room ${num}: the face in the document is the face on the pill`);
    seen.add(`${lois}/${davis}`);
  }
  assert.equal(seen.size, 20);
  let count = 0; for (const l of Object.keys(DIRECTORS_MATRIX)) count += Object.keys(DIRECTORS_MATRIX[l]).length;
  assert.equal(count, 20, 'and nothing else is in the data');
});

ok('every pair of real states has a room: 4 LOIS x 5 Davis', () => {
  assert.deepEqual(Object.keys(DIRECTORS_MATRIX).sort(), Object.keys(LOIS_FACES).sort());
  for (const l of Object.keys(LOIS_FACES)) assert.deepEqual(Object.keys(DIRECTORS_MATRIX[l]).sort(), Object.keys(DAVIS_STATES).sort(), l);
});

ok('the five verdicts are the matrix\'s, and they sit on the rooms the issue names', () => {
  const v = (l, d) => roomFor(l, d).verdict;
  assert.deepEqual([...new Set(parsed.map((p) => p[5]))].sort(), ['AGREEMENT', 'DAVIS ALONE', 'FULL BURN', 'THE CLASH', 'THE ROOM']);
  for (const d of ['FLOW', 'SEEDLING', 'UGLY', 'STUCK']) assert.equal(v('NOD', d), 'THE CLASH');
  assert.equal(v('NOD', 'BLOOM'), 'AGREEMENT'); assert.equal(v('BURN', 'FLOW'), 'FULL BURN');
  for (const d of Object.keys(DAVIS_STATES)) { assert.equal(v('AWAY', d), 'DAVIS ALONE'); assert.equal(roomFor('AWAY', d).lois, null, 'LOIS is silent when away'); assert.equal(v('VIBE', d), 'THE ROOM'); }
});

ok('no state, no room: with either Director silent nobody speaks (rule 4); junk is not a room', () => {
  assert.equal(roomFor('NOD', null), null); assert.equal(roomFor(null, 'FLOW'), null); assert.equal(roomFor(), null);
  assert.equal(roomFor('NOD', undefined), null); assert.equal(roomFor('__proto__', 'FLOW'), null); assert.equal(roomFor('NOD', 'constructor'), null); assert.equal(roomFor('LEAN', 'FLOW'), null);
});

ok('wiring: the duel says the matrix\'s words and the strip only reads', () => {
  const duel = readFileSync(new URL('../panels/directors/DirectorsDuel.jsx', import.meta.url), 'utf8');
  assert.match(duel, /roomFor\(lois\.code, davis \? davis\.code : null\)/);
  assert.match(duel, /talk \? \(talk\.lois \?\? ''\) : lois\.label/); assert.match(duel, /talk \? talk\.davis :/);
  assert.match(duel, /className="duel-verdict" data-verdict=\{talk\.verdict\}/);
  assert.match(duel, /\{talk\.verdictLine\}/);
});

console.log(`directorsMatrix.selfcheck: ${n} checks passed`);
