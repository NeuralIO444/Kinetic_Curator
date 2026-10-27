// #1745 — quarantine keeps every refused document, newest first. One boot can
// quarantine the pipeline primary, its backup and the legacy key; a single slot
// kept only the last of those and lost the newest session's raw document.
import assert from 'node:assert/strict';

const store = new Map();
let quota = Infinity; // total characters the stub accepts
const used = () => [...store.values()].reduce((n, v) => n + v.length, 0);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    const s = String(v);
    if (used() - (store.get(k)?.length ?? 0) + s.length > quota) {
      const e = new Error('full');
      e.name = 'QuotaExceededError';
      throw e;
    }
    store.set(k, s);
  },
  removeItem: (k) => store.delete(k),
};

const {
  readPipelineAutosave,
  writePipelineAutosave,
  readQuarantine,
  readQuarantineAll,
  QUARANTINE_KEY,
  QUARANTINE_CAP,
  PIPELINE_KEY,
  PIPELINE_BACKUP_KEY,
  AUTOSAVE_KEY,
} = await import('./projectDocument.js');

const reset = () => {
  store.clear();
  quota = Infinity;
};

// 1. Primary, backup and legacy all unreadable: all three raws survive, newest work first.
{
  reset();
  store.set(PIPELINE_KEY, '{ primary-newest');
  store.set(PIPELINE_BACKUP_KEY, '{ backup-older');
  store.set(AUTOSAVE_KEY, '{ legacy-oldest');
  const r = readPipelineAutosave();
  assert.equal(r.doc, null);
  assert.equal(r.quarantined, true);
  const all = readQuarantineAll();
  assert.equal(all.length, 3, 'every quarantined document is kept');
  const raws = all.map((e) => e.raw);
  for (const want of ['{ primary-newest', '{ backup-older', '{ legacy-oldest']) {
    assert.ok(raws.includes(want), `kept: ${want}`);
  }
  assert.deepEqual(all.map((e) => e.source).sort(), [AUTOSAVE_KEY, PIPELINE_BACKUP_KEY, PIPELINE_KEY].sort());
  assert.equal(readQuarantine().raw, all[0].raw, 'readQuarantine is the newest entry');
  for (const k of [PIPELINE_KEY, PIPELINE_BACKUP_KEY, AUTOSAVE_KEY]) assert.equal(store.has(k), false, `${k} cleared`);
}

// 2. A later boot's quarantine does not replace an earlier, unrecovered one.
{
  reset();
  store.set(PIPELINE_KEY, '{ monday');
  readPipelineAutosave();
  store.set(PIPELINE_KEY, '{ tuesday');
  readPipelineAutosave();
  assert.deepEqual(
    readQuarantineAll().map((e) => e.raw),
    ['{ tuesday', '{ monday'],
  );
}

// 3. The list is capped, oldest dropped.
{
  reset();
  for (let i = 0; i < QUARANTINE_CAP + 2; i++) {
    store.set(PIPELINE_KEY, `{ boot-${i}`);
    readPipelineAutosave();
  }
  const raws = readQuarantineAll().map((e) => e.raw);
  assert.equal(raws.length, QUARANTINE_CAP);
  assert.equal(raws[0], `{ boot-${QUARANTINE_CAP + 1}`, 'newest kept');
  assert.ok(!raws.includes('{ boot-0'), 'oldest dropped');
}

// 4. Pre-#1745 single-object quarantine still reads, and is kept when a new one lands.
{
  reset();
  store.set(QUARANTINE_KEY, JSON.stringify({ quarantinedAt: 'x', reason: 'old', raw: '{ legacy-shape' }));
  assert.equal(readQuarantine().raw, '{ legacy-shape');
  store.set(PIPELINE_KEY, '{ new');
  readPipelineAutosave();
  assert.deepEqual(
    readQuarantineAll().map((e) => e.raw),
    ['{ new', '{ legacy-shape'],
  );
}

// 5. No room for the quarantine copy: the source key is left in place, not deleted.
{
  reset();
  store.set(PIPELINE_KEY, '{ cannot-move-me');
  quota = used(); // nothing more fits
  readPipelineAutosave();
  assert.equal(store.get(PIPELINE_KEY), '{ cannot-move-me', 'source kept when its quarantine cannot be stored');
}

// 6. An unreadable primary is not rotated over a good backup.
{
  reset();
  const good = JSON.stringify({ version: 1, doc: { version: 1, seed: 7 } });
  store.set(PIPELINE_BACKUP_KEY, good);
  store.set(PIPELINE_KEY, '{ torn');
  writePipelineAutosave({ version: 1, seed: 8 });
  assert.equal(store.get(PIPELINE_BACKUP_KEY), good, 'good backup survives a torn primary');
  // and a readable primary still rotates as before
  writePipelineAutosave({ version: 1, seed: 9 });
  assert.equal(JSON.parse(store.get(PIPELINE_BACKUP_KEY)).doc.seed, 8);
}

console.log('quarantine.selfcheck: OK (#1745 quarantine keeps every refused document)');
