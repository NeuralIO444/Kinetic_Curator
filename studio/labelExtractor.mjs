#!/usr/bin/env node
// studio/labelExtractor.mjs — Persona Adapters A0 (#2393): takes + keep ledger → labeled turns.
//
//   node studio/labelExtractor.mjs --takes <file-or-dir> [--takes ...] --ledgers <dir> [--out labeled.json]
//
// The band learns from Matt's acts, never from persona opinions (spec A3, docs/design/persona-adapters-spec.md).
// This extractor runs on the Mac Studio, never in the app: it reads take records (the P7 band section, #2387)
// and the taste ledgers (keeps.jsonl / passes.jsonl, #1173) and emits one versioned labeled-turns artifact —
// the training contract A2's trainer consumes. No `personas` section is written anywhere; taste.json is not
// touched.
//
// The labeling rules are A3 as amended by Matt's six rulings on #2393 (2026-11-20), which override the spec's
// original timing reading wherever they differ:
//
//   1. Keep target — an in-take keep (a band `yield` turn, why:'keep') labels the solo it ended as `good`: the
//      decision that STARTED that solo (its origin, below), however many phrases the solo had stood.
//   2. Pass / skip / re-roll — take-level, from the seed join to the ledgers: a take whose seed's latest ledger
//      verdict is a pass has every decision `bad`. Ledger rows are timestamped; the latest verdict wins, and a
//      keep rescues a pass only when it is strictly LATER (ruling 2's wording). Resolver input logs are never
//      mined for seed changes.
//   3. Kept take — the same seed join: latest verdict a keep → `weak-good` on every decision. Repeated keeps
//      STACK: each keep row for the seed strengthens the weak positive (the ladder below). A seed in neither
//      ledger leaves every decision `unlabeled` — silence never counts against a persona.
//   4. Undo is folded into lock: a `yield` why:'lock' labels the overridden move `strong-bad`, and that one
//      signal serves A3's whole lock-or-undo clause. No undo record is required or read.
//   5. Granularity — labels are PER ANSWER. A solo row and a cut row label their single move; inside a trade
//      row every answer [by, verdict, move] is labeled individually, because A2 trains per persona per
//      decision kind and the label unit is the decision, not the row.
//   6. Values — every labeled decision carries the word AND the weight side by side: the word keeps the turn
//      human-auditable, the weight is what the trainer eats.
//
// A decision's ORIGIN is the decision that started the solo it belongs to: a `solo` row starts its own solo; a
// trade whose answers hand the solo over (owner ≠ caller) starts the new solo at the counter answer that took
// it; a trade the caller keeps leaves the origin untouched. A keep or lock yield aims at the standing solo, so
// it labels that solo's origin decision.
//
// Precedence, strongest first: a targeted in-take label (keep → good, lock → strong-bad) beats the take-level
// ledger blanket for the one decision it aims at; every other decision takes the blanket. Persona verdicts
// inside a trade (agree / disagree / lay out) are NEVER labels — they are the decisions being labeled.
import { gunzipSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkBandRecord, turnOf } from '../app/src/personas/bandRecord.mjs';
import { parseLedger } from '../app/src/curator/tasteLedger.js';

export const LABELED_TURNS_FORMAT = 'kc-labeled-turns';
export const LABELED_TURNS_VERSION = 1;

/**
 * The weight ladder (ruling 6), faithful to A3's strength ordering:
 * strong-bad (-2) outweighs bad (-1); good (+1) outweighs weak-good; weak-good stacks per keep row
 * (+0.25 each) and is capped at +0.75, so no number of ledger keeps ever makes a blanket label as
 * strong as a deliberate in-take keep. Unlabeled is 0 — present in the artifact, weightless in training.
 */
export const LABEL_LADDER = Object.freeze({
  good: 1,
  weakGoodPerKeep: 0.25,
  weakGoodCap: 0.75,
  bad: -1,
  strongBad: -2,
  unlabeled: 0,
});

/** The stacked weak-positive weight for a seed kept `keepCount` times (0 keeps → 0). */
export function weakGoodWeight(keepCount) {
  const n = Number.isInteger(keepCount) && keepCount > 0 ? keepCount : 0;
  return Math.min(LABEL_LADDER.weakGoodPerKeep * n, LABEL_LADDER.weakGoodCap);
}

