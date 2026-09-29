// subAnim.selfcheck — baked frame strips for asset sub-animation.
import assert from 'node:assert';
import {
  frameId, baseAssetId, frameIndexOf,
  sampleRig, expandSubFrames, frameIndexFor, phaseFor,
  studioPartSvg, rigFromStudioParts, hasRig, validSubRig,
} from './subAnim.mjs';

// --- id helpers ---
assert.strictEqual(frameId('anim_dial_01', 3), 'anim_dial_01__f3');
assert.strictEqual(baseAssetId('anim_dial_01__f3'), 'anim_dial_01');
assert.strictEqual(baseAssetId('anim_dial_01'), 'anim_dial_01');
assert.strictEqual(baseAssetId('geo_hex_01'), 'geo_hex_01');
assert.strictEqual(frameIndexOf('anim_dial_01__f3'), 3);
assert.strictEqual(frameIndexOf('anim_dial_01'), -1);

// --- spin: full turn per period ---
const spinRig = [{ svg: '<line x1="50" y1="50" x2="50" y2="20"/>', anim: { kind: 'spin' } }];
assert.ok(sampleRig(spinRig, 0, 2).includes('rotate(0 50 50)'));
assert.ok(sampleRig(spinRig, 1, 2).includes('rotate(180 50 50)'));
assert.ok(sampleRig(spinRig, 2, 2).includes('rotate(0 50 50)'), 'wraps at period');
assert.ok(sampleRig(spinRig, 0.5, 2).includes('rotate(90 50 50)'));

// --- static layer passes through unwrapped ---
const mixedRig = [
  { svg: '<circle cx="50" cy="50" r="30"/>', anim: null },
  { svg: '<line x1="50" y1="50" x2="50" y2="20"/>', anim: { kind: 'spin' } },
];
const mixed = sampleRig(mixedRig, 0, 2);
assert.ok(mixed.startsWith('<circle cx="50" cy="50" r="30"/>'), 'static layer unwrapped');
assert.ok(mixed.includes('<g transform="rotate(0 50 50)">'), 'animated layer wrapped');

// --- osc / pulse ---
const oscRig = [{ svg: '<rect/>', anim: { kind: 'osc', amp: 20 } }];
assert.ok(sampleRig(oscRig, 0, 2).includes('rotate(0 50 50)'));
assert.ok(sampleRig(oscRig, 0.5, 2).includes('rotate(20 50 50)'), 'quarter period = +amp');
assert.ok(sampleRig(oscRig, 1.5, 2).includes('rotate(-20 50 50)'), 'three-quarter = -amp');
const pulseRig = [{ svg: '<circle/>', anim: { kind: 'pulse', amp: 0.25 } }];
assert.ok(sampleRig(pulseRig, 0, 2).includes('scale(1)'));
assert.ok(sampleRig(pulseRig, 0.5, 2).includes('scale(1.25)'));
assert.ok(sampleRig(pulseRig, 1.5, 2).includes('scale(0.75)'));

// --- blink: on/off windows, phase-shiftable ---
const blinkRig = [{ svg: '<path/>', anim: { kind: 'blink' } }];
assert.ok(sampleRig(blinkRig, 0, 2).includes('<path/>'), 'blink on at t=0');
assert.strictEqual(sampleRig(blinkRig, 1, 2), '', 'blink off at half period');
assert.strictEqual(sampleRig(blinkRig, 2, 2).includes('<path/>'), true, 'blink wraps');
const blinkPhase = [{ svg: '<path/>', anim: { kind: 'blink', phase: 0.5 } }];
assert.strictEqual(blinkPhase && sampleRig(blinkPhase, 0, 2), '', 'phase 0.5 shifts window off at t=0');
assert.ok(sampleRig(blinkPhase, 1, 2).includes('<path/>'), 'phase 0.5 on at half period');

// --- march: translate-x loop, wraps every period ---
const marchRig = [{ svg: '<g/>', anim: { kind: 'march', amp: 40 } }];
assert.ok(sampleRig(marchRig, 0, 2).includes('translate(0 0)'));
assert.ok(sampleRig(marchRig, 1, 2).includes('translate(-20 0)'), 'half period = -amp/2');
assert.ok(sampleRig(marchRig, 2, 2).includes('translate(0 0)'), 'wraps at period');

// --- unknown kind / empty rig are safe ---
assert.strictEqual(sampleRig([{ svg: '<x/>', anim: { kind: 'nope' } }], 1, 2), '<x/>');
assert.strictEqual(sampleRig([], 1, 2), '');
assert.strictEqual(sampleRig(null, 1, 2), '');

// --- expandSubFrames ---
const asset = { id: 'anim_dial_01', sub: { frames: 4, period: 2, rig: spinRig } };
const frames = expandSubFrames(asset);
assert.strictEqual(frames.length, 4);
assert.deepStrictEqual(frames.map((f) => f.id), ['anim_dial_01__f0', 'anim_dial_01__f1', 'anim_dial_01__f2', 'anim_dial_01__f3']);
assert.ok(frames[0].svg.includes('rotate(0 50 50)'));
assert.ok(frames[2].svg.includes('rotate(180 50 50)'));
assert.deepStrictEqual(expandSubFrames({ id: 'geo_hex_01' }), [], 'no sub -> no frames');
assert.deepStrictEqual(expandSubFrames({ id: 'x', sub: { frames: 4, period: 2, rig: [] } }), [], 'empty rig -> no frames');

