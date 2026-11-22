// personaRollback.selfcheck.mjs — #2397 (A4): the DEV readout's rollback, mirroring the trainer's
// rules (A2 Q5) over the same store files. Restore-exactly or refuse-and-touch-nothing; past v1 the
// entry is removed and empty shells pruned; the history record is the trainer's shape; the taste is
// written in the canonical form; the live half writes taste first and logs only what landed.
import assert from 'node:assert';
import { planRollback, canonicalStringify, historyLine, rollbackTimestamp } from './personaRollback.mjs';
import { rollbackPersonaHead } from './personaRollbackLive.js';

let n = 0;
const ok = (name, fn) => {
  const r = fn();
  if (r && typeof r.then === 'function')
    return r.then(() => {
      n++;
      console.log(`  [ok] ${name}`);
    });
  n++;
  console.log(`  [ok] ${name}`);
};

import { DECISION_FEATURES_VERSION } from './decisionFeatures.mjs';
const leafHead = (v) => ({
  kind: 'xgboost-trees',
  objective: 'binary:logistic',
  baseScore: 0,
  fidelity: 0.9,
  fitOn: 240,
  features: ['num.heat'],
  trees: [{ leaf: v }],
});
const entry = (version, over = {}) => ({
  version,
  kind: 'solo',
  head: leafHead(1),
  labeledTurns: 240,
  heldOut: 0.5,
  trainedAt: '2026-11-20T03:30:00.000Z',
  featuresVersion: DECISION_FEATURES_VERSION,
  ...over,
});
const TS = '2026-11-21T12:00:00Z';

await ok('rollback restores the previous version artifact exactly', () => {
  const prior = entry(2);
  const taste = { format: 'kc-taste/1', personas: { davis: { solo: entry(3) } } };
  const r = planRollback(taste, 'davis', 'solo', JSON.stringify(prior), TS);
  assert.equal(r.ok, true);
  assert.deepEqual(taste.personas.davis.solo, prior);
  assert.deepEqual(r.record, { ts: TS, action: 'rollback', id: 'davis', kind: 'solo', fromVersion: 3, toVersion: 2 });
});

await ok('past version 1 the entry is removed and empty shells are pruned', () => {
  const taste = { format: 'kc-taste/1', personas: { lois: { trade: entry(1, { kind: 'trade' }) } } };
  const r = planRollback(taste, 'lois', 'trade', null, TS);
  assert.equal(r.ok, true);
  assert.equal(r.record.toVersion, null);
  assert.equal('personas' in taste, false);
});

await ok('a refusal touches nothing: no entry, malformed entry, bad artifact', () => {
  const t1 = { personas: { davis: {} } };
  assert.equal(planRollback(t1, 'davis', 'solo', null, TS).ok, false);
  const bad = entry(2, { heldOut: 2 });
  const t2 = { personas: { davis: { solo: bad } } };
  const before = JSON.stringify(t2);
  assert.equal(planRollback(t2, 'davis', 'solo', JSON.stringify(entry(1)), TS).ok, false);
  assert.equal(JSON.stringify(t2), before);
  const t3 = { personas: { davis: { solo: entry(3) } } };
  assert.equal(planRollback(t3, 'davis', 'solo', JSON.stringify(entry(1)), TS).ok, false); // wrong version
  assert.equal(planRollback(t3, 'davis', 'solo', 'not json', TS).ok, false);
  assert.equal(planRollback(t3, 'davis', 'solo', null, TS).ok, false);
  assert.equal(t3.personas.davis.solo.version, 3);
});

await ok('canonical form: sorted keys, indent 1; history line: sorted keys, one line', () => {
  assert.equal(canonicalStringify({ b: 1, a: { d: 2, c: 3 } }), '{\n "a": {\n  "c": 3,\n  "d": 2\n },\n "b": 1\n}');
  assert.equal(
    historyLine({ ts: TS, action: 'rollback', id: 'davis', kind: 'solo', fromVersion: 3, toVersion: 2 }),
    '{"action":"rollback","fromVersion":3,"id":"davis","kind":"solo","toVersion":2,"ts":"2026-11-21T12:00:00Z"}\n',
  );
  assert.equal(rollbackTimestamp(new Date('2026-11-21T12:00:00.123Z')), TS);
});

// ── the live half over a fake desktop fs ──
function fakeDesktop(files) {
  const store = new Map(Object.entries(files));
  return {
    store,
    deps: {
      isDesktop: () => true,
      appDataDir: async () => '/data/com.neuralio.kc',
      join: async (...parts) => parts.join('/'),
      readTextFile: async (p) => {
        if (!store.has(p)) throw new Error(`missing: ${p}`);
        return store.get(p);
      },
      writeTextFile: async (p, text) => store.set(p, text),
      now: () => TS,
    },
  };
}
const TASTE_PATH = '/data/com.neuralio.kc/adapters/taste.json';
const ART_PATH = '/data/com.neuralio.kc/adapters/persona-heads/davis/solo/v2.json';
const HIST_PATH = '/data/com.neuralio.kc/adapters/persona-heads/history.jsonl';

await ok('live: writes the restored taste canonically, then appends the history record', async () => {
  const taste = { format: 'kc-taste/1', personas: { davis: { solo: entry(3) } }, note: 'kept' };
  const { store, deps } = fakeDesktop({
    [TASTE_PATH]: JSON.stringify(taste),
    [ART_PATH]: JSON.stringify(entry(2)),
    [HIST_PATH]: '{"earlier":true}\n',
  });
  const r = await rollbackPersonaHead('davis', 'solo', deps);
  assert.equal(r.ok, true);
  const written = JSON.parse(store.get(TASTE_PATH));
  assert.equal(written.personas.davis.solo.version, 2);
  assert.equal(written.note, 'kept');
  assert.equal(store.get(TASTE_PATH), canonicalStringify(written));
  assert.equal(store.get(HIST_PATH), '{"earlier":true}\n' + historyLine(r.record));
});

await ok('live: a missing artifact refuses before any write; the browser refuses outright', async () => {
  const taste = { personas: { davis: { solo: entry(3) } } };
  const { store, deps } = fakeDesktop({ [TASTE_PATH]: JSON.stringify(taste) });
  const r = await rollbackPersonaHead('davis', 'solo', deps);
  assert.equal(r.ok, false);
  assert.equal(store.get(TASTE_PATH), JSON.stringify(taste));
  assert.equal(store.has(HIST_PATH), false);
  const web = await rollbackPersonaHead('davis', 'solo', { ...deps, isDesktop: () => false });
  assert.equal(web.ok, false);
});

console.log(`personaRollback.selfcheck: ${n} checks passed`);
