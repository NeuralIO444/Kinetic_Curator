// node src/state/firewall.selfcheck.mjs
//
// #107 §1 (state firewall), §2 (life drift out of document state), and §6
// (autosave as a crash-only journal).
//
// The live instrument has to survive a poisoned document for forty minutes,
// which means three invariants:
//
//   1. Store state is ALWAYS valid. Every layoutParams write in the app —
//      sliders, presets, randomize, the governor, morph lerps, evolve targets
//      — funnels through setLayoutParam/setLayoutParams, so the check lives
//      there rather than at each call site that has to remember.
//   2. Ambient life drift never lands in that state at all. It writes to the
//      ephemeral driftOverlay slot, which is merged over layoutParams for
//      render only — never persisted, never undoable.
//   3. Boot either restores a document that parsed cleanly, or starts from
//      factory defaults and says so. There is no third option where a
//      half-understood document is applied anyway.
//
// Exercises the real slice, not a copy: createLayoutSlice is a plain
// (set) => ({...}) factory, so a four-line harness drives it without React.

import assert from 'node:assert';
import { createLayoutSlice } from './slices/layoutSlice.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

// ── Minimal store harness ──────────────────────────────────────────────────
function makeStore() {
  let state = {};
  const set = (patch) => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
  };
  state = {
    ...createLayoutSlice(set),
    activeLayerId: 'layer-1',
  };
  return {
    get: () => state,
    lp: () => state.layoutParams,
    setLayoutParam: (k, v) => state.setLayoutParam(k, v),
    setLayoutParams: (p) => state.setLayoutParams(p),
  };
}

// ── §1: structurally invalid writes are rejected, previous value kept ──────
{
  const s = makeStore();
  // Move every field OFF its default first. Otherwise "rejected, previous
  // kept" and "fell back to the default" produce the same value and the test
  // cannot tell them apart — which it could not, until this line.
  s.setLayoutParam('count', 321);
  s.setLayoutParam('mode', 'grid');
  s.setLayoutParam('scale', [0.5, 2.5]);
  const before = s.lp().count;
  assert.strictEqual(before, 321);

  for (const bad of [NaN, Infinity, -Infinity, null, undefined, '', [], {}, true]) {
    s.setLayoutParam('count', bad);
    assert.strictEqual(
      s.lp().count, before,
      `setLayoutParam('count', ${JSON.stringify(bad)}) should have been rejected, `
      + `got ${s.lp().count}`,
    );
  }
  for (const bad of ['__proto__', 'constructor', 'nope', 42, null]) {
    s.setLayoutParam('mode', bad);
    assert.strictEqual(s.lp().mode, 'grid', `mode ${bad} should be rejected, keeping 'grid'`);
  }
  for (const bad of [[null, null], ['a', 'b'], [1], 'big', null]) {
    s.setLayoutParam('scale', bad);
    assert.deepStrictEqual(s.lp().scale, [0.5, 2.5], `scale ${JSON.stringify(bad)} should be rejected`);
  }
  // A rejected write must not push an undo entry either — Ctrl-Z has to line
  // up with edits the operator actually made.
  const depth = (s.get().historyUndoStack || []).length;
  for (const bad of [NaN, null, '__proto__']) s.setLayoutParam('count', bad);
  assert.strictEqual((s.get().historyUndoStack || []).length, depth,
    'rejected writes must not create undo entries');
}

// ── §1: out-of-range but well-formed values CLAMP rather than reject ───────
// A slider past its maximum is not a bug, and refusing it would feel broken.
{
  const s = makeStore();
  s.setLayoutParam('count', 5000);
  assert.strictEqual(s.lp().count, 800, 'count should clamp to the slider maximum');
  s.setLayoutParam('count', -10);
  assert.strictEqual(s.lp().count, 10, 'count should clamp to the slider minimum');
  s.setLayoutParam('zTiers', 99.6);
  assert.strictEqual(s.lp().zTiers, 12, 'zTiers should clamp and stay integral');
  s.setLayoutParam('scale', [-5, 900]);
  assert.deepStrictEqual(s.lp().scale, [0.1, 3.0], 'range ends clamp');
  // Numeric strings still work; older projects wrote some fields that way.
  s.setLayoutParam('density', '55');
  assert.strictEqual(s.lp().density, 55);
}

