import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { trackNumeral, trackNumeralTitle } from './trackNumeral.mjs';

test('#1016 track numerals: all arabic, roman retired', () => {
  assert.equal(trackNumeral(1, 'kc'), '1');
  assert.equal(trackNumeral(2, 'kc'), '2');
  assert.equal(trackNumeral(3, 'kc'), '3');
  assert.equal(trackNumeral(4, 'kc'), '4');
  assert.equal(trackNumeral(1, 'fx'), '1');
  assert.equal(trackNumeral(4, 'fx'), '4');
  assert.equal(trackNumeral(2, 'math'), '2');
  assert.equal(trackNumeral(0, 'kc'), '');
  assert.equal(trackNumeralTitle(2, 'kc', { edited: true }), 'KC track 2 — editing');
  assert.equal(trackNumeralTitle(3, 'fx', { ghost: true }), 'FX 3 — tap to arm');
});

test('#716 numeral tile heads every LayerStack row and inverts when edited', () => {
  const jsx = readFileSync(new URL('./LayerStack.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../styles/panels.css', import.meta.url), 'utf8');
  assert.match(jsx, /function TrackNumeral/);
  assert.equal((jsx.match(/<TrackNumeral /g) || []).length, 1, 'one shared row renderer — no ghost rows (mockup C, #1014 rebuild)');
  assert.match(jsx, /edited=\{math \? isMathSelected : fx \? isFxSelected : isActive\}/);
  assert.match(css, /\.track-numeral \{[^}]*background:\s*#0a0a0a/);
  assert.match(css, /\.track-numeral \{[^}]*color:\s*#f4f4f4/);
  assert.match(css, /\.track-numeral-edited \{[^}]*background:\s*#f4f4f4/);
  assert.match(css, /\.track-numeral-edited \{[^}]*color:\s*#0a0a0a/);
});
