/**
 * governorXray.selfcheck.mjs — the X-ray provenance gate (#2492, A14).
 * Node-only.
 *
 * The defect: the pass-chain table rendered every committed cost number
 * as a "measured" value, but the measurement file mixes real sweep
 * measurements with numbers committed by hand (documented in the file's
 * own comments as "added by hand, not re-measured", derived ratios, and
 * chosen bounds). buildXray dropped the entry's `method`, so an estimate
 * was indistinguishable from a measurement — and no number showed how
 * old the sweep behind it was.
 *
 * Matt's ruling (2026-11-24, on the issue): estimates STAY in X-RAY but
 * are labeled "est."; every measured value carries its date, with the
 * age shown on the number.
 *
 * What it proves:
 *  A. classification — an entry with method 'estimate' builds a row of
 *     kind 'estimate' carrying NO measurement date or age; a swept entry
 *     (method 'wall'/'hw', or a bare number) builds kind 'measured'
 *     carrying the sweep stamp; a missing entry stays null-kind.
 *  B. age — at a fixed `now`, a measured row's age is the whole days
 *     between the stamp and now; a same-session stamp ages 0.
 *  C. the real data is honest — in the committed measuredCosts.mjs, the
 *     rows its own comments describe as hand-added / derived / chosen
 *     carry method 'estimate', and a full build over the real registry
 *     classifies every row exactly by its entry's method, with no
 *     estimate row carrying a date.
 *  D. the panel surface keeps the law — GovernorXrayPanel passes the
 *     stamp into buildXray and renders the "est." label + the age on
 *     measured numbers (source contract).
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { buildXray } from './governorXray.mjs';
import { allCostTiers } from './costTiers.mjs';
// Import the registration sites so the registry holds the real declarations.
import './effects/fxShaders.mjs';
import './bridge/builtinEffects.mjs';
import './accum.mjs';
import './renderer.mjs';
import { MEASURED_COSTS, MEASURED_AT } from './effects/measuredCosts.mjs';

const DAY = 86400000;
const STAMP = '2026-09-27T17:20:00.028Z';
const tiers = [
  { id: 't/swept', tier: 3, timeMs: 0.2, memoryBytes: 0, notes: '' },
  { id: 't/hand', tier: 3, timeMs: 0.2, memoryBytes: 0, notes: '' },
  { id: 't/bare', tier: 3, timeMs: 0.2, memoryBytes: 0, notes: '' },
  { id: 't/none', tier: 3, timeMs: 0.2, memoryBytes: 0, notes: '' },
];
const measuredMs = {
  't/swept': { ms: 0.3, method: 'wall', draws: 90 },
  't/hand': { ms: 0.3, method: 'estimate', draws: 90 },
  't/bare': 0.4,
};

// --- A. classification -------------------------------------------------------

const now = Date.parse(STAMP) + 10 * DAY;
const { passes, measuredAgeDays } = buildXray({ tiers, measuredMs, measuredAt: STAMP, now, shed: {} });
const byId = new Map(passes.map((p) => [p.id, p]));

const swept = byId.get('t/swept');
assert.equal(swept.measuredKind, 'measured', 'a swept entry is kind measured');
assert.equal(swept.measuredMs, 0.3);
assert.equal(swept.measuredAt, STAMP, 'a measured row carries the sweep date');

const hand = byId.get('t/hand');
assert.equal(hand.measuredKind, 'estimate', "an entry with method 'estimate' is kind estimate");
assert.equal(hand.measuredMs, 0.3, 'the estimate value itself still shows (ruling: estimates stay)');
assert.equal(hand.measuredAt, null, 'an estimate carries NO measurement date');
assert.equal(hand.measuredAgeDays, null, 'an estimate carries NO measurement age');

const bare = byId.get('t/bare');
assert.equal(bare.measuredKind, 'measured', 'a bare number counts as measured (older callers)');
assert.equal(bare.measuredAt, STAMP);

const none = byId.get('t/none');
assert.equal(none.measuredMs, null);
assert.equal(none.measuredKind, null, 'no entry → no kind, renders as —');
console.log('[selfcheck] A classification — estimate / measured / bare / missing kinds are exact');

// --- B. age ------------------------------------------------------------------

assert.equal(measuredAgeDays, 10, 'age is whole days from the stamp to now');
assert.equal(swept.measuredAgeDays, 10, 'the age rides on the measured row itself');
const sameSession = buildXray({ tiers, measuredMs, measuredAt: STAMP, now: Date.parse(STAMP) + 3600000, shed: {} });
assert.equal(sameSession.measuredAgeDays, 0, 'a stamp from the current session ages 0');
assert.equal(sameSession.passes.find((p) => p.id === 't/swept').measuredAgeDays, 0);
const noStamp = buildXray({ tiers, measuredMs, shed: {} });
assert.equal(noStamp.measuredAgeDays, null, 'no stamp → no age');
assert.equal(noStamp.passes.find((p) => p.id === 't/swept').measuredAgeDays, null);
console.log('[selfcheck] B age — whole days on the number; same-session is 0; no stamp is null');

// --- C. the real data is honest ----------------------------------------------

// Rows whose own comments in measuredCosts.mjs state they were added by
// hand and never swept (#1022, #1610, #2008, #2038, #1010), derived from a
// ratio (#1183), or committed at a chosen bound above the direct reading
// (#1868) — plus the row that was always marked (#1482). If a future edit
// re-marks one of these as a sweep method, the X-ray would present an
// estimate as a measurement again: fail here instead.
const HAND_ADDED = [
  'fx/sharpen',
  'fx/haze',
  'fx/dither',
  'fx/riso',
  'fx/stipple',
  'math/gain',
  'math/lift',
  'math/contrast',
  'math/saturate',
  'math/threshold',
  'math/quantize',
  'math/knee',
  'math/tempTint',
  'math/vignette',
  'math/channelMix',
  'math/hueRotate',
  'math/levelsFixed',
  'gl/contact-shadow',
  'gl/spectrum-marks',
  'beast/trails',
];
for (const id of HAND_ADDED) {
  assert.ok(MEASURED_COSTS[id], `${id}: row must exist`);
  assert.equal(
    MEASURED_COSTS[id].method,
    'estimate',
    `${id}: hand-added number must carry method 'estimate' so it never presents as measured`,
  );
}

const realTiers = allCostTiers();
assert.ok(realTiers.length > 0, 'registry must hold declarations from the imported modules');
const real = buildXray({
  tiers: realTiers,
  measuredMs: MEASURED_COSTS,
  measuredAt: MEASURED_AT,
  now: Date.parse(MEASURED_AT) + 58 * DAY,
  shed: {},
});
assert.equal(real.measuredAgeDays, 58);
for (const row of real.passes) {
  const entry = MEASURED_COSTS[row.id];
  if (!entry) {
    assert.equal(row.measuredKind, null, `${row.id}: unmeasured stays null-kind`);
    continue;
  }
  const expectKind = entry.method === 'estimate' ? 'estimate' : 'measured';
  assert.equal(row.measuredKind, expectKind, `${row.id}: kind follows the entry method (${entry.method})`);
  if (expectKind === 'estimate') {
    assert.equal(row.measuredAt, null, `${row.id}: estimate carries no date`);
    assert.equal(row.measuredAgeDays, null, `${row.id}: estimate carries no age`);
  } else {
    assert.equal(row.measuredAt, MEASURED_AT, `${row.id}: measured carries the sweep date`);
    assert.equal(row.measuredAgeDays, 58, `${row.id}: measured carries its age`);
  }
}
console.log(
  `[selfcheck] C real data — ${HAND_ADDED.length} hand-added rows marked estimate; ` +
    `${real.passes.length} rows classified by method, estimates dateless`,
);

// --- D. the panel surface keeps the law ---------------------------------------

const panelSrc = readFileSync(new URL('../panels/GovernorXrayPanel.jsx', import.meta.url), 'utf8');
assert.ok(panelSrc.includes('measuredAt: MEASURED_AT'), 'panel passes the sweep stamp into buildXray');
assert.ok(panelSrc.includes("measuredKind === 'estimate'"), 'panel branches on the estimate kind');
assert.ok(panelSrc.includes('ms est.'), 'panel renders the "est." label on estimate numbers');
assert.ok(panelSrc.includes('measuredAgeDays'), 'panel renders the age on measured numbers');
assert.ok(panelSrc.includes('working set (est.)'), 'working-set column is labeled as the estimate it is');
console.log('[selfcheck] D panel — stamp wired in; est. label, age, and (est.) column all rendered');

console.log('[selfcheck] governorXray: OK — estimates labeled, measurements dated, age on the number');