const timeOf = (row) => {
  const t = Date.parse(row && row.timestamp);
  return Number.isFinite(t) ? t : -Infinity; // an unparseable stamp can never be the latest word
};

/**
 * The ledger verdict per seed, from parsed ledger rows: { verdict: 'keep' | 'pass', keepCount, passCount }.
 * Latest timestamp wins; a keep wins only when strictly later than the latest pass (ruling 2). Counts are
 * per seed across both ledgers — keepCount is what weak-good stacking reads.
 */
export function verdictsFromRows(keepsRows, passesRows) {
  const bySeed = new Map();
  const bump = (seed, kind, t) => {
    let e = bySeed.get(seed);
    if (!e) {
      e = { keepCount: 0, passCount: 0, keepTime: -Infinity, passTime: -Infinity };
      bySeed.set(seed, e);
    }
    if (kind === 'keep') {
      e.keepCount += 1;
      if (t > e.keepTime) e.keepTime = t;
    } else {
      e.passCount += 1;
      if (t > e.passTime) e.passTime = t;
    }
  };
  for (const r of keepsRows || []) if (r && Number.isInteger(r.seed)) bump(r.seed >>> 0, 'keep', timeOf(r));
  for (const r of passesRows || []) if (r && Number.isInteger(r.seed)) bump(r.seed >>> 0, 'pass', timeOf(r));
  const out = new Map();
  for (const [seed, e] of bySeed) {
    out.set(seed, {
      verdict: e.keepTime > e.passTime ? 'keep' : 'pass',
      keepCount: e.keepCount,
      passCount: e.passCount,
    });
  }
  return out;
}

/**
 * The verdict map from raw ledger text, parsed by the app's own ledger reader (tasteLedger.js): an
 * off-schema or corrupt line is skipped WITH a warning there, never silently. Returns { verdicts, skipped }.
 */
export function verdictsFromLedgers(keepsText, passesText, warn) {
  const keeps = parseLedger(keepsText ?? '', warn);
  const passes = parseLedger(passesText ?? '', warn);
  return { verdicts: verdictsFromRows(keeps.rows, passes.rows), skipped: keeps.skipped + passes.skipped };
}

// The take-level blanket every decision starts from (rulings 2 + 3); a targeted in-take label overrides it.
function blanketFor(entry) {
  if (!entry) return { label: 'unlabeled', weight: LABEL_LADDER.unlabeled, source: 'none' };
  if (entry.verdict === 'keep') {
    return { label: 'weak-good', weight: weakGoodWeight(entry.keepCount), source: 'ledger-keep' };
  }
  return { label: 'bad', weight: LABEL_LADDER.bad, source: 'ledger-pass' };
}

/**
 * One take → its labeled decisions, or null when the take has no valid band section (a take made with the
 * band off, or a section that fails the app's own check — fail closed, exactly as playback treats it).
 * `entry` is the seed's ledger verdict (verdictsFromRows value) or undefined when the seed is in neither
 * ledger. Units come out in turn order; a trade contributes one unit per answer.
 */
export function labelTake(perf, entry) {
  const rec = perf && typeof perf === 'object' ? checkBandRecord(perf.band) : null;
  if (!rec) return null;
  const blanket = blanketFor(entry);
  const units = [];
  let origin = null; // the unit that started the standing solo — what a keep/lock yield aims at
  rec.turns.forEach((row, turnIndex) => {
    const [frame, phrase] = row;
    const turn = turnOf(row);
    if (turn.kind === 'solo') {
      const u = { turn: turnIndex, frame, phrase, kind: 'solo', by: turn.by, move: 'solo' };
      units.push(u);
      origin = u;
    } else if (turn.kind === 'cut') {
      units.push({ turn: turnIndex, frame, phrase, kind: 'cut', by: turn.by, move: 'cut', target: turn.target });
      origin = null;
    } else if (turn.kind === 'trade') {
      const mine = turn.answers.map((a, answerIndex) => {
        const u = {
          turn: turnIndex,
          answer: answerIndex,
          frame,
          phrase,
          kind: 'trade',
          by: a.by,
          verdict: a.verdict,
          move: a.move,
        };
        units.push(u);
        return u;
      });
      if (turn.owner === null) origin = null; // a cut answer ended the solo; it starts nothing
      else if (turn.owner !== turn.by) origin = mine[turn.answers.findIndex((a) => a.by === turn.owner)] || null;
      // owner === caller: the solo stands as it was — the origin is untouched.
    } else if (turn.kind === 'yield') {
      if (origin) {
        origin.targeted =
          turn.why === 'lock'
            ? { label: 'strong-bad', weight: LABEL_LADDER.strongBad, source: 'intake-lock' }
            : { label: 'good', weight: LABEL_LADDER.good, source: 'intake-keep' };
      }
      origin = null;
    } else if (turn.kind === 'out') {
      origin = null;
    }
    // 'in' starts no solo and labels nothing; governor in/out rows carry no move, so they are never units.
  });
  for (const u of units) {
    const t = u.targeted || blanket;
    u.label = t.label;
    u.weight = t.weight;
    u.source = t.source;
    delete u.targeted;
  }
  return {
    seed: rec.seed,
    verdict: entry ? entry.verdict : 'none',
    keepCount: entry ? entry.keepCount : 0,
    passCount: entry ? entry.passCount : 0,
    units,
  };
}

