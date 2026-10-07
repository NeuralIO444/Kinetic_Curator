// bake-swatch-weights.mjs — write `weights` into src/data/palettes.js (#1049).
//
//   node scripts/bake-swatch-weights.mjs           fill palettes that have no weights
//   node scripts/bake-swatch-weights.mjs --force   overwrite every palette (drops hand edits)
//   node scripts/bake-swatch-weights.mjs --sheet   print the ranked contact sheet (markdown), write nothing
//
// A hand-edited `weights` array is the source of truth: without --force this
// script never touches a palette that already has one.
import { readFileSync, writeFileSync } from 'node:fs';
import { PALETTES } from '../src/data/palettes.js';
import { deriveSwatchWeights, swatchWeights, rankedSwatches } from '../src/data/swatchWeights.js';

const FILE = new URL('../src/data/palettes.js', import.meta.url);
const args = new Set(process.argv.slice(2));

if (args.has('--sheet')) {
  console.log('| palette | ranked swatches, strongest first (weight) |\n|---|---|');
  for (const p of PALETTES) {
    const w = swatchWeights(p);
    const cells = rankedSwatches(p).map((c) => `\`${c}\` ${w[p.swatches.indexOf(c)].toFixed(2)}`);
    console.log(`| ${p.name} \`${p.id}\` | ${cells.join(' · ')} |`);
  }
  process.exit(0);
}

const force = args.has('--force');
const lines = readFileSync(FILE, 'utf8').split('\n');
const out = [];
let id = null; let wrote = 0; let kept = 0; let inSwatches = false; let indent = '';
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const idm = line.match(/^\s*id:\s*'([^']+)'/);
  if (idm) id = idm[1];
  if (/^\s*weights:\s*\[/.test(line)) {
    if (force) continue; // dropped; rewritten after the swatches array
    kept += 1;
  }
  out.push(line);
  if (/^\s*swatches:\s*\[/.test(line) && id) { inSwatches = true; indent = line.match(/^\s*/)[0]; }
  if (!inSwatches || !line.includes(']')) continue; // a swatches array may span several lines
  inSwatches = false;
  const p = PALETTES.find((q) => q.id === id);
  const has = /^\s*weights:\s*\[/.test(lines[i + 1] || '');
  if (p && (force || !has)) {
    out.push(`${indent}weights: [${deriveSwatchWeights(p).join(', ')}],`);
    wrote += 1;
  }
  id = null;
}
writeFileSync(FILE, out.join('\n'));
console.log(`bake-swatch-weights: wrote ${wrote}, kept ${force ? 0 : kept} hand-set`);
