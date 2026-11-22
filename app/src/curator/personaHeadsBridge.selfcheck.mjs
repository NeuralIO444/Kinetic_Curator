// node src/curator/personaHeadsBridge.selfcheck.mjs
// #2439 — the Persona Adapters boot bridge: at app start the app loads the nightly trainer's current heads
// (the canonical taste in the adapters data home) onto the loaded taste's personas section, so A1's walk
// steers with them. Matt's rulings (2026-11-21) are the contract:
//   1. the newest head loads, always — the nightly verify never gates the boot read;
//   2. a missing or unreadable store is a SILENT fallback — no trace — and damage is per entry: one bad
//      entry falls back alone, the rest still load;
//   3. boot-only — one read at start; mid-session writes land at the next launch, never between takes.
// Desktop-only: the browser build never reads (it runs with no heads, silently, per ruling 2). The overlay
// is in memory only — the app's stored taste is never rewritten by the bridge.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { personasOverlayFromStoreText, mergePersonasSection } from './personaHeadsBridge.mjs';
import { loadPersonaHeadsAtBoot, ADAPTERS_DIR, ADAPTERS_TASTE_FILE } from './personaHeadsLive.js';
import { DECISION_FEATURES_VERSION } from './decisionFeatures.mjs';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const treeHead = (features, trees, fidelity = 0.9) => ({
  kind: 'xgboost-trees',
  objective: 'binary:logistic',
  baseScore: 0,
  fidelity,
  fitOn: 240,
  features,
  trees,
});
const leafHead = (v) => treeHead(['num.heat'], [{ leaf: v }]);
const entry = (kind, head, { version = 1, labeledTurns = 240, heldOut = 0.6 } = {}) => ({
  version,
  kind,
  head,
  labeledTurns,
  heldOut,
  trainedAt: '2026-11-21T03:30:00.000Z',
  featuresVersion: DECISION_FEATURES_VERSION,
});
const storeText = (personas) => JSON.stringify({ kind: 'kc-taste', version: 1, personas });

await ok('a valid store file becomes a cleaned overlay — newest per persona per kind', () => {
  const o = personasOverlayFromStoreText(
    storeText({
      davis: { solo: { ...entry('solo', leafHead(4), { version: 3 }), junk: 'dropped' } },
      lois: { trade: entry('trade', leafHead(-2), { version: 1 }) },
    }),
  );
  assert.equal(o.davis.solo.version, 3);
  assert.equal(o.davis.solo.junk, undefined, 'entries are rebuilt from known fields only');
  assert.equal(o.lois.trade.version, 1);
});

await ok('missing, corrupt or headless store text is a silent null — no throw, no partial state', () => {
  assert.equal(personasOverlayFromStoreText('not json'), null);
  assert.equal(personasOverlayFromStoreText('{}'), null);
  assert.equal(personasOverlayFromStoreText('{"personas":{}}'), null);
  assert.equal(personasOverlayFromStoreText('[]'), null);
  assert.equal(personasOverlayFromStoreText(''), null);
});

await ok('damage is per entry: the bad ones fall back alone, the rest still load', () => {
  const o = personasOverlayFromStoreText(
    storeText({
      davis: {
        solo: entry('solo', leafHead(4)),
        trade: entry('trade', leafHead(1), { heldOut: 7 }), // heldOut out of range — damaged
      },
      carson: { solo: entry('solo', treeHead(['num.bogus'], [{ leaf: 1 }])) }, // outside the universe
      governor: { solo: entry('solo', leafHead(1)) }, // structurally impossible head
      queen: { trade: entry('trade', leafHead(1)) }, // not a head-holding seat in A1's structure
    }),
  );
  assert.deepEqual(Object.keys(o), ['davis'], 'only the healthy seat survives');
  assert.deepEqual(Object.keys(o.davis), ['solo'], 'and within it, only the healthy kind');
});

await ok('the merge: the store wins per persona per kind, the rest of the section is untouched', () => {
  const current = {
    davis: { solo: entry('solo', leafHead(1), { version: 1 }), trade: entry('trade', leafHead(2), { version: 1 }) },
    lois: { trade: entry('trade', leafHead(3), { version: 2 }) },
  };
  const overlay = { davis: { solo: entry('solo', leafHead(9), { version: 4 }) } };
  const merged = mergePersonasSection(current, overlay);
  assert.equal(merged.davis.solo.version, 4, 'the store\u2019s newer head replaces the loaded one');
  assert.equal(merged.davis.trade.version, 1, 'a kind the store does not carry stays');
  assert.equal(merged.lois.trade.version, 2, 'a seat the store does not carry stays');
  assert.equal(current.davis.solo.version, 1, 'the input section is not mutated');
  assert.equal(mergePersonasSection(current, null), current, 'no overlay, no change');
  assert.equal(mergePersonasSection(null, overlay).davis.solo.version, 4);
});

await ok('the live read: not desktop, no store, no taste — every failure is a quiet no', async () => {
  let reads = 0;
  const deps = (over) => ({
    isDesktop: () => true,
    appDataDir: async () => '/data',
    join: async (...p) => p.join('/'),
    readTextFile: async () => {
      reads++;
      return storeText({ davis: { solo: entry('solo', leafHead(4), { version: 2 }) } });
    },
    getTaste: () => ({ personas: {} }),
    overlay: () => true,
    ...over,
  });
  assert.equal((await loadPersonaHeadsAtBoot(deps({ isDesktop: () => false }))).ok, false);
  assert.equal(reads, 0, 'the browser build never reads');
  const boom = await loadPersonaHeadsAtBoot(
    deps({
      readTextFile: async () => {
        throw new Error('no such file');
      },
    }),
  );
  assert.equal(boom.ok, false, 'a missing store is a no, not a crash');
  assert.equal((await loadPersonaHeadsAtBoot(deps({ getTaste: () => null, overlay: () => false }))).ok, false);
});

await ok('the live read lands the overlay once, from the canonical path', async () => {
  let seenPath = null;
  let applied = null;
  const r = await loadPersonaHeadsAtBoot({
    isDesktop: () => true,
    appDataDir: async () => '/data',
    join: async (...p) => p.join('/'),
    readTextFile: async (p) => {
      seenPath = p;
      return storeText({ davis: { solo: entry('solo', leafHead(4), { version: 2 }) } });
    },
    getTaste: () => ({ personas: {} }),
    overlay: (o) => {
      applied = o;
      return true;
    },
  });
  assert.equal(r.ok, true);
  assert.equal(seenPath, `/data/${ADAPTERS_DIR}/${ADAPTERS_TASTE_FILE}`);
  assert.equal(applied.davis.solo.version, 2);
});

await ok('wired: App boots the bridge once; the fs allowlist can read inside $APPDATA only', () => {
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes('loadPersonaHeadsAtBoot()'), 'App.jsx calls the boot load');
  const conf = JSON.parse(readFileSync(new URL('../../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  const fs = conf.tauri.allowlist.fs;
  assert.equal(fs.readFile, true, 'readFile is enabled for the bridge');
  assert.deepEqual(fs.scope, ['$APPDATA', '$APPDATA/**'], 'and the scope stays the app data dir');
  const cargo = readFileSync(new URL('../../../src-tauri/Cargo.toml', import.meta.url), 'utf8');
  assert.ok(
    cargo.includes('"fs-read-file"'),
    'the tauri feature matches the allowlist (cargo check enforces the pair)',
  );
});

console.log(
  `personaHeadsBridge.selfcheck: ${n} checks passed (#2439 — boot bridge: newest heads at start, silent fallback)`,
);
