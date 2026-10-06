import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { efTileFace, KIND_FACE } from './efRackTile.mjs';
import { FX_RACK, FX_EFFECT_DEFS } from './fxFilters.js';

const jsx = readFileSync(new URL('../panels/build/LayerStack.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/panels.css', import.meta.url), 'utf8');
const rule = (sel) => (css.match(new RegExp(`${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`)) || [])[1] || '';

test('#716 EF tile face is abbreviation + one mode word', () => {
  assert.deepEqual(efTileFace({ slot: 'EF-2' }, 'displace'), { abbr: 'WRP', word: 'warp' });
  assert.equal(efTileFace({ slot: 'EF-4' }, 'grain').abbr, 'GRN');
  assert.equal(efTileFace({ slot: 'EF-3' }, 'grade').word, 'grade');
  assert.equal(efTileFace({ slot: 'EF-1' }, 'halo').abbr, 'HAL');
  assert.equal(efTileFace({ slot: 'EF-4' }, null).abbr, 'FIN');
});

test('#1046 an empty slot names its family, never the bare word "empty"', () => {
  for (const slot of FX_RACK) {
    const face = efTileFace(slot, null);
    assert.notEqual(face.word, 'empty', `${slot.slot} must not read "empty"`);
    assert.equal(face.word, slot.label.toLowerCase());
  }
  assert.equal(efTileFace({ slot: 'EF-1', label: 'Blur / Focus' }, null).word, 'blur / focus');
});

test('#1046 every effect in the rack has a face, so no tile falls back to a bare kind name', () => {
  for (const slot of FX_RACK) for (const k of slot.kinds) assert.ok(KIND_FACE[k], `${k} has an EF face`);
});

test('#1046 the editor is a header strip plus controls: no glyph, no reserved rows', () => {
  assert.match(jsx, /className="ef-tile"/);
  assert.match(jsx, /className="ef-head"/);
  assert.match(jsx, /className="ef-abbr"/);
  assert.match(jsx, /className="ef-word"/);
  assert.match(jsx, /className="ef-bypass"/);
  assert.ok(!/EfGlyph/.test(jsx), 'the 28px glyph that floated in black is gone');
  assert.ok(!/ef-glyph/.test(css), 'and so is its CSS');
  const tile = rule('.ef-tile');
  assert.match(tile, /display:\s*flex/);
  assert.ok(!/grid-template-rows/.test(tile), 'no reserved grid rows: height is the content');
  assert.ok(!/min-height/.test(tile));
  assert.match(rule('.ef-head'), /min-height:\s*28px/);
});

test('#1046 an effect with almost nothing to set says so, and an empty slot offers an action', () => {
  assert.match(jsx, /no controls/);
  assert.match(jsx, /no other controls/);
  assert.match(jsx, /\+ ADD \{FX_EFFECT_DEFS\[effectiveKind\]/, 'the empty-slot button names what it adds');
  assert.ok(!/>\s*empty\s*</i.test(jsx), 'no bare "empty" text node');
  // The notes are driven by the parameter count (LayerStack: paramCount <= 1), so pin
  // WHICH effects get one. A new effect with <= 1 control must be added here on purpose.
  const countOf = (k) => Object.keys(FX_EFFECT_DEFS[k].params).length;
  const kinds = Object.keys(FX_EFFECT_DEFS);
  assert.deepEqual(kinds.filter((k) => countOf(k) === 0).sort(), ['edge', 'invert', 'solarize'], 'these read "no controls"');
  assert.deepEqual(kinds.filter((k) => countOf(k) === 1).sort(), ['grain', 'posterize', 'rgbSplit'], 'these read "no other controls"');
  assert.ok(kinds.filter((k) => countOf(k) > 1).length >= 6, 'everything else shows its sliders and no note');
});
