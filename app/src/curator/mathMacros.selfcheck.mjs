// mathMacros.selfcheck.mjs — #724: assignable macro knobs over fine-grain sliders.
// Pure module contract: registry, sanitize, assign/unassign/invert, drive math.
import assert from 'node:assert';
import {
  LEARNABLE_TARGETS, getTargetSpec, sanitizeMathMacros,
  createMacro, addMacro, removeMacro, renameMacro,
  assignTarget, unassignTarget, toggleInvert, drivePatch,
  MATH_MAX_MACROS, MATH_MAX_TARGETS,
} from './mathMacros.js';

let n = 0;
const ok = (cond, msg) => { n++; assert(cond, msg); };

// --- registry ---------------------------------------------------------------
ok(LEARNABLE_TARGETS.length > 40, `registry is broad (${LEARNABLE_TARGETS.length})`);
const keys = new Set(LEARNABLE_TARGETS.map((t) => t.key));
for (const k of ['jitter', 'density', 'hueRotate', 'audioModDepth', 'audioSwell',
  'swarmCohesion', 'damping', 'accumulationWetness', 'scale', 'rotate', 'alpha',
  'growthRate', 'metabolism', 'parallax']) {
  ok(keys.has(k), `learnable: ${k}`);
}
// Atlas-affecting counts stay human-paced: a macro sweeping COUNT would
// rebake the atlas every frame.
for (const k of ['count', 'particleCount', 'lsysDepth', 'body']) {
  ok(!keys.has(k), `excluded (atlas-affecting): ${k}`);
}
// Spec-only keys with no slider, and bitmasks, are not learnable.
for (const k of ['collideMask', 'contactRadius', 'contactRestitution', 'contactRepel']) {
  ok(!keys.has(k), `excluded (no slider): ${k}`);
}
ok(getTargetSpec('nope') === null, 'unknown key -> null');
const damp = getTargetSpec('damping');
ok(damp.min === 0.80 && damp.max === 0.99 && damp.label === 'DAMPING', 'spec carries label + span');
ok(getTargetSpec('scale').isRange === true, 'scale is a range target');

// --- sanitize (hostile docs collapse) ---------------------------------------
ok(JSON.stringify(sanitizeMathMacros(null)) === '[]', 'null -> []');
ok(JSON.stringify(sanitizeMathMacros('x')) === '[]', 'string -> []');
{
  const out = sanitizeMathMacros([
    { id: 'a', name: 'Big', targets: [{ key: 'jitter', invert: true }, { key: 'nope' }, { key: 'jitter' }] },
    { id: '', name: 'bad' },
    { id: 'a', name: 'dup' },
    'junk',
  ]);
  ok(out.length === 1, 'one valid macro survives');
  ok(out[0].targets.length === 1 && out[0].targets[0].invert === true, 'unknown + dup targets dropped');
}
{
  const many = Array.from({ length: 9 }, (_, i) => ({ id: `m${i}`, name: 'x', targets: [] }));
  ok(sanitizeMathMacros(many).length === MATH_MAX_MACROS, 'macro cap applies');
  const macro = { id: 't', name: 'x', targets: Array.from({ length: 60 }, (_, i) => ({ key: 'jitter' })) };
  ok(sanitizeMathMacros([macro])[0].targets.length <= MATH_MAX_TARGETS, 'target cap applies');
}

// --- macro list edits --------------------------------------------------------
let macros = [];
const m1 = createMacro('id-1', '  Swell  ');
ok(m1.name === 'Swell', 'name trimmed');
macros = addMacro(macros, m1);
ok(macros.length === 1, 'add works');
ok(addMacro(macros, m1) === macros, 'duplicate id refused');
macros = renameMacro(macros, 'id-1', 'Bigger');
ok(macros[0].name === 'Bigger', 'rename works');
ok(renameMacro(macros, 'id-1', '   ') === macros, 'blank rename refused');
macros = removeMacro(macros, 'id-1');
ok(macros.length === 0, 'remove works');
ok(removeMacro(macros, 'zzz') === macros, 'remove unknown is a no-op');