// --- frameIndexFor: index math incl. phase ---
const sub = { frames: 8, period: 1.6 };
assert.strictEqual(frameIndexFor(sub, 0), 0);
assert.strictEqual(frameIndexFor(sub, 0.2), 1, '0.2s into 1.6s/8f -> frame 1');
assert.strictEqual(frameIndexFor(sub, 1.6), 0, 'wraps at period');
assert.strictEqual(frameIndexFor(sub, 3.2), 0, 'wraps at 2 periods');
assert.strictEqual(frameIndexFor(sub, 0, 0.8), 4, 'phase 0.8s offsets by 4 frames');
assert.strictEqual(frameIndexFor(sub, -0.2), 7, 'negative time wraps to last frame');

// --- phaseFor: deterministic, spread, bounded ---
const p1 = phaseFor(sub, 3, 'abc');
const p2 = phaseFor(sub, 3, 'abc');
assert.strictEqual(p1, p2, 'deterministic');
assert.ok(p1 >= 0 && p1 < 1.6, 'bounded by period');
const phases = new Set(Array.from({ length: 50 }, (_, i) => phaseFor(sub, i, `k${i}`).toFixed(3)));
assert.ok(phases.size > 40, `spread across instances (got ${phases.size}/50 unique)`);

// --- studio bridge: parts -> rig ---
const studioParts = [
  { kind: 'ellipse', x: 50, y: 50, rot: 0, sx: 1, sy: 1, token: 'ink', stroke: false, anim: { kind: 'none', amp: 20, phase: 0 } },
  { kind: 'rect', x: 50, y: 50, rot: 0, sx: 1, sy: 1, token: 'accent', stroke: false, anim: { kind: 'spin', amp: 0, phase: 0 } },
];
const sps = studioPartSvg(studioParts[0]);
assert.ok(sps.includes('<g style="color: var(--ink)"'), 'studio part paints via token');
assert.ok(sps.includes('translate(50 50) rotate(0) scale(1 1) translate(-50 -50)'), 'studio part transform baked');
assert.ok(sps.includes('<ellipse'), 'primitive inner markup present');
assert.strictEqual(hasRig(studioParts), true, 'spin part activates rig');
assert.strictEqual(hasRig([studioParts[0]]), false, 'all-none -> no rig');
assert.strictEqual(hasRig([]), false, 'empty -> no rig');
const rig = rigFromStudioParts(studioParts);
assert.strictEqual(rig.length, 2);
assert.strictEqual(rig[0].anim, null, 'none-kind layer is static');
assert.deepStrictEqual(rig[1].anim, { kind: 'spin', amp: 0, phase: 0 });
const rigSvg = sampleRig(rig, 0.6, 2.4);
assert.ok(rigSvg.includes('rotate(90 50 50)'), 'rig sample drives the animated layer');
// legacy parts without anim field (pre-rig saves) behave as static
const legacyRig = rigFromStudioParts([{ kind: 'dot', x: 50, y: 50, rot: 0, sx: 1, sy: 1, token: 'ink', stroke: false }]);
assert.strictEqual(legacyRig[0].anim, null);
assert.strictEqual(hasRig([{ kind: 'dot' }]), false);

// --- validSubRig: storage validation fails closed ---
const goodSub = { frames: 8, period: 1.6, rig: [{ svg: '<circle/>', anim: { kind: 'pulse', amp: 0.3, phase: 0 } }, { svg: '<rect/>', anim: null }] };
const clean = validSubRig(goodSub);
assert.ok(clean && clean.frames === 8 && clean.period === 1.6 && clean.rig.length === 2);
assert.strictEqual(validSubRig(null), null);
assert.strictEqual(validSubRig({}), null);
assert.strictEqual(validSubRig({ frames: 1, period: 1.6, rig: [{ svg: '<x/>' }] }), null, 'frames < 2 rejected');
assert.strictEqual(validSubRig({ frames: 8, period: 0, rig: [{ svg: '<x/>' }] }), null, 'period 0 rejected');
assert.strictEqual(validSubRig({ frames: 8, period: 1.6, rig: [] }), null, 'empty rig rejected');
assert.strictEqual(validSubRig({ frames: 8, period: 1.6, rig: [{ svg: '<x/>', anim: { kind: 'spin' } }] }).rig[0].anim.kind, 'spin');
assert.strictEqual(validSubRig({ frames: 8, period: 1.6, rig: [{ svg: '' }] }), null, 'empty svg rejected');
assert.strictEqual(validSubRig({ frames: 8, period: 1.6, rig: [{ svg: '<x/>', anim: { kind: 'explode' } }] }), null, 'unknown kind -> all-static -> rejected');
assert.strictEqual(validSubRig({ frames: 8, period: 1.6, rig: [{ svg: '<x/>', anim: { kind: 'none' } }] }), null, 'all-static rig rejected');

// --- per-tick idempotence: the worker looks up by BASE id so a stale __fN
// suffix from the previous tick can never freeze or stack ---
assert.strictEqual(baseAssetId(frameId('anim_dial_01', 3)), 'anim_dial_01', 'base id strips frame suffix');
assert.strictEqual(baseAssetId('anim_dial_01'), 'anim_dial_01', 'base id untouched when plain');
assert.strictEqual(frameIndexOf('anim_dial_01__f3'), 3);
assert.strictEqual(frameIndexOf('anim_dial_01'), -1);
assert.strictEqual(frameId(baseAssetId(frameId('anim_dial_01', 3)), 7), 'anim_dial_01__f7', 're-framing never stacks suffixes');

console.log('subAnim selfcheck ok');
