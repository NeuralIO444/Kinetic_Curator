// node src/curator/readMeter.selfcheck.mjs
//
// #1627 S2 — the three-reads meter. Two halves:
//   A. SYNTHETIC — hand-built rasters whose band structure is known by
//      construction: a flat block (coarse only), white noise (fine
//      only), a block + noise + mid blobs (all three). The meter must
//      meter each as constructed, deterministically.
//   B. THE KILL CRITERION — the parity corpus (censusReport.readsMetric,
//      real scenes through the real still pipeline): bald / mud /
//      balanced / top-heavy must separate by eye-checkable margins.
//      If a future change collapses the separation, this suite fails
//      loudly and S3's judge is gone with it — that is the point.
import assert from 'node:assert/strict';
import { readMeter, readVerdict, BALD_FINE_MAX, MUD_BIG_MAX, TOP_HEAVY_BIG_MIN } from './readMeter.mjs';
import { readsMetric, formatCensusReport, renderReachability } from './censusReport.mjs';
import { readsView } from './censusReadout.mjs';

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};

// ── A. synthetic rasters ─────────────────────────────────────────────
const W = 200;
const H = 140;
const blank = () => new Uint8Array(W * H * 4);
const setPx = (px, x, y, v) => {
  const o = (y * W + x) * 4;
  px[o] = v;
  px[o + 1] = v;
  px[o + 2] = v;
  px[o + 3] = 255;
};
// Deterministic noise (mulberry-style hash, no Math.random).
const hash01 = (n) => {
  let h = Math.imul((n | 0) + 0x9e3779b9, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

{
  // Empty: no ink, honest 'empty', never a fake balance.
  const m = readMeter(blank(), W, H);
  assert.strictEqual(m.verdict, 'empty');
  assert.strictEqual(m.total, 0);
  checks += 2;
  // Malformed input meters empty, never throws.
  assert.strictEqual(readMeter(null, 0, 0).verdict, 'empty');
  checks++;

  // One flat block: coarse energy only — fine near zero, verdict bald
  // or top-heavy (both are the all-top family), big share > 0.85.
  const block = blank();
  for (let y = 30; y < 110; y++) for (let x = 40; x < 160; x++) setPx(block, x, y, 255);
  const mb = readMeter(block, W, H);
  ok(mb.shares.big > 0.85, `flat block is coarse (big ${mb.shares.big})`);
  ok(mb.shares.fine < BALD_FINE_MAX, `flat block has no fine level (fine ${mb.shares.fine})`);
  ok(mb.verdict === 'bald' || mb.verdict === 'top-heavy', `flat block verdict ${mb.verdict}`);

  // White noise: fine only — the coarse map is a flat field, so big
  // collapses and the verdict is mud.
  const noise = blank();
  for (let i = 0; i < W * H; i++) setPx(noise, i % W, Math.floor(i / W), Math.floor(hash01(i) * 256));
  const mn = readMeter(noise, W, H);
  ok(mn.shares.fine > 0.5, `white noise is fine (fine ${mn.shares.fine})`);
  ok(mn.shares.big < MUD_BIG_MAX, `white noise has no big read (big ${mn.shares.big})`);
  assert.strictEqual(mn.verdict, 'mud');
  checks++;

  // All three by construction: a big block (big) + 12 px blobs (mid)
  // + per-pixel noise at low amplitude everywhere (fine).
  const mix = blank();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) setPx(mix, x, y, 40 + Math.floor(hash01(y * W + x) * 130));
  for (let y = 20; y < 120; y++) for (let x = 20; x < 90; x++) setPx(mix, x, y, 255);
  for (let by = 0; by < 3; by++)
    for (let bx = 0; bx < 4; bx++) {
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) setPx(mix, 110 + bx * 22 + x, 15 + by * 40 + y, 200);
    }
  const mm = readMeter(mix, W, H);
  ok(
    mm.shares.big > 0.1 && mm.shares.mid > 0.05 && mm.shares.fine > BALD_FINE_MAX,
    `the mix carries all three levels: ${JSON.stringify(mm.shares)}`,
  );
  assert.strictEqual(mm.verdict, 'balanced');
  checks++;

  // Determinism: same raster, same meter, bit for bit.
  assert.deepStrictEqual(readMeter(mix, W, H), mm);
  checks++;
  // Verdict thresholds are the named constants, in the named order.
  assert.strictEqual(readVerdict({ big: 0.95, mid: 0.04, fine: 0.01 }), 'top-heavy');
  assert.strictEqual(readVerdict({ big: 0.8, mid: 0.15, fine: 0.01 }), 'bald');
  assert.strictEqual(readVerdict({ big: 0.05, mid: 0.2, fine: 0.75 }), 'mud');
  assert.strictEqual(readVerdict({ big: 0.8, mid: 0.13, fine: 0.05 }), 'balanced');
  checks += 4;
  console.log('readMeter.selfcheck A synthetic: block / noise / mix meter as constructed; empty is honest');
}