// ── §1: good writes still work, and are not "hardened" into uselessness ────
{
  const s = makeStore();
  s.setLayoutParam('mode', 'grid');
  assert.strictEqual(s.lp().mode, 'grid');
  s.setLayoutParam('count', 321);
  assert.strictEqual(s.lp().count, 321);
  s.setLayoutParam('scale', [0.5, 2.5]);
  assert.deepStrictEqual(s.lp().scale, [0.5, 2.5]);
  s.setLayoutParam('mirror', true);
  assert.strictEqual(s.lp().mirror, true);
  // Reversed ranges are legitimate authoring and must survive the firewall.
  s.setLayoutParam('scale', [2.0, 0.4]);
  assert.deepStrictEqual(s.lp().scale, [2.0, 0.4], 'reversed range must survive');
}

// ── §1: clamping to the current value is not an edit ──────────────────────
// Holding a slider past its maximum sends a stream of events that all clamp
// to the same number. Each one used to produce a fresh layoutParams object.
//
// Asserting on object IDENTITY, not on undo depth: pushToUndo throttles to
// one entry per 800ms, so an undo-depth assertion passes whether or not this
// guard exists — it measures the throttle, not the guard. Identity is what
// actually matters, because a new layoutParams reference invalidates
// useCanvasItems' memo and the staged-eval cache (#108 step 4) every event.
{
  const s = makeStore();
  s.setLayoutParam('count', 800);
  const ref = s.lp();
  for (let i = 0; i < 20; i++) s.setLayoutParam('count', 900 + i);
  assert.strictEqual(s.lp().count, 800, 'stays clamped');
  assert.strictEqual(
    s.lp(), ref,
    'writes that clamp to the current value must not replace layoutParams — a new '
    + 'reference re-runs the whole placement pipeline for no visible change',
  );
  // Rejected writes must not churn the reference either.
  for (const bad of [NaN, null, '__proto__']) s.setLayoutParam('count', bad);
  assert.strictEqual(s.lp(), ref, 'rejected writes must not replace layoutParams');
}

// ── §1: bulk writes accept the good keys and keep previous for the bad ────
// This is the machine-generated path: a morph lerp or evolve target that
// produced one NaN must not discard the rest of the frame's parameters.
{
  const s = makeStore();
  s.setLayoutParam('count', 300);
  s.setLayoutParams({ jitter: 42, count: NaN, mode: 'grid', density: 91 });
  assert.strictEqual(s.lp().jitter, 42, 'good key applied');
  assert.strictEqual(s.lp().density, 91, 'good key applied');
  assert.strictEqual(s.lp().mode, 'grid', 'good key applied');
  assert.strictEqual(s.lp().count, 300, 'bad key kept its previous value');
}

// ── §1: the invariant itself — state is valid after any sequence ──────────
{
  const s = makeStore();
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
  const GARBAGE = [NaN, Infinity, null, undefined, '', [], {}, true, '__proto__', -1e9, 1e9];
  const KEYS = Object.keys(DEFAULT_LAYOUT_PARAMS);
  for (let i = 0; i < 3000; i++) {
    const key = KEYS[Math.floor(rnd() * KEYS.length)];
    const value = rnd() < 0.5
      ? GARBAGE[Math.floor(rnd() * GARBAGE.length)]
      : rnd() * 2000 - 1000;
    if (rnd() < 0.5) s.setLayoutParam(key, value);
    else s.setLayoutParams({ [key]: value });
  }
  const lp = s.lp();
  for (const [k, def] of Object.entries(DEFAULT_LAYOUT_PARAMS)) {
    if (typeof def === 'number') {
      assert.ok(Number.isFinite(lp[k]), `after fuzz, ${k} is not finite: ${lp[k]}`);
    } else if (Array.isArray(def)) {
      assert.ok(Array.isArray(lp[k]) && lp[k].length === 2 && lp[k].every(Number.isFinite),
        `after fuzz, ${k} is not a finite pair: ${JSON.stringify(lp[k])}`);
    }
  }
  assert.strictEqual({}.polluted, undefined, 'prototype was polluted');
}

