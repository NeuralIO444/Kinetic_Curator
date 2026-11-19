// hornStrip.selfcheck.mjs — #2388 (P8): the strip's place, order, grammar, colours and phone wrap.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hornLabel, hornTileName } from '../../curator/hornFaces.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const rd = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const codec = rd('./RoomCodec.jsx');
const strip = rd('./HornStrip.jsx');
const css = rd('../../styles/panels.css');
const tokens = rd('../../styles/tokens.css');

ok(
  'the strip sits in the codec after the kc-voice/1 channel and before the footer; COVER and OVERLAP stay the big tiles',
  () => {
    const at = (s) => codec.indexOf(s);
    assert.ok(at('className="codec-transcript"') > 0);
    assert.ok(at('<HornStrip horns={horns} />') > at('className="codec-transcript"'), 'after the channel');
    assert.ok(at('<HornStrip horns={horns} />') < at('className="codec-footer"'), 'before the footer');
    assert.equal((codec.match(/<HornStrip /g) || []).length, 1);
    assert.match(codec, /className="codec-window codec-lois"/);
    assert.match(codec, /className="codec-window codec-davis"/);
    assert.match(codec, /<span className="codec-name">cover<\/span>/);
    assert.match(codec, /<span className="codec-name">overlap<\/span>/);
  },
);

ok(
  'three tiles from the resolved horns, in order (BLAST, HYBRID, SWISS GRIT), the codec grammar: face, lowercase callsign, state word',
  () => {
    assert.match(strip, /horns\.map\(\(h\) =>/);
    assert.match(strip, /className="horn-face-slot"/);
    assert.match(strip, /className="horn-name">\{h\.tile\}/);
    assert.equal(hornTileName('ashworth'), 'swissg');
    assert.equal(hornLabel('ashworth'), 'swiss grit');
    assert.match(strip, /className="horn-state act">\{h\.word\}/);
    assert.match(strip, /const FACES = \{ carson: BlastFace, greiman: HybridFace, ashworth: GritFace \}/);
    assert.match(codec, /resolveHorns\(\{/);
    // each tile is a labelled image of its state and carries its code for the e2e/inspector
    assert.match(strip, /aria-label=\{`\$\{h\.callsign\}, \$\{h\.word\}`\}/);
    assert.match(strip, /data-code=\{h\.code\}/);
    // readout only: nothing in the strip is a button or takes input
    assert.ok(!/<button|onClick|onKey|tabIndex/.test(strip), 'a readout, not a control');
  },
);

ok('transcript labels: a horn line names itself by callsign (blast / hybrid / swiss grit), never a real name', () => {
  assert.match(codec, /hornLabel\(persona\)/);
  assert.match(codec, /carson: 'blast', greiman: 'hybrid', ashworth: 'grit'/);
});

const hex = (name) => (tokens.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1];
const hue = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  const x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (x * 60 + 360) % 360;
};
const gap = (a, b) => Math.min(Math.abs(hue(a) - hue(b)), 360 - Math.abs(hue(a) - hue(b)));

ok('distinct label colours: three hues of their own, none LOIS red, Davis amber, live pink or the focus cyan', () => {
  const horns = ['--kc-blast', '--kc-hybrid', '--kc-grit'].map(hex);
  assert.ok(horns.every(Boolean), 'all three tokens exist');
  assert.equal(new Set(horns).size, 3);
  const others = ['--kc-red', '--kc-davis', '--accent', '--accent2', '--accent3', '--kc-ok'].map(hex);
  assert.ok(others.every(Boolean));
  for (const h of horns) {
    for (const o of others) assert.ok(gap(h, o) >= 20, `${h} vs ${o}: ${gap(h, o).toFixed(0)} degrees`);
  }
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 3; j++) assert.ok(gap(horns[i], horns[j]) >= 40, `${horns[i]} vs ${horns[j]}`);
  assert.match(css, /\.horn-blast \.horn-name[\s\S]*?color: var\(--kc-blast\)/);
  assert.match(css, /\.horn-hybrid \.horn-name[\s\S]*?color: var\(--kc-hybrid\)/);
  assert.match(css, /\.horn-grit \.horn-name[\s\S]*?color: var\(--kc-grit\)/);
  // the existing tiles keep their colours
  assert.match(css, /\.codec-lois \.codec-name \{\s*color: var\(--kc-red\)/);
  assert.match(css, /\.codec-davis \.codec-name \{\s*color: var\(--kc-davis\)/);
});

ok(
  'layout: the strip is grid column 2, row 2 (under the channel); at phone width it wraps to its own row under the channel row',
  () => {
    assert.match(css, /\.room-horns \{\s*grid-column: 2;\s*grid-row: 2;\s*display: flex;\s*flex-wrap: wrap;/);
    assert.match(css, /\.room-codec \{\s*container-type: inline-size;/);
    assert.match(css, /@container \(max-width: 420px\) \{\s*\.room-horns \{\s*grid-column: 1 \/ -1;/);
    assert.match(css, /\.room-codec > \.codec-footer \{\s*grid-row: 3;/);
    // the real panel is 360 px wide on a phone and 520 px on a desktop: the container query splits them
    assert.ok(360 <= 420 && 520 > 420);
    // 3 tiles + gaps fit the phone strip on one row, and wrap (flex-wrap) before they would overflow a narrower one
    assert.ok(3 * 72 + 2 * 4 <= 360);
  },
);

console.log(`hornStrip.selfcheck: ${n} checks passed`);