// ── B. the kill criterion, on the named corpus ───────────────────────
const reads = readsMetric();
{
  const byScene = new Map(reads.map((r) => [r.scene, r]));
  for (const name of ['bald', 'mud', 'balanced', 'top-heavy']) {
    ok(byScene.has(name), `corpus scene ${name} measured`);
  }
  const bald = byScene.get('bald');
  const mud = byScene.get('mud');
  const bal = byScene.get('balanced');
  const top = byScene.get('top-heavy');
  assert.strictEqual(bald.verdict, 'bald', `bald scene verdicts bald: ${JSON.stringify(bald.shares)}`);
  assert.strictEqual(mud.verdict, 'mud', `mud scene verdicts mud: ${JSON.stringify(mud.shares)}`);
  assert.strictEqual(bal.verdict, 'balanced', `balanced scene verdicts balanced: ${JSON.stringify(bal.shares)}`);
  assert.strictEqual(top.verdict, 'top-heavy', `top-heavy scene verdicts top-heavy: ${JSON.stringify(top.shares)}`);
  checks += 4;
  // The margins, eye-checkable (the numbers are the staging report's):
  ok(
    bal.shares.fine > 2.5 * bald.shares.fine,
    `fine separates balanced from bald: ${bal.shares.fine} vs ${bald.shares.fine} (${(bal.shares.fine / bald.shares.fine).toFixed(1)}×)`,
  );
  ok(
    bal.shares.big > 10 * mud.shares.big,
    `big separates balanced from mud: ${bal.shares.big} vs ${mud.shares.big} (${(bal.shares.big / mud.shares.big).toFixed(1)}×)`,
  );
  ok(
    mud.shares.fine > 10 * top.shares.fine,
    `fine separates mud from top-heavy: ${mud.shares.fine} vs ${top.shares.fine}`,
  );
  ok(
    top.shares.big > bal.shares.big + 0.1,
    `big separates top-heavy from balanced: ${top.shares.big} vs ${bal.shares.big}`,
  );
  // The corpus repeats bit-identically (the meter is a pure function
  // of the still pipeline's deterministic output).
  assert.deepStrictEqual(readsMetric(), reads, 'corpus meters identically on a second run');
  checks++;
  console.log(
    `readMeter.selfcheck B corpus: bald ${JSON.stringify(bald.shares)} · mud ${JSON.stringify(mud.shares)} · balanced ${JSON.stringify(bal.shares)} · top-heavy ${JSON.stringify(top.shares)} — separation holds, S3's gate is OPEN`,
  );
}

// ── C. the readout reshapes, never recomputes ────────────────────────
{
  const view = readsView(reads);
  assert.strictEqual(view.present, true);
  assert.deepStrictEqual(view.bald, ['bald']);
  assert.deepStrictEqual(view.mud, ['mud']);
  assert.deepStrictEqual(view.balanced, ['balanced']);
  assert.deepStrictEqual(view.topHeavy, ['top-heavy']);
  checks += 5;
  assert.deepStrictEqual(readsView(null), { present: false, reason: 'not measured', rows: [] });
  checks++;
  const report = formatCensusReport({ paramRows: [], dishRows: [], reach: renderReachability(), reads });
  ok(report.includes('three reads') && report.includes('balanced:'), 'the formatted census carries the reads section');
  console.log('readMeter.selfcheck C readout: views reshape the measured rows; absent stays absent');
}

console.log(`readMeter.selfcheck: ok — ${checks} checks passed (#1627 S2)`);
