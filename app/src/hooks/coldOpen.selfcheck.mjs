// coldOpen.selfcheck.mjs — the top bar's cold open and its row (#1103).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { COLD_OPEN_MS, TAP_PULSE_MS, coldOpenWanted, createColdOpen } from './coldOpen.mjs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

// a clock the test moves by hand
const clock = () => {
  const q = []; let now = 0;
  return {
    setTimer: (fn, ms) => { const h = { fn, at: now + ms }; q.push(h); return h; },
    clearTimer: (h) => { const i = q.indexOf(h); if (i >= 0) q.splice(i, 1); },
    advance: (ms) => { now += ms; for (const h of [...q].sort((a, b) => a.at - b.at)) if (h.at <= now) { q.splice(q.indexOf(h), 1); h.fn(); } },
  };
};

ok('the verbs hold their full names for about two seconds, once, then cool down', () => {
  assert.ok(COLD_OPEN_MS >= 1500 && COLD_OPEN_MS <= 3000, 'long enough to read, short enough to be a flourish');
  const c = clock(); const co = createColdOpen({ ms: COLD_OPEN_MS, ...c });
  let heard = 0; const off = co.subscribe(() => { heard += 1; });
  assert.equal(co.get(), false, 'nothing before start');
  assert.equal(co.start({}), true);
  assert.equal(co.get(), true);
  c.advance(COLD_OPEN_MS - 1); assert.equal(co.get(), true, 'still open just before');
  c.advance(1); assert.equal(co.get(), false, 'cooled at COLD_OPEN_MS');
  assert.equal(heard, 2, 'subscribers hear it open and close');
  assert.equal(co.start({}), false, 'it happens once per page load, not per remount');
  c.advance(10_000); assert.equal(co.get(), false);
  off();
});

ok('someone who asked for less motion, or a stage, never sees it', () => {
  assert.equal(coldOpenWanted({}), true); assert.equal(coldOpenWanted(), true);
  assert.equal(coldOpenWanted({ reducedMotion: true }), false);
  assert.equal(coldOpenWanted({ stage: true }), false);
  for (const env of [{ reducedMotion: true }, { stage: true }]) {
    const c = clock(); const co = createColdOpen({ ms: 500, ...c });
    assert.equal(co.start(env), false); assert.equal(co.get(), false);
    assert.equal(co.start({}), false, 'and a later start does not sneak it in');
  }
});

ok('cancel closes it at once and drops the timer', () => {
  const c = clock(); const co = createColdOpen({ ms: 500, ...c });
  co.start({}); co.cancel();
  assert.equal(co.get(), false); c.advance(5000); assert.equal(co.get(), false);
});

ok('the row: START, KINETIC, L, V, CURATOR, B — in that order, with BEAT out of the palette strip', () => {
  const bar = read('../panels/layout/CuratorBar.jsx');
  const at = (re) => { const m = bar.search(re); assert.ok(m >= 0, `${re} is in CuratorBar`); return m; };
  const order = [at(/className="tb-pill start-mode-btn act"/), at(/<KineticButton \/>/), at(/<ExpandLabel mode="swap" short=\{looksUsed/), at(/<ExpandLabel mode="swap" short=\{voiceUsed/), at(/<ExpandLabel short="cur" full="curator" \/>/), at(/<BeatButton \/>/)];
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'START < KIN < L < V < CUR < B');
  assert.ok(!/BeatButton/.test(read('../components/PaletteStrip.jsx')), 'BEAT is not in the palette strip any more');
  assert.match(read('../components/BeatButton.jsx'), /<ExpandLabel short="b" full=\{`beat · \$\{bpmLabel\}`\} \/>/);
});

ok('KIN and CURATOR open on the cold open; the rest of the row does not; reduced motion is honoured in the hook', () => {
  assert.match(read('../panels/layout/KineticButton.jsx'), /data-open=\{tapOpen\.open \|\| cold \? 'true' : undefined\}/);
  const bar = read('../panels/layout/CuratorBar.jsx');
  assert.match(bar, /data-open=\{curTap\.open \|\| cold \? 'true' : undefined\}/);
  assert.ok(!/data-open=\{looksTap\.open \|\| cold/.test(bar) && !/data-open=\{voiceTap\.open \|\| cold/.test(bar), 'L and V rest as L and V');
  const hook = read('./useColdOpen.js');
  assert.match(hook, /prefers-reduced-motion: reduce/); assert.match(hook, /document\.fullscreenElement/);
});

ok('CURATOR is in capitals like the rest (the .act class does it; the source stays lowercase), and it keeps its full accessible name', () => {
  const bar = read('../panels/layout/CuratorBar.jsx');
  assert.match(bar, /className=\{`tb-pill randomize-btn xl act/);
  assert.match(bar, /aria-label="Curator — roll a taste-guided scene over the unlocked parameters"/);
  assert.ok(!/>\s*Curator\s*</.test(bar), 'no mixed-case "Curator" label left on the button');
});

ok('a press flashes the full name for about a second, then cools: the K key and every Curator roll, wherever the pointer is', () => {
  assert.ok(TAP_PULSE_MS >= 800 && TAP_PULSE_MS <= 2000 && TAP_PULSE_MS < COLD_OPEN_MS, 'a flash, shorter than the cold open');
  const kin = read('../panels/layout/KineticButton.jsx');
  assert.match(kin, /tapOpen\.pulse\(TAP_PULSE_MS\)/);
  assert.ok(kin.indexOf('tapOpen.pulse(TAP_PULSE_MS)') > kin.indexOf('const tap = () =>') && kin.indexOf('tapOpen.pulse(TAP_PULSE_MS)') < kin.indexOf('useHotkeys({ k: tap })'), 'the pulse is inside tap(), which both the click and the K key run');
  const bar = read('../panels/layout/CuratorBar.jsx');
  assert.match(bar, /on\(Events\.LAYOUT_CURATE, \(\) => \{ pulseCurator\(TAP_PULSE_MS\); curUsed\(\); \}\)/, 'subscribed to the roll event, not just the click');
  const hook = read('./useTapOpen.js');
  assert.match(hook, /const pulse = useCallback\(/); assert.match(hook, /clearTimeout\(timer\.current\);\n\s+timer\.current = setTimeout/, 'a second press restarts the flash instead of stacking timers');
  assert.match(hook, /return \(\) => clearTimeout\(timer\.current\)|useEffect\(\(\) => \(\) => clearTimeout\(timer\.current\), \[\]\)/, 'and the timer is cleaned up on unmount');
});

console.log(`coldOpen.selfcheck: ${n} checks passed`);
