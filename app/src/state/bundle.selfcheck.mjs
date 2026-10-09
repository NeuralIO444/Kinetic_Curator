// bundle.selfcheck.mjs — the export-everything bundle round-trips (#1051).
import assert from "node:assert";
import {
  BUNDLE_KIND,
  BUNDLE_VERSION,
  BUNDLE_PARTS,
  buildBundle,
  parseBundle,
  isBundle,
  bundleSummary,
  bundleMessage,
  bundleFilename,
  bundleConfirmLine,
  bundlePartPhrase,
  BUNDLE_APPLY_MODE,
} from "./bundle.js";

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// Sanitizers that accept anything except a marked-bad value, and tag good ones
// so we can see each part went through ITS OWN reader.
const pass = (tag) => (v) =>
  v && v.bad
    ? { ok: false, error: `${tag} is corrupt` }
    : { ok: true, value: { tag, v } };
const SAN = Object.fromEntries(BUNDLE_PARTS.map((p) => [p, pass(p)]));

const PARTS = {
  project: { seed: 7, layers: [1] },
  userPalettes: [{ id: "p1" }],
  userVoices: [{ id: "v1" }],
  favorites: [{ id: "f1" }],
  keeps: [{ id: "k1" }, { id: "k2" }],
  taste: { version: 1 },
  biology: { v: 1 },
  canvasPresets: [{ id: "mine-1" }],
};

ok("build then parse round-trips every part unchanged", () => {
  const b = buildBundle({ ...PARTS, appVersion: "0.9.0", now: 0 });
  assert.equal(b.kind, BUNDLE_KIND);
  assert.equal(b.version, BUNDLE_VERSION);
  assert.equal(b.exportedAt, "1970-01-01T00:00:00.000Z");
  const r = parseBundle(JSON.parse(JSON.stringify(b)), SAN); // through real JSON
  assert.equal(r.ok, true);
  for (const name of BUNDLE_PARTS) {
    assert.equal(r.parts[name].ok, true, name);
    assert.deepEqual(r.parts[name].value.v, PARTS[name], name);
    assert.equal(
      r.parts[name].value.tag,
      name,
      `${name} went through its own sanitizer`,
    );
  }
  assert.equal(r.appVersion, "0.9.0");
});

ok("parts that are null or absent are left out, not written as null", () => {
  const b = buildBundle({
    project: PARTS.project,
    taste: null,
    keeps: undefined,
  });
  assert.deepEqual(Object.keys(b.parts), ["project"]);
  const r = parseBundle(b, SAN);
  assert.deepEqual(Object.keys(r.parts), ["project"]);
});

ok("one corrupt part imports the rest and is named", () => {
  const b = buildBundle({ ...PARTS, favorites: { bad: true } });
  const r = parseBundle(b, SAN);
  assert.equal(r.ok, true);
  assert.equal(r.parts.favorites.ok, false);
  assert.match(r.parts.favorites.error, /favorites is corrupt/);
  assert.equal(r.parts.project.ok, true);
  assert.equal(r.parts.keeps.ok, true);
  const s = bundleSummary(r);
  assert.ok(s.good.includes("project") && !s.good.includes("favorites"));
  assert.deepEqual(
    s.bad.map((x) => x.name),
    ["favorites"],
  );
  assert.match(
    bundleMessage(s, "Imported"),
    /^Imported: .*project.*\. Skipped: favorites \(favorites is corrupt\)$/,
  );
});

ok("a sanitizer that throws is contained to its part", () => {
  const san = {
    ...SAN,
    keeps: () => {
      throw new Error("boom");
    },
  };
  const r = parseBundle(buildBundle(PARTS), san);
  assert.equal(r.ok, true);
  assert.equal(r.parts.keeps.ok, false);
  assert.equal(r.parts.keeps.error, "boom");
  assert.equal(r.parts.project.ok, true);
});

ok("a part with no reader is refused, never trusted", () => {
  const rest = { ...SAN };
  delete rest.keeps;
  const r = parseBundle(buildBundle(PARTS), rest);
  assert.equal(r.parts.keeps.ok, false);
  assert.equal(r.parts.keeps.error, "no reader for this part");
});

