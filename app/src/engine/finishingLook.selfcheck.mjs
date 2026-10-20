// node src/engine/finishingLook.selfcheck.mjs
// #1356 — the finishing look pass (both creature families), SHIPPED part + fork guardrails.
// Shipped in this build (presentation layer only, no resolver output moves):
//   - The engraving finish gained its second body-space line family — the longitudinal SEAMS
//     (engraveBody.mjs; creature-system plan §1.3: lines of constant "along" are seams). Proven
//     below: off-spine probes darken at the seam offsets, on-spine probes are the S4 field
//     exactly (the S4 suite, its golden included, passes untouched), and the GLSL carries the
//     same constants as the JS mirror.
// Recorded as forks in STAGING-REPORT.md (NOT shipped — they move the recorded takes, because
// resolver items embed the full asset record, item.asset, svg and baked regions included, so
// any part-art change rehashes every take that draws the part):
//   - F1, the part-pool art enrichment for both families. Its designed art was verified against
//     the two guardrails pinned below BEFORE being forked: every part's auto-attach points
//     bit-identical (anatomy never moves) and every part's governor cost score identical
//     (assets/ingest.js assetCostScore — the assetThin ranking in gl/liveResolve.mjs). The pins
//     below state those guardrails at their pre-pass values: they pass on today's art, and the
//     fork's art was measured passing them too (STAGING-REPORT.md has the table).
//   - F2, the dish accent split. Pinned below as a contract: dish items still carry
//     accent === colour, so within-asset detail cannot show on a disc until F2 lands under a
//     pin ruling. This suite makes that fork's PR change the contract deliberately.
import assert from 'node:assert/strict';
import { autoAttachPoints } from './autoAttach.js';
import { assetCostScore } from '../assets/ingest.js';
import { ASSETS } from '../data/assets/index.js';
import { engraveFactorAt, ENGRAVE_SEAM_OFFSETS, ENGRAVE_SEAM_REL, ENGRAVE_GLSL } from './engraveBody.mjs';
import { createDishCreatureBuilder } from './dishCreature.js';

const byId = (id) => ASSETS.find((a) => a.id === id);

// 1. Fork F1's guardrails, at pre-pass values: anatomy (auto-attach points) and the governor's
//    cost score for every part the two families are skinned from.
const PINNED_ATTACH = {
  org_pod_02: [{ x: 50, y: 8 }, { x: 70, y: 50 }, { x: 50, y: 92 }, { x: 30, y: 50 }], // moth body
  org_leaf_02: [{ x: 50, y: 4 }, { x: 67.25, y: 50 }, { x: 50, y: 96 }, { x: 32.75, y: 50 }], // moth wing
  org_petal_02: [{ x: 50, y: 4 }, { x: 68.75, y: 50.75 }, { x: 50, y: 96 }, { x: 31.4, y: 44.82 }], // fan feather
  org_petal_01: [{ x: 50, y: 6 }, { x: 63.25, y: 51.9 }, { x: 50, y: 94 }, { x: 36.75, y: 51.9 }], // fan leaf
  org_pod_01: [{ x: 50, y: 6 }, { x: 72, y: 50 }, { x: 50, y: 94 }, { x: 28, y: 50 }], // fan plate
  geo_chev_01: [{ x: 28, y: 16 }, { x: 66, y: 50 }, { x: 28, y: 84 }, { x: 20, y: 50 }], // fan chevron ornament
  org_blob_01: [{ x: 50, y: 8 }, { x: 92, y: 48 }, { x: 51.24, y: 92.25 }, { x: 8, y: 52 }], // dish disc
};
for (const [id, want] of Object.entries(PINNED_ATTACH)) {
  assert.deepEqual(autoAttachPoints(byId(id).svg), want, `${id}: attach points are the pre-pass points`);
}
const PINNED_COST = { org_pod_02: 5, org_leaf_02: 2, org_petal_02: 2, org_petal_01: 1, org_pod_01: 2, geo_chev_01: 1, org_blob_01: 1 };
for (const [id, want] of Object.entries(PINNED_COST)) {
  assert.equal(assetCostScore(byId(id).svg), want, `${id}: cost score is the pre-pass score`);
}

