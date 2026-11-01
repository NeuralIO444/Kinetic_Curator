// directorsMatrix.selfcheck.mjs — the 20 rooms are the document, character for character (#1126).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { DIRECTORS_MATRIX, roomFor } from './directorsMatrix.js';
import { LOIS_FACES } from './loisFace.js';
import { DAVIS_STATES } from './davisState.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const doc = readFileSync(
  new URL('../../../docs/research/directors-copy-matrix-2026-10-07.md', import.meta.url),
  'utf8',
);
const parsed = [
  ...doc.matchAll(
    /## Room (\d+): LOIS (\S.*?) (NOD|VIBE|BURN|AWAY) × Davis (FLOW|SEEDLING|UGLY|STUCK|BLOOM)\n\nVerdict: (.+?) — (.+?)\n\n\*\*LOIS:\*\* (.+?)\n\n\*\*Davis:\*\* (.+?)(?:\n|$)/g,
  ),
];

ok('the document has 20 rooms and the data has exactly those 20, in the same words', () => {
  assert.equal(parsed.length, 20, 'the document parses to 20 rooms');
  const seen = new Set();
  for (const [, num, kao, lois, davis, verdict, verdictLine, loisLine, davisLine] of parsed) {
    const r = DIRECTORS_MATRIX[lois]?.[davis];
    assert.ok(r, `room ${num} (${lois} x ${davis}) exists`);
    assert.equal(r.n, Number(num));
    assert.equal(r.verdict, verdict);
    assert.equal(r.verdictLine, verdictLine);
    assert.equal(r.davis, davisLine, `room ${num}: Davis's line is the document's`);
    assert.equal(
      r.lois,
      loisLine.startsWith('*(silent') ? null : loisLine,
      `room ${num}: LOIS's line is the document's`,
    );
    assert.equal(kao, LOIS_FACES[lois].face, `room ${num}: the face in the document is the face on the pill`);
    seen.add(`${lois}/${davis}`);
  }
  assert.equal(seen.size, 20);
  let count = 0;
  for (const l of Object.keys(DIRECTORS_MATRIX)) count += Object.keys(DIRECTORS_MATRIX[l]).length;
  assert.equal(count, 20, 'and nothing else is in the data');
});

// Re-pin (#1856): LOIS_FACES gained CUT (BOOK S3 — the round's spent cut is a rendered face now).
// The matrix is not CUT's home: its rooms are Matt's signed copy, re-parsed verbatim from the
// document above, and CUT — an event at the table, not a state of the honest feed — has no room
// in that document. No line may be invented to give it one (this module's first law), so coverage
// is pinned over the four feed faces and CUT's absence is asserted as a fact, not an oversight.
ok('every pair of feed states has a room: 4 LOIS x 5 Davis; CUT has no room and none may be invented', () => {
  const feedFaces = Object.keys(LOIS_FACES).filter((k) => k !== 'CUT');
  assert.deepEqual(feedFaces.sort(), ['AWAY', 'BURN', 'NOD', 'VIBE']);
  assert.deepEqual(Object.keys(DIRECTORS_MATRIX).sort(), feedFaces);
  for (const l of feedFaces)
    assert.deepEqual(Object.keys(DIRECTORS_MATRIX[l]).sort(), Object.keys(DAVIS_STATES).sort(), l);
  assert.ok(!('CUT' in DIRECTORS_MATRIX), 'CUT has no room: its copy is not in the signed document');
});

ok("the five verdicts are the matrix's, and they sit on the rooms the issue names", () => {
  const v = (l, d) => roomFor(l, d).verdict;
  assert.deepEqual([...new Set(parsed.map((p) => p[5]))].sort(), [
    'AGREEMENT',
    'DAVIS ALONE',
    'FULL BURN',
    'THE CLASH',
    'THE ROOM',
  ]);
  for (const d of ['FLOW', 'SEEDLING', 'UGLY', 'STUCK']) assert.equal(v('NOD', d), 'THE CLASH');
  assert.equal(v('NOD', 'BLOOM'), 'AGREEMENT');
  assert.equal(v('BURN', 'FLOW'), 'FULL BURN');
  for (const d of Object.keys(DAVIS_STATES)) {
    assert.equal(v('AWAY', d), 'DAVIS ALONE');
    assert.equal(roomFor('AWAY', d).lois, null, 'LOIS is silent when away');
    assert.equal(v('VIBE', d), 'THE ROOM');
  }
});

ok('no state, no room: with either Director silent nobody speaks (rule 4); junk is not a room', () => {
  assert.equal(roomFor('NOD', null), null);
  assert.equal(roomFor(null, 'FLOW'), null);
  assert.equal(roomFor(), null);
  assert.equal(roomFor('NOD', undefined), null);
  assert.equal(roomFor('__proto__', 'FLOW'), null);
  assert.equal(roomFor('NOD', 'constructor'), null);
  assert.equal(roomFor('LEAN', 'FLOW'), null);
});

ok("wiring: the codec names the room with the matrix's words and the footer only reads", () => {
  const codec = readFileSync(new URL('../panels/directors/RoomCodec.jsx', import.meta.url), 'utf8');
  assert.match(codec, /roomFor\(lois\.code, davis \? davis\.code : null\)/);
  assert.match(codec, /'data-verdict': talk\.verdict/);
  assert.match(codec, /\{talk\.verdictLine\}/);
  assert.match(codec, /talk \? talk\.verdict : 'THE ROOM'/);
});

ok(
  '"ugly" is ultra rare (Matt, 2026-10-11): one spoken line in the whole matrix, never a label, never a verdict; the state reads SIFT',
  () => {
    const said = [];
    for (const l of Object.keys(DIRECTORS_MATRIX)) {
      for (const d of Object.keys(DIRECTORS_MATRIX[l])) {
        const r = DIRECTORS_MATRIX[l][d];
        for (const [who, line] of [
          ['lois', r.lois],
          ['davis', r.davis],
          ['verdict', r.verdictLine],
          ['verdictName', r.verdict],
        ]) {
          if (line && /ugly/i.test(line)) said.push(`${l}x${d}:${who}`);
        }
      }
    }
    assert.deepEqual(said, ['AWAYxUGLY:davis'], 'only room 18, a room that needs LOIS away AND a run of passes');
    for (const st of Object.values(DAVIS_STATES))
      assert.ok(!/ugly/i.test(st.label), `${st.code}: the label does not say it`);
    assert.equal(
      DAVIS_STATES.UGLY.code,
      'UGLY',
      'the internal code is unchanged (tables, tempo and wildness key on it)',
    );
    assert.equal(DAVIS_STATES.UGLY.name, 'SIFT', 'what the artist reads');
    const codec = readFileSync(new URL('../panels/directors/RoomCodec.jsx', import.meta.url), 'utf8');
    assert.match(codec, /davis \? \(davis\.name \?\? davis\.code\) : '—'/, 'the room shows the name, not the code');
  },
);

console.log(`directorsMatrix.selfcheck: ${n} checks passed`);
