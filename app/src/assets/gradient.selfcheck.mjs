// node src/assets/gradient.selfcheck.mjs — #701 TE-limited gradients.
import assert from 'node:assert';
import {
  sanitizeGradient, hasGradient, gradientDefs, applyGradient,
  GRADIENT_TYPES, GRADIENT_DIRS, GRADIENT_STOPS,
} from './gradient.js';
import { ASSETS } from '../data/assets/index.js';
import { Resvg } from '@resvg/resvg-js';

// ── the limitation is the feature ───────────────────────────────────────────
assert.deepStrictEqual([...GRADIENT_TYPES], ['linear', 'radial']);
assert.deepStrictEqual([...GRADIENT_DIRS], ['up', 'down', 'left', 'right']);
assert.deepStrictEqual([...GRADIENT_STOPS], ['ink', 'accent', 'transparent'],
  'stops are palette slots only — an arbitrary colour cannot survive the live R/G mask');

// Legal declarations normalize; everything else is FLAT.
assert.deepStrictEqual(sanitizeGradient({ type: 'linear', dir: 'up', from: 'ink', to: 'accent' }),
  { type: 'linear', dir: 'up', from: 'ink', to: 'accent' });
assert.deepStrictEqual(sanitizeGradient({ type: 'radial', from: 'ink', to: 'transparent' }),
  { type: 'radial', from: 'ink', to: 'transparent' });
assert.deepStrictEqual(sanitizeGradient({ type: 'linear', from: 'ink', to: 'accent' }).dir, 'down',
  'a linear gradient with no direction falls to down');
for (const bad of [
  null, undefined, 'x', 42, {},
  { type: 'conic', from: 'ink', to: 'accent' },                 // not a legal type
  { type: 'linear', from: '#ff0000', to: 'accent' },            // arbitrary colour
  { type: 'linear', from: 'ink', to: 'rebeccapurple' },
  { type: 'linear', from: 'ink' },                              // one stop
  { type: 'linear', to: 'accent' },
  { type: 'linear', from: 'transparent', to: 'transparent' },   // invisible
  { type: 'linear', from: 'ink', to: 'ink' },                   // flat by another name
  { type: 'radial', from: 'accent', to: 'accent' },
]) {
  assert.strictEqual(sanitizeGradient(bad), null, `${JSON.stringify(bad)} must fall back to flat`);
}
// An unknown direction is corrected rather than rejected — the gradient is
// still legal, only the arrow was mistyped.
assert.strictEqual(sanitizeGradient({ type: 'linear', dir: 'sideways', from: 'ink', to: 'accent' }).dir, 'down');

// ── assets without the field render EXACTLY as before ───────────────────────
{
  const body = '<path d="M0 0" fill="var(--ink)"/><circle fill="var(--accent)"/>';
  for (const g of [undefined, null, {}, { type: 'conic' }]) {
    assert.strictEqual(applyGradient(body, g, { ink: '#ff0000', accent: '#00ff00' }), body,
      'a flat asset must come back byte-identical');
  }
  assert.strictEqual(gradientDefs(null, { ink: '#f00', accent: '#0f0' }), '');
  // And the shipped catalogue is still entirely flat: this mechanism is inert
  // until an asset opts in, so nothing on the plate changes today.
  const optedIn = ASSETS.filter(hasGradient);
  assert.strictEqual(optedIn.length, 0,
    `no shipped asset may opt in yet (found ${optedIn.map((a) => a.id).join(', ')})`);
}

// ── what a gradient actually bakes ──────────────────────────────────────────
{
  const body = '<path d="M0 0" fill="var(--ink)"/><circle fill="var(--accent)"/>';
  const out = applyGradient(body, { type: 'linear', dir: 'down', from: 'ink', to: 'accent' },
    { ink: '#ff0000', accent: '#00ff00' });
  // INK is painted by the ramp; ACCENT stays a flat second colour, so the
  // asset keeps a readable figure/ground.
  assert.ok(out.includes('fill="url(#kc-grad)"'), 'ink must paint with the gradient');
  assert.ok(!out.includes('var(--ink)'), 'no ink placeholder may survive');
  assert.ok(out.includes('fill="var(--accent)"'), 'accent must stay flat for the colour substitution');
  assert.ok(out.startsWith('<defs>'), 'the defs must precede the body');
  assert.ok(out.includes('<linearGradient'), 'linear');
  // Stops carry the colours the caller is baking — mask primaries on the live
  // path, real palette hex on the stills path. Same module either way.
  assert.ok(out.includes('stop-color="#ff0000"') && out.includes('stop-color="#00ff00"'));
}
// Direction actually changes the ramp, and every direction is distinct.
{
  const coords = GRADIENT_DIRS.map((dir) =>
    gradientDefs({ type: 'linear', dir, from: 'ink', to: 'accent' }, { ink: '#f00', accent: '#0f0' }));
  assert.strictEqual(new Set(coords).size, GRADIENT_DIRS.length, 'each direction must be its own ramp');
  assert.ok(coords[GRADIENT_DIRS.indexOf('down')].includes('y1="0"'));
  assert.ok(coords[GRADIENT_DIRS.indexOf('up')].includes('y1="1"'));
}
// Radial is centred and fills the bounding box.
{
  const d = gradientDefs({ type: 'radial', from: 'ink', to: 'transparent' }, { ink: '#f00', accent: '#0f0' });
  assert.ok(d.includes('<radialGradient') && d.includes('cx="0.5"') && d.includes('r="0.5"'));
}

