// labelExtractor.selfcheck.mjs — A0 (#2393): fixture takes → expected labels, one block per ruling.
// Run: node studio/labelExtractor.selfcheck.mjs (also in app/selfcheck.manifest as ../studio/…)
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LABEL_LADDER,
  LABELED_TURNS_FORMAT,
  LABELED_TURNS_VERSION,
  extractLabels,
  labelTake,
  verdictsFromLedgers,
  verdictsFromRows,
  weakGoodWeight,
} from './labelExtractor.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────
// Rows are [frame, phrase, kind, by, extra] in the band record's own shape (bandRecord.mjs); every fixture
// conversation passes the app's checkBandRecord, or the block says why not.
const take = (seed, turns) => ({ format: 'kc-performance', version: 3, frames: 400, band: { version: 1, seed, turns } });

// A: davis solos; the room answers (lois builds, carson rests — the solo stands); the artist KEEPS, ending davis.
const TURNS_A = [
  [0, 0, 'in', 'governor', null],
  [0, 0, 'solo', 'davis', { len: 4, cap: 0.5 }],
  [100, 1, 'trade', 'davis', { answers: [['lois', 'agree', 'build'], ['carson', 'layOut', 'rest']], owner: 'davis' }],
  [200, 2, 'yield', 'artist', { why: 'keep', ended: 'davis' }],
  [300, 3, 'out', 'governor', null],
];
// B: carson solos; davis COUNTERS and takes the solo over; the artist LOCKS, ending davis.
const TURNS_B = [
  [0, 0, 'in', 'governor', null],
  [0, 0, 'solo', 'carson', { len: 6, cap: 0.4 }],
  [
    100,
    1,
    'trade',
    'carson',
    { answers: [['davis', 'disagree', 'counter'], ['lois', 'agree', 'build']], owner: 'davis', len: 3, cap: 0.6 },
  ],
  [200, 2, 'yield', 'artist', { why: 'lock', ended: 'davis' }],
];
// B without the yield: the same conversation, no artist act — persona verdicts alone must label nothing.
const TURNS_B2 = TURNS_B.slice(0, 3);
// C: greiman solos; the GOVERNOR cuts; ashworth solos. No artist act — ledger tests ride on this one.
const TURNS_C = [
  [0, 0, 'in', 'governor', null],
  [0, 0, 'solo', 'greiman', { len: 5, cap: 0.3 }],
  [100, 1, 'cut', 'governor', { target: 'greiman' }],
  [200, 2, 'solo', 'ashworth', { len: 2, cap: 0.2 }],
  [300, 3, 'out', 'governor', null],
];

const T1 = '2026-11-01T10:00:00.000Z';
const T2 = '2026-11-02T10:00:00.000Z';
const row = (seed, timestamp) => ({ seed, timestamp });
const keeps = (...rows) => verdictsFromRows(rows, []);
const passes = (...rows) => verdictsFromRows([], rows);
const both = (k, p) => verdictsFromRows(k, p);
const unit = (labeled, pred) => labeled.units.find(pred);
const byKind = (labeled, kind, by) => unit(labeled, (u) => u.kind === kind && u.by === by);

// ── the ladder (ruling 6): pinned values, A3's ordering, weak-good stacking with its cap ──
{
  assert.deepEqual(
    { ...LABEL_LADDER },
    { good: 1, weakGoodPerKeep: 0.25, weakGoodCap: 0.75, bad: -1, strongBad: -2, unlabeled: 0 },
  );
  assert.ok(LABEL_LADDER.strongBad < LABEL_LADDER.bad, 'strong-bad outweighs bad');
  assert.ok(LABEL_LADDER.bad < LABEL_LADDER.unlabeled, 'bad is below silence');
  assert.ok(weakGoodWeight(1) > LABEL_LADDER.unlabeled, 'a kept take is above silence');
  assert.ok(weakGoodWeight(1) < LABEL_LADDER.good, 'weak-good stays below a deliberate keep');
  assert.equal(weakGoodWeight(0), 0);
  assert.equal(weakGoodWeight(1), 0.25);
  assert.equal(weakGoodWeight(2), 0.5, 'repeated keeps stack');
  assert.equal(weakGoodWeight(3), 0.75);
  assert.equal(weakGoodWeight(9), 0.75, 'stacking is capped — the blanket never reaches good');
}

