// node src/components/feedbackVisibility.selfcheck.mjs
//
// #2503 — arm-vs-apply and silent state changes: the feedback must be ON
// the surface, not in a hover tooltip or a 5px mark. Five filed findings:
//   B5  ModeStrip chips arm a roll scope; while an arm stands, the strip
//       names the pending scope in plain text ("next roll: …").
//   B6  The palette strip's 4-chip window over 37+ palettes gains ‹ ›
//       browse keys + a position readout; keys 1–4 still pick the
//       visible four, now disclosed by the readout.
//   B16 PIPELINE stage-mode / mapping / toggle buttons and the budget
//       ceiling buttons expose their pressed state (aria-pressed).
//   B24 The spectrum-marks mapping explains itself as visible text
//       under its buttons, not only in their tooltips.
//   B25 Gating reasons (RangeRow / ModeRow / ValueButton, and the
//       STIMULI response picker) render as visible panel text when the
//       control is disabled, not only in the tooltip / aria-label.
// These pins are source-shape + one pure-helper behaviour block, in the
// house style of topbarLegibility: they fail on the pre-#2503 tree for
// exactly the filed reasons.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { clampChipWindowStart, chipWindowStart } from './paletteChipWindow.mjs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const modeStrip = read('./ModeStrip.jsx');
const paletteStrip = read('./PaletteStrip.jsx');
const stageBlock = read('../panels/pipeline/StageBlock.jsx');
const budgetKnob = read('./BudgetKnob.jsx');
const spectrumMarks = read('../panels/stimulus/SpectrumMarks.jsx');
const rangeRow = read('./RangeRow.jsx');
const modeRow = read('../panels/build/te/ModeRow.jsx');
const valueButton = read('../panels/build/te/ValueButton.jsx');
const layoutSliders = read('../panels/layout/LayoutSliders.jsx');
const panelsCss = read('../styles/panels.css');
const controlsCss = read('../styles/controls.css');
const layoutCss = read('../styles/layout.css');

