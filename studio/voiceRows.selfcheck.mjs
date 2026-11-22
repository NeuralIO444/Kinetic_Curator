// voiceRows.selfcheck — Persona Adapters A7 (#2400): labeled takes → voice rows.
//
//   node studio/voiceRows.selfcheck.mjs
//
// The laws under test: one row per line-MOMENT where today's selection would fire a SIGNED
// line, carrying the app's own voiceFeatures over that candidate line and the TAKE's verdict
// (queenRows.takeVerdict: the ledger blanket first, the intake verdict as fallback, nothing
// for an unlabeled take). With the shipped copy matrix — every line unsigned — the builder
// honestly emits zero rows: takes with verdicts but no signed-line moments are counted as
// silent, never encoded.
import assert from "node:assert/strict";
import { buildVoiceRows, VOICE_ROWS_FORMAT } from "./voiceRows.mjs";
import {
  LABELED_TURNS_FORMAT,
  LABELED_TURNS_VERSION,
} from "./labelExtractor.mjs";
import { HORN_LINES } from "../app/src/curator/hornLines.mjs";

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const TURNS = [
  [0, 0, "in", "governor", null],
  [0, 0, "solo", "davis", { len: 4, cap: 0.5 }],
  [
    100,
    1,
    "trade",
    "davis",
    {
      answers: [
        ["carson", "agree", "build"],
        ["greiman", "disagree", "counter"],
      ],
      owner: "greiman",
      len: 4,
      cap: 0.5,
    },
  ],
  [
    200,
    2,
    "trade",
    "greiman",
    { answers: [["lois", "disagree", "cut"]], owner: null },
  ],
  [300, 3, "out", "governor", null],
];
const take = (seed) => ({
  name: `take-${seed}.json`,
  perf: {
    format: "kc-performance",
    version: 3,
    frames: 400,
    band: { version: 1, seed, turns: TURNS },
  },
});
const unit = (source, label, weight) => ({
  turn: 1,
  frame: 0,
  phrase: 0,
  kind: "solo",
  by: "davis",
  label,
  weight,
  source,
});
const labeled = (takes) => ({
  format: LABELED_TURNS_FORMAT,
  version: LABELED_TURNS_VERSION,
  takes,
});
const SIGNED = HORN_LINES.map((l) => ({ ...l, signed: true }));

ok(
  "one row per signed-line moment, carrying the take verdict and the candidate line",
  () => {
    const art = buildVoiceRows(
      labeled([
        {
          seed: 7,
          name: "take-7.json",
          units: [unit("ledger-keep", "weak-good", 0.5)],
        },
      ]),
      [take(7)],
      SIGNED,
    );
    assert.equal(art.format, VOICE_ROWS_FORMAT);
    assert.equal(art.featuresVersion, 1);
    assert.deepEqual(art.summary, {
      labeledTakes: 1,
      droppedTakes: 0,
      silentTakes: 0,
      rows: 3,
    });
    assert.deepEqual(
      art.rows.map((r) => [
        r.id,
        r.features.line,
        r.features.ctx,
        r.features.to,
      ]),
      [
        ["carson", "H01", "agree", "davis"],
        ["greiman", "H07", "disagree", "davis"],
        ["greiman", "H10", "cut", "lois"],
      ],
    );
    for (const r of art.rows) {
      assert.equal(r.takeSeed, 7);
      assert.equal(r.label, 1, "a kept take labels its moments good");
      assert.equal(r.weight, 0.5);
      assert.deepEqual(r.features.num, {});
    }
  },
);

ok(
  "a passed take labels its moments bad; an unlabeled take contributes nothing",
  () => {
    const art = buildVoiceRows(
      labeled([
        {
          seed: 8,
          name: "take-8.json",
          units: [unit("ledger-pass", "bad", -1)],
        },
        { seed: 9, name: "take-9.json", units: [] },
      ]),
      [take(8), take(9)],
      SIGNED,
    );
    assert.equal(art.summary.rows, 3);
    assert.equal(
      art.summary.droppedTakes,
      1,
      "the unlabeled take is dropped, counted",
    );
    assert.ok(
      art.rows.every(
        (r) => r.label === 0 && r.weight === -1 && r.takeSeed === 8,
      ),
    );
  },
);

ok(
  "the shipped table is all-unsigned: zero rows, honestly — the take counts as silent",
  () => {
    const art = buildVoiceRows(
      labeled([
        {
          seed: 7,
          name: "take-7.json",
          units: [unit("ledger-keep", "weak-good", 0.5)],
        },
      ]),
      [take(7)],
    );
    assert.deepEqual(art.summary, {
      labeledTakes: 1,
      droppedTakes: 0,
      silentTakes: 1,
      rows: 0,
    });
  },
);

ok(
  "a wrong artifact raises; a missing take is dropped, never guessed at",
  () => {
    assert.throws(
      () => buildVoiceRows({ format: "nope", version: 1, takes: [] }, []),
      /not a kc-labeled-turns/,
    );
    const art = buildVoiceRows(
      labeled([
        {
          seed: 42,
          name: "take-42.json",
          units: [unit("ledger-keep", "weak-good", 0.5)],
        },
      ]),
      [],
      SIGNED,
    );
    assert.deepEqual(art.summary, {
      labeledTakes: 0,
      droppedTakes: 1,
      silentTakes: 0,
      rows: 0,
    });
  },
);

console.log(`voiceRows.selfcheck: ${n} checks passed`);