// 2. The engraving seams (JS mirror; the GLSL parity is asserted on the constants below).
{
  const straight = [{ x: 50, y: 10 }, { x: 50, y: 50 }, { x: 50, y: 90 }]; // arc 0..80 down the middle
  const P = { spacing: 8, width: 1.5, strength: 0.55 };
  const at = (x, y) => engraveFactorAt({ x, y }, straight, P);
  const near = (a, b, eps = 5e-3) => Math.abs(a - b) < eps;
  // On the spine the field is S4's, exactly: contour centre dark, between contours untouched.
  assert.ok(near(at(50, 10 + 16), 1 - 0.55), 'on-spine contour centre is the S4 value');
  assert.ok(near(at(50, 10 + 44), 1, 1e-9), 'on-spine between contours: no seam reaches the spine');
  // Off the spine at a between-contours arc (44), the seams darken at their offsets and only there.
  assert.ok(at(50 + ENGRAVE_SEAM_OFFSETS[0], 10 + 44) < 0.78, 'seam 1 darkens at its offset');
  assert.ok(at(50 + ENGRAVE_SEAM_OFFSETS[1], 10 + 44) < 0.78, 'seam 2 darkens at its offset');
  assert.ok(near(at(50 + 3, 10 + 44), 1, 1e-9), 'between spine and seam 1: untouched');
  assert.ok(near(at(50 + 8, 10 + 44), 1, 1e-9), 'between the seams: untouched');
  assert.ok(
    near(at(50 + ENGRAVE_SEAM_OFFSETS[0], 10 + 44), 1 - 0.55 * ENGRAVE_SEAM_REL, 0.02),
    'seam strength is ENGRAVE_SEAM_REL of the contour strength (end fade ~1 mid-spine)',
  );
  // The seams bend with the spine: on a bent path the lateral frame follows the segments.
  const bent = [{ x: 50, y: 10 }, { x: 74, y: 50 }, { x: 50, y: 90 }];
  assert.notEqual(engraveFactorAt({ x: 62, y: 30 }, bent, P), at(62, 30), 'the seam field follows a bent spine');
  // GLSL carries the same seam constants as the mirror (parity by construction, the S4 pattern).
  assert.ok(ENGRAVE_GLSL.includes('abs(bestLat) - 5.5') && ENGRAVE_GLSL.includes('abs(bestLat) - 11.0'), 'GLSL seam offsets match ENGRAVE_SEAM_OFFSETS');
  assert.ok(ENGRAVE_GLSL.includes('seam * 0.55'), 'GLSL seam strength matches ENGRAVE_SEAM_REL');
  assert.deepEqual([...ENGRAVE_SEAM_OFFSETS], [5.5, 11]);
  assert.equal(ENGRAVE_SEAM_REL, 0.55);
}

// 3. Fork F2's contract, pinned deliberately: every dish item's accent equals its colour today,
//    so a disc's interior art renders only where a mark's two slots differ — on the dish it
//    waits for the accent split (STAGING-REPORT.md, fork F2).
{
  const PAL = { bg: '#111111', ink: '#eeeeee', swatches: ['#e8762d', '#2a9d8f'] };
  const b = createDishCreatureBuilder();
  let e;
  const input = {
    dishPins: [{ x: 480, y: 330 }], dishFormed: [true], dishHosted: [true], dishPressure: [1],
    seed: 77, seedOffsets: null, loopTimeMs: 0,
    assetAttach: { org_blob_01: [{ x: 50, y: 8, role: 'H' }, { x: 92, y: 50, role: 'L' }] },
  };
  for (let i = 0; i < 200; i++) { e = [{ id: 'a', items: [], palette: PAL }]; b.append(input, e, ASSETS, null, null); }
  const items = e[0].items.filter((i) => i._creature);
  assert.ok(items.length > 0, 'the dish creature drew');
  assert.ok(items.every((i) => i.accent === i.color), 'dish items: accent === colour (fork F2 changes this)');
}

console.log('finishingLook.selfcheck: ok (F1 guardrails, engraving seams, F2 dish accent contract)');
