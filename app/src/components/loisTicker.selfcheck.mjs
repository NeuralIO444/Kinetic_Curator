// loisTicker.selfcheck.mjs — #1588: LOIS's verdict line leaves the top bar and rides her footer
// slot as a ticker, in the place the kaomoji face held. The line is loisRank's last verdict — the
// exact string the top bar showed; the tape runs it right to left (Matt, 2026-10-22), one line+divider
// unit per loop, only when that unit overflows the slot, and reduced motion settles it static.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { tickerLine, tickerMotion, TICKER_SPEED_PX_S, TICKER_DIVIDER } from './loisTicker.mjs';
import { rankLois, getLoisVerdict, clearLoisVerdict } from '../curator/loisRank.js';
const flat = (s) => s.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, ''); // layout-blind source pins (#1684): whitespace and trailing commas are Prettier's, not the code's
const fre = (re) => new RegExp(re.source.replace(/\\s[*+?]?/g, '').replace(/ /g, ''), re.flags); // the same pin as a layout-blind pattern

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const mid = {
  count: 280,
  scale: [0.7, 1.1],
  rotate: [-15, 15],
  alpha: [55, 70],
  jitter: 18,
  displacement: 10,
  density: 70,
  zTiers: 4,
  noiseSpeed: 0.6,
  noiseFreq: 0.006,
  swarmCohesion: 1.3,
  gravityWells: 0.7,
  particleCount: 140,
  damping: 0.95,
  wind: 0.45,
  breath: 0.2,
  lifeDrift: 0.25,
  flap: 0.2,
};
const outlier = {
  count: 40,
  scale: [0.15, 2.9],
  rotate: [-180, 180],
  alpha: [15, 100],
  jitter: 150,
  displacement: 150,
  density: 22,
  zTiers: 2,
  noiseSpeed: 1.9,
  noiseFreq: 0.014,
  swarmCohesion: 0.3,
  gravityWells: 0.2,
  particleCount: 55,
  damping: 0.91,
  wind: 1.9,
  breath: 0.75,
  lifeDrift: 0.85,
  flap: 0.88,
};

ok('parity: a seeded pick puts the exact top-bar string on the ticker', () => {
  clearLoisVerdict();
  assert.equal(tickerLine(), '', 'nothing said yet: no line — the slot shows her state alone');
  const pool = [...Array.from({ length: 6 }, () => ({ ...mid })), { ...outlier }];
  const ranked = rankLois(pool);
  assert.ok(ranked.verdict.length > 0, 'the seeded pool earns a verdict');
  assert.equal(tickerLine(), ranked.verdict, 'the ticker carries the pick\u2019s own line');
  assert.equal(tickerLine(), getLoisVerdict(), 'the same source the top bar read');
  clearLoisVerdict();
  assert.equal(tickerLine(), '', 'cleared: back to the state alone');
});

ok('scrolls only on overflow: a line that fits sits still', () => {
  assert.equal(tickerMotion({ textWidth: 90, slotWidth: 100 }).mode, 'static');
  assert.equal(tickerMotion({ textWidth: 100, slotWidth: 100 }).mode, 'static', 'exactly fitting is not overflowing');
  assert.equal(tickerMotion({ textWidth: 101, slotWidth: 100 }).mode, 'scroll');
});

ok('travels right to left by exactly one unit per loop, at one constant speed', () => {
  const m = tickerMotion({ textWidth: 260, slotWidth: 66 });
  assert.equal(m.from, 0, 'starts on the slot\u2019s left edge: the tape is already running, no blank frame');
  assert.equal(m.to, -260, 'ends one whole unit to the left: the wrap lands on an identical frame');
  assert.ok(m.to < m.from, 'right to left: the travel is negative');
  assert.ok(Math.abs(m.durationS - 260 / TICKER_SPEED_PX_S) < 1e-9, 'one unit over the speed');
  const longer = tickerMotion({ textWidth: 520, slotWidth: 66 });
  assert.ok(Math.abs(520 / longer.durationS - TICKER_SPEED_PX_S) < 1e-9, 'a longer line rides at the same speed');
  assert.ok(TICKER_SPEED_PX_S > 0 && TICKER_SPEED_PX_S <= 40, 'slow and readable, not a marquee');
});

