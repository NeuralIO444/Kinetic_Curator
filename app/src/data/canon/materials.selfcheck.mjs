// materials.selfcheck.mjs — creature PAINT P1 (#2338; spec creature-paint-drive §1.3, §1.4).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MATERIALS_BY_STYLE,
  MATERIAL_FILLS,
  MATERIAL_PATTERNS,
  MATERIAL_TONES,
  materialsForStyle,
  materialById,
  sanitizeMaterialId,
  materialStyle,
} from './materials.js';
import { CANON_STYLE_IDS } from './styles.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ok - ${name}`);
};

ok('every Canon style ships materials, and only Canon styles do', () => {
  assert.deepEqual(Object.keys(MATERIALS_BY_STYLE).sort(), [...CANON_STYLE_IDS].sort());
  for (const id of CANON_STYLE_IDS) assert.ok(materialsForStyle(id).length >= 1, id);
});

ok('only proven treatments: solid/outline fills, none/hatch/stipple patterns, ink/accent tones', () => {
  // the list checked for #2338 against both rasterizers; widen it only with a new render check
  assert.deepEqual([...MATERIAL_FILLS], ['solid', 'outline']);
  assert.deepEqual([...MATERIAL_PATTERNS], ['none', 'hatch', 'stipple']);
  assert.deepEqual([...MATERIAL_TONES], ['ink', 'accent']);
  for (const list of Object.values(MATERIALS_BY_STYLE))
    for (const x of list) {
      assert.ok(MATERIAL_FILLS.includes(x.fill), `${x.id} fill`);
      assert.ok(MATERIAL_PATTERNS.includes(x.pattern), `${x.id} pattern`);
      assert.ok(MATERIAL_TONES.includes(x.tone), `${x.id} tone`);
    }
});

ok('a patterned material tones accent: an ink pattern vanishes on an ink-filled body (#2340)', () => {
  for (const list of Object.values(MATERIALS_BY_STYLE))
    for (const x of list) if (x.pattern !== 'none') assert.equal(x.tone, 'accent', x.id);
});

ok('ids are unique across styles and each names its own style', () => {
  const ids = Object.values(MATERIALS_BY_STYLE).flatMap((l) => l.map((x) => x.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const [style, list] of Object.entries(MATERIALS_BY_STYLE))
    for (const x of list) {
      assert.ok(x.id.startsWith(`${style}-`), x.id);
      assert.equal(materialStyle(x.id), style);
    }
});

ok('no colour lives in the file: no hex, rgb or hsl — the room colours a material', () => {
  // code only: comments (line and block) cite issue numbers like #2338, which read as hex
  const src = readFileSync(new URL('./materials.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src), 'no hex');
  assert.ok(!/\b(rgb|hsl)a?\(/.test(src), 'no rgb/hsl');
});

ok('lookups and the sanitizer: known ids pass, anything else is null; unknown styles are empty', () => {
  const first = MATERIALS_BY_STYLE.swiss[0];
  assert.equal(materialById(first.id), first);
  assert.equal(sanitizeMaterialId(first.id), first.id);
  for (const junk of [null, undefined, '', 'nope', 7, {}]) {
    assert.equal(sanitizeMaterialId(junk), null);
    assert.equal(materialById(junk), null);
  }
  assert.deepEqual(materialsForStyle('nope'), []);
  assert.deepEqual(materialsForStyle(null), []);
  assert.equal(materialStyle('nope'), null);
});

ok('frozen: the data cannot be changed at run time', () => {
  assert.ok(Object.isFrozen(MATERIALS_BY_STYLE));
  assert.ok(Object.isFrozen(MATERIALS_BY_STYLE.swiss));
  assert.ok(Object.isFrozen(MATERIALS_BY_STYLE.swiss[0]));
});

console.log(`materials selfcheck: ${n} ok`);
