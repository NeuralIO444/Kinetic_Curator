// patternEditor.selfcheck.mjs — the PATTERN track's controls in BUILD (#1099).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { trackNumeralTitle } from './trackNumeral.mjs';
import { PATTERN_MODES, PATTERN_DENSITY_MIN, PATTERN_DENSITY_MAX } from '../../state/patternTrack.js';
const flat = (s) => s.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, ''); // layout-blind source pins (#1684): whitespace and trailing commas are Prettier's, not the code's
const fre = (re) => new RegExp(re.source.replace(/\\s[*+?]?/g, '').replace(/ /g, ''), re.flags); // the same pin as a layout-blind pattern

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const ed = read('./PatternEditor.jsx');
const stack = read('./LayerStack.jsx');

ok('the editor offers every mode and the signed range; sliders are the house RangeRow, never a native input', () => {
  for (const m of PATTERN_MODES) assert.ok(['QUILT', 'GLYPH', 'FIELD', 'READOUT'].includes(m)); // #1797 READOUT
  assert.match(ed, /PATTERN_MODES\.map\(\(m\) => \(/);
  assert.match(flat(ed), fre(/min=\{PATTERN_DENSITY_MIN\} max=\{PATTERN_DENSITY_MAX\}/));
  assert.equal(PATTERN_DENSITY_MIN, 4);
  assert.equal(PATTERN_DENSITY_MAX, 12);
  assert.ok(!/<input\b/.test(ed), 'no native <input>');
  assert.equal((ed.match(/<RangeRow\b/g) || []).length, 6, 'density, mix, grout, hero, drift, movers');
  for (const tone of ed.match(/tone="[a-z]+"/g)) assert.equal(tone, 'tone="build"', 'BUILD is yellow');
});

ok('honest UI: what a mode ignores is disabled WITH a reason, never hidden and never live', () => {
  assert.match(
    flat(ed),
    fre(
      /ariaLabel="Pattern grout" disabled=\{!quilt\} disabledLabel="Quilt only" disabledReason="only QUILT has grout"/,
    ),
  );
  assert.match(
    flat(ed),
    fre(
      /ariaLabel="Pattern hero" disabled=\{!quilt\} disabledLabel="Quilt only" disabledReason="only QUILT has hero tiles"/,
    ),
  );
  assert.match(
    ed,
    /quilt \? `\$\{\(p\.grout \* 100\)\.toFixed\(1\)\}%` : '—'/,
    'a disabled control reads a dash, not a stale number',
  );
  assert.match(ed, /setParam\(id, 'drop', !p\.drop\)/, 'DROP is shown now that it does something (#1100)');
  assert.match(ed, /DRIFT is never affected/, 'and says it never touches DRIFT');
});

ok('every control writes through the slice, which sanitizes; nothing calls the store with raw values', () => {
  // since the bus (#1457) the editor emits events; the slice setters sit behind them
  for (const ev of ['PATTERN_MODE', 'PATTERN_PARAM']) assert.match(ed, new RegExp(`Events\\.${ev}`));
  assert.match(ed, /requestPatternShuffle\(id\)/, 'SHUFFLE goes through the DROP gate, never straight to the seed');
  assert.ok(!/s\.shufflePattern/.test(ed));
  assert.match(ed, /setParam\(id, 'grout', v \/ 100\)/, 'percent in the UI, fractions in the store');
  assert.ok(!/setState|useStore\.getState/.test(ed));
});

ok('no inline style, no emoji, no hardcoded case; casing is the .act / .lbl classes', () => {
  assert.ok(!/\bstyle=/.test(ed));
  assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(ed));
  assert.ok(!/toUpperCase|toLowerCase/.test(ed), 'case is never decided in JSX (M3)');
  assert.match(ed, /className=\{`big-btn act/);
  assert.match(ed, /className=\{`chip-btn act/);
});

ok(
  'LayerStack: PATTERN in the ADD STRATUM type chooser, the whole block opens the editor, the PATCH row is hidden, a lone KC cannot be removed',
  () => {
    assert.match(
      stack,
      /ADD_TYPES = Object\.freeze\(\['content', 'fx', 'math', 'pattern'\]\)/,
      'the chooser offers PATTERN beside the other strata',
    );
    assert.match(stack, /Events\.PATTERN_ADD, \{ mode: 'QUILT' \}/);
    assert.match(flat(stack), fre(/pat \? emit\(Events\.PATTERN_SELECT, \{ id: layer\.id \}\) :/));
    assert.match(stack, /\{!adj && !pat && \(\s*<>/, 'a pattern track has no PATCH row');
    assert.match(stack, /disabled=\{isKcLayer\(layer\) && kcCount <= 1\}/);
    assert.match(stack, /const singleTrack = kcCount < 2/, 'PATCH needs a second KC track, not a second content track');
    assert.match(stack, /\{pat && isPatSelected && <PatternEditor/);
  },
);

ok('numeral titles name a PATTERN track PT', () => {
  assert.equal(trackNumeralTitle(1, 'pattern'), 'PT track 1');
  assert.equal(trackNumeralTitle(2, 'pattern', { edited: true }), 'PT track 2 — editing');
  assert.equal(trackNumeralTitle(1, 'kc'), 'KC track 1');
});

console.log(`patternEditor.selfcheck: ${n} checks passed`);
