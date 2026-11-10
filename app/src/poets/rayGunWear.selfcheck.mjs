// rayGunWear.selfcheck.mjs — #2010 (RAY GUN P1 · TORN & XEROXED): baked worn letters, and the treatment that moves
// a treated stamp to its own letter's worn variant.
//
// Pins (docs/design/raygun-headroom-2026-11-06.md §10 P1, ruling D1, §7's "every new destruction axis is named in the
// record"):
//   A  the pack: a torn + a xerox variant of every treatable Latin letter (Anton caps 26, Anton lowercase 26, PT
//      Serif 52 → 208), each naming its source and its own letter, path data only, unique <defs> ids, every one
//      rasterizing with real ink that DIFFERS from its source; and the pack is exactly what the generator bakes
//      (a regen is byte-identical — scripts/gen-wear.mjs)
//   B  poem-only: in the catalogue, out of the authored bake, in the poem-only union, excluded on every dealing
//      surface; never resolved by any placement; worn stamps measure with their source's ruler
//   C  the treatment: with the wear axis named, CARSON and SHOT move some stamps to their OWN letter's variant and
//      nothing else moves — geometry, `ch`, count and order are bit-identical to the unworn blast; GREIMAN never
//      wears; letters with no variant (digits, punctuation, kana) stay; deterministic per seed
//   D  replay: a record without `wear` draws exactly the pre-P1 blast (old takes replay bit-for-bit); the door
//      carries `wear: 1`, adds no key to a record without it, and refuses any other value; the store's arms name it
import assert from 'node:assert';
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { ASSETS, ASSETS_AUTHORED } from '../data/assets/index.js';
import { ASSETS_WEAR } from '../data/assets/assets-wear.js';
import { ASSETS_SERIF } from '../data/assets/assets-serif.js';
import { RESVG_FONT } from '../assets/resvgFont.mjs';
import { disallowedTag, isHostile } from '../assets/ingest.js';
import {
  WEAR_STAMP_IDS,
  WEAR_SOURCE_BY_ID,
  POEM_ONLY_STAMP_IDS,
  wearStampIdFor,
  stampWidthEm,
  serifGlyphWidthEm,
  glyphWidthEm,
  stampIdForGlyph,
  serifStampIdForChar,
} from './placement.js';
import { rayGunForm } from './rayGunForm.js';
import { fieldFormForDeal, sanitizeFieldForm } from './fieldForm.js';
import { mkRng } from '../engine/prng.js';
import { poolDescriptors } from '../panels/assetPoolLogic.mjs';
import { chapterAssets } from '../data/chapters.js';
import { dealableRecords } from '../state/rollPool.mjs';
import { dealCast } from '../curator/dice.js';
import { useStore } from '../state/store.js';
import { wearPackSource } from '../../../scripts/gen-wear.mjs';

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};
console.log('rayGunWear.selfcheck');

const BY_ID = new Map(ASSETS.map((a) => [a.id, a]));

