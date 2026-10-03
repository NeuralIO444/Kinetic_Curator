import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { efTileFace } from './efRackTile.mjs';

test('#716 EF tile face is abbreviation + one mode word', () => {
  assert.deepEqual(efTileFace({ slot: 'EF-2' }, 'displace'), { abbr: 'WRP', word: 'warp', glyph: 'displace' });
  assert.equal(efTileFace({ slot: 'EF-4' }, null).word, 'empty');
  assert.equal(efTileFace({ slot: 'EF-4' }, null).abbr, 'FIN');
  assert.equal(efTileFace({ slot: 'EF-3' }, 'grade').word, 'grade');
  assert.equal(efTileFace({ slot: 'EF-1' }, 'halo').abbr, 'HAL');
});

test('#716 rack editor uses the tile grammar', () => {
  const jsx = readFileSync(new URL('../panels/build/LayerStack.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/panels.css', import.meta.url), 'utf8');
  assert.match(jsx, /className="ef-tile"/);
  assert.match(jsx, /className="ef-abbr"/);
  assert.match(jsx, /className="ef-bypass"/);
  assert.match(jsx, /className="ef-word"/);
  assert.match(css, /\.ef-tile \{[^}]*display:\s*grid/);
});
