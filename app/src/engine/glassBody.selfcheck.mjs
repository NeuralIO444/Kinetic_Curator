// glassBody.selfcheck.mjs — #1547 (Materials M1): the material:'glass' body.
//
// Pins the M1 contract end to end:
//  - the switch (isGlassMaterial) and the body constant;
//  - placements: a glass material flags every placed item, attenuates
//    its alpha by exactly GLASS_BODY_ALPHA, and engages the back-to-front
//    sort — while 'plate'/'flat' placements are untouched (parity) and
//    the #1129 glass BOOL keeps its own un-attenuated alpha (its
//    translucency is the voice's alpha range, not the material's);
//  - the scene contract: the glass flag rides onto contract instances
//    only when set, so a non-glass contract is byte-identical in shape
//    to the pre-M1 contract (no key, no hash change);
//  - the export warning: 'glass' undisclosed since M1; since M3 the
//    warning covers exactly the two colour-ramp bodies that don't
//    survive the GL export — plate and wash — exactly once each
//    (stipple's screen survives the export; flat is not a body).
import assert from 'node:assert';
import { isGlassMaterial, GLASS_BODY_ALPHA, GLASS_MATERIAL, glassAlphaFrom } from './glassBody.mjs';
import { place } from '../curator/censusReport.mjs';
import { buildSceneContract, warnUnsupportedMaterials } from '../gl/sceneContract.js';
import { resolveLayers } from '../../../studio/render.mjs';
import { getRenderCaps } from '../data/quality.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS } from '../data/assets/index.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

// ── the switch ─────────────────────────────────────────────────────────
ok('isGlassMaterial: only the glass material engages', () => {
  assert.equal(GLASS_MATERIAL, 'glass');
  assert.equal(isGlassMaterial('glass'), true);
  for (const other of ['plate', 'flat', 'wash', 'stipple', '', undefined, null]) {
    assert.equal(isGlassMaterial(other), false, `material ${String(other)} must not engage glass`);
  }
  assert.ok(GLASS_BODY_ALPHA > 0 && GLASS_BODY_ALPHA < 1, 'body alpha is an attenuation');
});

// ── placements (the census fixture: fibonacci, PLACE_BASE shape) ──────
const BASE = { count: 60, kinemeBreath: 0.3, kinemeDrift: 0.5, kinemePaletteBreath: 0.12, mode: 'fibonacci' };
const byIndex = (items) => new Map(items.map((it) => [it.index, it]));
const flat = place({ ...BASE, material: 'flat' });
const plate = place({ ...BASE, material: 'plate' });
const glass = place({ ...BASE, material: 'glass' });

ok('glass material: every item flagged, alpha attenuated exactly, sorted back-to-front', () => {
  assert.ok(glass.length > 0);
  const f = byIndex(flat);
  for (const g of glass) {
    assert.equal(g.glass, true, 'every glass-material item carries the flag');
    const src = f.get(g.index);
    assert.ok(src, 'glass item has a flat counterpart');
    assert.equal(g.alpha, src.alpha * GLASS_BODY_ALPHA, 'alpha is the flat alpha times the body constant');
    assert.equal(g.x, src.x); assert.equal(g.y, src.y); assert.equal(g.scale, src.scale);
  }
  const zt = glass.map((i) => i.zTier ?? 0);
  assert.ok(zt.every((v, k) => k === 0 || v >= zt[k - 1]), 'glass subsequence is back-to-front (z-tier ascending)');
});

ok('parity: plate and flat placements are identical; plate carries only its own flag (#1548)', () => {
  const p = byIndex(plate);
  assert.equal(plate.length, flat.length);
  for (const it of flat) {
    assert.ok(!it.glass, 'flat item carries no glass flag');
    const q = p.get(it.index);
    assert.ok(q && !q.glass, 'plate item carries no glass flag');
    // #1548 (Materials M2): plate flags its items for the shader/still
    // ramp — geometry, alpha and colour are untouched by the flag.
    assert.equal(q.plate, true, 'plate item carries the plate flag since M2');
    assert.equal(q.alpha, it.alpha); assert.equal(q.x, it.x); assert.equal(q.y, it.y);
  }
});

