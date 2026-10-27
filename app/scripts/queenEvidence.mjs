// queenEvidence.mjs — #1508 (Look Explorer E4): the Queen's evidence
// over a mining run, computed by the run TOOL (operator side).
//
// Why this lives in scripts/ and not in src/: her mechanics have
// exactly one host in the app graph (curator/director.js), and
// queenDeniability.selfcheck enforces that import graph (KC-1 DS
// rule 10 — she is never named on a surface, and her identifiers
// travel nowhere). An explorer module importing queenLean fails that
// suite — correctly. The run tool is operator tooling: it reads her
// own functions the way the sanctioned debug trace does, and writes
// the result into the run's artifacts as telemetry.
//
// What it computes (spec §4): her sway, form unchanged, over
// evidence that now includes mined candidates. The anchor is
// keptCentroid(keeps) — keeps only; taste still learns from kept
// renders alone (spec §7), so mined candidates are WEIGHED, never
// learned from. Her M1 rank bias is reported per finalist; it steers
// nothing here (explorer selection is farthest-point and attaches
// no scores, spec §3.4) and writes nothing anywhere. Below
// MIN_KEEPS keeps she is silent — identity, as ever.
import { keptCentroid, rankBiases, proximity, MIN_KEEPS, M1_BIAS } from '../src/curator/queenLean.mjs';
import { extractFeatures } from '../src/curator/taste.js';
import { cornerWord } from '../src/curator/provenance.mjs';

/**
 * Her leanings over a mined pool. pool: [{ layoutParams, corner,
 * index }]. Returns per-candidate { index, corner, proximity, bias }
 * using her own M1 constants, plus leaning counts by corner.
 */
export function queenEvidence(keeps, pool) {
  const list = Array.isArray(keeps) ? keeps : [];
  const candidates = (pool || []).map((p) => p.layoutParams);
  const centroid = keptCentroid(list);
  if (list.length < MIN_KEEPS || !centroid) {
    return {
      keeps: list.length,
      silent: true,
      reason:
        list.length < MIN_KEEPS
          ? `fewer than ${MIN_KEEPS} keeps — she is identity, as ever`
          : 'no keep carries a layout — nothing to lean toward',
      leaning: (pool || []).map((p) => ({
        index: p.index ?? null,
        corner: p.corner ?? 'wilderness',
        proximity: null,
        bias: 0,
      })),
      leaningByCorner: {},
      anchor: null,
    };
  }
  const biases = rankBiases(candidates, centroid);
  const leaning = (pool || []).map((p, i) => ({
    index: p.index ?? null,
    corner: p.corner ?? 'wilderness',
    proximity: +proximity(extractFeatures(p.layoutParams), centroid).toFixed(4),
    bias: biases[i],
  }));
  const leaningByCorner = {};
  for (const l of leaning) {
    if (l.bias > 0) leaningByCorner[l.corner] = (leaningByCorner[l.corner] || 0) + 1;
  }
  return {
    keeps: list.length,
    silent: false,
    reason: null,
    leaning,
    leaningByCorner,
    anchor: 'kept centroid (keeps only — mined candidates are weighed, never learned from)',
    bias: M1_BIAS,
  };
}

export function formatQueenSection(ev) {
  const L = [];
  L.push('THE QUEEN’S EVIDENCE (her anchor is kept taste; the mined pool is what she weighs):');
  if (ev.silent) {
    L.push(`  silent — ${ev.reason} (${ev.keeps} keeps handed to the run)`);
    return L.join('\n');
  }
  const leaning = ev.leaning.filter((l) => l.bias > 0);
  L.push(`  anchor: ${ev.anchor} · ${ev.keeps} keeps`);
  L.push(`  she leans toward ${leaning.length} of ${ev.leaning.length} finalists (M1 proximity, bias +${ev.bias})`);
  for (const [corner, n] of Object.entries(ev.leaningByCorner)) {
    L.push(`    ${cornerWord(corner)} corner: ${n} leaned`);
  }
  return L.join('\n');
}
