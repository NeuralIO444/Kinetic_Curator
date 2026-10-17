// node src/engine/featherFan.selfcheck.mjs
// Phase 2 S3 — the feather fan: plumage grown on the wing's bone chain, not scattered on its surface.
// Deterministic layout (keyed draws), the fan's rules (root-short -> tip-long, overlap, ornaments on the
// joints), the mirror, the cost registration, and the builder emitting fans instead of scales.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ASSETS } from '../data/assets/index.js';
import { buildSkeleton, MOTH_SKELETON_PLAN } from './skeleton.js';
import { createCreatureBuilder, MOTH, MOTH_PARTS, mothRecipe, pointToward } from './creature.js';
import { FAN, FAN_COUNTS, FAN_PARTS, fanHash, fanPlacements, mirrorPlacements, wingLocalChain } from './featherFan.js';
import { autoAttachPoints } from './autoAttach.js';
import { getCostTier } from './kernel/costRegistry.mjs';

const asset = (id) => ASSETS.find((a) => a.id === id);
const bodyPts = autoAttachPoints(asset(MOTH_PARTS.body).svg);
const wingPts = autoAttachPoints(asset(MOTH_PARTS.wing).svg);
const recipe = mothRecipe({ bodyPoints: bodyPts, wingPoints: wingPts, beat: 0 });
const skel = buildSkeleton({ seed: 77, creatureId: 'm0', plan: MOTH_SKELETON_PLAN, attach: bodyPts });
const foreR = wingLocalChain(skel, 'fore', 'R', recipe.parts.body.anchors.wingR, 1);
const layout = (over = {}) => fanPlacements({ chain: foreR, seed: 77, creatureId: 'm0', chainKey: 'fore', counts: FAN_COUNTS.fore, ...over });
const rootedOf = (l) => [...l.plate, ...l.feather, ...l.leaf]; // root -> tip order across kinds
const partLen = (p) => p.dScaleY * 100;
const partDir = (p, kind) => p.dRot + FAN_PARTS[kind].axisDeg;
const partRoot = (p, kind) => {
  const len = partLen(p);
  const r = (partDir(p, kind) * Math.PI) / 180;
  return { x: p.dx - Math.sin(r) * len * FAN.centreAlong, y: p.dy + Math.cos(r) * len * FAN.centreAlong };
};
const distToSeg = (p, a, b) => {
  const vx = b.x - a.x; const vy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
};

// 1. The pool is data, its assets are real, and the counts land in the brief's envelope (6-20 per bone)
{
  for (const [kind, part] of Object.entries(FAN_PARTS)) assert.ok(asset(part.asset), `${kind} -> ${part.asset} is a built-in asset`);
  assert.equal(new Set(Object.values(FAN_PARTS).map((p) => p.asset)).size, 4, 'four kinds, four assets');
  for (const [wing, counts] of Object.entries(FAN_COUNTS)) {
    assert.ok(counts.plate === 1 && counts.leaf === 1 && counts.chevron === 2, `${wing}: one plate, one leaf, two ornaments`);
    // Per-bone counts measured off the REAL layout, not the length proportion on paper: every rooted
    // part's root lies on exactly one bone — count roots per bone and hold the brief's 6-20 envelope.
    const chain = wingLocalChain(skel, wing, 'R', recipe.parts.body.anchors[wing === 'fore' ? 'wingR' : 'hindR'], 1);
    const l = fanPlacements({ chain, seed: 77, creatureId: 'm0', chainKey: wing, counts });
    const kinds = ['plate', ...Array(counts.feather).fill('feather'), 'leaf'];
    const per = chain.map(() => 0);
    rootedOf(l).forEach((p, i) => {
      const rp = partRoot(p, kinds[i]);
      let best = 0; let bd = Infinity;
      chain.forEach((s, si) => { const d = distToSeg(rp, s.base, s.tip); if (d < bd) { bd = d; best = si; } });
      per[best] += 1;
    });
    for (const [bi, n] of per.entries()) assert.ok(n >= 6 && n <= 20, `${wing} bone ${bi} carries ${n} rooted parts (brief: 6-20 per bone)`);
  }
}

