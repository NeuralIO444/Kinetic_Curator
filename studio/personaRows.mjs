#!/usr/bin/env node
// studio/personaRows.mjs — Persona Adapters A2 (#2395): labeled turns + takes → training rows.
//
//   node studio/personaRows.mjs --labeled <labeled.json> --takes <file-or-dir> [--takes ...]
//       [--tuning <tuning.json>] [--out rows.json]
//
// A0's extractor (labelExtractor.mjs) says WHAT Matt decided about each band decision; it carries no
// features. This builder joins the labeled-turns artifact back to the takes it came from and encodes
// each labeled decision as one training row for A2's trainer (train_persona_heads.py):
//
//   { id, kind, takeSeed, features, label, weight }
//
// `features` is a decisionFeatures() vector (app/src/curator/decisionFeatures.mjs) — the encoding goes
// through the app's own function, so a training row can never drift from the vector the live band
// walks a head over. The labels are A0's authority: this module never re-reads the ledgers (they were
// the extractor's input, not A2's) and never relabels a unit.
//
// Q1 (ruling on #2395, Matt 2026-11-20): rows carry ONLY the live-true feature set — the features a
// head actually sees in a live decision. In band.mjs's decisionInput terms, with production's empty
// decisionCtx, those are exactly:
//   solo   { heat, pressure }                                   (the pick: the candidate's own heat)
//   trade  { caller, verdict, move, heat, soloAge, pressure }   (one answerer's verdict on a call)
//   cut    { target, soloAge, pressure }                        (the bandleader's cut; heat is stripped
//                                                                 live — not a fact of the cut)
// Nothing else is encoded: no bpm/bar (recoverable from the clock section but never supplied live),
// no recipe features (the ledger join exists, the live supply does not), no census, no principles.
// A row trained on a feature that cannot fire live would credit held-out fidelity to a world that
// does not exist — the XGB_LIVE_NULL_FEATURES trap at corpus scale.
//
// Where each live-true feature comes from:
//   caller / verdict / move / target — the take's band record (checkBandRecord's checked rows).
//   soloAge — the band's own fold (applyTurn / standingSolo over the turns before the decision):
//             the standing solo's start phrase, exactly as stepBand computes it live.
//   heat    — the tuning table in force (the `tuning` argument; the CLI's --tuning file, else the
//             shipped table via personaTuning()). No take stamps its table, so the current table is
//             the only source; a null (unruled) heat stays absent from the vector, as it walks.
//   pressure — re-derived by deterministic replay of the take's `stress` section through the app's
//             own createStressTracker: the recorder logged every per-frame update as runs
//             [frame, activity, dish, taste, n], but a run's frame is an ANNOTATION — the stress
//             record's documented law (stressRecord.js) is that order is what replays, and its
//             canonical per-frame readback (expandStressRecord) numbers updates by ordinal: the
//             k-th update of the take, counting every run's updates in order, sits at frame k.
//             The pressure at a decision's frame is the clamped smoothed value after the last
//             update at or before it (the take's initial smoothed before the first update — what
//             the live getPressure() would have read). A take with no stress section encodes no
//             pressure: an absent numeric walks as 0, one consistent fact on both sides.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkBandRecord, turnOf } from '../app/src/personas/bandRecord.mjs';
import { applyTurn, createBandState, standingSolo } from '../app/src/personas/band.mjs';
import { decisionFeatures, DECISION_FEATURES_VERSION } from '../app/src/curator/decisionFeatures.mjs';
import { createStressTracker } from '../app/src/curator/stress.js';
import { personaTuning } from '../app/src/personas/tuning.mjs';
import { LABELED_TURNS_FORMAT, LABELED_TURNS_VERSION, parseTakeBytes } from './labelExtractor.mjs';

export const PERSONA_ROWS_FORMAT = 'kc-persona-rows';
export const PERSONA_ROWS_VERSION = 1;

