// node src/curator/readDuel.selfcheck.mjs
//
// #1627 S3 — the duel, gated by S2's proof (readMeter.selfcheck B:
// the corpus separates, so this judge is honest). Pinned:
//   A. THE ANCHOR — the Queen's balance point is the mean of the keeps'
//      measured reads; no keeps → no anchor → the duel declines.
//   B. THE GATE — LOIS judges a read against the anchor: distance,
//      verdict, and a demand/throttle naming the band at fault.
//   C. THE HEAT — #1483's temperature widens the tolerance (the ruled
//      boldness temperature, read through effectiveTemp — no second
//      thermostat in this module).
//   D. THE TILT, RIDDEN — through curate.js pickCurated itself: Davis's
//      pick inside tolerance stands; outside, the pick tilts to the
//      candidate nearest the anchor; without reads/anchor the return
//      is exactly yesterday's { index, curated } (shape-pinned).
//   E. THE HINT — a duel that ran is said out loud; no duel, no line.
import assert from 'node:assert/strict';
import { anchorFromReads, judgeRead, duelPick, duelTolerance, readDistance } from './readDuel.mjs';
import { pickCurated, curatorHint, getLastDuel, nullCurator } from './curate.js';
import { effectiveTemp, TEMP_FLOOR, TEMP_CAP } from './effectiveTemp.js';
import { readsMetric } from './censusReport.mjs';

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};

// The corpus's own reads (S2's measured scenes) as candidate reads,
// and an anchor from two "keeps": the balanced scene read twice over
// with small perturbations — a Queen whose taste sits at balance.
const corpus = new Map(readsMetric().map((r) => [r.scene, r.shares]));
const BAL = corpus.get('balanced');
const anchor = anchorFromReads([
  { shares: BAL },
  { shares: { big: BAL.big - 0.04, mid: BAL.mid + 0.02, fine: BAL.fine + 0.02 } },
]);

// ── A. the anchor ────────────────────────────────────────────────────
{
  ok(anchor && Math.abs(anchor.big - (BAL.big + BAL.big - 0.04) / 2) < 1e-9, 'the anchor is the keeps’ mean read');
  assert.strictEqual(anchorFromReads([]), null, 'no keeps → no anchor');
  assert.strictEqual(anchorFromReads([null, {}, { shares: null }]), null, 'unmeasured keeps → no anchor');
  checks += 2;
  // Bare share maps anchor too (the caller’s shape is its own).
  const bare = anchorFromReads([BAL]);
  ok(Math.abs(bare.fine - BAL.fine) < 1e-9, 'bare share maps anchor');
  console.log(
    `readDuel.selfcheck A anchor: queen sits at big ${anchor.big.toFixed(3)} · mid ${anchor.mid.toFixed(3)} · fine ${anchor.fine.toFixed(3)} (the keeps’ mean)`,
  );
}

// ── B. the gate ──────────────────────────────────────────────────────
{
  const bal = judgeRead(BAL, anchor);
  ok(bal.pass && bal.verdict === 'balanced', `the balanced read passes its own anchor (dist ${bal.dist})`);
  const bald = judgeRead(corpus.get('bald'), anchor);
  ok(!bald.pass && bald.verdict === 'bald', 'the bald read fails the gate');
  assert.strictEqual(bald.demand.band, 'fine', 'LOIS demands the missing band by name');
  ok(bald.line.includes('demand fine'), `the demand is the copy: "${bald.line}"`);
  checks += 2;
  const mud = judgeRead(corpus.get('mud'), anchor);
  ok(!mud.pass && mud.verdict === 'mud' && mud.demand.band === 'big', 'mud fails, demanding big');
  const top = judgeRead(corpus.get('top-heavy'), anchor);
  ok(top.verdict === 'top-heavy', 'top-heavy verdicts as the meter names it');
  assert.strictEqual(
    judgeRead(null, anchor).verdict,
    'unmeasured',
    'an unmeasured read is judged unmeasured, never passed',
  );
  checks++;
  ok(readDistance(BAL, BAL) === 0 && readDistance(BAL, corpus.get('mud')) > 0.5, 'distance is a distance');
  console.log('readDuel.selfcheck B gate: balance passes, bald demands fine, mud demands big — by name');
}