ok("non-bundles and unknown versions are refused and change nothing", () => {
  for (const junk of [
    null,
    undefined,
    5,
    "x",
    [],
    {},
    { kind: "other" },
    { seed: 1, layers: [] },
  ]) {
    const r = parseBundle(junk, SAN);
    assert.equal(r.ok, false);
    assert.equal(r.error, "not a KC-1 bundle");
    assert.equal(isBundle(junk), false);
  }
  const future = { ...buildBundle(PARTS), version: 3 };
  const r = parseBundle(future, SAN);
  assert.equal(r.ok, false);
  assert.match(r.error, /version 3 is not supported/);
  assert.equal(
    parseBundle({ ...buildBundle(PARTS), version: undefined }, SAN).ok,
    false,
  );
});

ok("an empty bundle, or one holding only unknown parts, is refused", () => {
  assert.equal(
    parseBundle({ kind: BUNDLE_KIND, version: 1, parts: {} }, SAN).ok,
    false,
  );
  assert.equal(
    parseBundle({ kind: BUNDLE_KIND, version: 1, parts: { mystery: 1 } }, SAN)
      .ok,
    false,
  );
  assert.equal(parseBundle({ kind: BUNDLE_KIND, version: 1 }, SAN).ok, false);
  assert.equal(
    parseBundle({ kind: BUNDLE_KIND, version: 1, parts: [1] }, SAN).ok,
    false,
  );
});

ok("unknown extra parts are ignored, known ones kept", () => {
  const b = buildBundle(PARTS);
  b.parts.mystery = { a: 1 };
  const r = parseBundle(b, SAN);
  assert.equal(r.ok, true);
  assert.equal("mystery" in r.parts, false);
});

ok("messages are plain, and the filename is stable", () => {
  const s = { good: ["project", "userPalettes"], bad: [] };
  assert.equal(bundleMessage(s, "Exported"), "Exported: project, palettes");
  assert.equal(
    bundleMessage(
      { good: [], bad: [{ name: "taste", error: "x" }] },
      "Imported",
    ),
    "Imported: nothing. Skipped: taste (x)",
  );
  assert.match(
    bundleFilename(Date.UTC(2026, 9, 5, 12, 30)),
    /^kinetic-curator-bundle-2026100\d-\d{4}\.json$/,
  );
});

// ── #1064: the confirm says what each part will DO, and the result says what landed ──
const sum = (good, bad = []) => ({ good, bad });

ok("every part has an apply mode, and only palettes merge", () => {
  assert.deepEqual(
    Object.keys(BUNDLE_APPLY_MODE).sort(),
    [...BUNDLE_PARTS].sort(),
  );
  assert.deepEqual(
    BUNDLE_PARTS.filter((p) => BUNDLE_APPLY_MODE[p] === "merge"),
    ["userPalettes"],
  );
});

ok(
  "the confirm names replaces as replaces and merges as merges, never the other way round",
  () => {
    const line = bundleConfirmLine(
      "kc.json",
      sum([
        "project",
        "userPalettes",
        "userVoices",
        "favorites",
        "keeps",
        "taste",
        "biology",
        "canvasPresets",
      ]),
    );
    assert.match(
      line,
      /^kc\.json will replace the project, voices, favorites, keeps, taste, the biology policy and canvas presets, and add palettes /,
    );
    assert.match(line, /ones you deleted since the export come back/);
    const [replaceClause, addClause] = line.split(", and add ");
    assert.ok(addClause, "there is a separate add clause");
    assert.ok(
      !/palettes/.test(replaceClause),
      "palettes are never promised as a replace",
    );
    assert.ok(/^palettes /.test(addClause), "palettes are the add");
    assert.ok(
      !/(favorites|keeps|voices|the project|taste|canvas presets)/.test(
        addClause,
      ),
      "replaces are never promised as an add",
    );
  },
);

