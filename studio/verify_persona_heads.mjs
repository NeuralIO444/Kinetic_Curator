// verify_persona_heads — the node-side gate for A2's trained persona heads (#2395).
//
// Loads a taste.json the trainer wrote, the rows it trained on, and the trainer's report, and
// proves the shipped artifact through the APP's own evaluators (app/src/curator/tasteHead.js),
// not a mirror:
//   (a) validateTaste(raw).ok === true, and a present `personas` section survives
//       validatePersonasSection whole (A1's all-or-nothing law);
//   (b) for every shipped entry in the report, the taste entry matches the report's version,
//       labeledTurns and heldOut;
//   (c) the JS tree walk (scoreTreeHeadWith) over the report's held-out rows reproduces the
//       trainer's Python spec-walk scores, and the Spearman of those scores against the label
//       weights reproduces the entry's stamped heldOut — the head the app walks is the head the
//       trainer judged, on the slice the trainer judged it on (Q2/Q4);
//   (d) prints which shipped heads steeringHeads actually admits (A1's earn-in gate), so a
//       shipped-but-sub-gate head is visible as shipped-but-silent, never as steering.
//
//   node studio/verify_persona_heads.mjs --taste <taste.json> --rows <rows.json>
//       --report <report.json> [--tol 1e-6]
//
// Exit 0 = pass; exit 1 = a named failure.
import { readFileSync } from "node:fs";
import {
  scoreTreeHeadWith,
  steeringHeads,
  validatePersonasSection,
  validateQueenTimingSection,
  validateTaste,
  validateVoiceSection,
} from "../app/src/curator/tasteHead.js";
import { validateRelationsSection } from "../app/src/personas/chemistry.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const tastePath = opt("--taste", null);
const rowsPath = opt("--rows", null);
const reportPath = opt("--report", null);
const TOL = Number(opt("--tol", "1e-6"));

const fail = (msg) => {
  console.error(`verify_persona_heads: FAIL — ${msg}`);
  process.exit(1);
};
if (!tastePath || !rowsPath || !reportPath)
  fail(
    "usage: --taste <taste.json> --rows <rows.json> --report <report.json> [--tol 1e-6]",
  );
const readJson = (p, what) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    fail(`cannot read ${what} at ${p}: ${e.message}`);
  }
};

/** Average ranks (ties share the mean rank) — curator.py spearman's ranking, mirrored. */
function ranks(xs) {
  const order = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(xs.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k][1]] = avg;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation; 0 when either side is constant (curator.spearman's law). */
function spearman(a, b) {
  if (a.length !== b.length || a.length < 2) return 0;
  const ra = ranks(a);
  const rb = ranks(b);
  const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < a.length; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb);
    va += (ra[i] - ma) ** 2;
    vb += (rb[i] - mb) ** 2;
  }
  if (va === 0 || vb === 0) return 0;
  return cov / Math.sqrt(va * vb);
}

const rawTaste = readJson(tastePath, "taste");
const rowsArtifact = readJson(rowsPath, "rows");
const report = readJson(reportPath, "report");

const v = validateTaste(rawTaste);
if (!v.ok) fail(`validateTaste rejected the trainer's taste.json: ${v.error}`);
const taste = v.taste;
if (
  rawTaste.personas !== undefined &&
  validatePersonasSection(rawTaste.personas) === null
)
  fail("the personas section does not survive validatePersonasSection");
if (
  rawTaste.relations !== undefined &&
  validateRelationsSection(rawTaste.relations) === null
)
  fail("the relations section does not survive validateRelationsSection");
if (
  rawTaste.queenTiming !== undefined &&
  validateQueenTimingSection(rawTaste.queenTiming) === null
)
  fail("the queenTiming section does not survive validateQueenTimingSection");
if (
  rawTaste.voice !== undefined &&
  validateVoiceSection(rawTaste.voice) === null
)
  fail("the voice section does not survive validateVoiceSection");
if (!rowsArtifact || rowsArtifact.format !== "kc-persona-rows")
  fail("rows artifact is not kc-persona-rows");
if (!report || report.format !== "kc-persona-train-report")
  fail("report is not kc-persona-train-report");

const rows = rowsArtifact.rows || [];
let checked = 0;
for (const e of report.entries || []) {
  if (e.verdict !== "shipped") continue;
  const entry =
    taste.personas && taste.personas[e.id] && taste.personas[e.id][e.kind];
  if (!entry)
    fail(
      `${e.id}|${e.kind}: report says v${e.version} shipped but taste.json has no such entry`,
    );
  if (entry.version !== e.version)
    fail(
      `${e.id}|${e.kind}: taste carries v${entry.version}, the report shipped v${e.version}`,
    );
  if (entry.labeledTurns !== e.labeledTurns)
    fail(
      `${e.id}|${e.kind}: labeledTurns mismatch — taste ${entry.labeledTurns}, report ${e.labeledTurns}`,
    );
  if (Math.abs(entry.heldOut - e.heldOut) > 1e-9)
    fail(
      `${e.id}|${e.kind}: heldOut mismatch — taste ${entry.heldOut}, report ${e.heldOut}`,
    );
  const entryRows = rows.filter((r) => r.id === e.id && r.kind === e.kind);
  const heldIdx = e.heldOutRows || [];
  const pyScores = e.pythonScores || [];
  if (!heldIdx.length || heldIdx.length !== pyScores.length)
    fail(
      `${e.id}|${e.kind}: the report carries no held-out slice to verify against`,
    );
  const jsScores = heldIdx.map((i) => {
    const row = entryRows[i];
    if (!row)
      fail(
        `${e.id}|${e.kind}: held-out row index ${i} is outside the entry's rows`,
      );
    return scoreTreeHeadWith(entry.head, row.features);
  });
  for (let k = 0; k < jsScores.length; k++) {
    const denom = Math.max(1, Math.abs(pyScores[k]));
    if (Math.abs(jsScores[k] - pyScores[k]) / denom > TOL)
      fail(
        `${e.id}|${e.kind}: JS walk ${jsScores[k]} != Python walk ${pyScores[k]} on held-out row ${heldIdx[k]}`,
      );
  }
  const rho = spearman(
    jsScores,
    heldIdx.map((i) => entryRows[i].weight),
  );
  if (Math.abs(rho - entry.heldOut) > 1e-6)
    fail(
      `${e.id}|${e.kind}: JS Spearman ${rho} does not reproduce the stamped heldOut ${entry.heldOut}`,
    );
  checked++;
  console.log(
    `verify_persona_heads: ${e.id}|${e.kind} v${entry.version} — ${heldIdx.length} held-out rows, ` +
      `JS walk == Python walk, heldOut ${entry.heldOut.toFixed(4)} reproduced`,
  );
}

const bundle = steeringHeads(taste);
const admitted = bundle
  ? Object.entries(bundle).flatMap(([id, kinds]) =>
      Object.keys(kinds).map((k) => `${id}|${k}`),
    )
  : [];
console.log(
  `verify_persona_heads: PASS — ${checked} shipped entr${checked === 1 ? "y" : "ies"} verified; ` +
    `steeringHeads admits: ${admitted.length ? admitted.join(", ") : "(none — earn-in gate)"}`,
);