// ── a transparent stop fades OUT, not through black ─────────────────────────
// The classic gradient mistake: fading to `transparent` in a naive
// implementation ramps through an unrelated colour on the way down.
{
  const d = gradientDefs({ type: 'linear', from: 'accent', to: 'transparent' },
    { ink: '#112233', accent: '#445566' });
  assert.ok(d.includes('stop-opacity="0"'), 'the transparent stop must be zero-opacity');
  assert.strictEqual((d.match(/#445566/g) || []).length, 2,
    'a transparent stop borrows the other stop colour, so the ramp fades out cleanly');
  assert.ok(!d.includes('#112233'), 'the unrelated slot must not appear in the ramp');
  // …and the same holds when transparent is the FIRST stop.
  const d2 = gradientDefs({ type: 'linear', from: 'transparent', to: 'ink' },
    { ink: '#112233', accent: '#445566' });
  assert.strictEqual((d2.match(/#112233/g) || []).length, 2);
  assert.ok(d2.includes('stop-opacity="0"'));
  // Both orders, against BOTH slots: transparent->accent must borrow accent,
  // never fall through to ink. (Missing this pair is how a "fade out" quietly
  // becomes a fade through an unrelated colour.)
  for (const [from, to, want, avoid] of [
    ['transparent', 'accent', '#445566', '#112233'],
    ['accent', 'transparent', '#445566', '#112233'],
    ['transparent', 'ink', '#112233', '#445566'],
    ['ink', 'transparent', '#112233', '#445566'],
  ]) {
    const d3 = gradientDefs({ type: 'linear', from, to }, { ink: '#112233', accent: '#445566' });
    assert.strictEqual((d3.match(new RegExp(want, 'g')) || []).length, 2,
      `${from}->${to} must ramp within ${want}`);
    assert.ok(!d3.includes(avoid), `${from}->${to} must not reach for ${avoid}`);
  }
}

// ── both bakers ask the same module the same question ───────────────────────
// The live path bakes the R/G mask, the stills path bakes real palette hex.
// If these two ever diverge, a gradient asset prints differently than it drew.
{
  const body = '<path fill="var(--ink)"/>';
  const g = { type: 'radial', from: 'ink', to: 'transparent' };
  const live = applyGradient(body, g, { ink: '#ff0000', accent: '#00ff00' });
  const still = applyGradient(body, g, { ink: '#1a1a1a', accent: '#d08020' });
  const shape = (s) => s.replace(/#[0-9a-f]{6}/gi, '#COLOR');
  assert.strictEqual(shape(live), shape(still),
    'the two bakers must produce the same ramp, differing only in the baked colours');
}

// ── it bakes: through the real rasterizer, not just as a string ─────────────
// Everything above checks the SVG we emit. This checks what comes out of the
// rasterizer the bakers actually use, because a gradient that is syntactically
// perfect and paints nothing is the failure mode that matters.
{
  const body = '<rect x="0" y="0" width="100" height="100" fill="var(--ink)"/>';
  const bake = (gradient, ink = '#ff0000', accent = '#00ff00') => {
    const b = applyGradient(body, gradient, { ink, accent })
      .replace(/var\(--ink[^)]*\)/g, ink)
      .replace(/var\(--accent[^)]*\)/g, accent);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 100 100">${b}</svg>`;
    const px = Buffer.from(new Resvg(svg).render().pixels);
    const at = (x, y) => { const o = (y * 64 + x) * 4; return [px[o], px[o + 1], px[o + 2], px[o + 3]]; };
    return { top: at(32, 4), mid: at(32, 32), bot: at(32, 59) };
  };

  // Flat is flat: solid ink, full alpha, top to bottom.
  const flat = bake(null);
  for (const p of [flat.top, flat.mid, flat.bot]) assert.deepStrictEqual(p, [255, 0, 0, 255]);

  // ink -> accent reads as a RED->GREEN ramp in the mask. That is the whole
  // mechanism: the shader turns (r-b) and (g-b) into a per-texel blend of the
  // LIVE palette, so this gradient is palette-resolved at 60fps for free.
  const ia = bake({ type: 'linear', dir: 'down', from: 'ink', to: 'accent' });
  assert.ok(ia.top[0] > 200 && ia.top[1] < 60, `top must be ink-dominant (${ia.top})`);
  assert.ok(ia.bot[1] > 200 && ia.bot[0] < 60, `bottom must be accent-dominant (${ia.bot})`);
  assert.ok(Math.abs(ia.mid[0] - ia.mid[1]) < 30, `the midpoint must be a real blend (${ia.mid})`);
  assert.strictEqual(ia.mid[3], 255, 'an ink->accent ramp stays fully opaque');
  // Direction is not cosmetic: up is the same ramp reversed.
  const up = bake({ type: 'linear', dir: 'up', from: 'ink', to: 'accent' });
  assert.ok(up.top[1] > 200 && up.bot[0] > 200, 'up must invert the ramp');

  // A transparent stop ramps ALPHA, and stays premultiplied-clean: no colour
  // channel may exceed its own alpha, or the atlas mipmaps will bloom.
  const it = bake({ type: 'linear', dir: 'down', from: 'ink', to: 'transparent' });
  assert.ok(it.top[3] > 200 && it.bot[3] < 60, `alpha must ramp (${it.top[3]} -> ${it.bot[3]})`);
  for (const p of [it.top, it.mid, it.bot]) {
    assert.ok(p[0] <= p[3] + 1, `premultiplied: rgb ${p[0]} must not exceed alpha ${p[3]}`);
    assert.strictEqual(p[1], 0, 'an ink->transparent ramp must never introduce accent');
  }

  // Radial fades from the centre out.
  const rad = bake({ type: 'radial', from: 'ink', to: 'transparent' });
  assert.ok(rad.mid[3] > 200, 'radial centre is opaque');
  assert.ok(rad.top[3] < 80 && rad.bot[3] < 80, 'radial edges fade');
}

console.log('gradient.selfcheck: OK');
