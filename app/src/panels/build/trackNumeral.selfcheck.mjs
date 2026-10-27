import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { trackNumeral, trackNumeralTitle } from './trackNumeral.mjs';
const flat = (s) => s.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, ''); // layout-blind source pins (#1684): whitespace and trailing commas are Prettier's, not the code's
const fre = (re) => new RegExp(re.source.replace(/\\s[*+?]?/g, '').replace(/ /g, ''), re.flags); // the same pin as a layout-blind pattern

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
  assert.equal(trackNumeralTitle(2, 'pattern', { edited: true }), 'PT track 2 — editing'); // #1099
});

test('#716 numeral tile heads every LayerStack row and inverts when edited', () => {
  const jsx = readFileSync(new URL('./LayerStack.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../styles/panels.css', import.meta.url), 'utf8');
  assert.match(jsx, /function TrackNumeral/);
  assert.equal(
    (jsx.match(/<TrackNumeral[\s/>]/g) || []).length,
    1,
    'one shared row renderer — no ghost rows (mockup C, #1014 rebuild)',
  );
  assert.match(
    flat(jsx),
    fre(/edited=\{math \? isMathSelected : fx \? isFxSelected : pat \? isPatSelected : isActive\}/),
  ); // #1099: a PATTERN row inverts when its editor is open
  assert.match(css, /\.track-numeral \{[^}]*background:\s*#0a0a0a/);
  assert.match(css, /\.track-numeral \{[^}]*color:\s*#f4f4f4/);
  assert.match(css, /\.track-numeral-edited \{[^}]*background:\s*#f4f4f4/);
  assert.match(css, /\.track-numeral-edited \{[^}]*color:\s*#0a0a0a/);
});