/**
 * The versioned labeled-turns artifact from parsed takes ([{ name, perf }]) and the ledger verdict map.
 * Takes with no valid band section are counted in `skipped`, never labeled. Pure: same inputs, same artifact.
 */
export function extractLabels(takes, verdicts) {
  const out = { format: LABELED_TURNS_FORMAT, version: LABELED_TURNS_VERSION, ladder: { ...LABEL_LADDER }, takes: [] };
  const byLabel = { good: 0, 'weak-good': 0, bad: 0, 'strong-bad': 0, unlabeled: 0 };
  let skipped = 0;
  let unitCount = 0;
  for (const t of takes || []) {
    const perf = t && t.perf;
    const seed = perf && typeof perf === 'object' && perf.band ? perf.band.seed >>> 0 : undefined;
    const labeled = labelTake(perf, seed !== undefined ? verdicts.get(seed) : undefined);
    if (!labeled) {
      skipped += 1;
      continue;
    }
    out.takes.push({ name: t.name || null, ...labeled });
    unitCount += labeled.units.length;
    for (const u of labeled.units) byLabel[u.label] += 1;
  }
  out.summary = { takes: out.takes.length, skipped, units: unitCount, byLabel };
  return out;
}

/** One take file's bytes → the performance object (.kcperf is gzip of JSON; a .json take is plain). */
export function parseTakeBytes(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const text = buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  return JSON.parse(text);
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
  const args = { takes: [], ledgers: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--takes') args.takes.push(argv[++i]);
    else if (a === '--ledgers') args.ledgers = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!args.takes.length || !args.ledgers) {
    console.error('usage: node studio/labelExtractor.mjs --takes <file-or-dir> [--takes ...] --ledgers <dir> [--out labeled.json]');
    process.exit(2);
  }
  const takes = [];
  for (const file of collectTakeFiles(args.takes)) {
    try {
      takes.push({ name: file, perf: parseTakeBytes(readFileSync(file)) });
    } catch (e) {
      console.error(`[labels] ${file}: unreadable take — skipped (${e.message})`);
      takes.push({ name: file, perf: null });
    }
  }
  const readLedger = (name) => {
    const p = join(args.ledgers, name);
    if (!existsSync(p)) {
      console.error(`[labels] ${p}: no such ledger — read as empty`);
      return '';
    }
    return readFileSync(p, 'utf8');
  };
  const { verdicts, skipped } = verdictsFromLedgers(readLedger('keeps.jsonl'), readLedger('passes.jsonl'), (m) =>
    console.error(m),
  );
  const artifact = extractLabels(takes, verdicts);
  const text = `${JSON.stringify(artifact, null, 2)}\n`;
  if (args.out) writeFileSync(args.out, text);
  else process.stdout.write(text);
  const s = artifact.summary;
  console.error(
    `[labels] ${s.takes} takes labeled, ${s.skipped} skipped (no valid band section), ${skipped} ledger lines skipped; ` +
      `${s.units} decisions: ${s.byLabel.good} good, ${s.byLabel['weak-good']} weak-good, ${s.byLabel.bad} bad, ` +
      `${s.byLabel['strong-bad']} strong-bad, ${s.byLabel.unlabeled} unlabeled`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
