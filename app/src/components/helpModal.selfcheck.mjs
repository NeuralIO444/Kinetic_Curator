// helpModal.selfcheck.mjs — the Help modal (#1043): every look lives in CSS, the About tab
// carries the signed content, and the modal CSS honors the design system's flat rules.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ABOUT_TITLE, ABOUT_LINKS, ABOUT_BIO } from '../data/aboutCopy.mjs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const jsx = read('./HotkeyOverlay.jsx');
const css = read('../styles/panels.css').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
const hot = rules.filter((r) => /\.hotkey-/.test(r.sel) && !/^@/.test(r.sel));

ok('no inline style anywhere in the modal component', () => {
  assert.ok(!/\bstyle=/.test(jsx), 'HotkeyOverlay.jsx must not carry style=');
});

ok('four tabs: help, keys, settings, about; the old close glyph and emoji are gone', () => {
  assert.match(jsx, /const TABS = \['help', 'keys', 'settings', 'about'\]/);
  assert.ok(!jsx.includes('✕'), 'the close glyph is ×');
  assert.ok(jsx.includes('>×<'));
  assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(jsx + read('../data/aboutCopy.mjs')), 'no emoji');
  assert.ok(jsx.includes('Replay the tour'), 'the tour replay stays');
});

ok('About carries the signed content: name, mailto email, https links with noopener', () => {
  assert.equal(ABOUT_TITLE, 'Kinetic Curator by Matt Ciaglia');
  assert.deepEqual(ABOUT_LINKS.map((l) => [l.label, l.href]), [
    ['website', 'https://www.mattciaglia.com/'],
    ['email', 'mailto:neural_io_444@icloud.com'],
    ['instagram', 'https://www.instagram.com/prismthief'],
    ['github', 'https://github.com/NeuralIO444'],
    ['blockwalk', 'https://blockwalk.io'],
  ]);
  assert.ok(ABOUT_BIO.length >= 1);
  assert.match(jsx, /target: '_blank', rel: 'noopener noreferrer'/);
  assert.match(jsx, /l\.href\.startsWith\('https:'\)/, 'only https links open a new tab; the mailto does not');
});

ok('LOIS rationing: the About tab spends no voice-1 line', () => {
  assert.ok(!/LOIS_LINES/.test(jsx));
});

ok('card: width in viewport percent, capped to the viewport, 90vh with internal scroll; rows and tabs are 44px', () => {
  const card = hot.find((r) => r.sel === '.hotkey-card')?.body || '';
  assert.match(card, /width:\s*70vw/);
  assert.match(card, /max-width:\s*92vw/);
  assert.match(card, /max-height:\s*90vh/);
  assert.match(card, /font-size:\s*clamp\(/, 'type scales with the card');
  assert.match(hot.find((r) => r.sel === '.hotkey-row')?.body || '', /min-height:\s*44px/);
  assert.match(hot.find((r) => r.sel === '.hotkey-link')?.body || '', /min-height:\s*44px/);
  assert.match(hot.find((r) => r.sel === '.hotkey-tabs .chip-btn')?.body || '', /min-height:\s*44px/);
  assert.match(hot.find((r) => r.sel === '.hotkey-list')?.body || '', /overflow-y:\s*auto/);
});

ok('flat: no box-shadow, no radius, no gradient in the modal rules; the one blur is the scrim (recorded exception)', () => {
  for (const r of hot) {
    assert.ok(!/box-shadow|border-radius|gradient/.test(r.body), `${r.sel} is not flat`);
    if (/backdrop-filter/.test(r.body)) assert.equal(r.sel, '.hotkey-overlay', `${r.sel} blurs`);
  }
  assert.ok(/\.hotkey-overlay \{[^}]*backdrop-filter: blur\(4px\)/.test(read('../styles/panels.css').replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.match(read('../styles/panels.css'), /recorded exception to DESIGN_SYSTEM\.md §1\.4/, 'the exception is written next to the blur');
});

ok('modal spacing stays on the 2/4/6/8/12/16/24 scale', () => {
  const ON = new Set([0, 2, 4, 6, 8, 12, 16, 24]);
  for (const r of hot) {
    for (const m of r.body.matchAll(/(?:^|[;\s])(?:gap|padding|margin)(?:-[a-z]+)?\s*:\s*([^;]+);/g)) {
      for (const v of m[1].match(/(?<![\d.])\d+(?:\.\d+)?px/g) || []) assert.ok(ON.has(parseFloat(v)), `${r.sel}: ${v} is off the scale`);
    }
  }
});

console.log(`helpModal.selfcheck: ${n} checks passed`);
