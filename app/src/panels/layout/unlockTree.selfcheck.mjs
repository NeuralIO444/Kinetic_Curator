// unlockTree.selfcheck.mjs — #1630: the unlock tree at the bottom of BUILD.
// The section is an explanation surface, and its one law is honesty: every
// node must be catalogued from the code that does the gating, read live
// state, and state its lock reason truthfully. This suite pins that:
//   · the gate-truth matrix — for each mode/symmetry/material/ground/shelf
//     snapshot, the pure catalogue's lit/dark states match the conditions
//     the slider components themselves compute
//   · the ladder is derived from mindConduct's real TIER_OPS table
//   · the catalogue covers every gated control in BUILD: the set of
//     disabledReason strings across the gating sources is pinned, so a new
//     greyed control (or a changed reason) fails here until the tree
//     learns it — the kill-criteria enforcement, not a copy promise
//   · the voice-only settings really have no performer control writing them
//   · the section is read-only (no buttons, no event emits) and sits at
//     the bottom of BUILD, after MATH
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), 'utf8');

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const { buildUnlockTree, UNLOCK_NODE_IDS } = await import('./unlockTree.mjs');
const { TIER_OPS } = await import('../../curator/mindConduct.js');
const { PARAM_SPEC } = await import('../../data/layout-modes.js');

const tree = (over = {}) =>
  buildUnlockTree({
    mode: 'grid',
    symmetry: 'none',
    material: 'flat',
    hasGround: false,
    voiceCount: 0,
    voiceCap: 12,
    davis: { tier: 1, cool: false },
    ...over,
  });
const nodeOf = (groups, id) => groups.flatMap((g) => g.nodes).find((x) => x.id === id);
const stateIn = (over, id) => nodeOf(tree(over), id).state;
const lineIn = (over, id) => nodeOf(tree(over), id).line;

ok('the catalogue is complete and stable (5 groups, every node present in every snapshot)', () => {
  assert.deepEqual(
    tree().map((g) => g.id),
    ['davis-ladder', 'davis-settings', 'materials', 'modes', 'shelf'],
  );
  assert.deepEqual(UNLOCK_NODE_IDS, [
    'tier-1',
    'tier-2',
    'tier-3',
    'tier-4',
    'voice-material',
    'voice-ztiers',
    'voice-noisefreq',
    'voice-displace',
    'mat-glass',
    'mat-plate',
    'mat-wash',
    'mat-stipple',
    'gate-swarm-family',
    'gate-cohesion',
    'gate-damping',
    'gate-moth',
    'gate-flap',
    'gate-growth',
    'gate-ground',
    'gate-weather',
    'gate-divergence',
    'shelf-voice',
  ]);
  for (const mode of ['grid', 'swarm', 'murmuration', 'hype', 'dla', 'eden', 'phyllotaxis']) {
    assert.equal(tree({ mode }).flatMap((g) => g.nodes).length, UNLOCK_NODE_IDS.length, `mode ${mode}`);
  }
});

ok('the ladder is derived from TIER_OPS: each tier line names exactly the ops that tier adds', () => {
  // The gate table's own shape, pinned so a table change forces a copy review.
  assert.deepEqual(TIER_OPS.t1, []);
  assert.deepEqual(TIER_OPS.t2, ['depth']);
  assert.deepEqual(TIER_OPS.t3, ['depth', 'add', 'retarget']);
  assert.deepEqual(TIER_OPS.t4, ['depth', 'add', 'retarget', 'remove']);
  assert.match(lineIn({}, 'tier-2'), /[Dd]eepen or soften/);
  assert.doesNotMatch(lineIn({}, 'tier-2'), /open a new|move a route|close an audio/);
  assert.match(lineIn({}, 'tier-3'), /[Oo]pen a new audio route/);
  assert.match(lineIn({}, 'tier-3'), /move a route to a new target/);
  assert.match(lineIn({}, 'tier-4'), /[Cc]lose an audio route/);
});

ok('tier states are monotone in Davis standing, and an unreadable standing lights nothing', () => {
  for (const t of [1, 2, 3, 4]) {
    for (const k of [1, 2, 3, 4]) {
      assert.equal(
        stateIn({ davis: { tier: t, cool: false } }, `tier-${k}`),
        k <= t ? 'lit' : 'dark',
        `davis t${t}, node t${k}`,
      );
    }
  }
  for (const k of [1, 2, 3, 4]) assert.equal(stateIn({ davis: null }, `tier-${k}`), 'dark');
  assert.match(lineIn({ davis: null }, 'tier-1'), /not readable/);
});

ok('cool-down is said out loud on the current tier node, and only there', () => {
  assert.match(lineIn({ davis: { tier: 3, cool: true } }, 'tier-3'), /cool-down/);
  assert.doesNotMatch(lineIn({ davis: { tier: 3, cool: true } }, 'tier-2'), /cool-down/);
  assert.doesNotMatch(lineIn({ davis: { tier: 3, cool: false } }, 'tier-3'), /cool-down/);
});