// 2. The chain lands in the wing's own frame: its root is the wing's root attach offset, exactly
{
  const root = pointToward(wingPts, 'bottom');
  assert.ok(Math.hypot(foreR[0].base.x - root.x, foreR[0].base.y - root.y) < 1e-6,
    `the fan starts where the wing starts (${foreR[0].base.x.toFixed(3)}, ${foreR[0].base.y.toFixed(3)} vs ${root.x}, ${root.y})`);
  assert.equal(foreR.length, 3, 'the fore chain is three bones');
  assert.ok(foreR.every((s) => s.len > 0), 'every bone has length');
}

// 3. Determinism: the same (seed, creature, chain) grows the same fan, hash and all; any key change moves it
{
  const a = layout();
  const b = layout();
  assert.deepEqual(b, a, 'two layouts of the same inputs are identical');
  assert.equal(fanHash(b), fanHash(a));
  assert.match(fanHash(a), /^[0-9a-f]{8}$/, 'the layout hash is an 8-hex FNV-1a');
  assert.notEqual(fanHash(layout({ seed: 78 })), fanHash(a), 'another seed, another fan');
  assert.notEqual(fanHash(layout({ creatureId: 'm1' })), fanHash(a), 'the creature is half the RNG key');
  assert.notEqual(fanHash(layout({ chainKey: 'hind' })), fanHash(a), 'the chain is in the key');
}

// 4. The fan's rules: counts as declared, roots ON the bones, root-short -> tip-long, overlap, joint ornaments
{
  const l = layout();
  for (const kind of ['plate', 'feather', 'leaf', 'chevron']) {
    assert.equal(l[kind].length, FAN_COUNTS.fore[kind], `${kind}: the layout grows the declared count`);
  }
  const rooted = rootedOf(l);
  const kinds = ['plate', ...Array(FAN_COUNTS.fore.feather).fill('feather'), 'leaf'];
  rooted.forEach((p, i) => {
    const rootPt = partRoot(p, kinds[i]);
    const d = Math.min(...foreR.map((s) => distToSeg(rootPt, s.base, s.tip)));
    assert.ok(d < 1e-5, `part ${i}'s root lies on the chain (off by ${d.toExponential(2)})`);
    assert.ok([p.dx, p.dy, p.dRot, p.dScaleX, p.dScaleY].every(Number.isFinite), 'placements are finite');
    assert.ok(p.dScaleX > 0 && p.dScaleY > 0, 'placements have size');
    // its direction stays near the bone's local direction: the splay and the jitter are all the freedom it gets
    const seg = foreR.reduce((best, s) => (distToSeg(rootPt, s.base, s.tip) < distToSeg(rootPt, best.base, best.tip) ? s : best), foreR[0]);
    assert.ok(Math.abs(partDir(p, kinds[i]) - seg.dirDeg) <= FAN.splayDeg / 2 + FAN.jitterDeg + 1e-9,
      `part ${i} angles to the local bone (dir ${partDir(p, kinds[i]).toFixed(2)} vs bone ${seg.dirDeg.toFixed(2)})`);
  });
  const lens = rooted.map(partLen);
  assert.ok(lens[0] < lens[lens.length - 1], `root-short -> tip-long (${lens[0].toFixed(1)} -> ${lens[lens.length - 1].toFixed(1)})`);
  const third = Math.floor(lens.length / 3);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(mean(lens.slice(0, third)) < mean(lens.slice(-third)), 'the first third is shorter than the last third');
  // root-to-tip overlap: the spacing between consecutive roots is less than the parts' own length
  const roots = rooted.map((p, i) => partRoot(p, kinds[i]));
  for (let i = 1; i < roots.length; i += 1) {
    const gap = Math.hypot(roots[i].x - roots[i - 1].x, roots[i].y - roots[i - 1].y);
    assert.ok(gap < Math.min(lens[i - 1], lens[i]), `parts ${i - 1} and ${i} overlap (gap ${gap.toFixed(2)} < length ${Math.min(lens[i - 1], lens[i]).toFixed(2)})`);
  }
  // ornaments are pinned to the joints: each sits on an interior joint (or the tip), barely sunk
  const joints = [foreR[0].tip, foreR[1].tip, foreR[2].tip];
  for (const orn of l.chevron) {
    const d = Math.min(...joints.map((jPt) => Math.hypot(orn.dx - jPt.x, orn.dy - jPt.y)));
    assert.ok(d < partLen(orn) * FAN.ornSink + 1, `an ornament is pinned to a joint (off by ${d.toFixed(2)})`);
  }
}

