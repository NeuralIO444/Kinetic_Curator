// mathShaders.selfcheck.mjs — #1010 MATH shader library.
//
// Proves the #1010 contract:
//   - twelve math ops, one fragment shader + one descriptor each, on the
//     #195 template contract (static uniform audits pass, descriptors
//     mirror the MATH_EFFECT_DEFS catalog ranges/defaults)
//   - every `math: true` op declares cost tier 3
//   - NO math op sits in the ACCUM echo/trails feedback path (source-text
//     assertion on gl/accum.mjs — color ops in feedback accumulate)
//   - pure ALU: no noise/history calls (deterministic across renderers)
//   - all twelve register on a bridge through registerTemplateEffect
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  registerTemplateEffect,
  auditEffectSource,
  validateDescriptor,
  __clearTemplateRegistry,
  getTemplateEffect,
} from './template.mjs';
import { getCostTier } from '../costTiers.mjs';
import { MATH_EFFECT_DEFS } from '../../fx/mathFilters.js';
import { MATH_SHADER_EFFECTS, MATH_SHADER_KINDS, registerMathShaders, applyMathMod } from './mathShaders.mjs';

const here = dirname(fileURLToPath(import.meta.url));

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

/** Minimal bridge stub: registerTemplateEffect only needs these three. */
function stubBridge() {
  const effects = new Map();
  return {
    hasEffect: (kind) => effects.has(kind),
    registerProgram: (name) => ({ program: { __stub: name } }),
    defineEffect: (kind, def) => effects.set(kind, def),
    effects,
  };
}
/** Minimal GL stub for the runtime uniform audit (no active uniforms). */
const stubGl = { ACTIVE_UNIFORMS: 0x8b86, getProgramParameter: () => 0, getActiveUniform: () => null };

ok('twelve math ops are declared', () => {
  assert.deepEqual([...MATH_SHADER_KINDS].sort(), [
    'channelMix', 'contrast', 'gain', 'hueRotate', 'knee', 'levelsFixed',
    'lift', 'quantize', 'saturate', 'tempTint', 'threshold', 'vignette',
  ]);
});

ok('every op is tagged math:true and declares tier 3', () => {
  for (const [kind, def] of MATH_SHADER_EFFECTS) {
    assert.equal(def.math, true, `${kind}: math tag`);
    const decl = getCostTier(`math/${kind}`);
    assert.ok(decl, `${kind}: cost declared`);
    assert.equal(decl.tier, 3, `${kind}: tier 3, got ${decl.tier}`);
  }
});

ok('descriptors validate and mirror the MATH_EFFECT_DEFS catalog', () => {
  for (const [kind, def] of MATH_SHADER_EFFECTS) {
    const d = validateDescriptor(kind, def.descriptor);
    const cat = MATH_EFFECT_DEFS[kind];
    assert.ok(cat, `catalog has ${kind}`);
    for (const [pname, p] of Object.entries(cat.params)) {
      const dp = d.params[pname];
      assert.ok(dp, `${kind}.${pname} in descriptor`);
      assert.equal(dp.min, p.min, `${kind}.${pname}.min`);
      assert.equal(dp.max, p.max, `${kind}.${pname}.max`);
      assert.equal(dp.def, p.def, `${kind}.${pname}.def`);
      assert.equal(dp.type, p.type, `${kind}.${pname}.type`);
    }
  }
});

ok('static uniform audits pass for all twelve shaders', () => {
  for (const [kind, def] of MATH_SHADER_EFFECTS) {
    const audit = auditEffectSource(def.fs, validateDescriptor(kind, def.descriptor));
    assert.deepEqual(audit.missingInShader, [], `${kind}: missing uniforms`);
    assert.deepEqual(audit.extraInShader, [], `${kind}: extra uniforms`);
  }
});

ok('shaders are pure ALU — no noise, no history, single texture', () => {
  for (const [kind, def] of MATH_SHADER_EFFECTS) {
    for (const banned of ['kc_fbm', 'kc_vnoise', 'kc_hash12', 'u_time']) {
      assert.ok(!def.fs.includes(banned), `${kind}: must not reference ${banned}`);
    }
    const texs = (def.fs.match(/uniform sampler2D/g) || []).length;
    assert.equal(texs, 1, `${kind}: exactly one texture (u_tex)`);
  }
});

ok('all twelve register through registerTemplateEffect', () => {
  __clearTemplateRegistry();
  const bridge = stubBridge();
  registerMathShaders(bridge, stubGl);
  assert.equal(bridge.effects.size, 12);
  for (const kind of MATH_SHADER_KINDS) {
    assert.ok(getTemplateEffect(kind), `${kind} in template registry`);
  }
  __clearTemplateRegistry();
});

ok('no math op is referenced inside the ACCUM feedback path', () => {
  // Hard rule: color ops in feedback accumulate (hue→grey, gain→white).
  // MATH grades the composite fold only — feed back from before the grade.
  // Match kind references (quoted strings, cost ids), not English words:
  // "lift" appears in accum.mjs prose, which is fine.
  const accumSrc = readFileSync(join(here, '..', 'accum.mjs'), 'utf8');
  for (const kind of MATH_SHADER_KINDS) {
    const re = new RegExp(`['"\`]${kind}['"\`]|\\bmath/${kind}\\b|\\bfx/${kind}\\b`);
    assert.ok(!re.test(accumSrc), `accum.mjs must not reference math op "${kind}" as an effect`);
  }
});

ok('quantize ships tone-only: no time-hold knob anywhere', () => {
  const { quantize } = MATH_EFFECT_DEFS;
  assert.deepEqual(Object.keys(quantize.params), ['steps']);
});

ok('applyMathMod pushes routed knobs toward max; silence is a no-op', () => {
  const fx = [
    { kind: 'gain', params: { exposure: 0 }, mod: { exposure: 'beatPulse' } },
    { kind: 'contrast', params: { amount: 0.5 } },
  ];
  // No audio -> untouched (values equal)
  assert.deepEqual(applyMathMod(fx, null), fx);
  assert.deepEqual(applyMathMod(fx, { rms: 0, flux: 0, beatPulse: 0 }), fx);
  // Full beat -> exposure hits max (3)
  const hit = applyMathMod(fx, { rms: 0, flux: 0, beatPulse: 1 });
  assert.equal(hit[0].params.exposure, 3);
  assert.equal(hit[1].params.amount, 0.5, 'unrouted knob untouched');
  // Half beat -> halfway toward max: 0 + 0.5 * (3 - 0)
  const half = applyMathMod(fx, { rms: 0, flux: 0, beatPulse: 0.5 });
  assert.equal(half[0].params.exposure, 1.5);
  // rms source routes rms, not beatPulse
  const rmsHit = applyMathMod(
    [{ kind: 'threshold', params: { level: 0.5, softness: 0 }, mod: { level: 'rms' } }],
    { rms: 1, flux: 0, beatPulse: 0 });
  assert.equal(rmsHit[0].params.level, 1);
  // int knobs stay ints after the push
  const intHit = applyMathMod(
    [{ kind: 'quantize', params: { steps: 8 }, mod: { steps: 'rms' } }],
    { rms: 0.5, flux: 0, beatPulse: 0 });
  assert.equal(intHit[0].params.steps, 12, '8 + 0.5*(16-8) = 12');
  // Unknown kind / knob are no-ops, never throw
  assert.deepEqual(applyMathMod([{ kind: 'nope', params: {} }], { rms: 1, flux: 0, beatPulse: 0 }), [{ kind: 'nope', params: {} }]);
});

console.log(`ok mathShaders.selfcheck — ${n} checks`);