// ── A · the pack ────────────────────────────────────────────────────────
ok('A1 208 variants: torn + xerox for Anton caps, Anton lowercase, PT Serif — each its own letter', () => {
  assert.equal(ASSETS_WEAR.length, 208);
  for (const kind of ['torn', 'xerox']) assert.equal(ASSETS_WEAR.filter((a) => a.tags.includes(kind)).length, 104);
  for (const a of ASSETS_WEAR) {
    const src = BY_ID.get(a.wearOf);
    assert.ok(src, `${a.id}: its source ${a.wearOf} is a catalogue stamp`);
    const srcCh = src.glyph ?? src.id.slice(4);
    assert.equal(a.glyph, srcCh, `${a.id}: wears its own letter`);
    assert.ok(/^[A-Za-z]$/.test(a.glyph), `${a.id}: letters only`);
    assert.ok(!a.svg.includes('<text'), `${a.id}: path data, never <text>`);
    for (const ref of a.svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ref[1].startsWith(`${a.id}_`), `${a.id}: defs ids are its own`);
    assert.equal(WEAR_SOURCE_BY_ID.get(a.id), a.wearOf);
  }
  assert.equal(new Set(ASSETS_WEAR.map((a) => a.id)).size, 208, 'ids unique');
  // the asset door's ingest allowlist (clipPath yes, mask/use no): a worn stamp survives an overlay round trip
  for (const a of ASSETS_WEAR) {
    assert.equal(disallowedTag(a.svg), null, `${a.id}: every tag is on the ingest allowlist`);
    assert.ok(!isHostile(a.svg), `${a.id}: nothing hostile`);
  }
  assert.equal(wearStampIdFor('typ_A', 'torn'), 'typ_tn_A');
  assert.equal(wearStampIdFor('typ_l_g', 'xerox'), 'typ_xr_l_g');
  assert.equal(wearStampIdFor('typ_s_R', 'torn'), 'typ_tn_s_R');
  for (const none of ['typ_0', 'typ_p_period', 'typ_f_A', 'typ_h_a', 'typ_tn_A', 'nope'])
    assert.equal(wearStampIdFor(none, 'torn'), null, `${none}: no wear`);
});

ok('A2 the pack is exactly the generator bake (a regen is byte-identical)', () => {
  assert.equal(fs.readFileSync('src/data/assets/assets-wear.js', 'utf8'), wearPackSource());
});

const raster = (svg) => {
  const doc =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 200 200" width="300" height="300">' +
    svg.replaceAll('var(--ink)', '#ffffff') +
    '</svg>';
  return new Resvg(doc, { font: RESVG_FONT, fitTo: { mode: 'width', value: 300 } }).render().pixels;
};
ok('A3 every variant rasterizes with real ink, and its ink differs from its source', () => {
  for (const a of ASSETS_WEAR) {
    const px = raster(a.svg);
    const sp = raster(BY_ID.get(a.wearOf).svg);
    let ink = 0;
    let diff = 0;
    for (let i = 3; i < px.length; i += 4) {
      if (px[i] > 8) ink++;
      if (Math.abs(px[i] - sp[i]) > 64) diff++;
    }
    assert.ok(ink > 1000, `${a.id}: real ink (${ink})`);
    assert.ok(diff > 40, `${a.id}: the wear shows (${diff} px differ from ${a.wearOf})`);
  }
});

// ── B · poem-only ───────────────────────────────────────────────────────
ok('B1 catalogue members, never authored, in the poem-only union, on no dealing surface', () => {
  for (const id of WEAR_STAMP_IDS) {
    assert.ok(BY_ID.has(id), `${id}: in the catalogue`);
    assert.ok(POEM_ONLY_STAMP_IDS.has(id), `${id}: poem-only`);
  }
  assert.ok(!ASSETS_AUTHORED.some((a) => WEAR_STAMP_IDS.has(a.id)), 'the authored bake never names one');
  assert.ok(!poolDescriptors().some((r) => WEAR_STAMP_IDS.has(r.id)), 'the pool panel shows none');
  for (const ch of ['swiss', 'now']) assert.ok(!chapterAssets(ch).some((id) => WEAR_STAMP_IDS.has(id)), `chapter ${ch}: none`);
  assert.ok(!dealableRecords(ASSETS).some((r) => WEAR_STAMP_IDS.has(r.id)), 'the KINETIC roll deals none');
  // the dice chokepoint: the pack's presence moves nothing (a seeded census, with and without the worn letters)
  const census = (pool) => {
    const rng = mkRng(2010);
    const out = [];
    for (let i = 0; i < 300; i++) out.push(dealCast(pool, 5, rng, 0.5, []).map((a) => a.id).join(','));
    return out;
  };
  assert.deepStrictEqual(census(ASSETS), census(ASSETS.filter((a) => !WEAR_STAMP_IDS.has(a.id))));
  const live = fs.readFileSync('src/gl/liveResolve.mjs', 'utf8');
  assert.ok(/\.\.\.ASSETS_WEAR,/.test(live), 'the placeable pool excludes the pack');
  const studio = fs.readFileSync('../studio/render.mjs', 'utf8');
  assert.ok(/\.\.\.ASSETS_WEAR\]\.map/.test(studio), 'the stills path (studio/render.mjs) excludes the pack from its placeable pool');
});