ok('the #1129 glass bool keeps its own alpha; bool + material attenuates once', () => {
  const f = byIndex(flat);
  const boolOnly = place({ ...BASE, material: 'plate', glass: true });
  for (const b of boolOnly) {
    assert.equal(b.glass, true);
    assert.equal(b.alpha, f.get(b.index).alpha, 'bool path alpha is the voice range, un-attenuated');
  }
  const both = place({ ...BASE, material: 'glass', glass: true });
  for (const b of both) {
    assert.equal(b.alpha, f.get(b.index).alpha * GLASS_BODY_ALPHA, 'material attenuation applies exactly once');
  }
});

ok('repeat builds are identical (the multiply never compounds)', () => {
  const again = place({ ...BASE, material: 'glass' });
  assert.deepEqual(again.map((i) => i.alpha), glass.map((i) => i.alpha));
});

ok('#1585: glassAlpha is a live param; the shipped constant is its default', () => {
  assert.equal(glassAlphaFrom({}), GLASS_BODY_ALPHA, 'absent resolves to the shipped constant');
  assert.equal(glassAlphaFrom({ glassAlpha: NaN }), GLASS_BODY_ALPHA, 'garbage resolves to the shipped constant');
  assert.equal(glassAlphaFrom({ glassAlpha: 0.5 }), 0.5);
  const f = byIndex(flat);
  const half = place({ ...BASE, material: 'glass', glassAlpha: 0.5 });
  assert.ok(half.length > 0);
  for (const g of half) {
    assert.equal(g.alpha, f.get(g.index).alpha * 0.5, 'the param, not the constant, attenuates');
  }
  const clear = place({ ...BASE, material: 'glass', glassAlpha: 0 });
  assert.ok(clear.every((i) => i.alpha === 0), 'glassAlpha 0: the body keeps none of its rolled alpha');
});

// ── the scene contract ─────────────────────────────────────────────────
const enabledAssets = Object.fromEntries(ASSETS.map((a) => [a.id, true]));
const caps = getRenderCaps('balanced', false);
function docWith(material) {
  return {
    version: 1, seed: 1234, paletteId: 'praystation', paletteOverrides: null,
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, lifeDrift: 0, count: 24, material },
    enabledAssets, quality: 'balanced',
    layers: [{ id: 'bg', name: 'BG', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'bg', layerSnapshots: {},
  };
}
const contractFor = (material) => {
  const doc = docWith(material);
  return buildSceneContract({ doc, resolvedLayers: resolveLayers(doc, { caps }), caps });
};

ok('contract: glass instances carry the flag; non-glass contracts gain no key', () => {
  const g = contractFor('glass');
  const gInst = g.instances.filter((i) => i.layer === 'bg');
  assert.ok(gInst.length > 0, 'glass doc produced instances');
  assert.ok(gInst.every((i) => i.glass === true), 'every instance of a glass stratum carries glass:true');
  const p = contractFor('plate');
  const pInst = p.instances.filter((i) => i.layer === 'bg');
  assert.ok(pInst.length > 0, 'plate doc produced instances');
  assert.ok(pInst.every((i) => !('glass' in i)), 'plate contract has no glass key anywhere (hash parity)');
});

// ── the export warning ─────────────────────────────────────────────────
ok('warnUnsupportedMaterials: exactly plate + wash disclosed once each; glass/stipple/flat silent', () => {
  const warns = [];
  const orig = console.warn;
  console.warn = (msg) => warns.push(String(msg));
  try {
    const wing = (material) => [{ layoutParams: { material }, items: [{ role: 'wing' }] }];
    warnUnsupportedMaterials(wing('glass'));
    assert.equal(warns.length, 0, 'glass carries no warning since M1 (its body survives the export)');
    warnUnsupportedMaterials(wing('stipple'));
    assert.equal(warns.length, 0, 'stipple carries no warning since M3 (its screen survives the export)');
    warnUnsupportedMaterials(wing('flat'));
    assert.equal(warns.length, 0, 'flat is not a body — nothing to disclose');
    warnUnsupportedMaterials(wing('plate'));
    assert.equal(warns.length, 1, 'plate disclosed: its ramp does not survive the GL export (studio.py still)');
    warnUnsupportedMaterials(wing('plate'));
    assert.equal(warns.length, 1, 'disclosed once per material per process');
    warnUnsupportedMaterials(wing('wash'));
    assert.equal(warns.length, 2, 'wash disclosed on the same ground since M3 (#1549)');
    warnUnsupportedMaterials([{ layoutParams: { material: 'wash' }, items: [{ role: 'body' }] }]);
    assert.equal(warns.length, 2, 'non-wing layers never warned');
  } finally {
    console.warn = orig;
  }
});

console.log(`glassBody.selfcheck: OK (${n} cases)`);