// ── §2: ambient life drift never touches document state ───────────────────
// useContinuousLife used to sine-modulate jitter/displacement/noiseSpeed by
// calling setLayoutParams directly on an interval, which fought the autosave
// debounce and put machine-generated noise in the same field undo/redo
// operate on. Drift now lands in the ephemeral driftOverlay field instead —
// same treatment as audioBands/beatPulse — merged into the render path only.
{
  const s = makeStore();
  const before = s.lp();
  const undoDepth = (s.get().historyUndoStack || []).length;
  s.get().setDriftOverlay({ jitter: 999, displacement: 999, noiseSpeed: 999 });
  assert.strictEqual(s.lp(), before, 'drift overlay must not replace layoutParams');
  assert.strictEqual((s.get().historyUndoStack || []).length, undoDepth,
    'drift overlay must not push an undo entry');
  assert.deepStrictEqual(s.get().driftOverlay, { jitter: 999, displacement: 999, noiseSpeed: 999 });

  const { serializeProject } = await import('./projectDocument.js');
  const doc = serializeProject(s.get());
  assert.strictEqual(doc.driftOverlay, undefined, 'drift overlay must never be persisted');
  assert.strictEqual(doc.layoutParams.jitter, DEFAULT_LAYOUT_PARAMS.jitter,
    'drift overlay must not leak into the persisted layoutParams');
}

// ── §6: autosave is a crash-only journal ──────────────────────────────────
{
  // Stub just enough localStorage to drive the real module.
  const store = new Map();
  let failWrites = null;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (failWrites) { const e = new Error('nope'); e.name = failWrites; throw e; }
      store.set(k, String(v));
    },
    removeItem: (k) => store.delete(k),
  };

  const {
    readAutosave, writeAutosave, readQuarantine, AUTOSAVE_KEY, QUARANTINE_KEY,
  } = await import('./projectDocument.js');

  // Round trip: a good document comes back.
  const doc = {
    version: 1, seed: 0x1a4f, paletteId: 'praystation',
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, count: 321 }, quality: 'balanced',
  };
  assert.deepStrictEqual(writeAutosave(doc), { ok: true });
  const stored = JSON.parse(store.get(AUTOSAVE_KEY));
  assert.strictEqual(stored.version, 1, 'envelope carries a version');
  assert.ok(stored.savedAt, 'envelope carries savedAt');
  assert.strictEqual(readAutosave().doc.layoutParams.count, 321);
  assert.strictEqual(readAutosave().quarantined, false);

  // Unparseable JSON: quarantined, defaults booted, autosave key cleared so
  // the next boot does not fail the same way.
  store.set(AUTOSAVE_KEY, '{ not json');
  const bad = readAutosave();
  assert.strictEqual(bad.doc, null, 'must not apply a document it could not read');
  assert.strictEqual(bad.quarantined, true);
  assert.ok(readQuarantine()?.raw.includes('not json'), 'raw blob is kept for recovery');
  assert.strictEqual(store.get(AUTOSAVE_KEY), undefined, 'poison must not be retried next boot');

  // Parseable JSON that is not a valid project: same treatment.
  store.set(AUTOSAVE_KEY, JSON.stringify({ version: 99, seed: 1 }));
  const wrongVersion = readAutosave();
  assert.strictEqual(wrongVersion.doc, null);
  assert.strictEqual(wrongVersion.quarantined, true);
  assert.ok(readQuarantine().reason.includes('99'), 'quarantine records why');

  // A poisoned-but-parseable project is NOT quarantined — it is sanitized and
  // applied, which is what normalizeLayoutParams is for. Quarantine is for
  // documents we cannot read at all.
  store.set(AUTOSAVE_KEY, JSON.stringify({
    version: 1, seed: 1, paletteId: 'praystation',
    layoutParams: { mode: '__proto__', count: 1e9, jitter: null },
  }));
  const poisoned = readAutosave();
  assert.strictEqual(poisoned.quarantined, false);
  assert.strictEqual(poisoned.doc.layoutParams.mode, DEFAULT_LAYOUT_PARAMS.mode);
  assert.strictEqual(poisoned.doc.layoutParams.count, 800);

  // Legacy bare-document autosave (no envelope) still restores, or every
  // existing session would be quarantined on upgrade.
  store.set(AUTOSAVE_KEY, JSON.stringify(doc));
  assert.strictEqual(readAutosave().doc.layoutParams.count, 321, 'pre-envelope autosave still loads');

  // Quota / private mode: reported, not swallowed.
  failWrites = 'QuotaExceededError';
  assert.deepStrictEqual(writeAutosave(doc), { ok: false, error: 'quota' });
  failWrites = 'SecurityError';
  assert.deepStrictEqual(writeAutosave(doc), { ok: false, error: 'blocked' });
  failWrites = null;

  assert.ok(QUARANTINE_KEY.startsWith('kc:'), 'quarantine key is namespaced');
}

console.log('firewall.selfcheck: OK (#107 §1 state firewall, §2 drift overlay, §6 crash-only autosave)');