ok('B2 no placement resolves one; worn stamps measure with their source ruler', () => {
  for (const ch of 'AaWgRz') {
    assert.ok(!WEAR_STAMP_IDS.has(stampIdForGlyph(ch)), `${ch}: base resolver never wears`);
    assert.ok(!WEAR_STAMP_IDS.has(serifStampIdForChar(ch)), `${ch}: serif resolver never wears`);
  }
  for (const a of ASSETS_WEAR) assert.equal(stampWidthEm(a.id, a.glyph), stampWidthEm(a.wearOf, a.glyph), a.id);
  assert.equal(stampWidthEm('typ_tn_s_W', 'W'), serifGlyphWidthEm('W'));
  assert.equal(stampWidthEm('typ_xr_W', 'W'), glyphWidthEm('W'));
  assert.ok(ASSETS_SERIF.every((a) => wearStampIdFor(a.id, 'torn')), 'every serif letter can tear');
});

// ── C · the treatment ───────────────────────────────────────────────────
const forms = [
  fieldFormForDeal({ poetId: 'teijo', pieceId: 't1', script: 'kana' }, mkRng(42)),
  fieldFormForDeal({ poetId: 'teijo', pieceId: 't3' }, mkRng(3)),
  fieldFormForDeal({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(5)),
  fieldFormForDeal({ poetId: 'greenleaf', pieceId: 'g2', face: 'serif' }, mkRng(7)),
  fieldFormForDeal({ poetId: 'rosselli', pieceId: 'r1' }, mkRng(11)),
].filter(Boolean);
assert.ok(forms.length >= 3, 'fixtures deal');
const geo = (s) => [s.ch, s.x, s.y, s.rotation, s.em];

ok('C1 CARSON and SHOT wear their own letters only — geometry, ch, count, order identical to the unworn blast', () => {
  let moved = 0;
  let total = 0;
  const kinds = new Set();
  for (const form of forms)
    for (const mode of ['carson', 'shot'])
      for (let seed = 1; seed <= 12; seed++) {
        const plain = rayGunForm(form, { mode, seed });
        const worn = rayGunForm(form, { mode, seed, wear: 1 });
        assert.equal(worn.stamps.length, plain.stamps.length);
        worn.stamps.forEach((s, i) => {
          const p = plain.stamps[i];
          assert.deepStrictEqual(geo(s), geo(p), 'only the face may move');
          total++;
          if (s.assetId !== p.assetId) {
            moved++;
            assert.equal(WEAR_SOURCE_BY_ID.get(s.assetId), p.assetId, `${s.assetId} wears ${p.assetId}`);
            assert.equal(BY_ID.get(s.assetId).glyph, s.ch, 'its own letter');
            kinds.add(BY_ID.get(s.assetId).tags.includes('torn') ? 'torn' : 'xerox');
          }
        });
        const { stamps: _a, ...restW } = worn;
        const { stamps: _b, ...restP } = plain;
        assert.deepStrictEqual(restW, restP, 'every other field of the form rides unchanged');
      }
  const share = moved / total;
  assert.ok(share > 0.2 && share < 0.75, `a share of the letters wear (${share.toFixed(3)})`);
  assert.deepStrictEqual([...kinds].sort(), ['torn', 'xerox']);
});

ok('C2 GREIMAN never wears; deterministic per seed; seeds differ', () => {
  for (const form of forms)
    for (let seed = 1; seed <= 6; seed++)
      assert.deepStrictEqual(rayGunForm(form, { mode: 'greiman', seed, wear: 1 }), rayGunForm(form, { mode: 'greiman', seed }));
  const f = forms[1];
  assert.deepStrictEqual(rayGunForm(f, { mode: 'carson', seed: 42, wear: 1 }), rayGunForm(f, { mode: 'carson', seed: 42, wear: 1 }));
  const ids = (seed) => rayGunForm(f, { mode: 'shot', seed, wear: 1 }).stamps.map((s) => s.assetId).join();
  assert.notEqual(ids(1), ids(2));
});

ok('C3 a letter with no variant keeps its stamp (digits, punctuation, the native face)', () => {
  const native = forms[0];
  assert.ok(native.stamps.some((s) => /^typ_[hkj]_/.test(s.assetId)), 'fixture: a native form');
  for (let seed = 1; seed <= 8; seed++) {
    const worn = rayGunForm(native, { mode: 'shot', seed, wear: 1 });
    native.stamps.forEach((p, i) => {
      if (/^typ_[hkj]_/.test(p.assetId)) assert.equal(worn.stamps[i].assetId, p.assetId, 'native glyphs never wear in P1');
    });
  }
  const synth = { ...forms[1], stamps: forms[1].stamps.map((s) => ({ ...s, ch: '7', assetId: 'typ_7' })) };
  for (let seed = 1; seed <= 4; seed++)
    assert.ok(rayGunForm(synth, { mode: 'shot', seed, wear: 1 }).stamps.every((s) => s.assetId === 'typ_7'));
});

// ── D · replay + the door + the store ───────────────────────────────────
ok('D1 a record without wear draws the pre-P1 blast exactly (no worn id anywhere)', () => {
  for (const form of forms)
    for (const mode of ['carson', 'greiman', 'grit', 'shot'])
      for (let seed = 1; seed <= 6; seed++) {
        const out = rayGunForm(form, { mode, seed });
        assert.ok(out.stamps.every((s) => !WEAR_STAMP_IDS.has(s.assetId)));
        assert.deepStrictEqual(rayGunForm(form, { mode, seed, wear: undefined }), out);
      }
  assert.equal(rayGunForm(forms[1], { mode: 'carson', seed: 3, wear: 2 }).stamps.some((s) => WEAR_STAMP_IDS.has(s.assetId)), false, 'only wear: 1 wears');
});

ok('D2 the door carries wear: 1, adds no key without it, refuses any other value', () => {
  const f = forms[1];
  const withWear = sanitizeFieldForm({ ...f, raygun: { mode: 'carson', seed: 9, wear: 1 } });
  assert.deepStrictEqual(withWear.raygun, { mode: 'carson', seed: 9, wear: 1 });
  const without = sanitizeFieldForm({ ...f, raygun: { mode: 'carson', seed: 9 } });
  assert.deepStrictEqual(without.raygun, { mode: 'carson', seed: 9 });
  assert.ok(!('wear' in without.raygun), 'no key added to a pre-P1 record');
  for (const bad of [0, 2, true, '1', null]) assert.equal(sanitizeFieldForm({ ...f, raygun: { mode: 'carson', seed: 9, wear: bad } }), null, `wear ${bad}`);
  // the stored stamps stay plain: the door never sees a worn id
  assert.ok(withWear.stamps.every((s) => !WEAR_STAMP_IDS.has(s.assetId)));
});

ok('D3 the store arms name the wear axis', () => {
  const base = useStore.getState();
  useStore.setState({
    seed: 0x1918,
    layoutParams: { ...base.layoutParams, composition: 'raster', fieldForm: forms[1] },
    raygunTap: 0,
    historyUndoStack: [],
  });
  useStore.getState().cyclePoemRaygun();
  assert.equal(useStore.getState().layoutParams.fieldForm.raygun.wear, 1);
  useStore.getState().setPoemRaygun('shot');
  assert.equal(useStore.getState().layoutParams.fieldForm.raygun.wear, 1);
});

console.log(`rayGunWear.selfcheck: ok (${passed} checks)`);