ok('his settings: voice-only nodes never read lit or dark, and MATERIAL names the live material', () => {
  for (const id of ['voice-material', 'voice-ztiers', 'voice-noisefreq', 'voice-displace']) {
    assert.equal(stateIn({ mode: 'hype', material: 'glass' }, id), 'his');
  }
  assert.match(lineIn({ material: 'wash' }, 'voice-material'), /This Look: Wash\./);
  assert.match(lineIn({ material: 'plate' }, 'voice-material'), /#268/);
});

ok('the voice-only params exist in PARAM_SPEC and no performer slider writes them', () => {
  for (const key of ['zTiers', 'noiseFreq', 'displacement']) assert.ok(PARAM_SPEC[key], `${key} in PARAM_SPEC`);
  const sliders = [
    'AppearanceSliders.jsx',
    'LayoutSliders.jsx',
    'SwarmSliders.jsx',
    'HypeSliders.jsx',
    'MaterialSliders.jsx',
  ]
    .map((f) => read(`./${f}`))
    .join('\n');
  for (const key of ['zTiers', 'noiseFreq', 'displacement']) {
    assert.ok(!sliders.includes(`set('${key}'`), `no slider sets ${key}`);
    assert.ok(!sliders.includes(`'${key}',`), `no slider button carries ${key}`);
  }
});

ok('material knobs light per material, exactly as MaterialSliders gates them', () => {
  for (const m of ['glass', 'plate', 'wash', 'stipple']) {
    assert.equal(stateIn({ material: m }, `mat-${m}`), 'lit', `${m} lit under ${m}`);
    for (const other of ['glass', 'plate', 'wash', 'stipple'].filter((x) => x !== m)) {
      assert.equal(stateIn({ material: m }, `mat-${other}`), 'dark', `${other} dark under ${m}`);
    }
  }
  for (const m of ['glass', 'plate', 'wash', 'stipple'])
    assert.equal(stateIn({ material: 'flat' }, `mat-${m}`), 'dark');
  assert.match(lineIn({ material: 'flat' }, 'mat-wash'), /Davis sets the material/);
});

ok('mode gates match the components\u2019 predicates (swarm family, hype, growth, phyllotaxis)', () => {
  // PARTICLES · GRAVITY · BREATH: swarm || murmuration || hype
  for (const [mode, want] of [
    ['swarm', 'lit'],
    ['murmuration', 'lit'],
    ['hype', 'lit'],
    ['grid', 'dark'],
    ['dla', 'dark'],
  ]) {
    assert.equal(stateIn({ mode }, 'gate-swarm-family'), want, `swarm-family in ${mode}`);
  }
  // The moth family: hype only. Growth: dla/eden. Divergence: phyllotaxis.
  assert.equal(stateIn({ mode: 'hype' }, 'gate-moth'), 'lit');
  assert.equal(stateIn({ mode: 'swarm' }, 'gate-moth'), 'dark');
  assert.equal(stateIn({ mode: 'dla' }, 'gate-growth'), 'lit');
  assert.equal(stateIn({ mode: 'eden' }, 'gate-growth'), 'lit');
  assert.equal(stateIn({ mode: 'hype' }, 'gate-growth'), 'dark');
  assert.equal(stateIn({ mode: 'phyllotaxis' }, 'gate-divergence'), 'lit');
  assert.equal(stateIn({ mode: 'grid' }, 'gate-divergence'), 'dark');
});

ok('COHESION and DAMPING carry their hype-specific reasons, worded as the components word them', () => {
  assert.equal(stateIn({ mode: 'swarm' }, 'gate-cohesion'), 'lit');
  assert.equal(stateIn({ mode: 'hype' }, 'gate-cohesion'), 'dark');
  assert.match(lineIn({ mode: 'hype' }, 'gate-cohesion'), /BEHAVE table drives cohesion/);
  assert.match(lineIn({ mode: 'grid' }, 'gate-cohesion'), /swarm/);
  assert.equal(stateIn({ mode: 'murmuration' }, 'gate-damping'), 'lit');
  assert.equal(stateIn({ mode: 'hype' }, 'gate-damping'), 'dark');
  assert.match(lineIn({ mode: 'hype' }, 'gate-damping'), /pin damping at 0\.97 or above/);
});

ok('FLAP needs hype AND a symmetric body (bilateral, radial-N, kaleido-N — the component\u2019s own test)', () => {
  assert.equal(stateIn({ mode: 'hype', symmetry: 'bilateral' }, 'gate-flap'), 'lit');
  assert.equal(stateIn({ mode: 'hype', symmetry: 'radial-6' }, 'gate-flap'), 'lit');
  assert.equal(stateIn({ mode: 'hype', symmetry: 'kaleido-12' }, 'gate-flap'), 'lit');
  assert.equal(stateIn({ mode: 'hype', symmetry: 'none' }, 'gate-flap'), 'dark');
  assert.match(lineIn({ mode: 'hype', symmetry: 'none' }, 'gate-flap'), /still needs a symmetric body/);
  assert.equal(stateIn({ mode: 'swarm', symmetry: 'bilateral' }, 'gate-flap'), 'dark');
});

ok('the pattern-ground family follows hasGround, and the voice shelf follows its cap', () => {
  assert.equal(stateIn({ hasGround: true }, 'gate-ground'), 'lit');
  assert.equal(stateIn({ hasGround: false }, 'gate-ground'), 'dark');
  assert.equal(stateIn({ hasWeather: true }, 'gate-weather'), 'lit');
  assert.equal(stateIn({ hasWeather: false }, 'gate-weather'), 'dark');
  assert.match(lineIn({ hasWeather: false }, 'gate-weather'), /FX layer with HAZE sits above/);
  assert.equal(stateIn({ voiceCount: 11, voiceCap: 12 }, 'shelf-voice'), 'lit');
  assert.equal(stateIn({ voiceCount: 12, voiceCap: 12 }, 'shelf-voice'), 'dark');
  assert.match(lineIn({ voiceCount: 12, voiceCap: 12 }, 'shelf-voice'), /delete a voice/);
});

ok('catalogue-from-code: the pinned set of lock reasons across the gating sources', () => {
  const files = [
    'AppearanceSliders.jsx',
    'HypeSliders.jsx',
    'SwarmSliders.jsx',
    'LayoutSliders.jsx',
    'MaterialSliders.jsx',
  ];
  const reasons = new Set();
  for (const f of files) {
    for (const line of read(`./${f}`).split('\n')) {
      if (!line.includes('disabledReason')) continue;
      for (const m of line.matchAll(/'([^']+)'|"([^"]+)"/g)) reasons.add(m[1] ?? m[2]);
    }
  }
  assert.deepEqual([...reasons].sort(), [
    'BEHAVE table drives cohesion in hype mode',
    'DLA / Eden growth modes only',
    'Hype mode only',
    'Moth bodies only (hype mode)',
    'Moth bodies pin damping ≥ 0.97 for stability',
    'Needs a PATTERN layer below this one',
    'Needs an FX layer with HAZE above this one',
    'Needs hype mode + bilateral or radial symmetry (wings/fans are only built for symmetric organisms)',
    'Phyllotaxis mode only',
    'Swarm mode only',
    'Swarm or hype mode only',
    'Swarm physics only',
  ]);
  // MaterialSliders gates through one template for its four bodies.
  assert.ok(read('./MaterialSliders.jsx').includes('`${NAMES[m]} material only`'), 'material gate template');
  // VoicesShelf's standing capacity gate.
  assert.ok(read('./VoicesShelf.jsx').includes('disabled={shelfFull}'), 'voice shelf cap gate');
  // The gated-control census: every gated ValueButton/MotionTile label in the
  // sources is named by some node in the tree.
  const named = tree()
    .flatMap((g) => g.nodes.map((x) => x.name))
    .join(' · ');
  for (const label of [
    'GROWTH RATE',
    'BRANCHING',
    'BODY',
    'TIGHT',
    'WIND',
    'METABOLISM',
    'PARTICLES',
    'GRAVITY',
    'COHESION',
    'DAMPING',
    'GROUND',
    'EDGE',
    'SHADOW',
    'SNAP',
    'WEATHER',
    'DIVERGENCE',
    'GLASS',
    'PLATE',
    'WASH',
    'STIPPLE',
  ]) {
    assert.ok(named.includes(label), `tree names ${label}`);
  }
  assert.ok(named.includes('FLAP') && named.includes('BREATH'), 'tree names the motion tiles');
});

ok('read-only by construction, and mounted last in BUILD', () => {
  const section = read('./UnlockTreeSection.jsx');
  assert.ok(!section.includes('<button'), 'no buttons in the tree');
  assert.ok(!section.includes('emit('), 'the tree emits nothing');
  assert.ok(!section.includes('onClick'), 'nothing in the tree is clickable');
  const pure = read('./unlockTree.mjs');
  assert.ok(!pure.includes('emit('), 'the catalogue emits nothing');
  const panel = read('../BuildPanel.jsx');
  assert.ok(panel.includes('<UnlockTreeSection'), 'BuildPanel renders the tree');
  assert.ok(panel.indexOf('<UnlockTreeSection') > panel.indexOf('<MathSection'), 'the tree sits below MATH');
  assert.ok(
    panel.indexOf('<UnlockTreeSection') > panel.indexOf('<ChiaroscuroSection'),
    'the tree sits below Appearance too',
  );
});

console.log(`\nunlockTree.selfcheck: ${n} groups OK`);