// ── ruling 1: an in-take keep labels the solo it ended GOOD, at its origin ──
{
  const l = labelTake(take(101, TURNS_A), undefined);
  assert.equal(l.verdict, 'none');
  assert.equal(l.units.length, 3, 'solo + two trade answers; in/yield/out carry no decision');
  const solo = byKind(l, 'solo', 'davis');
  assert.equal(solo.label, 'good');
  assert.equal(solo.weight, 1);
  assert.equal(solo.source, 'intake-keep');
  for (const a of l.units.filter((u) => u.kind === 'trade')) {
    assert.equal(a.label, 'unlabeled', 'the keep aims at the solo, not at the room');
    assert.equal(a.weight, 0);
    assert.equal(a.source, 'none');
  }
}

// ── rulings 4 + 5: a lock labels the overridden move STRONG-BAD, per answer at the handover ──
{
  const l = labelTake(take(102, TURNS_B), undefined);
  const counter = unit(l, (u) => u.kind === 'trade' && u.by === 'davis');
  assert.equal(counter.label, 'strong-bad', 'the lock lands on the counter answer that took the solo');
  assert.equal(counter.weight, -2);
  assert.equal(counter.source, 'intake-lock');
  assert.equal(counter.verdict, 'disagree');
  assert.equal(counter.move, 'counter');
  assert.equal(byKind(l, 'solo', 'carson').label, 'unlabeled', "carson's solo was not the overridden move");
  assert.equal(unit(l, (u) => u.kind === 'trade' && u.by === 'lois').label, 'unlabeled');
}

// ── persona opinions are never labels: verdicts without an artist act label nothing ──
{
  const l = labelTake(take(102, TURNS_B2), undefined);
  assert.ok(l.units.every((u) => u.label === 'unlabeled' && u.weight === 0), 'a disagree/counter is a decision, not a label');
}

// ── ruling 2: a passed seed makes every decision BAD (take-level, per answer) ──
{
  const l = labelTake(take(103, TURNS_C), passes(row(103, T1)).get(103));
  assert.equal(l.verdict, 'pass');
  assert.equal(l.units.length, 3, 'greiman solo, governor cut, ashworth solo');
  for (const u of l.units) {
    assert.equal(u.label, 'bad');
    assert.equal(u.weight, -1);
    assert.equal(u.source, 'ledger-pass');
  }
  const cut = byKind(l, 'cut', 'governor');
  assert.equal(cut.move, 'cut');
  assert.equal(cut.target, 'greiman');
}

// ── ruling 3: a kept seed is WEAK-GOOD on every decision, stacking per keep row up to the cap ──
{
  for (const [n, w] of [[1, 0.25], [2, 0.5], [3, 0.75], [5, 0.75]]) {
    const rows = Array.from({ length: n }, (_, i) => row(103, `2026-11-0${i + 1}T10:00:00.000Z`));
    const l = labelTake(take(103, TURNS_C), keeps(...rows).get(103));
    assert.equal(l.verdict, 'keep');
    assert.equal(l.keepCount, n);
    for (const u of l.units) {
      assert.equal(u.label, 'weak-good');
      assert.equal(u.weight, w, `${n} keeps → ${w}`);
      assert.equal(u.source, 'ledger-keep');
    }
  }
}

// ── ruling 2, tie-breaks: latest verdict wins; a keep rescues only when strictly later ──
{
  const rescued = labelTake(take(103, TURNS_C), both([row(103, T2)], [row(103, T1)]).get(103));
  assert.equal(rescued.verdict, 'keep');
  assert.ok(rescued.units.every((u) => u.label === 'weak-good'), 'a later keep wins over an earlier pass');
  const sunk = labelTake(take(103, TURNS_C), both([row(103, T1)], [row(103, T2)]).get(103));
  assert.equal(sunk.verdict, 'pass');
  assert.ok(sunk.units.every((u) => u.label === 'bad'), 'a later pass sinks an earlier keep');
  const tied = labelTake(take(103, TURNS_C), both([row(103, T1)], [row(103, T1)]).get(103));
  assert.equal(tied.verdict, 'pass', 'same-stamp keep is not LATER — the pass stands');
}

// ── precedence: a targeted in-take label beats the ledger blanket on its one decision ──
{
  const locked = labelTake(take(102, TURNS_B), keeps(row(102, T1)).get(102));
  assert.equal(unit(locked, (u) => u.by === 'davis' && u.kind === 'trade').label, 'strong-bad', 'a kept take does not wash out its lock');
  assert.equal(byKind(locked, 'solo', 'carson').label, 'weak-good');
  assert.equal(unit(locked, (u) => u.by === 'lois').label, 'weak-good');
  const kept = labelTake(take(101, TURNS_A), passes(row(101, T1)).get(101));
  assert.equal(byKind(kept, 'solo', 'davis').label, 'good', 'a passed take does not sink its kept solo');
  assert.ok(
    kept.units.filter((u) => u.kind === 'trade').every((u) => u.label === 'bad'),
    'the rest of the passed take is bad',
  );
}

