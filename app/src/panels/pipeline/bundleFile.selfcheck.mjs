// bundleFile.selfcheck.mjs — the one-file envelope's kind sniffing (#1216).
import assert from "node:assert";
import { sniffImportKind, HITS_ENVELOPE_VERSION } from "./bundleFile.js";
import { BUNDLE_KIND, BUNDLE_VERSION } from "../../state/bundle.js";
import { TASTE_KIND, TASTE_VERSION } from "../../curator/tasteHead.js";
import { FEATURES_VERSION } from "../../curator/recipeFeatures.js";

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

ok("bundle files sniff as bundle", () => {
  assert.equal(
    sniffImportKind({ kind: BUNDLE_KIND, version: BUNDLE_VERSION, parts: {} }),
    "bundle",
  );
  assert.equal(
    sniffImportKind({ kind: BUNDLE_KIND, version: 1, parts: {} }),
    "bundle",
    "v1 too",
  );
});

ok("a taste file sniffs as taste, not project", () => {
  const taste = {
    kind: TASTE_KIND,
    version: TASTE_VERSION,
    featuresVersion: FEATURES_VERSION,
    model: "m",
    dims: 1,
    trainedAt: "",
    head: { terms: { a: 1 }, num: {}, bias: 0, fidelity: 0.5 },
    labels: {},
  };
  assert.equal(sniffImportKind(taste), "taste");
});

ok("a hits envelope sniffs as hits", () => {
  const hits = {
    version: HITS_ENVELOPE_VERSION,
    project: { seed: 1 },
    hits: [{ seed: 9 }],
    keeps: [],
  };
  assert.equal(sniffImportKind(hits), "hits");
});

ok("palette arrays and single palette objects sniff as palettes", () => {
  assert.equal(sniffImportKind([{ id: "p1", swatches: ["#000"] }]), "palettes");
  assert.equal(sniffImportKind({ id: "p1", swatches: ["#000"] }), "palettes");
});

ok("a project file sniffs as project; junk is unknown", () => {
  assert.equal(sniffImportKind({ version: 1, seed: 42 }), "project");
  assert.equal(sniffImportKind({ hello: "world" }), "unknown");
  assert.equal(sniffImportKind(null), "unknown");
  assert.equal(sniffImportKind("nope"), "unknown");
});

console.log(`bundleFile.selfcheck: ${n} checks passed`);
