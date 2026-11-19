// hornLines.selfcheck.mjs — #2388 (P8): the horns' chat lines are UNSIGNED drafts; none renders until Matt signs; callsigns only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HORN_LINES, linesForTurn, lineFor, callsignOf } from './hornLines.mjs';
import { bandLinesFrom, startRoomFeed, getRoomFeed, resetRoomFeed } from './roomFeed.js';
import { Events, emit } from '../composition/eventBus.js';
import { HORN_WORDS, resolveHorns, HORN_IDS } from './hornFaces.js';
import { BAND_ANSWERERS } from '../personas/band.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const rd = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const noComments = (t) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/ .*$/gm, '');

const doc = rd('../../../docs/research/directors-copy-matrix-horns-2026-11-19.md');
const parsed = [
  ...doc.matchAll(/## (H\d+) · (BLAST|HYBRID|SWISS GRIT) · ([^\n]+)\n\nStatus: (UNSIGNED|SIGNED)\n\n> ([^\n]+)/g),
];

// ── the sign mechanism ───────────────────────────────────────────────────────
ok('the page and the data are the same lines, character for character, in the same order', () => {
  assert.equal(parsed.length, HORN_LINES.length);
  parsed.forEach(([, id, callsign, , , text], i) => {
    const l = HORN_LINES[i];
    assert.equal(l.id, id);
    assert.equal(l.text, text, `${id}: the data's words are the page's`);
    assert.equal(callsignOf(l.horn), callsign, `${id}: spoken by the horn the heading names`);
  });
  assert.equal(new Set(HORN_LINES.map((l) => l.id)).size, HORN_LINES.length, 'unique ids');
});

ok('every line is UNSIGNED on the page and in the data: Claude signs nothing', () => {
  for (const [, id, , , status] of parsed) assert.equal(status, 'UNSIGNED', `${id} is unsigned on the page`);
  for (const l of HORN_LINES) assert.equal(l.signed, false, `${l.id} is unsigned in the data`);
  assert.match(doc, /> \*\*Status: UNSIGNED\*\*/, 'the page carries the UNSIGNED banner');
});

ok('page status and data flag can never disagree (signing flips both)', () => {
  parsed.forEach(([, id, , , status], i) => assert.equal(HORN_LINES[i].signed, status === 'SIGNED', id));
});

const trade = (by, answers) => ({ kind: 'trade', phrase: 3, by, answers, owner: by, len: 3, cap: 0.1 });
const everyTurn = [];
for (const caller of ['davis', 'carson', 'greiman', 'ashworth'])
  for (const verdict of ['agree', 'disagree', 'layOut'])
    everyTurn.push(
      trade(caller, [
        { by: 'carson', verdict, move: verdict === 'agree' ? 'build' : verdict === 'disagree' ? 'counter' : 'rest' },
        { by: 'greiman', verdict, move: 'rest' },
        { by: 'ashworth', verdict, move: 'rest' },
        { by: 'lois', verdict: 'disagree', move: 'cut' },
      ]),
    );

ok('UNSIGNED NEVER RENDERS: every possible turn earns no line from the shipped drafts', () => {
  for (const t of everyTurn) {
    assert.deepEqual(linesForTurn(t), []);
    assert.deepEqual(bandLinesFrom(t), []);
  }
  for (const h of ['carson', 'greiman', 'ashworth'])
    for (const c of ['agree', 'disagree', 'layOut', 'cut']) assert.equal(lineFor(h, c, 'lois'), null);
});

ok('the transcript stays empty end to end: band:turn on the bus, nothing lands in the retained window', () => {
  resetRoomFeed();
  const stop = startRoomFeed();
  for (const t of everyTurn) emit(Events.BAND_TURN, t, { cause: 'band' });
  assert.equal(getRoomFeed().length, 0);
  stop();
  resetRoomFeed();
});

ok('a SIGNED line renders (test fixture, not a real signing); the unsigned one beside it still does not', () => {
  const fixture = HORN_LINES.map((l) => ({ ...l, signed: l.id === 'H02' || l.id === 'H04' || l.id === 'H08' }));
  const t = trade('davis', [
    { by: 'carson', verdict: 'disagree', move: 'counter' },
    { by: 'greiman', verdict: 'disagree', move: 'counter' },
    { by: 'ashworth', verdict: 'disagree', move: 'counter' },
  ]);
  assert.deepEqual(linesForTurn(t, fixture), [{ persona: 'carson', id: 'H02', text: 'answers OVERLAP — no.' }]);
  // the addressee-specific line wins over the generic one
  const t2 = trade('carson', [{ by: 'greiman', verdict: 'disagree', move: 'counter' }]);
  assert.deepEqual(linesForTurn(t2, fixture), [
    { persona: 'greiman', id: 'H08', text: 'answers BLAST — no. Too raw.' },
  ]);
  // BLAST cut by COVER answers COVER
  const t3 = trade('carson', [{ by: 'lois', verdict: 'disagree', move: 'cut' }]);
  assert.deepEqual(linesForTurn(t3, fixture), [{ persona: 'carson', id: 'H04', text: 'answers COVER — no.' }]);
  // all signed: every horn answer and every cut speaks, in answer order
  const all = HORN_LINES.map((l) => ({ ...l, signed: true }));
  assert.equal(
    linesForTurn(everyTurn[0], all).length,
    3,
    'caller OVERLAP: the three horns answer; a cut would only add a line if the caller were a horn',
  );
  const byBlast = trade('carson', [
    { by: 'greiman', verdict: 'agree', move: 'build' },
    { by: 'ashworth', verdict: 'layOut', move: 'rest' },
    { by: 'lois', verdict: 'disagree', move: 'cut' },
  ]);
  assert.deepEqual(
    linesForTurn(byBlast, all).map((l) => l.id),
    ['H05', 'H13', 'H04'],
    "caller BLAST: two horn answers, then BLAST answering COVER's cut",
  );
});

ok('QUEEN and GOVERNOR never speak and are never named; only the three horns have lines', () => {
  assert.deepEqual([...new Set(HORN_LINES.map((l) => l.horn))].sort(), ['ashworth', 'carson', 'greiman']);
  const all = HORN_LINES.map((l) => ({ ...l, signed: true }));
  const t = trade('davis', [
    { by: 'queen', verdict: 'agree', move: 'build' },
    { by: 'governor', verdict: 'agree', move: 'build' },
  ]);
  assert.deepEqual(linesForTurn(t, all), []);
  assert.equal(callsignOf('queen'), null);
  assert.equal(callsignOf('governor'), null);
  assert.ok(BAND_ANSWERERS.includes('lois'));
  for (const kind of ['solo', 'in', 'out', 'cut', 'yield'])
    assert.deepEqual(linesForTurn({ kind, by: 'carson', phrase: 1 }, all), []);
  assert.deepEqual(linesForTurn(null, all), []);
});

// ── callsign law (R6): no real names on anything this slice renders ─────────────
const NAMES = [
  'George Lois',
  'Joshua Davis',
  'Tina Turner',
  'David Bowie',
  'David Carson',
  'April Greiman',
  'Chris Ashworth',
];
const SURNAMES = [
  'Lois',
  'Davis',
  'Carson',
  'Greiman',
  'Ashworth',
  'Turner',
  'Bowie',
  'George',
  'Tina',
  'Queen',
  'Governor',
];
const bad = (text) => [
  ...NAMES.filter((x) => new RegExp(`\\b${x}\\b`, 'i').test(text)),
  ...SURNAMES.filter((x) => new RegExp(`\\b${x}\\b`, 'i').test(text)),
];

ok('real names, likenesses and the unnamed seats appear in none of the rendered words', () => {
  for (const l of HORN_LINES) assert.deepEqual(bad(l.text), [], `${l.id}: ${l.text}`);
  const words = [
    HORN_WORDS.REST,
    HORN_WORDS.ARMED,
    HORN_WORDS.SPECTRUM,
    HORN_WORDS.BUILD,
    HORN_WORDS.GRIT,
    ...HORN_WORDS.TEAR.filter(Boolean),
  ];
  for (const w of words) assert.deepEqual(bad(w), [], w);
  // every label/callsign/aria string the strip can produce, in every state
  const states = [
    {},
    { stageMode: 'carson', heat: 3 },
    { stageMode: 'greiman' },
    { stageMode: 'grit' },
    { standing: 'carson' },
    { standing: 'ashworth' },
  ];
  for (const m of states)
    for (const h of resolveHorns(m))
      for (const s of [h.label, h.callsign, h.word, `${h.callsign}, ${h.word}`]) assert.deepEqual(bad(s), [], s);
  assert.deepEqual(
    resolveHorns({}).map((h) => h.callsign),
    ['BLAST', 'HYBRID', 'SWISS GRIT'],
  );
  // the callsigns the lines may address: only the five surface ones
  for (const id of ['lois', 'davis', ...HORN_IDS])
    assert.ok(['COVER', 'OVERLAP', 'BLAST', 'HYBRID', 'SWISS GRIT'].includes(callsignOf(id)));
  // a template never leaves a hole or a stray brace
  for (const l of HORN_LINES) assert.ok(!/[{}]/.test(l.text.replace('{to}', '')), l.id);
});

ok('the source of everything rendered here is free of display-form real names (comments are lineage)', () => {
  for (const f of ['./hornLines.mjs', './hornFaces.js', './hornFaceGeometry.js', '../panels/directors/HornStrip.jsx']) {
    const stripped = noComments(rd(f));
    const display = [...stripped.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);
    for (const s of display)
      assert.deepEqual(bad(s.replace(/^(carson|greiman|ashworth|lois|davis|queen|governor)$/, '')), [], `${f}: ${s}`);
  }
  const pageLines = parsed.map((m) => m[5]).join('\n');
  assert.deepEqual(bad(pageLines), [], 'the lines on the page');
});

console.log(`hornLines.selfcheck: ${n} checks passed`);
