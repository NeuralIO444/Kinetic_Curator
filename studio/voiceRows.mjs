// studio/voiceRows.mjs — Persona Adapters A7 (#2400): labeled takes → voice rows.
//
//   node studio/voiceRows.mjs --labeled <labeled.json> --takes <file-or-dir> [--takes ...] --out <voice-rows.json>
//
// A0's labeled-takes artifact says what Matt decided about each take; each take's band record
// (personas/bandRecord.mjs) says what the band played. This builder joins them: for every
// labeled take, it replays the take's band turns through the app's own moment logic
// (hornLines.turnMoments) and, for each moment, asks what TODAY's selection would say
// (hornLines.lineFor). Every moment where a SIGNED line would fire yields one training row,
//
//   { id, takeSeed, features, label, weight }
//
// where id is the horn, features are the app's own voiceFeatures over the candidate line
// (the line today's selection picked — the moment's baseline candidate), and label/weight are
// the TAKE's verdict (queenRows.takeVerdict: the ledger blanket, else the last intake
// verdict; a take with neither is unlabeled and contributes nothing). The ruling on #2400:
// the chooser trains on labeled line-moments in kept vs passed takes, per persona.
//
// With the shipped copy matrix (every line UNSIGNED) lineFor never fires, so this honestly
// emits zero rows — the machinery ships dark until Matt signs lines and labels accumulate,
// exactly as A1's rows did before labels existed. Counted, never guessed at.
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBandRecord, turnOf } from "../app/src/personas/bandRecord.mjs";
import {
  HORN_LINES,
  lineFor,
  turnMoments,
} from "../app/src/curator/hornLines.mjs";
import {
  voiceFeatures,
  VOICE_FEATURES_VERSION,
} from "../app/src/curator/voiceFeatures.mjs";
import {
  LABELED_TURNS_FORMAT,
  LABELED_TURNS_VERSION,
  parseTakeBytes,
} from "./labelExtractor.mjs";
import { takeVerdict } from "./queenRows.mjs";

export const VOICE_ROWS_FORMAT = "kc-voice-rows";
export const VOICE_ROWS_VERSION = 1;

/**
 * Labeled-takes artifact + takes ([{ name, perf }]) → the voice rows artifact. Pure.
 * A labeled take whose performance is missing, whose band record fails the app's own
 * checks, or which carries no verdict is counted in the summary, never encoded. A take
 * with a verdict but no signed-line moment is counted as silent.
 */
export function buildVoiceRows(labeled, takes, lines = HORN_LINES) {
  if (
    !labeled ||
    labeled.format !== LABELED_TURNS_FORMAT ||
    labeled.version !== LABELED_TURNS_VERSION
  )
    throw new Error(
      `not a ${LABELED_TURNS_FORMAT} v${LABELED_TURNS_VERSION} artifact`,
    );
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
  let silentTakes = 0;
  for (const lt of labeled.takes || []) {
    const candidates = bySeed.get(lt.seed >>> 0) || [];
    const pick =
      candidates.find((c) => c.name !== null && c.name === lt.name) ||
      candidates[0];
    const verdict = takeVerdict(lt);
    if (!pick || !verdict || verdict.weight === 0) {
      droppedTakes += 1;
      continue;
    }
    labeledTakes += 1;
    let takeRows = 0;
    for (const row of pick.rec.turns) {
      const turn = turnOf(row);
      for (const m of turnMoments(turn)) {
        const line = lineFor(m.persona, m.ctx, m.to, lines);
        if (!line) continue; // no signed line fits — silence trains nothing (ruling 3)
        rows.push({
          id: m.persona,
          takeSeed: lt.seed >>> 0,
          features: voiceFeatures({ line: line.id, ctx: m.ctx, to: m.to }),
          label: verdict.weight > 0 ? 1 : 0,
          weight: verdict.weight,
        });
        takeRows += 1;
      }
    }
    if (!takeRows) silentTakes += 1;
  }
  return {
    format: VOICE_ROWS_FORMAT,
    version: VOICE_ROWS_VERSION,
    featuresVersion: VOICE_FEATURES_VERSION,
    rows,
    summary: { labeledTakes, droppedTakes, silentTakes, rows: rows.length },
  };
}

function collectTakeFiles(paths) {
  const files = [];
  for (const p of paths) {
    if (!existsSync(p)) throw new Error(`--takes path not found: ${p}`);
    if (statSync(p).isDirectory()) {
      for (const name of readdirSync(p).sort()) {
        if (/\.kcperf$/i.test(name) || /\.json$/i.test(name))
          files.push(join(p, name));
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
    if (a === "--labeled") args.labeled = argv[++i];
    else if (a === "--takes") args.takes.push(argv[++i]);
    else if (a === "--out") args.out = argv[++i];
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!args.labeled || !args.takes.length) {
    console.error(
      "usage: node studio/voiceRows.mjs --labeled <labeled.json> --takes <file-or-dir> [--takes ...] [--out voice-rows.json]",
    );
    process.exit(2);
  }
  const labeled = JSON.parse(readFileSync(args.labeled, "utf8"));
  const takes = [];
  for (const file of collectTakeFiles(args.takes)) {
    try {
      takes.push({ name: file, perf: parseTakeBytes(readFileSync(file)) });
    } catch (e) {
      console.error(
        `[voice-rows] ${file}: unreadable take — skipped (${e.message})`,
      );
      takes.push({ name: file, perf: null });
    }
  }
  const artifact = buildVoiceRows(labeled, takes);
  const text = JSON.stringify(artifact, null, 1) + "\n";
  if (args.out) writeFileSync(args.out, text);
  else process.stdout.write(text);
  console.error(
    `[voice-rows] ${artifact.summary.rows} rows from ${artifact.summary.labeledTakes} labeled takes ` +
      `(${artifact.summary.silentTakes} silent, ${artifact.summary.droppedTakes} dropped)`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main(process.argv.slice(2));
