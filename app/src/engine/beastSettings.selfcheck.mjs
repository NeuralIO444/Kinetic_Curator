// beastSettings.selfcheck.mjs — the beast's roam/trace and Davis's role deal as settings: defaults add nothing, every
// switch and dial maps to the document field the engine already reads, junk is clamped (engine/beastSettings.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BEAST_SETTING_DEFAULTS,
  BEAST_SETTING_RANGES,
  sanitizeBeastSettings,
  beastDocFields,
} from './beastSettings.mjs';
import { sanitizeRoam } from './beastRoam.js';
import { sanitizeTrace } from './beastTrace.js';
import { helpText } from '../data/helpCopy.js';

const ok = (name, fn) => {
  fn();
  console.log(`  [ok] ${name}`);
};
const HERE = dirname(fileURLToPath(import.meta.url));

ok('default settings add no document field — an untouched instrument builds the contract it always built', () => {
  assert.deepEqual(beastDocFields(BEAST_SETTING_DEFAULTS), {});
  assert.deepEqual(beastDocFields(undefined), {});
  assert.deepEqual(beastDocFields({}), {});
  assert.deepEqual(beastDocFields('junk'), {});
});

ok('the defaults ARE the engine defaults (they cannot drift from the ruled tuning)', () => {
  assert.equal(BEAST_SETTING_DEFAULTS.turnGain, sanitizeRoam(null).turnGain);
  const t = sanitizeTrace(null);
  assert.deepEqual(
    [BEAST_SETTING_DEFAULTS.traceAlpha, BEAST_SETTING_DEFAULTS.traceFade, BEAST_SETTING_DEFAULTS.traceCount],
    [t.alpha, t.fade, t.count],
  );
});

ok('the switches map to the A/B document fields', () => {
  assert.deepEqual(beastDocFields({ roam: false }), { beastRoam: false });
  assert.deepEqual(beastDocFields({ trace: false }), { beastTrace: false });
  assert.deepEqual(beastDocFields({ davisRoleDeal: false }), { davisRoleDeal: false });
  assert.deepEqual(Object.keys(beastDocFields({ roam: false, trace: false, davisRoleDeal: false })).sort(), [
    'beastRoam',
    'beastTrace',
    'davisRoleDeal',
  ]);
});

ok('a dial rides only its own changed value, and the engine reads it back', () => {
  assert.deepEqual(beastDocFields({ turnGain: 0.8 }), { beastRoam: { turnGain: 0.8 } });
  assert.equal(sanitizeRoam(beastDocFields({ turnGain: 0.8 }).beastRoam).turnGain, 0.8);
  assert.deepEqual(beastDocFields({ traceFade: 20 }), { beastTrace: { fade: 20 } });
  assert.deepEqual(beastDocFields({ traceAlpha: 0.7, traceCount: 12 }), { beastTrace: { alpha: 0.7, count: 12 } });
  const tr = sanitizeTrace(beastDocFields({ traceAlpha: 0.7, traceFade: 20, traceCount: 12 }).beastTrace);
  assert.deepEqual([tr.alpha, tr.fade, tr.count], [0.7, 20, 12]);
});

ok('a switch off wins over its dials (off is off)', () => {
  assert.deepEqual(beastDocFields({ roam: false, turnGain: 0.9 }), { beastRoam: false });
  assert.deepEqual(beastDocFields({ trace: false, traceFade: 2 }), { beastTrace: false });
});

ok('junk clamps to the range, booleans stay strict, unknown keys drop', () => {
  const s = sanitizeBeastSettings({
    turnGain: 9,
    traceAlpha: -3,
    traceFade: 'x',
    traceCount: 99.6,
    roam: 'no',
    trace: 0,
    extra: 1,
  });
  assert.equal(s.turnGain, 1);
  assert.equal(s.traceAlpha, 0);
  assert.equal(s.traceFade, BEAST_SETTING_DEFAULTS.traceFade, 'non-numeric falls back');
  assert.equal(s.traceCount, 24, 'count clamps then rounds');
  assert.equal(s.roam, true, 'a non-boolean never flips a switch');
  assert.equal(s.trace, true);
  assert.ok(!('extra' in s));
  for (const [k, r] of Object.entries(BEAST_SETTING_RANGES))
    assert.ok(r.min < r.max && BEAST_SETTING_DEFAULTS[k] >= r.min && BEAST_SETTING_DEFAULTS[k] <= r.max, k);
});

ok(
  'wiring: the loop spreads the fields into the contract doc, the panels carry the controls, every control has hover copy',
  () => {
    const loop = readFileSync(join(HERE, '..', 'gl', 'liveLoop.mjs'), 'utf8');
    assert.match(loop, /\.\.\.beastDocFields\(s\.beastSettings\)/);
    const wet = readFileSync(join(HERE, '..', 'panels', 'WetLab.jsx'), 'utf8');
    assert.match(wet, /<BeastSettings \/>/);
    const dav = readFileSync(join(HERE, '..', 'panels', 'DavisPanel.jsx'), 'utf8');
    assert.match(dav, /<DavisRoleDealSwitch \/>/);
    for (const id of [
      'beast-roam',
      'beast-turn',
      'beast-trace',
      'beast-trace-ink',
      'beast-trace-fade',
      'beast-trace-count',
      'davis-role-deal',
    ])
      assert.ok(helpText(id).length > 20, `help copy for ${id}`);
  },
);

console.log('[selfcheck] beastSettings: 7 cases passed');