const clamp01 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * The pressure reader for one take: frame → the clamped smoothed stress the band would have read at
 * that frame, or null when the take carries no usable stress section. Deterministic: the same record
 * replays to the same series (the stress record's own law — its logged band changes are the check).
 * Frames are update ORDINALS, exactly as expandStressRecord reads the record back: a run's logged
 * frame is an annotation and is never consulted, so two records with the same signals and different
 * annotations read back identically.
 */
export function pressureReader(perf) {
  const rec = perf && typeof perf === 'object' ? perf.stress : null;
  if (!rec || rec.version !== 1 || !Array.isArray(rec.runs)) return null;
  const tracker = createStressTracker({ initial: rec.initial || null });
  const points = []; // [ordinal frame, clamped smoothed after that update], in replay order
  for (const run of rec.runs) {
    if (!Array.isArray(run)) continue;
    const [, activity, dish, taste, n] = run;
    if (!Number.isInteger(n) || n < 0) continue;
    for (let j = 0; j < n; j++) {
      tracker.update({ activity, dish, taste });
      points.push([points.length, clamp01(tracker.smoothed)]);
    }
  }
  const initial = rec.initial && Number.isFinite(rec.initial.smoothed) ? clamp01(rec.initial.smoothed) : 0;
  return (frame) => {
    let p = initial;
    for (const [f, s] of points) {
      if (f > frame) break;
      p = s;
    }
    return p;
  };
}

/** The band state standing BEFORE each turn of a checked record (the fold, turn by turn). */
function statesBefore(rec) {
  const states = [];
  let state = createBandState();
  for (const row of rec.turns) {
    states.push(state);
    state = applyTurn(state, turnOf(row));
  }
  return states;
}

/**
 * Labeled-turns artifact + takes ([{ name, perf }]) + a tuning table → the rows artifact.
 * A labeled take whose performance is not among `takes` (or whose band section fails the app's own
 * check) cannot be encoded honestly — it is counted in summary.droppedTakes, never guessed at.
 * A trade/cut unit whose fold shows no standing solo is counted in summary.droppedUnits.
 * Pure: same inputs, same artifact.
 */
export function buildRows(labeled, takes, tuning) {
  if (!labeled || labeled.format !== LABELED_TURNS_FORMAT || labeled.version !== LABELED_TURNS_VERSION)
    throw new Error(`not a ${LABELED_TURNS_FORMAT} v${LABELED_TURNS_VERSION} artifact`);
  const bySeed = new Map();
  for (const t of takes || []) {
    const rec = t && t.perf ? checkBandRecord(t.perf.band) : null;
    if (!rec) continue;
    if (!bySeed.has(rec.seed)) bySeed.set(rec.seed, []);
    bySeed.get(rec.seed).push({ name: t.name || null, perf: t.perf, rec });
  }
  const heatOf = (id) => {
    const h = tuning && tuning.personas && tuning.personas[id] ? tuning.personas[id].heat : null;
    return typeof h === 'number' && Number.isFinite(h) ? h : undefined;
  };
  const rows = [];
  const byEntry = {};
  let droppedTakes = 0;
  let droppedUnits = 0;
  let encodedTakes = 0;
  for (const lt of labeled.takes || []) {
    const candidates = bySeed.get(lt.seed >>> 0) || [];
    const pick = candidates.find((c) => c.name !== null && c.name === lt.name) || candidates[0];
    if (!pick) {
      droppedTakes += 1;
      continue;
    }
    encodedTakes += 1;
    const { rec } = pick;
    const states = statesBefore(rec);
    const pressureAt = pressureReader(pick.perf);
    for (const u of lt.units || []) {
      const turn = Number.isInteger(u.turn) ? rec.turns[u.turn] : undefined;
      if (!turn || turnOf(turn).kind !== u.kind) {
        droppedUnits += 1;
        continue;
      }
      const pressure = pressureAt ? pressureAt(u.frame) : undefined;
      let input = null;
      if (u.kind === 'solo') {
        input = { heat: heatOf(u.by), pressure };
      } else if (u.kind === 'trade' || u.kind === 'cut') {
        const solo = standingSolo(states[u.turn], u.phrase);
        if (!solo) {
          droppedUnits += 1;
          continue;
        }
        const soloAge = u.phrase - solo.start;
        input =
          u.kind === 'trade'
            ? { caller: turnOf(turn).by, verdict: u.verdict, move: u.move, heat: heatOf(u.by), soloAge, pressure }
            : { target: u.target, soloAge, pressure };
      } else {
        droppedUnits += 1;
        continue;
      }
      rows.push({
        id: u.by,
        kind: u.kind,
        takeSeed: lt.seed >>> 0,
        features: decisionFeatures(input),
        label: u.label,
        weight: u.weight,
      });
      if (u.weight !== 0) {
        const key = `${u.by}|${u.kind}`;
        byEntry[key] = (byEntry[key] || 0) + 1;
      }
    }
  }
  return {
    format: PERSONA_ROWS_FORMAT,
    version: PERSONA_ROWS_VERSION,
    featuresVersion: DECISION_FEATURES_VERSION,
    rows,
    summary: {
      takes: encodedTakes,
      droppedTakes,
      units: rows.length,
      droppedUnits,
      labeledByEntry: byEntry,
    },
  };
}

function collectTakeFiles(paths) {
  const files = [];
  for (const p of paths) {
    if (!existsSync(p)) throw new Error(`--takes path not found: ${p}`);
    if (statSync(p).isDirectory()) {
      for (const name of readdirSync(p).sort()) {
        if (/\.kcperf$/i.test(name) || /\.json$/i.test(name)) files.push(join(p, name));
      }
    } else {
      files.push(p);
    }
  }
  return files;
}

function main(argv) {
  const args = { labeled: null, takes: [], tuning: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--labeled') args.labeled = argv[++i];
    else if (a === '--takes') args.takes.push(argv[++i]);
    else if (a === '--tuning') args.tuning = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!args.labeled || !args.takes.length) {
    console.error(
      'usage: node studio/personaRows.mjs --labeled <labeled.json> --takes <file-or-dir> [--takes ...] [--tuning <tuning.json>] [--out rows.json]',
    );
    process.exit(2);
  }
  const labeled = JSON.parse(readFileSync(args.labeled, 'utf8'));
  const takes = [];
  for (const file of collectTakeFiles(args.takes)) {
    try {
      takes.push({ name: file, perf: parseTakeBytes(readFileSync(file)) });
    } catch (e) {
      console.error(`[rows] ${file}: unreadable take — skipped (${e.message})`);
      takes.push({ name: file, perf: null });
    }
  }
  const tuning = args.tuning ? JSON.parse(readFileSync(args.tuning, 'utf8')) : personaTuning();
  const artifact = buildRows(labeled, takes, tuning);
  const text = `${JSON.stringify(artifact, null, 2)}\n`;
  if (args.out) writeFileSync(args.out, text);
  else process.stdout.write(text);
  const s = artifact.summary;
  console.error(
    `[rows] ${s.takes} takes encoded (${s.droppedTakes} dropped: no matching performance), ` +
      `${s.units} rows (${s.droppedUnits} units dropped), labeled by entry: ` +
      (Object.entries(s.labeledByEntry)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ') || 'none'),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