ok(
  "the confirm copes with only replaces, only a merge, nothing readable, and lists skipped parts",
  () => {
    assert.equal(
      bundleConfirmLine("a.json", sum(["keeps"])),
      "a.json will replace keeps.",
    );
    assert.match(
      bundleConfirmLine("a.json", sum(["userPalettes"])),
      /^a\.json will add palettes \(/,
    );
    assert.equal(
      bundleConfirmLine("a.json", sum([])),
      "a.json holds nothing readable.",
    );
    const sk = bundleConfirmLine(
      "a.json",
      sum(["project"], [{ name: "taste", error: "not valid" }]),
    );
    assert.match(
      sk,
      /will replace the project\. Skipped, unreadable: taste \(not valid\)\.$/,
    );
  },
);

ok(
  "a part phrase carries what landed, a + for merges, and the number dropped",
  () => {
    assert.equal(
      bundlePartPhrase("userVoices", { kept: 5, given: 5 }),
      "voices (5)",
    );
    assert.equal(
      bundlePartPhrase("userVoices", { kept: 12, given: 30 }),
      "voices (12 of 30; 18 dropped)",
    );
    assert.equal(
      bundlePartPhrase("userPalettes", { kept: 3, given: 3 }),
      "palettes (+3)",
    );
    assert.equal(
      bundlePartPhrase("userPalettes", { kept: 3, given: 5 }),
      "palettes (+3 of 5; 2 dropped)",
    );
    assert.equal(bundlePartPhrase("project"), "project", "no count, no number");
    assert.equal(
      bundlePartPhrase("keeps", { kept: 7 }),
      "keeps (7)",
      "a count with no given is not a drop",
    );
  },
);

ok(
  "the result line reports parts that were applied AND parts that were reduced, with numbers",
  () => {
    const counts = {
      userPalettes: { kept: 3, given: 5 },
      favorites: { kept: 12, given: 12 },
      userVoices: { kept: 12, given: 30 },
    };
    const msg = bundleMessage(
      sum(["project", "userPalettes", "favorites", "userVoices"]),
      "Bundle imported",
      counts,
    );
    assert.equal(
      msg,
      "Bundle imported: project, palettes (+3 of 5; 2 dropped), favorites (12), voices (12 of 30; 18 dropped)",
    );
  },
);

ok(
  "a part whose entries were ALL refused is reported as skipped, never as imported",
  () => {
    const msg = bundleMessage(
      sum(["userPalettes", "keeps"]),
      "Bundle imported",
      { userPalettes: { kept: 0, given: 5 }, keeps: { kept: 2, given: 2 } },
    );
    assert.equal(
      msg,
      "Bundle imported: keeps (2). Skipped: palettes (none of 5 were usable)",
    );
    const none = bundleMessage(sum(["userPalettes"]), "Bundle imported", {
      userPalettes: { kept: 0, given: 5 },
    });
    assert.equal(
      none,
      "Bundle imported: nothing. Skipped: palettes (none of 5 were usable)",
    );
  },
);

ok("without counts the message is exactly the old one", () => {
  assert.equal(
    bundleMessage(sum(["project", "userPalettes"]), "Exported"),
    "Exported: project, palettes",
  );
});

ok("parseBundle carries `given` through from a reader", () => {
  const san = {
    ...SAN,
    keeps: (v) => ({ ok: true, value: v.slice(0, 1), given: v.length }),
  };
  const r = parseBundle(
    buildBundle({
      keeps: [{ id: 1 }, { id: 2 }, { id: 3 }],
      project: { seed: 1 },
    }),
    san,
  );
  assert.equal(r.parts.keeps.given, 3);
  assert.equal(r.parts.keeps.value.length, 1);
  assert.equal(
    "given" in r.parts.project,
    false,
    "a reader that reports no count adds none",
  );
});

// #1216 — the v2 envelope: hits rides top-level, v1 still reads.
ok("buildBundle writes the hits feed beside parts, omitted when null", () => {
  const feed = {
    version: 1,
    project: { seed: 1 },
    hits: [{ seed: 9 }],
    keeps: [],
  };
  const b = buildBundle({ project: { seed: 1 }, hits: feed, now: 0 });
  assert.equal(b.version, 2);
  assert.deepEqual(b.hits, feed, "the readable studio feed section");
  assert.deepEqual(Object.keys(b.parts), ["project"]);
  const bare = buildBundle({ project: { seed: 1 }, hits: null, now: 0 });
  assert.equal(
    "hits" in bare,
    false,
    "null feed is left out, not written as null",
  );
});

ok("v1 bundles (no hits section) still parse; v3 is refused", () => {
  const v1 = {
    kind: BUNDLE_KIND,
    version: 1,
    exportedAt: "",
    appVersion: "",
    parts: { project: { seed: 1 } },
  };
  const r1 = parseBundle(JSON.parse(JSON.stringify(v1)), SAN);
  assert.equal(r1.ok, true, "v1 reads");
  assert.equal("hits" in r1, false, "v1 has no feed section to carry");
  const v3 = { ...v1, version: 3 };
  const r3 = parseBundle(v3, SAN);
  assert.equal(r3.ok, false, "v3 refused");
  assert.match(r3.error, /not supported/);
});

console.log(`bundle.selfcheck: ${n} checks passed`);