// ── fail closed: no band section, or a section the app's own check refuses, labels nothing ──
{
  assert.equal(labelTake({ format: 'kc-performance', version: 3 }, undefined), null, 'no band section');
  assert.equal(labelTake({ band: { version: 99, seed: 7, turns: TURNS_A } }, undefined), null, 'bad version');
  assert.equal(labelTake(null, undefined), null);
  const art = extractLabels(
    [
      { name: 'a', perf: take(101, TURNS_A) },
      { name: 'bare', perf: { format: 'kc-performance', version: 3 } },
      { name: 'broken', perf: null },
    ],
    new Map(),
  );
  assert.equal(art.format, LABELED_TURNS_FORMAT);
  assert.equal(art.version, LABELED_TURNS_VERSION);
  assert.equal(art.summary.takes, 1);
  assert.equal(art.summary.skipped, 2);
  assert.equal(art.summary.units, 3);
  assert.deepEqual(art.summary.byLabel, { good: 1, 'weak-good': 0, bad: 0, 'strong-bad': 0, unlabeled: 2 });
}

// ── the ledger reader: corrupt and off-schema lines are skipped WITH a count, never silently ──
{
  const line = (seed, ts) =>
    JSON.stringify({ seed, recipe: { layoutParams: null, paletteId: null }, timestamp: ts, keepContext: null, projectRef: null });
  const text = [line(103, T1), '{not json', JSON.stringify({ seed: 'x' }), '', line(103, T2)].join('\n');
  const { verdicts, skipped } = verdictsFromLedgers(text, '', () => {});
  assert.equal(skipped, 2, 'one unparseable + one off-schema line');
  assert.equal(verdicts.get(103).keepCount, 2);
  assert.equal(verdicts.get(103).verdict, 'keep');
}

// ── determinism: the artifact is a pure function of its inputs ──
{
  const input = [
    { name: 'a', perf: take(101, TURNS_A) },
    { name: 'b', perf: take(102, TURNS_B) },
    { name: 'c', perf: take(103, TURNS_C) },
  ];
  const v = both([row(102, T1), row(103, T1), row(103, T2)], [row(101, T1)]);
  const one = extractLabels(input, v);
  const two = extractLabels(input, v);
  assert.deepEqual(one, two);
  assert.equal(JSON.stringify(one), JSON.stringify(two), 'byte-identical artifact for identical inputs');
}

// ── CLI smoke: plain .json takes, a gzipped .kcperf, and a ledgers dir, end to end ──
{
  const dir = mkdtempSync(join(tmpdir(), 'kc-labels-'));
  try {
    const takesDir = join(dir, 'takes');
    const ledgersDir = join(dir, 'ledgers');
    mkdirSync(takesDir);
    mkdirSync(ledgersDir);
    writeFileSync(join(takesDir, 'take-a.json'), JSON.stringify(take(101, TURNS_A)));
    writeFileSync(join(takesDir, 'take-b.kcperf'), gzipSync(JSON.stringify(take(102, TURNS_B))));
    const line = (seed, ts) =>
      JSON.stringify({ seed, recipe: { layoutParams: null, paletteId: null }, timestamp: ts, keepContext: null, projectRef: null });
    writeFileSync(join(ledgersDir, 'keeps.jsonl'), `${line(102, T1)}\n`);
    writeFileSync(join(ledgersDir, 'passes.jsonl'), '');
    const outFile = join(dir, 'labeled.json');
    execFileSync(process.execPath, [join(here, 'labelExtractor.mjs'), '--takes', takesDir, '--ledgers', ledgersDir, '--out', outFile], {
      stdio: 'pipe',
    });
    const art = JSON.parse(readFileSync(outFile, 'utf8'));
    assert.equal(art.format, 'kc-labeled-turns');
    assert.equal(art.version, 1);
    assert.equal(art.takes.length, 2);
    const b = art.takes.find((t) => t.seed === 102);
    assert.equal(unit(b, (u) => u.by === 'davis' && u.kind === 'trade').label, 'strong-bad');
    assert.equal(byKind(b, 'solo', 'carson').label, 'weak-good');
    const a = art.takes.find((t) => t.seed === 101);
    assert.equal(byKind(a, 'solo', 'davis').label, 'good');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('labelExtractor.selfcheck: OK');
