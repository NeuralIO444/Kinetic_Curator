/**
 * governorEventLog.selfcheck.mjs — the governor-observability gate
 * (backend hardening 5/6). Node-only.
 *
 * What it proves:
 *  A. the event log records sheds and restores with their cause: type,
 *     cut kind, shed-order step, label, and the FPS window that fired it.
 *  B. the ring buffer is bounded: it never holds more than MAX_EVENTS,
 *     oldest entries are dropped first.
 *  C. the export is well-formed JSON: schema id, timestamp, capacity,
 *     and every entry carrying the recorded fields.
 *  D. invalid events fail closed (bad type, unknown cut kind, malformed
 *     fps window throw).
 *  E. the X-ray data builder matches the cost registry: every declared
 *     pass shows up with its declared tier, measured cost from the
 *     item-3 measurements, and honest shed state (tier-1 passes marked
 *     shed exactly when perfTier1 is set — the silent-cull rule).
 *  F. the shed-step mapping follows the ladder contract (renderScale=1 …
 *     watchdog=7).
 */
import { strict as assert } from 'node:assert';
import {
  recordGovernorEvent,
  getGovernorEvents,
  clearGovernorEvents,
  exportGovernorLogJSON,
  governorEventLogSize,
  LOG_SCHEMA,
  MAX_EVENTS,
  SHED_STEPS,
  CUT_KINDS,
} from './governorEventLog.mjs';
import { buildXray } from './governorXray.mjs';
import { allCostTiers } from './costTiers.mjs';
// Import the registration sites so the registry holds the real declarations.
import './effects/fxShaders.mjs';
import './bridge/builtinEffects.mjs';
import './accum.mjs';
import './renderer.mjs';
import { MEASURED_COSTS } from './effects/measuredCosts.mjs';

function fresh() { clearGovernorEvents(); }

// --- A. shed/restore recorded with cause ------------------------------------
fresh();
const shedEv = recordGovernorEvent({
  type: 'shed',
  cutKind: 'renderScale',
  label: 'resolution → 75% (dynamic render scale)',
  fps: { at: 24, threshold: 32, sustainedMs: 1600 },
  detail: 'FPS 24 < 32 sustained 1.6s',
});
assert.equal(shedEv.type, 'shed');
assert.equal(shedEv.cutKind, 'renderScale');
assert.equal(shedEv.step, 1);
assert.equal(shedEv.label, 'resolution → 75% (dynamic render scale)');
assert.deepEqual(shedEv.fps, { at: 24, threshold: 32, sustainedMs: 1600 });
assert.match(shedEv.detail, /24/);
assert.match(shedEv.t, /^\d{4}-\d{2}-\d{2}T/);

const restoreEv = recordGovernorEvent({
  type: 'restore',
  cutKind: 'renderScale',
  label: 'resolution → 100%',
  fps: { at: 58, threshold: 32, sustainedMs: 0 },
});
assert.equal(restoreEv.type, 'restore');
assert.equal(restoreEv.step, 1);
assert.equal(governorEventLogSize(), 2);
assert.deepEqual(getGovernorEvents().map((e) => e.type), ['shed', 'restore']);

// --- B. ring buffer bounds ---------------------------------------------------
fresh();
const total = MAX_EVENTS + 60;
for (let i = 0; i < total; i++) {
  recordGovernorEvent({ type: 'shed', cutKind: 'assetThin', label: `event-${i}` });
}
const buf = getGovernorEvents();
assert.equal(buf.length, MAX_EVENTS, `buffer must cap at ${MAX_EVENTS}`);
assert.equal(buf[0].label, `event-${total - MAX_EVENTS}`, 'oldest entries dropped first');
assert.equal(buf[buf.length - 1].label, `event-${total - 1}`, 'newest entry kept');

