// rayGunDistort.selfcheck.mjs — #2010 (RAY GUN P3): the type producer for the shared distortion channel.
//
// Pins:
//   A  the record names the axis: `distort: 1` — the door carries it (no key added without it, any other value
//      refused); new arms stamp it; a record without it draws exactly as before (old takes replay)
//   B  the stage moves nothing else: geometry, `ch`, assetId (wear), count and order are identical with the axis on
//      or off; GREIMAN and GRIT stay clean; CARSON distorts a seeded share; SHOT distorts by its own falloff
//   C  determinism + bounds: same record, same distortion; every record is within the channel's law
//   D  the seam: the resolver (buildPlacements) carries a glyph's record to its item, and only a treated glyph's
import assert from 'node:assert';
import { rayGunForm } from './rayGunForm.js';
import { fieldFormForDeal, sanitizeFieldForm } from './fieldForm.js';
import { mkRng } from '../engine/prng.js';
import { contractDistort, distortError } from '../gl/itemDistort.mjs';
import { CORPUS } from '../gl/parity/corpus.mjs';
import { resolveLayers } from '../../../studio/render.mjs';
import { getRenderCaps } from '../data/quality.js';
import { useStore } from '../state/store.js';

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};
console.log('rayGunDistort.selfcheck');

const forms = [
  fieldFormForDeal({ poetId: 'teijo', pieceId: 't4' }, mkRng(1)),
  fieldFormForDeal({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(5)),
  fieldFormForDeal({ poetId: 'greenleaf', pieceId: 'g2', face: 'serif' }, mkRng(7)),
  fieldFormForDeal({ poetId: 'teijo', pieceId: 't1', script: 'kana' }, mkRng(42)),
].filter(Boolean);
const SEEDS = Array.from({ length: 16 }, (_, i) => 3 + i * 6007);
const MODES = ['carson', 'greiman', 'shot'];
const strip = (s) => {
  const { distort: _d, ...rest } = s;
  return rest;
};

// ── A · the record ──────────────────────────────────────────────────────
ok('A1 the door carries distort: 1, adds no key without it, refuses any other value', () => {
  const f = forms[0];
  assert.deepStrictEqual(sanitizeFieldForm({ ...f, raygun: { mode: 'shot', seed: 4, wear: 1, distort: 1 } }).raygun, {
    mode: 'shot',
    seed: 4,
    wear: 1,
    distort: 1,
  });
  assert.ok(!('distort' in sanitizeFieldForm({ ...f, raygun: { mode: 'shot', seed: 4 } }).raygun));
  for (const bad of [0, 2, true, '1', null]) assert.equal(sanitizeFieldForm({ ...f, raygun: { mode: 'shot', seed: 4, distort: bad } }), null);
  const stored = sanitizeFieldForm({ ...f, raygun: { mode: 'carson', seed: 4, distort: 1 } });
  assert.ok(stored.stamps.every((s) => !('distort' in s)), 'the stored stamps never carry a distortion');
});

ok('A2 new arms name the axis; a record without it draws exactly as before', () => {
  const base = useStore.getState();
  useStore.setState({ seed: 0x1918, layoutParams: { ...base.layoutParams, composition: 'raster', fieldForm: forms[1] }, raygunTap: 0, historyUndoStack: [] });
  useStore.getState().cyclePoemRaygun();
  assert.equal(useStore.getState().layoutParams.fieldForm.raygun.distort, 1);
  for (const f of forms)
    for (const mode of MODES)
      for (const seed of SEEDS.slice(0, 4)) {
        const out = rayGunForm(f, { mode, seed, wear: 1 });
        assert.ok(out.stamps.every((s) => !('distort' in s)), 'no axis, no record');
        assert.equal(rayGunForm(f, { mode, seed, wear: 1, distort: 2 }).stamps.some((s) => 'distort' in s), false, 'only distort: 1');
      }
});

// ── B · the stage moves nothing else ────────────────────────────────────
ok('B1 geometry, ch, assetId, count and order identical with the axis on or off', () => {
  for (const f of forms)
    for (const mode of MODES)
      for (const seed of SEEDS) {
        const off = rayGunForm(f, { mode, seed, wear: 1 });
        const on = rayGunForm(f, { mode, seed, wear: 1, distort: 1 });
        assert.equal(on.stamps.length, off.stamps.length);
        on.stamps.forEach((s, i) => assert.deepStrictEqual(strip(s), off.stamps[i]));
        const { stamps: _a, ...restOn } = on;
        const { stamps: _b, ...restOff } = off;
        assert.deepStrictEqual(restOn, restOff);
      }
});

ok('B2 GREIMAN stays clean; CARSON distorts a seeded share; SHOT distorts by its falloff', () => {
  let carsonShare = 0;
  let carsonN = 0;
  let shotHeat = 0;
  let shotN = 0;
  for (const f of forms)
    for (const seed of SEEDS) {
      assert.ok(rayGunForm(f, { mode: 'greiman', seed, distort: 1 }).stamps.every((s) => !s.distort), 'greiman clean');
      const c = rayGunForm(f, { mode: 'carson', seed, distort: 1 }).stamps;
      carsonShare += c.filter((s) => s.distort).length;
      carsonN += c.length;
      // SHOT: every glyph is in the blast — each carries a record (the lean follows the swirl everywhere)
      const sh = rayGunForm(f, { mode: 'shot', seed, distort: 1 }).stamps;
      shotHeat += sh.filter((x) => x.distort && x.distort.tear + x.distort.melt > 0).length;
      shotN += sh.length;
    }
  const share = carsonShare / carsonN;
  assert.ok(share > 0.2 && share < 0.75, `CARSON distorts a share (${share.toFixed(3)})`);
  const heat = shotHeat / shotN;
  assert.ok(heat > 0.05 && heat < 0.9, `SHOT tears or melts the glyphs near its epicentre (${heat.toFixed(3)})`);
});

// ── C · determinism + bounds ────────────────────────────────────────────
ok('C1 same record, same distortion; every record within the channel law', () => {
  for (const f of forms)
    for (const mode of ['carson', 'shot']) {
      const a = rayGunForm(f, { mode, seed: 77, distort: 1 });
      assert.deepStrictEqual(a, rayGunForm(f, { mode, seed: 77, distort: 1 }));
      for (const seed of SEEDS)
        for (const s of rayGunForm(f, { mode, seed, distort: 1 }).stamps) {
          if (!s.distort) continue;
          const c = contractDistort(s.distort);
          assert.ok(c, 'a stamped record is never empty');
          assert.equal(distortError(c), null);
        }
    }
});

// ── D · the seam ────────────────────────────────────────────────────────
ok('D1 the resolver carries a treated glyph’s record to its item (buildPlacements), and only then', () => {
  const items = (fieldForm) => {
    const doc = structuredClone(CORPUS[0].doc);
    doc.layoutParams = { ...doc.layoutParams, count: 0, composition: 'raster', fieldForm };
    const caps = getRenderCaps(doc.quality || 'balanced', false);
    return resolveLayers(doc, { caps })
      .flatMap((l) => l.items ?? [])
      .filter((it) => String(it.key ?? '').startsWith('field-'));
  };
  const plain = items(forms[0]);
  const armed = items({ ...forms[0], raygun: { mode: 'shot', seed: 11, wear: 1, distort: 1 } });
  assert.ok(plain.length > 0 && plain.every((it) => !('distort' in it)), 'a plain poem’s items carry none');
  const treated = rayGunForm(forms[0], { mode: 'shot', seed: 11, wear: 1, distort: 1 }).stamps;
  assert.equal(armed.length, treated.length);
  armed.forEach((it, j) => assert.deepStrictEqual(it.distort, treated[j].distort, `item ${j} carries its glyph’s record`));
});

console.log(`rayGunDistort.selfcheck: ok (${passed} checks)`);