ok('reduced motion settles it: static however wide the line runs', () => {
  const m = tickerMotion({ textWidth: 400, slotWidth: 66, reducedMotion: true });
  assert.equal(m.mode, 'static');
  assert.equal(m.durationS, 0, 'no travel is even described');
});

ok('unmeasured is static: nothing animates on a guess', () => {
  assert.equal(tickerMotion().mode, 'static');
  assert.equal(tickerMotion({ textWidth: 0, slotWidth: 66 }).mode, 'static');
  assert.equal(tickerMotion({ textWidth: 300, slotWidth: 0 }).mode, 'static');
});

ok('the tape: caps, blocks divide the repeats, two units carry the loop, the slot fades the run', () => {
  assert.equal(TICKER_DIVIDER, '■■■', 'solid blocks between repeats — the 80s tape\u2019s mark');
  assert.ok(
    !/\s/.test(TICKER_DIVIDER),
    'no spaces in the divider: the CSS owns its sides, so the unit the twin measures is the unit the run paints',
  );
  const pill = readFileSync(new URL('./LoisPill.jsx', import.meta.url), 'utf8');
  assert.match(pill, /TICKER_DIVIDER/, 'the pill paints the divider beside the line');
  assert.match(
    pill,
    /\{unit\(false\)\}[\s\S]{0,160}\{unit\(true\)\}/,
    'the run carries two units: the second is what the wrap lands on',
  );
  assert.match(
    pill,
    /className="lois-ticker-measure"[\s\S]{0,160}\{unit\(false\)\}/,
    'the hidden twin measures ONE unit — the width the motion maths runs on',
  );
  assert.match(pill, /'aria-hidden': 'true'/, 'the duplicate copy is aria-hidden: the verdict is said once');
  const css = readFileSync(new URL('../styles/layout.css', import.meta.url), 'utf8');
  assert.match(
    css,
    /\.lois-ticker \{[^}]*text-transform: uppercase/,
    'the line rides in caps — on the slot, so the twin measures the painted width',
  );
  assert.ok(!/\.lois-ticker-run \{[^}]*text-shadow/.test(css), 'no glow on the run (Matt, 2026-10-22: lose the bloom)');
  assert.match(
    flat(css),
    fre(/\.lois-ticker\[data-mode="scroll"\][^{]*\{[^}]*mask-image:/),
    'the running tape fades at the slot\u2019s edges',
  );
  assert.match(
    css,
    /\.lois-ticker\[data-mode="static"\] \.lois-ticker-unit \+ \.lois-ticker-unit/,
    'sitting still, the second copy is dropped: one line, one divider',
  );
});

ok('the wiring: the sentence left the top bar, the face left the slot, the record stayed', () => {
  const bar = readFileSync(new URL('../panels/layout/CuratorBar.jsx', import.meta.url), 'utf8');
  assert.ok(!/lois-verdict/.test(bar), 'no verdict sentence renders in the top bar');
  assert.ok(!/getLoisVerdict\(/.test(bar), 'the top bar no longer reads the verdict');
  const pill = readFileSync(new URL('./LoisPill.jsx', import.meta.url), 'utf8');
  assert.ok(!/lois-face|face\.face/.test(pill), 'no kaomoji renders in the slot');
  assert.match(pill, /tickerLine\(\)/, 'the pill reads the line from the ticker\u2019s source');
  assert.match(pill, /className="lois-ticker"/, 'the ticker renders in the face\u2019s place');
  const curate = readFileSync(new URL('../curator/curate.js', import.meta.url), 'utf8');
  assert.match(curate, /getLoisVerdict\(\)/, 'the tooltip record still reads the same verdict, untouched');
});

console.log(`loisTicker.selfcheck: ${n} checks passed`);
