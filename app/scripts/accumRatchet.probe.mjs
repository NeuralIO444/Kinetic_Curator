#!/usr/bin/env node
/**
 * Fast #361 harness — no browser.
 * Models one pixel of light through fade + additive glow for N frames.
 *
 *   cd app && node scripts/accumRatchet.probe.mjs
 *   node scripts/accumRatchet.probe.mjs --optics 1 --fade 0.94 --frames 300
 */
import { accumRecipeParams } from '../src/gl/accum.mjs';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || i === process.argv.length - 1) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
}

const optics = arg('optics', 1);
const fade = arg('fade', 0.88);
const frames = Math.max(1, arg('frames', 300) | 0);
const ink = arg('ink', 0.35);
const p = accumRecipeParams({ fade, optics });
const add = p.bloomAmount + p.halationAmount * 0.6;

function run(ceiling) {
  let L = ink;
  let hit1 = -1;
  for (let i = 1; i <= frames; i++) {
    L = L * p.keep + add;
    if (ceiling) L = Math.min(1, L);
    if (hit1 < 0 && L >= 0.98) hit1 = i;
  }
  return { end: L, hit1 };
}

const open = run(false);
const cap = run(true);

const line = [
  `optics ${optics}`,
  `fade ${fade} (keep ${p.keep})`,
  `bloom ${p.bloomAmount.toFixed(3)} + halo ${p.halationAmount.toFixed(3)}`,
  `add/frame ${add.toFixed(3)}`,
  `${frames} frames`,
].join(' · ');

console.log(`accumRatchet.probe  ${line}`);
console.log(`  no ceiling   end=${open.end.toFixed(3)}  paper@${open.hit1 < 0 ? 'never' : `frame ${open.hit1}`}`);
console.log(`  min(rgb,1)   end=${cap.end.toFixed(3)}  paper@${cap.hit1 < 0 ? 'never' : `frame ${cap.hit1}`}`);

if (open.end >= 0.98 && cap.end <= 1.001) {
  console.log('  #361: ratchet confirmed. ceiling stops the climb.');
  process.exit(0);
}
if (open.end < 0.98) {
  console.log('  this knob pair does not blow out in the model — try --optics 1 --fade 0.96');
  process.exit(0);
}
process.exit(1);
