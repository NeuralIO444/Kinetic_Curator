// creaturePaint.selfcheck.mjs — creature PAINT P3 (#2340; spec creature-paint-drive §1.3, §1.7).
//
// The material is drawn over the art, in a palette token, with elements the overlay door already trusts
// (Matt, 2026-11-17): hatch / stipple as one plain path clipped to the drawing's own shapes.
import assert from 'node:assert/strict';
import { applyMaterial, recordMaterial, silhouetteShapes, patternPath } from './creaturePaint.js';
import { assembleCreature, creatureTile } from './creatureAssembler.js';
import { creatureTileSvg } from './creatureRig.js';
import { sanitizeOverlay } from '../assets/overlay.js';
import { disallowedTag, isHostile } from '../assets/ingest.js';
import { MATERIALS_BY_STYLE } from '../data/canon/materials.js';
import { ASSETS } from '../data/assets/index.js';
import { Resvg } from '@resvg/resvg-js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ok - ${name}`);
};
const ALL = Object.values(MATERIALS_BY_STYLE).flat();
const PATTERNED = ALL.filter((m) => m.pattern !== 'none');
const PLAIN = ALL.filter((m) => m.pattern === 'none');
const BLOB = ASSETS.find((a) => a.id === 'org_blob_01').svg;
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const PTS = [
  { x: 50, y: 5, role: 'H' },
  { x: 10, y: 60, role: 'L' },
  { x: 90, y: 60, role: 'L' },
];

ok('no material, an unknown one, or a pattern-less one returns the drawing unchanged', () => {
  for (const m of [null, undefined, '', 'chrome', { id: 'nope' }]) assert.equal(applyMaterial(BLOB, m), BLOB);
  for (const m of PLAIN) assert.equal(applyMaterial(BLOB, m.id), BLOB, m.id);
  assert.equal(applyMaterial('', PATTERNED[0].id), '');
  assert.equal(applyMaterial('<g></g>', PATTERNED[0].id), '<g></g>', 'nothing to paint inside');
});

ok('over the art: the drawing is kept byte for byte, the pattern is added after it in the tone token', () => {
  for (const m of PATTERNED) {
    const out = applyMaterial(BLOB, m.id);
    assert.ok(out.startsWith(BLOB), m.id);
    const added = out.slice(BLOB.length);
    assert.ok(added.includes(`stroke="var(--${m.tone})"`), m.id);
    assert.ok(/clip-path="url\(#kcm-[0-9a-f]{8}\)"/.test(added));
    assert.ok(!HEX.test(added), `no hex in ${m.id}`);
    assert.ok(!/<pattern|<mask/i.test(added), 'never the elements the door refuses');
  }
});

ok('deterministic: the same drawing + material is the identical markup; hatch and stipple differ', () => {
  for (const m of PATTERNED) assert.equal(applyMaterial(BLOB, m.id), applyMaterial(BLOB, m.id));
  assert.notEqual(patternPath('hatch'), patternPath('stipple'));
  assert.equal(patternPath('none'), '');
});

ok('the overlay door accepts every painted library drawing (the tile survives a reload)', () => {
  for (const a of ASSETS.filter((_, i) => i % 7 === 0))
    for (const m of PATTERNED.slice(0, 2)) {
      const out = applyMaterial(a.svg, m.id);
      assert.equal(disallowedTag(out, ['text']), null, `${a.id} ${m.id}`);
      assert.equal(isHostile(out), false, `${a.id} ${m.id}`);
    }
});

ok('the silhouette follows nested transforms and skips defs', () => {
  const svg =
    '<defs><clipPath id="z"><rect width="5" height="5"/></clipPath></defs>' +
    '<g transform="translate(10 0)"><g transform="scale(2)"><circle cx="1" cy="2" r="3" fill="var(--ink)"/></g></g>';
  assert.equal(silhouetteShapes(svg), '<circle cx="1" cy="2" r="3" transform="translate(10 0) scale(2)"/>');
});

ok('creatureTile wears the record material; an unpainted record bakes the same tile as before PAINT', () => {
  const body = ASSETS.find((a) => a.id === 'org_blob_01');
  const plain = assembleCreature({ assetId: body.id, points: PTS, seed: 4 });
  assert.equal(recordMaterial(plain), null);
  assert.equal(creatureTile(plain, body).svg, creatureTileSvg(plain, body.svg));
  const painted = assembleCreature({ assetId: body.id, points: PTS, seed: 4, styleId: 'engraved' });
  // engraved's first two materials are patterned; pick a seed whose dealt material is
  const rec = [
    painted,
    ...[5, 6, 7, 8, 9].map((s) => assembleCreature({ assetId: body.id, points: PTS, seed: s, styleId: 'engraved' })),
  ].find((r) => PATTERNED.some((m) => m.id === recordMaterial(r)));
  const tile = creatureTile(rec, body);
  assert.ok(tile.svg.includes('clip-path="url(#kcm-'));
  const [loaded] = sanitizeOverlay([tile]);
  assert.ok(loaded && loaded.svg === tile.svg, 'the door loads the painted tile unchanged');
});

ok('the room colours the paint: under the atlas token swap the pattern takes each room accent', () => {
  // the swap both atlases make (gl/atlas.mjs, gl/liveAtlas.mjs subColors): only these tokens reach the room
  const room = (svg, ink, accent) => svg.replace(/var\(--ink[^)]*\)/g, ink).replace(/var\(--accent[^)]*\)/g, accent);
  const square = '<rect x="10" y="10" width="80" height="80" fill="var(--ink)"/>';
  const painted = applyMaterial(square, 'engraved-hatch');
  const ink = [32, 32, 32];
  const rgb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  const dist = (px, i, c) => Math.abs(px[i] - c[0]) + Math.abs(px[i + 1] - c[1]) + Math.abs(px[i + 2] - c[2]);
  // the hatch's pixels: opaque, and nearer the room's accent than the ink under them (the line blends with it)
  const count = (accent) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${room(painted, '#202020', accent)}</svg>`;
    const px = new Resvg(svg).render().pixels;
    const a = rgb(accent);
    let c = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200 && dist(px, i, a) < dist(px, i, ink)) c++;
    return c;
  };
  for (const accent of ['#e0245e', '#20c0ff']) assert.ok(count(accent) > 600, `hatch drawn in ${accent}`);
  assert.equal(count('#202020'), 0, "an accent equal to the ink shows no hatch: the colour is the room's alone");
  assert.ok(!/var\(--/.test(room(painted, '#000000', '#ffffff')), 'nothing left for the room to miss');
});

console.log(`creaturePaint selfcheck: ${n} ok`);
