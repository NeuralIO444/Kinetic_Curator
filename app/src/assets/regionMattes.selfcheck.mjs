/**
 * regionMattes.selfcheck — #725 slice 1: region detection.
 *
 * Acceptance (from the issue + Matt's answers):
 *  - redraw the shape keeping its flat color → same region IDs
 *  - recolor a region → new ID
 *  - same color in two separate blobs → distinct IDs (via position)
 *  - anti-aliased edges do not spawn sliver regions (quantized + absorbed)
 *
 * The detector is pure over pixel buffers: rasterization is the caller's
 * job (browser canvas at ingest; synthetic buffers here).
 */
import assert from 'node:assert';
import { detectRegions, REGION_ID_RE } from './regionMattes.js';

// --- helpers: paint synthetic pixel buffers --------------------------------

/** RGBA buffer with a filled rect. */
function makeBuf(w, h) {
  return { w, h, px: new Uint8ClampedArray(w * h * 4) };
}
function fillRect(b, x0, y0, x1, y1, r, g, bl, a = 255) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * b.w + x) * 4;
      b.px[i] = r; b.px[i + 1] = g; b.px[i + 2] = bl; b.px[i + 3] = a;
    }
  }
}
function fillCircle(b, cx, cy, rad, r, g, bl, a = 255) {
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= rad * rad) {
        const i = (y * b.w + x) * 4;
        b.px[i] = r; b.px[i + 1] = g; b.px[i + 2] = bl; b.px[i + 3] = a;
      }
    }
  }
}
const ids = (res) => res.regions.map((r) => r.id).sort();

// Two flat squares: red + blue on transparent.
function twoSquares() {
  const b = makeBuf(200, 200);
  fillRect(b, 20, 20, 80, 80, 255, 0, 0);
  fillRect(b, 120, 120, 180, 180, 0, 0, 255);
  return b;
}

// 1. Two flat regions → two stable, well-formed IDs.
{
  const b = twoSquares();
  const res = detectRegions(b.px, b.w, b.h);
  assert.strictEqual(res.regions.length, 2, `expected 2 regions, got ${res.regions.length}`);
  for (const r of res.regions) {
    assert.match(r.id, REGION_ID_RE, `bad id ${r.id}`);
    assert.ok(r.area > 1000, 'region area sane');
    assert.ok(r.cx >= 0 && r.cx <= 1 && r.cy >= 0 && r.cy <= 1, 'centroid normalized');
  }
  assert.notStrictEqual(res.regions[0].id, res.regions[1].id, 'distinct ids');
}

// 2. Redraw keeping the flat color → SAME IDs (slightly moved + resized square).
{
  const a = twoSquares();
  const b = makeBuf(200, 200);
  fillRect(b, 26, 14, 92, 78, 255, 0, 0); // same red, shifted/resized
  fillRect(b, 112, 126, 172, 186, 0, 0, 255); // same blue, shifted
  assert.deepStrictEqual(ids(detectRegions(b.px, b.w, b.h)), ids(detectRegions(a.px, a.w, a.h)),
    'redraw with same colors must keep IDs');
}

// 3. Recolor one region → NEW id for it, other region's id survives.
{
  const a = twoSquares();
  const before = ids(detectRegions(a.px, a.w, a.h));
  const b = makeBuf(200, 200);
  fillRect(b, 20, 20, 80, 80, 0, 200, 0); // red → green
  fillRect(b, 120, 120, 180, 180, 0, 0, 255); // blue untouched
  const after = ids(detectRegions(b.px, b.w, b.h));
  assert.strictEqual(after.length, 2);
  const kept = after.filter((id) => before.includes(id));
  assert.strictEqual(kept.length, 1, 'exactly the untouched region keeps its id');
  assert.ok(!before.includes(after.find((id) => !before.includes(id))), 'recolored region is a new id');
}

// 4. Same color, two separate blobs → DISTINCT ids (position disambiguates).
{
  const b = makeBuf(200, 200);
  fillRect(b, 10, 10, 50, 50, 255, 0, 0);
  fillRect(b, 140, 140, 190, 190, 255, 0, 0);
  const res = detectRegions(b.px, b.w, b.h);
  assert.strictEqual(res.regions.length, 2, 'two blobs = two regions');
  assert.notStrictEqual(res.regions[0].id, res.regions[1].id, 'same color, distinct ids via position');
}

// 5. Anti-aliased edge: 1px blended border must NOT spawn sliver regions.
{
  const b = makeBuf(200, 200);
  fillRect(b, 40, 40, 160, 160, 255, 0, 0);
  // Simulate AA: blend the outer ring 50% toward transparent/black.
  for (let x = 40; x < 160; x++) {
    for (const y of [40, 159]) {
      const i = (y * b.w + x) * 4;
      b.px[i] = 128; b.px[i + 1] = 0; b.px[i + 2] = 0; b.px[i + 3] = 255;
    }
  }
  for (let y = 40; y < 160; y++) {
    for (const x of [40, 159]) {
      const i = (y * b.w + x) * 4;
      b.px[i] = 128; b.px[i + 1] = 0; b.px[i + 2] = 0; b.px[i + 3] = 255;
    }
  }
  const res = detectRegions(b.px, b.w, b.h);
  assert.strictEqual(res.regions.length, 1, `AA edge must not spawn slivers, got ${res.regions.length}`);
}

// 6. Empty / fully transparent → zero regions, no crash.
{
  const b = makeBuf(200, 200);
  const res = detectRegions(b.px, b.w, b.h);
  assert.strictEqual(res.regions.length, 0);
}

// 7. Hostile input: bad args → empty result, never throws.
{
  assert.deepStrictEqual(detectRegions(null, 200, 200).regions, []);
  assert.deepStrictEqual(detectRegions(new Uint8ClampedArray(0), 0, 0).regions, []);
  assert.deepStrictEqual(detectRegions(new Uint8ClampedArray(10), 200, 200).regions, []);
}

// 8. ID format carries color + coarse position.
{
  const b = makeBuf(200, 200);
  fillRect(b, 20, 20, 80, 80, 255, 0, 0);
  const [r] = detectRegions(b.px, b.w, b.h).regions;
  assert.ok(r.id.includes('ff0000'), `id carries the color: ${r.id}`);
}

console.log('regionMattes.selfcheck: OK');