// --- C. export format --------------------------------------------------------
fresh();
recordGovernorEvent({ type: 'shed', cutKind: 'perfTier1', label: 'mirror/gloss/ACCUM off' });
const exported = JSON.parse(exportGovernorLogJSON());
assert.equal(exported.schema, LOG_SCHEMA);
assert.match(exported.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
assert.equal(exported.count, 1);
assert.equal(exported.capacity, MAX_EVENTS);
assert.equal(exported.events.length, 1);
assert.deepEqual(
  Object.keys(exported.events[0]).sort(),
  ['cutKind', 'detail', 'fps', 'label', 'step', 't', 'type'],
);

// --- D. fail-closed ----------------------------------------------------------
fresh();
assert.throws(
  () => recordGovernorEvent({ type: 'drop', cutKind: 'renderScale' }),
  /type must be/,
);
assert.throws(
  () => recordGovernorEvent({ type: 'shed', cutKind: 'fxCull' }),
  /unknown cutKind/,
);
assert.throws(
  () => recordGovernorEvent({ type: 'shed', cutKind: 'renderScale', fps: { at: NaN, threshold: 32, sustainedMs: 0 } }),
  /fps\.at must be a finite number/,
);
assert.equal(governorEventLogSize(), 0, 'failed records must not enter the buffer');

// --- E. X-ray matches the registry ------------------------------------------
const tiers = allCostTiers();
assert.ok(tiers.length > 0, 'registry must hold declarations from the imported modules');

const quiet = buildXray({ tiers, measuredMs: MEASURED_COSTS, shed: {} });
assert.equal(quiet.passes.length, tiers.length, 'every declared pass shows up in the X-ray');
const rowById = new Map(quiet.passes.map((r) => [r.id, r]));
for (const t of tiers) {
  const row = rowById.get(t.id);
  assert.ok(row, `X-ray row missing for ${t.id}`);
  assert.equal(row.tier, t.tier, `${t.id}: tier matches registry`);
  assert.equal(row.declaredMs, t.timeMs, `${t.id}: declared estimate matches`);
  const m = MEASURED_COSTS[t.id];
  if (m !== undefined) {
    assert.equal(row.measuredMs, m.ms, `${t.id}: measured cost matches item-3 measurements`);
  } else {
    assert.equal(row.measuredMs, null, `${t.id}: no measurement recorded as null`);
  }
  // Silent-cull rule: with the governor quiet, nothing shows as shed.
  assert.equal(row.shed, false, `${t.id}: active when nothing is shed`);
}

const shedding = buildXray({ tiers, measuredMs: MEASURED_COSTS, shed: { perfTier1: true } });
for (const row of shedding.passes) {
  if (row.tier === 1) {
    assert.equal(row.shed, true, `${row.id}: tier-1 pass honestly marked shed under perfTier1`);
    assert.equal(row.shedBy, 'perfTier1 (cut 3)');
  } else {
    assert.equal(row.shed, false, `${row.id}: non-tier-1 pass never shed by perfTier1`);
  }
}
assert.equal(shedding.cuts.length, 7, 'one row per shed-ladder step');
const stepMap = new Map(shedding.cuts.map((c) => [c.cutKind, c]));
assert.equal(stepMap.get('renderScale').active, false);
assert.equal(stepMap.get('perfTier1').active, true);
const scaled = buildXray({ tiers, measuredMs: MEASURED_COSTS, shed: { renderScale: 0.5 } });
assert.equal(new Map(scaled.cuts.map((c) => [c.cutKind, c])).get('renderScale').state, '50%');

// --- F. step mapping follows the ladder contract -----------------------------
assert.deepEqual(SHED_STEPS, {
  renderScale: 1,
  quality: 2,
  perfTier1: 3,
  assetThin: 4,
  countClamp: 5,
  slowRender: 6,
  watchdog: 7,
});
assert.deepEqual([...CUT_KINDS].sort(), Object.keys(SHED_STEPS).sort());

clearGovernorEvents();
console.log('[selfcheck] governorEventLog: OK — shed/restore with cause, ring bounded, export valid, X-ray matches registry');
