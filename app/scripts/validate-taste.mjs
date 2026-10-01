#!/usr/bin/env node
// #762 — validate a Mac Studio taste.json without importing it into the app.
import { readFileSync } from 'node:fs';
import { validateTaste, HEAD_MIN_FIDELITY } from '../src/curator/tasteHead.js';

const path = process.argv[2];
if (!path) {
  console.error('usage: node scripts/validate-taste.mjs path/to/taste.json');
  process.exit(2);
}
const raw = JSON.parse(readFileSync(path, 'utf8'));
const out = validateTaste(raw);
if (!out.ok) {
  console.error(out.error);
  process.exit(1);
}
const fid = out.taste.head.fidelity;
const live = fid >= HEAD_MIN_FIDELITY;
console.log(JSON.stringify({
  ok: true,
  model: out.taste.model,
  dims: out.taste.dims,
  fidelity: fid,
  mlxLive: live,
  labels: out.taste.labels,
}, null, 2));
process.exit(live ? 0 : 0);
