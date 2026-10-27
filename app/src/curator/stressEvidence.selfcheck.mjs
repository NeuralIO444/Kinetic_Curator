// node src/curator/stressEvidence.selfcheck.mjs
// #1635 — the band edges' evidence from real takes: occupancy and crossings that match the live counters, honest
// verdicts (too few sessions; one band dominating = re-scope the signal), and a Markdown block for the closing PR.
import assert from 'node:assert/strict';
import { createStressTracker } from './stress.js';
import { createStressRecorder } from './stressRecord.js';
import {
  stressTakeEvidence, pooledStressEvidence, stressEvidenceMarkdown, MIN_SESSIONS, UPDATES_PER_MINUTE,
} from './stressEvidence.js';

/** Record a synthetic take of n reader updates driven by sig(f); returns { record, live } (live = the reader's own counts). */
function take(n, sig) {
  const t = createStressTracker();
  let frame = 0;
  const rec = createStressRecorder({ initial: null, getFrame: () => frame });
  const live = { relax: 0, normal: 0, tighten: 0, crossings: 0 };
  let prev = null;
  for (let f = 0; f < n; f++) {
    frame = f;
    const s = sig(f);
    const r = t.update(s);
    rec.update({ ...s, band: r.band });
    if (r.band !== null) {
      live[r.band] += 1;
      if (prev !== null && r.band !== prev) live.crossings += 1;
      prev = r.band;
    }
  }
  return { record: JSON.parse(JSON.stringify(rec.finish())), live };
}
const swing = (f) => ({ activity: 0.5 + 0.5 * Math.sin(f / 60), dish: 0.5 + 0.5 * Math.sin(f / 60 + 0.4), taste: 0.5 + 0.5 * Math.sin(f / 60 - 0.3) });
const calm = () => ({ activity: 0.05, dish: 0.05, taste: 0.05 });

// 1. one take: the evidence agrees with what the live reader counted (stressLive's session telemetry)
{
  const { record, live } = take(2 * UPDATES_PER_MINUTE, swing);
  const e = stressTakeEvidence(record);
  assert.ok(e.ok && e.consistent, 'the take reads and its log is consistent');
  assert.equal(e.updates, 2 * UPDATES_PER_MINUTE);
  assert.equal(e.minutes, 2);
  assert.deepEqual({ relax: e.frames.relax, normal: e.frames.normal, tighten: e.frames.tighten }, { relax: live.relax, normal: live.normal, tighten: live.tighten }, 'per-band frames match the live counters');
  assert.equal(e.crossings, live.crossings, 'crossings match the live counter');
  assert.ok(e.crossings > 0 && e.frames.relax > 0 && e.frames.tighten > 0, 'a swinging take visits every band');
  assert.equal(e.crossingsPerMinute, +(live.crossings / 2).toFixed(2));
  const occ = e.occupancy;
  assert.ok(Math.abs(occ.relax + occ.normal + occ.tighten + occ.none - 1) < 1e-3, 'occupancy sums to the session');
  assert.ok(e.stress.p10 <= e.stress.p50 && e.stress.p50 <= e.stress.p90);
}

// 2. honesty: junk is refused, never a zero session; a tampered log is flagged inconsistent
{
  assert.equal(stressTakeEvidence(null).ok, false);
  assert.equal(stressTakeEvidence({ version: 1, runs: [] }).ok, false);
  const { record } = take(600, swing);
  const bad = { ...record, bands: record.bands.map(([f, b]) => [f, b === 'relax' ? 'tighten' : b]) };
  const e = stressTakeEvidence(bad);
  assert.ok(e.ok && !e.consistent, 'a record whose band changes do not follow from its signals is flagged');
}

// 3. verdicts: too few sessions; one band dominating (the kill criterion); otherwise tunable
{
  const swingTakes = Array.from({ length: MIN_SESSIONS }, (_, i) => stressTakeEvidence(take(1800 + i * 120, (f) => swing(f + i * 97)).record));
  assert.equal(pooledStressEvidence(swingTakes.slice(0, MIN_SESSIONS - 1)).verdict.kind, 'insufficient');
  const p = pooledStressEvidence(swingTakes);
  assert.equal(p.sessions, MIN_SESSIONS);
  assert.equal(p.verdict.kind, 'tunable');
  assert.equal(p.updates, swingTakes.reduce((s, t) => s + t.updates, 0), 'pooled updates sum the takes');
  assert.equal(p.crossings, swingTakes.reduce((s, t) => s + t.crossings, 0));
  const calmTakes = Array.from({ length: MIN_SESSIONS }, () => stressTakeEvidence(take(1800, calm).record));
  const c = pooledStressEvidence(calmTakes);
  assert.equal(c.verdict.kind, 'signal', 'a show pinned in one band is a signal problem, not an edge problem');
  assert.equal(c.dominant, 'relax');
  const mixed = pooledStressEvidence([...swingTakes, { ok: false, reason: 'no stress record' }]);
  assert.equal(mixed.skipped, 1);
  assert.equal(mixed.sessions, MIN_SESSIONS);
}

// 4. the PR block: one row per take plus the pool, and the verdict
{
  const takes = [stressTakeEvidence(take(1200, swing).record), { ok: false, reason: 'no stress record' }];
  const md = stressEvidenceMarkdown(takes, ['a.kcperf', 'b.kcperf']);
  assert.ok(md.includes('| a.kcperf |') && md.includes('| b.kcperf |') && md.includes('no stress record'));
  assert.ok(md.includes('| **all** |') && md.includes('**Verdict:**') && md.includes('not enough evidence'));
}

console.log('stressEvidence.selfcheck: ok (#1635)');
