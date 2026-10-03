import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { crookedCorner, openAlpha, stretchCorner, nickCorner, flipCorner } from './hands.mjs';

test('#866 amount 0 is the current quad and the current sample', () => {
  const c = { x: 12, y: -8 };
  assert.deepEqual(crookedCorner(c, 0, 0.3), c);
  assert.equal(openAlpha(0.8, { x: 0.5, y: 0.5 }, 0, 0.2), 0.8);
  const src = readFileSync(new URL('./shaders.mjs', import.meta.url), 'utf8');
  assert.match(src, /u_hands\.x > 0\.0/);
  assert.match(src, /u_hands\.y > 0\.0/);
  assert.doesNotMatch(readFileSync(new URL('./resolveFs.mjs', import.meta.url), 'utf8'), /u_hands/);
});

test('#866 a non-zero hand changes the mark and repeats for the same seed', () => {
  const c = { x: 12, y: -8 };
  const a = crookedCorner(c, 0.6, 0.3);
  const b = crookedCorner(c, 0.6, 0.3);
  assert.deepEqual(a, b);
  assert.notEqual(a.x, c.x);
  const ink = openAlpha(0.8, { x: 0.5, y: 0.5 }, 0.7, 0.2);
  assert.equal(ink, openAlpha(0.8, { x: 0.5, y: 0.5 }, 0.7, 0.2));
  assert.ok(ink < 0.8);
});

test('#865 stretch: amount 0 is identity, repeats per seed, clamps at 30% per axis', () => {
  const c = { x: 12, y: -8 };
  assert.deepEqual(stretchCorner(c, 0, 0.3), c);
  const a = stretchCorner(c, 0.6, 0.3);
  assert.deepEqual(a, stretchCorner(c, 0.6, 0.3));
  assert.ok(a.x !== c.x || a.y !== c.y, 'non-zero stretch changes the corner');
  // clamp: neither axis moves more than 30% for amount <= 1 (slider max)
  for (let i = 0; i < 50; i++) {
    const seed = i / 50;
    for (const amount of [0.25, 0.6, 1]) {
      const r = stretchCorner({ x: 40, y: -25 }, amount, seed);
      assert.ok(Math.abs(r.x - 40) <= 0.30 * 40 + 1e-9, `x clamp seed=${seed} amount=${amount}`);
      assert.ok(Math.abs(r.y - -25) <= 0.30 * 25 + 1e-9, `y clamp seed=${seed} amount=${amount}`);
    }
  }
  // the GLSL implements the stretch strand
  const src = readFileSync(new URL('./shaders.mjs', import.meta.url), 'utf8');
  assert.match(src, /fract\(seed \* 3\.7\)/);
});

test('#865 nick: amount 0 is identity, one corner nicked per seed, pull is amount*0.35', () => {
  const c = { x: 12, y: -8 };
  for (let k = 0; k < 4; k++) assert.deepEqual(nickCorner(c, 0, 0.3, k), c);
  const seed = 0.42;
  const outs = [0, 1, 2, 3].map((k) => nickCorner(c, 0.7, seed, k));
  assert.deepEqual(outs[0], nickCorner(c, 0.7, seed, 0), 'same seed repeats');
  const nicked = outs.filter((o) => o.x !== c.x || o.y !== c.y);
  assert.equal(nicked.length, 1, 'exactly one corner is nicked per seed');
  const k = 1 - 0.7 * 0.35;
  assert.ok(Math.abs(nicked[0].x - c.x * k) < 1e-9 && Math.abs(nicked[0].y - c.y * k) < 1e-9);
  // the GLSL implements the nick strand
  const src = readFileSync(new URL('./shaders.mjs', import.meta.url), 'utf8');
  assert.match(src, /fract\(seed \* 9\.31\)/);
});

test('#865 flip: amount 0 is identity, binary per seed, mirror is exact', () => {
  const c = { x: 12, y: -8 };
  assert.deepEqual(flipCorner(c, 0, 0.3), c);
  assert.deepEqual(flipCorner(c, 0.6, 0.3), flipCorner(c, 0.6, 0.3), 'same seed repeats');
  // find one seed that flips and one that does not
  let flipped = null, kept = null;
  for (let i = 0; i < 100 && (!flipped || !kept); i++) {
    const r = flipCorner(c, 0.6, i / 100);
    if (r.x === -c.x && r.y === c.y) flipped = r;
    if (r.x === c.x && r.y === c.y) kept = r;
  }
  assert.ok(flipped, 'some seeds flip');
  assert.ok(kept, 'some seeds keep');
  // the GLSL implements the flip strand
  const src = readFileSync(new URL('./shaders.mjs', import.meta.url), 'utf8');
  assert.match(src, /fract\(seed \* 5\.77\)/);
});

test('#868 double: amount 0 is identity, repeats per seed, faint mix bounded by amount*0.35', () => {
  const local = { x: 0.5, y: 0.5 };
  assert.equal(openAlpha(0.8, local, 0, 0.2), 0.8);
  // find a seed whose strand picks the double ink (3-way pick this slice)
  let dseed = null;
  for (let i = 0; i < 200; i++) {
    const s = i / 200;
    const istr = s * 3.3 - Math.floor(s * 3.3);
    if (Math.min(2, Math.floor(istr * 3)) === 2) { dseed = s; break; }
  }
  assert.ok(dseed !== null, 'some seed picks double');
  const a = openAlpha(0.8, local, 0.7, dseed);
  assert.equal(a, openAlpha(0.8, local, 0.7, dseed), 'same seed repeats');
  assert.ok(a <= 0.8 + 1e-9, 'faint mix never exceeds the original alpha');
  assert.ok(a >= 0.8 * (1 - 0.7 * 0.35) - 1e-9, 'mix bounded by amount*0.35');
  const src = readFileSync(new URL('./shaders.mjs', import.meta.url), 'utf8');
  assert.match(src, /fract\(v_seed \* 3\.3\)/);
});