// ── C. the heat ──────────────────────────────────────────────────────
{
  ok(duelTolerance(TEMP_FLOOR) < duelTolerance(TEMP_CAP), 'a hotter room tolerates more');
  assert.strictEqual(
    duelTolerance(),
    duelTolerance(effectiveTemp()),
    'the default heat IS effectiveTemp — the single source (#1483)',
  );
  checks++;
  // A borderline read: inside at the cap, outside at the floor.
  const borderline = { big: anchor.big - 0.16, mid: anchor.mid + 0.08, fine: anchor.fine + 0.08 };
  ok(!judgeRead(borderline, anchor, TEMP_FLOOR).pass, 'cold room: the borderline read is tilted away');
  ok(
    judgeRead(borderline, anchor, TEMP_CAP).pass,
    'hot room: the same read stands — boldness is the temperature’s whole job',
  );
  console.log(
    `readDuel.selfcheck C heat: tolerance ${duelTolerance(TEMP_FLOOR)} at the floor → ${duelTolerance(TEMP_CAP)} at the cap`,
  );
}

// ── D. the tilt, through pickCurated ─────────────────────────────────
{
  const cands = [{ id: 'bald-cand' }, { id: 'mud-cand' }, { id: 'bal-cand' }];
  const reads = [corpus.get('bald'), corpus.get('mud'), BAL].map((shares) => ({ shares }));
  const davisPicksBald = { name: 'stub', status: () => 'active', pick: () => 0 };
  // Without reads: exactly yesterday's shape and pick.
  const plain = pickCurated(cands, davisPicksBald, () => 0);
  assert.deepStrictEqual(plain, { index: 0, curated: true }, 'no reads → yesterday’s return, byte for byte');
  checks++;
  // With reads + anchor: Davis's bald pick tilts to the balanced one.
  const dueled = pickCurated(cands, davisPicksBald, () => 0, { reads, anchor });
  assert.strictEqual(dueled.index, 2, 'the tilt takes the candidate nearest the anchor');
  ok(dueled.curated === true && dueled.duel?.dueled && dueled.duel?.tilted, 'the return carries the duel, honestly');
  ok(dueled.duel.fromLine.includes('demand fine'), 'the tilt names why Davis’s pick fell');
  checks += 2;
  // Davis picks the balanced one: it stands, no tilt.
  const stands = pickCurated(cands, { name: 'stub', status: () => 'active', pick: () => 2 }, () => 0, {
    reads,
    anchor,
  });
  assert.strictEqual(stands.index, 2);
  ok(stands.duel?.dueled && !stands.duel?.tilted, 'inside tolerance, Davis’s pick stands');
  checks++;
  // Reads but no anchor (no keeps): the duel declines, pick untouched.
  const declined = pickCurated(cands, davisPicksBald, () => 0, { reads, anchor: null });
  assert.deepStrictEqual(declined, { index: 0, curated: true }, 'no anchor → no duel → yesterday’s return');
  checks++;
  // duelPick direct: first of equals wins (LOIS's convention).
  const eq = duelPick({ reads: [BAL, BAL], anchor, davisIndex: 0 });
  ok(eq.dueled && !eq.tilted && eq.index === 0, 'equals: the first stands');
  console.log(
    'readDuel.selfcheck D tilt: bald pick tilts to balance; a standing pick is left alone; absence is honest',
  );
}

// ── E. the hint ──────────────────────────────────────────────────────
{
  const cands = [{ id: 'a' }, { id: 'b' }];
  const reads = [{ shares: corpus.get('bald') }, { shares: BAL }];
  pickCurated(cands, { name: 'stub', status: () => 'active', pick: () => 0 }, () => 0, { reads, anchor });
  ok(getLastDuel()?.tilted, 'the duel is on record');
  const hint = curatorHint({ name: 'stub', status: () => 'active', pick: () => 0 });
  ok(hint.includes('duel: tilted'), `the hint says the duel out loud: "${hint}"`);
  pickCurated(cands, { name: 'stub', status: () => 'active', pick: () => 0 }, () => 0);
  assert.strictEqual(getLastDuel(), null, 'a pick without reads clears the record — no stale judgments');
  checks++;
  assert.strictEqual(
    curatorHint(nullCurator()),
    'curator untrained · dice roll',
    'no duel → yesterday’s hint, exactly',
  );
  checks++;
  console.log('readDuel.selfcheck E hint: the duel is spoken when it ran, absent when it didn’t');
}

console.log(`readDuel.selfcheck: ok — ${checks} checks passed (#1627 S3)`);
