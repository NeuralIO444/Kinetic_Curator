// stressEvidence.js — #1635: the band edges' evidence, read from real takes. Pure.
//
// The 0.28 / 0.72 band edges (curator/stress.js RELAX_BELOW / TIGHTEN_ABOVE) were picked. #1635 asks that they be
// tuned — or kept — from what real sessions actually do, never from feel. Every take already carries its stress
// record (curator/stressRecord.js, stored on the performance as `stress`); this module reads one or more of them
// back into the summary the closing PR cites:
//   - occupancy: the share of updates spent in each band (and "none", before the tracker's first band);
//   - crossings: band changes between bands, and per minute (updates count at 60 fps — the reader steps once per
//     presented frame; minutes are that count / 3600, the same convention verifyPerformance uses);
//   - the smoothed stress distribution (p10/p25/p50/p75/p90) and the share of time sitting within EDGE_NEAR of each
//     edge — where the edges actually cut the signal, and how much of the show lives on a knife edge;
//   - the take's own check: do its logged band changes follow from its logged signals (verifyStressRecord)?
//
// It reports and judges only what the issue's kill criteria name; it never proposes new edge numbers (that is the
// tuning decision, made by a person with this evidence in hand):
//   - fewer than MIN_SESSIONS takes: not enough evidence yet;
//   - one band at or above SINGLE_BAND_SHARE of all updates: the finding is the stress SIGNAL, not the edges —
//     stop and re-scope the signal before touching the numbers.
import { expandStressRecord, verifyStressRecord } from './stressRecord.js';
import { BANDS, RELAX_BELOW, TIGHTEN_ABOVE } from './stress.js';

/** #1635: the evidence threshold — five or more real sessions before the edges are touched. */
export const MIN_SESSIONS = 5;
/** #1635 kill criterion: one band at ~100% occupancy means the signal is wrong, not the edges. */
export const SINGLE_BAND_SHARE = 0.95;
/** "On the edge": smoothed stress within this distance of a band edge. */
export const EDGE_NEAR = 0.04;
/** Updates per minute (the reader steps once per presented frame, counted at 60 fps). */
export const UPDATES_PER_MINUTE = 3600;

const QUANTILES = Object.freeze([0.1, 0.25, 0.5, 0.75, 0.9]);
const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

function quantiles(sorted) {
  const out = {};
  for (const q of QUANTILES) {
    const key = `p${Math.round(q * 100)}`;
    out[key] = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null;
  }
  return out;
}

/** Tally a per-frame expansion ([{ stress, band }]) into raw counts. */
function tally(frames) {
  const counts = { relax: 0, normal: 0, tighten: 0, none: 0 };
  let crossings = 0;
  let nearRelax = 0;
  let nearTighten = 0;
  let prev = null;
  const stress = [];
  for (const f of frames) {
    if (f.band === null || !BANDS.includes(f.band)) counts.none += 1;
    else {
      counts[f.band] += 1;
      if (prev !== null && f.band !== prev) crossings += 1;
      prev = f.band;
    }
    stress.push(f.stress);
    if (Math.abs(f.stress - RELAX_BELOW) <= EDGE_NEAR) nearRelax += 1;
    if (Math.abs(f.stress - TIGHTEN_ABOVE) <= EDGE_NEAR) nearTighten += 1;
  }
  return { updates: frames.length, counts, crossings, nearRelax, nearTighten, stress };
}

/** Shape raw counts into the reported summary. */
function shape(t) {
  const n = t.updates;
  const share = (k) => (n ? round(t.counts[k] / n) : 0);
  const minutes = n / UPDATES_PER_MINUTE;
  return {
    updates: n,
    minutes: round(minutes, 2),
    occupancy: { relax: share('relax'), normal: share('normal'), tighten: share('tighten'), none: share('none') },
    frames: { ...t.counts },
    crossings: t.crossings,
    crossingsPerMinute: minutes > 0 ? round(t.crossings / minutes, 2) : 0,
    nearEdge: { relax: n ? round(t.nearRelax / n) : 0, tighten: n ? round(t.nearTighten / n) : 0 },
    stress: quantiles(t.stress.slice().sort((a, b) => a - b)),
  };
}

/**
 * One take's evidence from its stress record (perf.stress). A missing or malformed record returns
 * { ok: false, reason } — never a fabricated zero session.
 */
export function stressTakeEvidence(record) {
  const v = verifyStressRecord(record);
  if (!record || record.version === undefined || !Array.isArray(record.runs)) return { ok: false, reason: 'no stress record' };
  const frames = expandStressRecord(record);
  if (!frames.length) return { ok: false, reason: 'empty or unreadable stress record' };
  const t = tally(frames);
  return { ok: true, consistent: v.ok, firstMismatch: v.firstMismatch, ...shape(t), _tally: t };
}