// ── B5: the standing arm is named on the strip ───────────────────────────
ok('B5: ModeStrip renders a plain-text scope readout while any arm stands', () => {
  assert.match(modeStrip, /className="scope-readout lbl" role="status"/, 'the readout element stands on the strip');
  assert.match(modeStrip, /next roll: \{armedNames\.join\(' \+ '\)\}/, 'it names the pending scope and when it lands');
  assert.match(
    modeStrip,
    /armedMode != null \? LAYOUT_MODES\.find\(\(m\) => m\.id === armedMode\)\?\.name/,
    'the mode name derives from the armed id, not a second source',
  );
  assert.match(
    modeStrip,
    /armedMotion != null \? MOTION_MODES\.find\(\(m\) => m\.id === armedMotion\)\?\.name/,
    'the motion name derives from the armed id, not a second source',
  );
  assert.match(panelsCss, /\.scope-readout \{/, 'the readout has a seat in the strip styles');
});

// ── B6: the palette window can be browsed, and says where it is ──────────
ok('B6: the browse clamp keeps a start inside the legal window range', () => {
  assert.strictEqual(clampChipWindowStart(37, 0, 4), 0, 'head stays head');
  assert.strictEqual(clampChipWindowStart(37, 8, 4), 8, 'a legal start stands');
  assert.strictEqual(clampChipWindowStart(37, 99, 4), 33, 'past the end clamps to the last window');
  assert.strictEqual(clampChipWindowStart(37, -5, 4), 0, 'before the head clamps to 0');
  assert.strictEqual(clampChipWindowStart(3, 2, 4), 0, 'the whole set fits → no window');
  assert.strictEqual(clampChipWindowStart(37, Number.NaN, 4), 0, 'degenerate start → 0');
  assert.strictEqual(clampChipWindowStart(37, 7.9, 4), 7, 'fractional starts floor to a chip boundary');
  // The follow law is untouched: the roll still owns the window it lands on.
  assert.strictEqual(chipWindowStart(37, 10, 4), 7, 'follow window unchanged (#952)');
});

ok('B6: PaletteStrip renders browse keys and a position readout over the chip window', () => {
  assert.match(paletteStrip, /aria-label="Previous palettes"/, 'a previous-window key stands');
  assert.match(paletteStrip, /aria-label="Next palettes"/, 'a next-window key stands');
  assert.match(paletteStrip, /className="palette-window-pos lbl"/, 'the position readout stands');
  assert.match(
    paletteStrip,
    /\{winStart \+ 1\}–\{winStart \+ visible\.length\} of \{all\.length\}/,
    'the readout names the visible span and the full set size',
  );
  assert.match(
    paletteStrip,
    /browseStart == null \? followStart : clampChipWindowStart\(all\.length, browseStart, CHIP_CAP\)/,
    'browse yields to the follow window until the performer steps it',
  );
  assert.match(
    paletteStrip,
    /browse && browse\.id === palette\.id \? browse\.start : null/,
    'a browse window is valid only for the palette it was stepped on — a new active palette re-follows the roll',
  );
  assert.match(
    paletteStrip,
    /const activeOffWindow = canBrowse && \(activeIndex < winStart \|\| activeIndex >= winStart \+ visible\.length\)/,
    'the strip knows when browsing has moved the window off the active chip',
  );
  assert.match(
    paletteStrip,
    /activeOffWindow && <> · up: \{palette\.name\}<\/>/,
    'while the active chip is off-window, the readout names the palette that is up (#952 — the strip never hides which palette the roll has on stage)',
  );
  assert.match(layoutCss, /\.palette-window-pos \{/, 'the readout has a seat in the strip styles');
});

// ── B16: selection buttons expose their pressed state ────────────────────
ok('B16: StageBlock stage-mode, mapping and toggle buttons carry aria-pressed', () => {
  assert.match(
    stageBlock,
    /aria-pressed=\{mode === m\}/,
    'stage mode (PREVIEW/FULLSCREEN/SYPHON) exposes its selection',
  );
  assert.match(stageBlock, /aria-pressed=\{mapping === mp\}/, 'stage mapping exposes its selection');
  assert.match(stageBlock, /aria-pressed=\{testPattern\}/, 'test pattern toggle exposes its state');
  assert.match(stageBlock, /aria-pressed=\{blackout\}/, 'blackout toggle exposes its state');
  assert.match(stageBlock, /aria-pressed=\{syphonOn\}/, 'syphon toggle exposes its state');
});

ok('B16: BudgetKnob ceiling buttons carry aria-pressed', () => {
  assert.match(budgetKnob, /aria-pressed=\{active\}/, 'FULL/SHOW/LEAN expose the chosen ceiling');
});

// ── B24: the spectrum mapping explains itself on the panel ───────────────
ok('B24: SpectrumMarks renders the standing mapping’s hint as visible text', () => {
  assert.match(
    spectrumMarks,
    /<div className="stim-spectrum-map-hint">\{MAP_HINT\[map\]\}<\/div>/,
    'the selected mapping’s behaviour stands under its buttons',
  );
  assert.match(panelsCss, /\.stim-spectrum-map-hint \{/, 'the hint line has a seat in the panel styles');
});

// ── B25: gating reasons render on the panel ──────────────────────────────
ok('B25: RangeRow renders its disabled reason as visible text (row + stack + bare)', () => {
  assert.match(rangeRow, /className="range-reason"/, 'the reason element exists');
  assert.match(
    rangeRow,
    /\{disabledLabel\} — \{disabledReason\}/,
    'the visible text is the same composed reason the tooltip carries',
  );
  assert.equal((rangeRow.match(/\{reasonEl\}/g) || []).length, 3, 'the row, stack and bare layouts all render it');
  assert.match(controlsCss, /\.range-reason \{/, 'the reason has a seat in the control styles');
});

ok('B25: ModeRow renders its disabled reason in both seats', () => {
  assert.match(modeRow, /className="te-mode-reason">\{disabledReason\}<\/div>/, 'the reason element exists');
  assert.equal((modeRow.match(/\{reasonEl\}/g) || []).length, 2, 'block and shelf seats both render it');
});

ok('B25: ValueButton renders its disabled reason as visible text', () => {
  assert.match(
    valueButton,
    /disabled && disabledReason && <div className="te-value-reason">\{disabledReason\}<\/div>/,
    'the reason stands under the button while gated',
  );
  assert.ok(
    valueButton.indexOf('te-value-reason') > valueButton.indexOf('te-lock'),
    'the reason renders after the lock pip, so the pip keeps its seat beside the button',
  );
  assert.match(panelsCss, /\.te-mode-reason \{/, 'the reason lines have a seat in the panel styles');
});

ok('B25: the STIMULI response picker renders its waiting-for-audio reason as visible text', () => {
  const reactivity = read('../panels/stimulus/ReactivityControls.jsx');
  assert.match(
    reactivity,
    /disabled && disabledReason && <span className="range-reason">Waiting for audio — \{disabledReason\}<\/span>/,
    'the picker speaks its gate on the panel, not only in its tooltip',
  );
});

ok('B25: the filed gating groups still pass their reasons in', () => {
  for (const reason of [
    'Needs a PATTERN layer below this one',
    'Needs an FX layer with HAZE above this one',
    'Needs an FX layer with TEAR above this one',
    'Phyllotaxis mode only',
  ]) {
    assert.ok(layoutSliders.includes(`disabledReason="${reason}"`), `LayoutSliders still gates with: ${reason}`);
  }
});

console.log(`feedbackVisibility.selfcheck: ${n} groups OK`);
