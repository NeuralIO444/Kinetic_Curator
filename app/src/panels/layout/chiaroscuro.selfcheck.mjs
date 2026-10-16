// chiaroscuro.selfcheck.mjs — #1587: the CHIAROSCURO section is the one
// home for the scene-level render engine in BUILD, and the move was a
// pure relocation. #1629: in the panel that home is now JUST A BUTTON —
// no title row, no live summary, no EDIT cell; the button, labelled
// CHIAROSCURO, launches the same floating editor, unchanged. Node-only
// source invariants (the render itself is proven byte-identical by the
// parity corpus, not by this file):
//   · BUILD hosts the section; the old sun row file is gone
//   · the sun controls still speak LIGHT_SET over exactly the light keys
//   · the section emits only the events its controls always emitted
//   · the editor floats over the canvas (portal + canvas anchor + Esc),
//     with no modal machinery
//   · HUE ROTATE left AppearanceSliders; FXAA never moved (Pipeline kept it)
//   · the help copy followed the sun to its new home
//   · 2026-10-16 amendment: the field→channel map renders inside the
//     editor (below sun + hue), no longer in the §④ row — still #1204's
//     Appearance-family control
//   · 2026-10-16 amendment 2: the editor is content-sized — the panel
//     hugs its groups (no forced width/height); shelfAnchor now
//     supplies only the placement and the bound (wrap rect minus the
//     16px inset), past whose height cap the body scrolls internally
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), 'utf8');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const buildPanel = read('../BuildPanel.jsx');
const section = read('./ChiaroscuroSection.jsx');
const sun = read('./SunControls.jsx');
const map = read('./MapRow.jsx');
const appearance = read('./AppearanceSliders.jsx');
const displayBlock = read('../pipeline/DisplayBlock.jsx');
const css = read('../../styles/panels.css');
const { LIGHT_DEFAULT, LIGHT_SLOTS } = await import('../../data/light.js');
const { helpText } = await import('../../data/helpCopy.js');

ok('BUILD hosts the CHIAROSCURO button in Appearance; SunRow is gone', () => {
  assert.ok(buildPanel.includes('<ChiaroscuroSection'), 'BuildPanel renders the section');
  assert.ok(!buildPanel.includes('SunRow'), 'BuildPanel no longer references the sun row');
  assert.ok(!existsSync(join(here, 'SunRow.jsx')), 'SunRow.jsx was relocated, not duplicated');
});

ok('the sun controls speak LIGHT_SET over exactly the light keys', () => {
  for (const key of Object.keys(LIGHT_DEFAULT)) {
    assert.ok(sun.includes(`'${key}'`) || sun.includes(`{ slot:`), `sun controls cover ${key}`);
  }
  assert.ok(sun.includes('LIGHT_SLOTS'), 'sun colour stays a palette slot');
  assert.ok(LIGHT_SLOTS.length > 0);
  assert.ok(sun.includes('Events.LIGHT_SET'), 'same event as before the move');
});

ok('the section and its tenants emit only the events their controls always emitted', () => {
  const emitted = new Set(
    [...(section + sun + map).matchAll(/Events\.([A-Z_]+)/g)].map((m) => m[1]),
  );
  assert.deepStrictEqual([...emitted].sort(), ['LAYOUT_LOCK', 'LAYOUT_PARAM', 'LIGHT_SET']);
});

ok('the editor floats over the canvas — portal, canvas anchor, Esc, no modal', () => {
  assert.ok(section.includes('createPortal'), 'editor is portaled');
  assert.ok(section.includes("querySelector('.canvas-wrap')"), 'anchored to the canvas wrap');
  assert.ok(section.includes("'Escape'"), 'Esc closes');
  assert.ok(!section.includes('aria-modal'), 'no focus-trap modal semantics');
  assert.ok(!/className=\{?["'`][^"'`]*backdrop/.test(section), 'no backdrop element is rendered');
});

ok('the panel form is just a button (#1629) — no title row, no summary, no EDIT', () => {
  assert.ok(section.includes('<span className="te-cell-label">CHIAROSCURO</span>'),
    'the one button is labelled CHIAROSCURO');
  assert.equal([...section.matchAll(/aria-haspopup="dialog"/g)].length, 1,
    'exactly one editor launcher');
  for (const gone of ['chiaro-row', 'chiaro-head', 'chiaro-title', 'chiaro-summary', 'const summary']) {
    assert.ok(!section.includes(gone), `${gone} left with the section row`);
  }
  assert.ok(!/>EDIT</.test(section), 'no EDIT cell remains');
});

ok('HUE ROTATE left AppearanceSliders; FXAA never moved', () => {
  assert.ok(!appearance.includes('hueRotate'), 'hue dial is out of the appearance shelf');
  assert.ok(section.includes('hueRotate'), 'hue dial lives in the section editor');
  assert.ok(!section.includes('DISPLAY_FXAA') && !sun.includes('DISPLAY_FXAA'),
    'the section never touches the FXAA event');
  assert.ok(displayBlock.includes('Events.DISPLAY_FXAA'), 'FXAA stays in Pipeline (amendment 1)');
});

ok('the help copy followed the sun to the CHIAROSCURO button', () => {
  assert.ok(helpText('layout-sun').includes('CHIAROSCURO'), 'layout-sun names the home');
  assert.ok(helpText('layout-sun').includes('button'), 'layout-sun names the button, not the old section row');
});

ok('the field→channel map renders inside the editor, not the §④ row (2026-10-16)', () => {
  assert.ok(section.includes("from './MapRow.jsx'"), 'the section imports the map control');
  assert.ok(section.includes('<MapRow'), 'the map renders inside the floating editor');
  assert.ok(!buildPanel.includes('MapRow'), 'the §④ Appearance row no longer hosts the map');
  assert.ok(map.includes('#1204'), 'the #1204 home doctrine still rides the control');
});

ok('the editor is content-sized, bounded by the wrap minus its inset (2026-10-16, amendment 2)', () => {
  // The law: the panel hugs its content; the wrap rect minus the 16px
  // inset is only a bound (placement + caps), never the panel's size.
  assert.ok(section.includes("from '../shelfView.mjs'"), 'the bound still comes from the shelf anchor module');
  assert.ok(section.includes('shelfAnchor('), 'placement and bound computed by shelfAnchor, not a second mechanism');
  assert.ok(section.includes('maxWidth: pos.maxWidth'), 'the portal caps the width at the wrap-minus-inset bound');
  assert.ok(section.includes('maxHeight: pos.maxHeight'), 'the portal caps the height at the wrap-minus-inset bound');
  assert.ok(!section.includes('width: pos.width'), 'no forced panel width — the content sizes the panel');
  assert.ok(!section.includes('height: pos.height'), 'no forced panel height — the content sizes the panel');
  assert.ok(!section.includes('EDITOR_W'), 'the old 560px panel-width constant stays gone');
  assert.ok(/\.chiaro-editor \{[^}]*width: max-content/.test(css),
    'the panel hugs its content (width: max-content) up to the inline bound');
  assert.ok(/\.chiaro-editor-body \{[^}]*overflow-y: auto/.test(css),
    'past the height bound the body scrolls internally, never overflowing the canvas');
});

console.log(`chiaroscuro.selfcheck: ${n} checks passed`);