/**
 * Pool several takes' evidence (the results of stressTakeEvidence) into the session summary and the verdict the
 * kill criteria allow. Takes that failed to read are counted and left out of the pool.
 */
export function pooledStressEvidence(takes) {
  const good = (Array.isArray(takes) ? takes : []).filter((t) => t && t.ok && t._tally);
  const skipped = (Array.isArray(takes) ? takes.length : 0) - good.length;
  const sum = { updates: 0, counts: { relax: 0, normal: 0, tighten: 0, none: 0 }, crossings: 0, nearRelax: 0, nearTighten: 0, stress: [] };
  for (const t of good) {
    const r = t._tally;
    sum.updates += r.updates;
    for (const k of Object.keys(sum.counts)) sum.counts[k] += r.counts[k];
    sum.crossings += r.crossings;
    sum.nearRelax += r.nearRelax;
    sum.nearTighten += r.nearTighten;
    for (const s of r.stress) sum.stress.push(s);
  }
  const pooled = shape(sum);
  const inconsistent = good.filter((t) => !t.consistent).length;
  const banded = sum.updates - sum.counts.none;
  const dominant = banded > 0 ? BANDS.reduce((a, b) => (sum.counts[b] > sum.counts[a] ? b : a), BANDS[0]) : null;
  const dominantShare = banded > 0 ? round(sum.counts[dominant] / banded) : 0;
  let verdict;
  if (good.length < MIN_SESSIONS) {
    verdict = { kind: 'insufficient', text: `${good.length} of ${MIN_SESSIONS} sessions — not enough evidence to touch the edges yet` };
  } else if (dominant && dominantShare >= SINGLE_BAND_SHARE) {
    verdict = { kind: 'signal', text: `${dominant} holds ${(dominantShare * 100).toFixed(1)}% of banded time — the stress signal needs re-scoping before the edges are touched (#1635 kill criterion)` };
  } else {
    verdict = { kind: 'tunable', text: `${good.length} sessions, no single band dominates — the edges can be tuned or kept from this evidence (a person decides; cite it)` };
  }
  return { sessions: good.length, skipped, inconsistent, edges: { relax: RELAX_BELOW, tighten: TIGHTEN_ABOVE }, ...pooled, dominant, dominantShare, verdict };
}

const pct = (v) => `${(v * 100).toFixed(1)}%`;

/** The summary as a Markdown block, ready to paste on the closing PR. `names` labels the takes, in order. */
export function stressEvidenceMarkdown(takes, names = []) {
  const pooled = pooledStressEvidence(takes);
  const lines = [
    `**Stress evidence (#1635)** — edges relax < ${RELAX_BELOW}, tighten > ${TIGHTEN_ABOVE}; occupancy is the share of reader updates (60 fps)`,
    '',
    '| take | min | relax | normal | tighten | crossings/min | p50 stress | near edges (R/T) | log consistent |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  (takes || []).forEach((t, i) => {
    const name = names[i] || `take ${i + 1}`;
    if (!t || !t.ok) { lines.push(`| ${name} | — | — | — | — | — | — | — | ${t ? t.reason : 'unreadable'} |`); return; }
    lines.push(`| ${name} | ${t.minutes} | ${pct(t.occupancy.relax)} | ${pct(t.occupancy.normal)} | ${pct(t.occupancy.tighten)} | ${t.crossingsPerMinute} | ${t.stress.p50} | ${pct(t.nearEdge.relax)} / ${pct(t.nearEdge.tighten)} | ${t.consistent ? 'yes' : `NO (band change ${t.firstMismatch})`} |`);
  });
  lines.push(`| **all** | ${pooled.minutes} | ${pct(pooled.occupancy.relax)} | ${pct(pooled.occupancy.normal)} | ${pct(pooled.occupancy.tighten)} | ${pooled.crossingsPerMinute} | ${pooled.stress.p50} | ${pct(pooled.nearEdge.relax)} / ${pct(pooled.nearEdge.tighten)} | ${pooled.inconsistent ? `${pooled.inconsistent} inconsistent` : 'yes'} |`);
  const q = pooled.stress;
  lines.push('', `Smoothed stress, pooled: p10 ${q.p10} · p25 ${q.p25} · p50 ${q.p50} · p75 ${q.p75} · p90 ${q.p90}`, '', `**Verdict:** ${pooled.verdict.text}`);
  return lines.join('\n');
}