// 5. The mirror: the left chain's own layout is the right layout mirrored, to trig dust
{
  const foreL = wingLocalChain(skel, 'fore', 'L', recipe.parts.body.anchors.wingL, 1);
  const left = fanPlacements({ chain: foreL, seed: 77, creatureId: 'm0', chainKey: 'fore', counts: FAN_COUNTS.fore, handedness: -1 });
  const mirrored = Object.fromEntries(Object.entries(layout()).map(([kind, list]) => [kind, mirrorPlacements(list, FAN_PARTS[kind].axisDeg)]));
  const round = (v) => Math.round(v * 1e6) / 1e6;
  const flat = (l) => ['plate', 'feather', 'leaf', 'chevron'].flatMap((kind) => l[kind].map((p) => [round(p.dx), round(p.dy), round(p.dRot), round(p.dScaleX), round(p.dScaleY)]));
  assert.deepEqual(flat(left), flat(mirrored), 'the left fan is the right fan mirrored');
}

// 6. Through the builder: the drawn moth wears fans now — counts, keys, determinism, no halos on plumage
{
  const PAL = { bg: '#111111', ink: '#eeeeee', swatches: ['#aa0000', '#222222'] };
  const entry = () => [{ id: 'a', items: [{ x: 1, y: 1, assetId: 'x' }], palette: PAL }];
  const input = (over = {}) => ({
    dishPins: [{ x: 500, y: 350 }], dishFormed: [true], seed: 77, seedOffsets: null, loopTimeMs: 0, assetAttach: {}, ...over,
  });
  const run = (over, n = MOTH.growFrames + MOTH.pairFrames + 2) => {
    const b = createCreatureBuilder();
    let e;
    for (let i = 0; i < n; i++) { e = entry(); b.append(input(over), e, ASSETS); }
    return e[0].items.filter((it) => it._creature);
  };
  const plumage = (items) => items.filter((it) => /\/fan/.test(it.key));
  const one = run({});
  assert.equal(plumage(one).length, 2 * (FAN_COUNTS.fore.plate + FAN_COUNTS.fore.feather + FAN_COUNTS.fore.leaf + FAN_COUNTS.fore.chevron),
    'one pair: a full fan on each fore wing');
  assert.equal(one.filter((it) => it.key.includes(':halo:')).length, 3, 'halos under body + fore wings only — never on plumage');
  const two = run({ dishLimbs: [2] });
  assert.equal(plumage(two).length, plumage(one).length + 2 * (FAN_COUNTS.hind.plate + FAN_COUNTS.hind.feather + FAN_COUNTS.hind.leaf + FAN_COUNTS.hind.chevron),
    'two pairs: the hind wings wear their own fans');
  assert.equal(new Set(two.map((it) => it.key)).size, two.length, 'every fan part has its own stable key');
  assert.equal(JSON.stringify(run({})), JSON.stringify(one), 'the same input grows the same moth, fans and all');
  assert.ok(plumage(two).every((it) => Object.values(FAN_PARTS).some((p) => p.asset === it.assetId)), 'every plumage item is a pool part');
}

// 7. The cost declaration landed (kernel/costRegistry.mjs, the S3 append-only block): tier 0, structural
{
  const decl = getCostTier('engine/creature-feather-fan');
  assert.ok(decl, 'the fan declares its cost tier');
  assert.equal(decl.tier, 0, 'tier 0: no new GPU pass — instanced sprites in the structural item pass');
}

// 8. The determinism guard, in mathRandomGuard's pattern: featherFan.js carries no banned clocks or
//    unseeded chance (comments stripped first, exactly as the guard strips them).
{
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'featherFan.js'), 'utf8');
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const code = noBlock.split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
  for (const banned of ['Math.random', 'Date.now', 'performance.now']) {
    assert.ok(!code.includes(banned), `featherFan.js must not use ${banned} — seeded kernel channels only`);
  }
}

console.log('featherFan.selfcheck: OK (pool, chain frame, determinism, fan rules, mirror, builder wiring, cost, guard)');
