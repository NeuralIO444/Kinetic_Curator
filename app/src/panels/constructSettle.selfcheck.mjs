// constructSettle.selfcheck.mjs — the CONSTRUCT tile's settle-into-place drawing (issue #2300; spec §13.3).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { settledSvg, ease, SETTLE_SPREAD } from './constructSettle.mjs';
import { constructTileSvg } from '../engine/constructAssembler.js';
import { houseConstructs } from '../engine/constructHouse.js';
import { ASSETS } from '../data/assets/index.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ok - ${name}`);
};

const byId = new Map(ASSETS.map((a) => [a.id, a]));
const svgOf = (id) => (byId.get(id) || {}).svg;
const records = houseConstructs((id) => byId.get(id) || null);
const rec = records[0];
const translates = (svg) => [...svg.matchAll(/translate\(([-\d.]+) ([-\d.]+)\)/g)].map((m) => [+m[1], +m[2]]);

ok('there are real constructs to draw', () => {
  assert.ok(records.length > 10, `${records.length} house constructs`);
  assert.ok(constructTileSvg(rec, svgOf));
});

ok('settled (t >= 1) is constructTileSvg byte for byte, for every house construct', () => {
  for (const r of records) {
    const tile = constructTileSvg(r, svgOf);
    assert.equal(settledSvg(r, svgOf, 1), tile, r.id);
    assert.equal(settledSvg(r, svgOf, 7), tile, r.id);
  }
});

ok('t = 0 is spread out: every part sits up to SETTLE_SPREAD from home, and the drawing differs', () => {
  const home = translates(constructTileSvg(rec, svgOf));
  const start = translates(settledSvg(rec, svgOf, 0));
  assert.equal(start.length, home.length);
  assert.notEqual(settledSvg(rec, svgOf, 0), constructTileSvg(rec, svgOf));
  start.forEach(([x, y], i) => {
    const d = Math.hypot(x - home[i][0], y - home[i][1]);
    assert.ok(d <= SETTLE_SPREAD + 0.02, `part ${i} at ${d}`);
  });
  assert.ok(
    Math.hypot(start[0][0] - home[0][0], start[0][1] - home[0][1]) > SETTLE_SPREAD - 0.02,
    'the first part starts fully out',
  );
});

ok('parts arrive in order: midway, an early part is nearer home than a late one', () => {
  const home = translates(constructTileSvg(rec, svgOf));
  const mid = translates(settledSvg(rec, svgOf, 0.4));
  const gap = (i) => Math.hypot(mid[i][0] - home[i][0], mid[i][1] - home[i][1]);
  assert.ok(gap(0) < gap(home.length - 1), `${gap(0)} < ${gap(home.length - 1)}`);
});

ok('garbage t reads as settled; deterministic; a missing drawing gives null', () => {
  const tile = constructTileSvg(rec, svgOf);
  for (const t of [NaN, -1, undefined, null, 'x', Infinity]) assert.equal(settledSvg(rec, svgOf, t), tile, String(t));
  assert.equal(settledSvg(rec, svgOf, 0.3), settledSvg(rec, svgOf, 0.3));
  assert.equal(
    settledSvg(rec, () => null, 0.3),
    null,
  );
  assert.equal(settledSvg(null, svgOf, 0.3), null);
});

ok('ease runs 0 → 1, ease-out', () => {
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  assert.ok(ease(0.5) > 0.5);
});

ok('pure: no clock, no Math.random, no store, no React', () => {
  const src = readFileSync(new URL('./constructSettle.mjs', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  for (const bad of ['Date.now', 'Math.random', 'performance.now', 'requestAnimationFrame', 'useStore', "from 'react'"])
    assert.ok(!src.includes(bad), `constructSettle.mjs has no ${bad}`);
});

console.log(`constructSettle selfcheck: ${n} ok`);
