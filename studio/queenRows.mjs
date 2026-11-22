// studio/queenRows.mjs — Persona Adapters A6 (#2399): labeled takes → her timing rows.
//
//   node studio/queenRows.mjs --labeled <labeled.json> --takes <file-or-dir> [--takes ...] --out <queen-rows.json>
//
// A0's labeled-takes artifact says what Matt decided; each take's rhythm record (band.rhythm,
// personas/rhythmRecord.mjs) says what she did — one timing row per turn she leaned. This
// builder joins them: one training row per leaned turn of a labeled take,
//
//   { takeSeed, features, label, weight }
//
// where features are the app's own queenTimingFeatures (the leaned turn's kind + the three sway
// sizes she used) and label/weight are the TAKE's verdict (the A6 ruling: her labels are
// take-level, both ways). The take's verdict is its ledger blanket (kept → weak-good with
// stacking; passed → bad); a take in neither ledger falls back to its intake verdict — the
// label of its last targeted unit (the keep/lock that ended its story at intake); a take with
// neither is unlabeled and contributes nothing. Takes without a valid rhythm record (the band
// off, or she never leaned) contribute no rows and are counted, never guessed at.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBandRecord, turnOf } from '../app/src/personas/bandRecord.mjs';
import { checkRhythmRecord } from '../app/src/personas/rhythmRecord.mjs';
import { queenTimingFeatures, QUEEN_TIMING_FEATURES_VERSION } from '../app/src/curator/queenTimingFeatures.mjs';
import { LABELED_TURNS_FORMAT, LABELED_TURNS_VERSION, parseTakeBytes } from './labelExtractor.mjs';

export const QUEEN_ROWS_FORMAT = 'kc-queen-rows';
export const QUEEN_ROWS_VERSION = 1;

/** The take-level verdict from a labeled take's units (see the header): { label, weight } or null. */
export function takeVerdict(lt) {
  const units = (lt && lt.units) || [];
  const blanket = units.find((u) => u.source === 'ledger-keep' || u.source === 'ledger-pass');
  if (blanket) return { label: blanket.label, weight: blanket.weight };
  const targeted = units.filter((u) => u.source === 'intake-keep' || u.source === 'intake-lock');
  if (targeted.length) {
    const last = targeted[targeted.length - 1];
    return { label: last.label, weight: last.weight };
  }
  return null;
}

/**
 * Labeled-takes artifact + takes ([{ name, perf }]) → the queen rows artifact. Pure.
 * A labeled take whose performance is missing, whose band/rhythm record fails the app's own
 * checks, or which carries no verdict is counted in the summary, never encoded.
 */
export function buildQueenRows(labeled, takes) {
  if (!labeled || labeled.format !== LABELED_TURNS_FORMAT || labeled.version !== LABELED_TURNS_VERSION)
    throw new Error(`not a ${LABELED_TURNS_FORMAT} v${LABELED_TURNS_VERSION} artifact`);
  const bySeed = new Map();
  for (const t of takes || []) {
    const rec = t && t.perf ? checkBandRecord(t.perf.band) : null;
    if (!rec) continue;
    if (!bySeed.has(rec.seed)) bySeed.set(rec.seed, []);
    bySeed.get(rec.seed).push({ name: t.name || null, perf: t.perf, rec });
  }
  const rows = [];
  let labeledTakes = 0;
  let droppedTakes = 0;
  let unleanedTakes = 0;
  for (const lt of labeled.takes || []) {
    const candidates = bySeed.get(lt.seed >>> 0) || [];
    const pick = candidates.find((c) => c.name !== null && c.name === lt.name) || candidates[0];
    const verdict = takeVerdict(lt);
    if (!pick || !verdict || verdict.weight === 0) {
      droppedTakes += 1;
      continue;
    }
    const rhythm = checkRhythmRecord(pick.perf.band && pick.perf.band.rhythm);
    if (!rhythm || !rhythm.timing.length) {
      unleanedTakes += 1;
      continue;
    }
    labeledTakes += 1;
    const kindByFrame = new Map();
    for (const row of pick.rec.turns) kindByFrame.set(row[0], turnOf(row).kind);
    for (const [frame, , enterEarlyMs, breathePct, tightMs] of rhythm.timing) {
      const kind = kindByFrame.get(frame);
      if (kind !== 'solo' && kind !== 'trade') continue; // she only ever leans those (queenLean)
      rows.push({
        takeSeed: lt.seed >>> 0,
        features: queenTimingFeatures({ kind, enterEarlyMs, breathePct, tightMs }),
        label: verdict.weight > 0 ? 1 : 0,
        weight: verdict.weight,
      });
    }
  }
  return {
    format: QUEEN_ROWS_FORMAT,
    version: QUEEN_ROWS_VERSION,
    featuresVersion: QUEEN_TIMING_FEATURES_VERSION,
    rows,
    summary: { labeledTakes, droppedTakes, unleanedTakes, rows: rows.length },
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
  const args = { labeled: null, takes: [], out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--labeled') args.labeled = argv[++i];
    else if (a === '--takes') args.takes.push(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!args.labeled || !args.takes.length) {
    console.error('usage: node studio/queenRows.mjs --labeled <labeled.json> --takes <file-or-dir> [--takes ...] [--out queen-rows.json]');
    process.exit(2);
  }
  const labeled = JSON.parse(readFileSync(args.labeled, 'utf8'));
  const takes = [];
  for (const file of collectTakeFiles(args.takes)) {
    try {
      takes.push({ name: file, perf: parseTakeBytes(readFileSync(file)) });
    } catch (e) {
      console.error(`[queen-rows] ${file}: unreadable take — skipped (${e.message})`);
      takes.push({ name: file, perf: null });
    }
  }
  const artifact = buildQueenRows(labeled, takes);
  const text = JSON.stringify(artifact, null, 1) + '\n';
  if (args.out) writeFileSync(args.out, text);
  else process.stdout.write(text);
  console.error(
    `[queen-rows] ${artifact.summary.rows} rows from ${artifact.summary.labeledTakes} labeled takes ` +
      `(${artifact.summary.unleanedTakes} unleaned, ${artifact.summary.droppedTakes} dropped)`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