// --- learn assign ------------------------------------------------------------
macros = addMacro([], createMacro('m', 'M'));
macros = assignTarget(macros, 'm', 'jitter');
macros = assignTarget(macros, 'm', 'damping');
macros = assignTarget(macros, 'm', 'scale');
ok(macros[0].targets.length === 3, 'three wiggles assign three targets');
ok(assignTarget(macros, 'm', 'jitter') === macros, 're-wiggle is idempotent');
ok(assignTarget(macros, 'm', 'count') === macros, 'atlas-affecting key refuses');
ok(assignTarget(macros, 'm', 'nope') === macros, 'unknown key refuses');
ok(assignTarget(macros, 'zzz', 'jitter') === macros, 'unknown macro refuses');
macros = toggleInvert(macros, 'm', 'damping');
ok(macros[0].targets.find((t) => t.key === 'damping').invert === true, 'invert flips');
macros = toggleInvert(macros, 'm', 'damping');
ok(macros[0].targets.find((t) => t.key === 'damping').invert === false, 'invert flips back');
macros = unassignTarget(macros, 'm', 'jitter');
ok(macros[0].targets.length === 2 && !macros[0].targets.some((t) => t.key === 'jitter'), 'unassign drops');

// --- drive math ---------------------------------------------------------------
const params = { jitter: 100, damping: 0.9, scale: [0.5, 1.5], zTiers: 4 };
const tgts = [{ key: 'jitter', invert: false }, { key: 'damping', invert: false }];
{
  // Full sweep up: each target crosses its whole span.
  const p = drivePatch(params, tgts, 1.0, {});
  ok(p.jitter === 200, `jitter full sweep -> max (${p.jitter})`);
  ok(Math.abs(p.damping - 0.99) < 1e-9, `damping full sweep -> max (${p.damping})`);
}
{
  // Half sweep down from mid.
  const p = drivePatch(params, tgts, -0.5, {});
  ok(p.jitter === 0, `jitter half sweep down clamps at min (${p.jitter})`);
  ok(Math.abs(p.damping - (0.9 - 0.5 * 0.19)) < 1e-9, `damping moves proportionally (${p.damping})`);
}
{
  // Invert reverses direction — the spread gesture.
  const p = drivePatch(params, [{ key: 'jitter', invert: true }], 0.5, {});
  ok(p.jitter === 0, `inverted sweep goes down (${p.jitter})`);
}
{
  // Range targets shift both ends, spread preserved, clamped.
  const p = drivePatch(params, [{ key: 'scale', invert: false }], 1.0, {});
  ok(Math.abs(p.scale[0] - 3.0) < 1e-9 && Math.abs(p.scale[1] - 3.0) < 1e-9,
    `scale range shifts to the top, spread clamped (${p.scale})`);
  const p2 = drivePatch({ scale: [0.5, 1.5] }, [{ key: 'scale', invert: false }], 0.1, {});
  ok(Math.abs((p2.scale[1] - p2.scale[0]) - 1.0) < 1e-9, 'spread preserved mid-range');
}
{
  // Int params round.
  const p = drivePatch(params, [{ key: 'zTiers', invert: false }], 0.05, {});
  ok(Number.isInteger(p.zTiers), `int param rounds (${p.zTiers})`);
}
{
  // Locks win: a locked param never moves under the macro.
  const p = drivePatch(params, tgts, 1.0, { jitter: true });
  ok(!('jitter' in p) && 'damping' in p, 'locked target skipped, others drive');
}
{
  // Empty / zero-delta / unknown keys produce no patch.
  ok(Object.keys(drivePatch(params, [], 1.0, {})).length === 0, 'no targets -> no patch');
  ok(Object.keys(drivePatch(params, tgts, 0, {})).length === 0, 'zero delta -> no patch');
  ok(Object.keys(drivePatch(params, [{ key: 'nope', invert: false }], 1.0, {})).length === 0,
    'unknown key -> no patch');
}

console.log(`mathMacros.selfcheck: ${n} assertions passed`);
