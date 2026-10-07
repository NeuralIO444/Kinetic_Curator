// expandLabel.selfcheck.mjs — the top bar's expanding label (#1103).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { splitLabel } from './expandLabel.mjs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('splitLabel: a prefix reveals its tail (KIN → KINETIC, l → looks ▾), anything else swaps (lok → looks ▾)', () => {
  assert.deepEqual(splitLabel('KIN', 'KINETIC'), { mode: 'reveal', head: 'KIN', tail: 'ETIC', shortN: 3, fullN: 7 });
  assert.deepEqual(splitLabel('v', 'voice: overlap ▾'), { mode: 'reveal', head: 'v', tail: 'oice: overlap ▾', shortN: 1, fullN: 16 });
  assert.equal(splitLabel('voi', 'voice: off ▾').mode, 'reveal');
  const s = splitLabel('lok', 'looks ▾');
  assert.equal(s.mode, 'swap'); assert.equal(s.shortN, 3); assert.equal(s.fullN, 7);
  assert.equal(splitLabel('KIN', 'kinetic').mode, 'reveal', 'prefix matching ignores case (CSS owns case)');
  assert.equal(splitLabel('same', 'same').mode, 'swap', 'equal forms have no tail to reveal');
  assert.deepEqual(splitLabel(undefined, undefined), { mode: 'swap', head: '', tail: '', shortN: 0, fullN: 0 });
});

ok('the width of a tail is a character count: head + tail always equals the full form', () => {
  for (const [s, f] of [['KIN', 'KINETIC'], ['l', 'looks ▾'], ['v', 'voice: lois ▾'], ['voi', 'voice: lois ▾']]) {
    const p = splitLabel(s, f);
    assert.equal(p.head + p.tail, f);
    assert.equal(p.shortN + p.tail.length, p.fullN);
  }
});

ok('every expanding button opens on hover, keyboard focus AND touch; no pixel widths', () => {
  const css = read('../styles/controls.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1], body: m[2] }));
  const open = rules.filter((r) => /\.xl-(tail|swap)/.test(r.sel) && /:hover/.test(r.sel));
  assert.ok(open.length >= 3);
  for (const r of open) {
    assert.match(r.sel, /:focus-visible/, 'keyboard focus opens it');
    assert.match(r.sel, /\[data-open="true"\]/, 'a touch opens it');
    assert.ok(!/\d+px/.test(r.body), 'a width is a character count, not pixels');
  }
  assert.match(css, /prefers-reduced-motion: reduce\) \{[^}]*\.xl-tail/, 'reduced motion drops the transition');
});

ok('LOOKS, VOICE and KIN use the shared label, with the full word as the accessible name', () => {
  const bar = read('../panels/layout/CuratorBar.jsx');
  assert.match(bar, /<ExpandLabel mode="swap" short=\{looksUsed \? 'lok' : 'l'\} full="looks ▾" \/>/);
  assert.match(bar, /<ExpandLabel mode="swap" short=\{voiceUsed \? 'voi' : 'v'\}/);
  assert.match(bar, /aria-label="Looks — pick a complete layout"/);
  assert.match(bar, /aria-label=\{`Voice: \$\{activeAlias\}/);
  assert.match(bar, /onMouseLeave=\{\(\) => setLooksUsed\(true\)\}/, 'used is marked when the pointer leaves, so the cool-down animates');
  assert.ok(!/looksUsed|voiceUsed/.test(read('../state/store.js')), 'used is session state in the component, not persisted');
  const kin = read('../panels/layout/KineticButton.jsx');
  assert.match(kin, /<ExpandLabel short="KIN" full="KINETIC" tailClass="kinetic-rest" \/>/);
  const lbl = read('./ExpandLabel.jsx');
  assert.match(lbl, /aria-hidden="true"/, 'the short form is hidden from assistive tech');
  assert.ok(!/\bstyle=\{\{(?!\s*'--xl-)/.test(lbl), 'the only inline style is the character-count custom property');
});

ok('KIN keeps its heat model: nothing in kineticHeat or the cooling loop changed', () => {
  const kin = read('../panels/layout/KineticButton.jsx');
  for (const k of ['routeKineticTapHeat', 'decayHeat', 'heatLevel', "setInterval", "'--heat'"]) assert.ok(kin.includes(k), `${k} is still there`);
  const css = read('../styles/controls.css');
  assert.match(css, /min-width: calc\(48px \+ var\(--heat, 0\) \* 102px\)/, 'width is still the heat meter');
  assert.match(css, /\.kinetic-btn\[data-heat-level="hot"\] \.kinetic-rest \{ max-width: calc\(var\(--xl-tail\) \* var\(--xl-ch\)\); \}/, 'hot still holds the full word');
});

console.log(`expandLabel.selfcheck: ${n} checks passed`);
