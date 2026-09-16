import assert from 'node:assert';
import { ParticleSystem } from './particles.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';

const assets = [{ id: 'a' }, { id: 'b' }];
const palette = { swatches: ['#111', '#222', '#333'] };

function run(mode, symmetry, body = 3, steps = 12) {
  const sys = new ParticleSystem();
  const lp = normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS,
    mode,
    particleCount: 40,
    symmetry,
    body,
    flap: 0.4,
    tight: 0.6,
    wind: 1.2,
  });
  sys.init(40, 1000, 700, assets, palette, 0x1a4f);
  for (let s = 0; s < steps; s++) {
    sys.update(lp, assets, palette, 0x1a4f, 1_000_000 + s * (1000 / 60), null);
  }
  return sys;
}

const cloud = run('swarm', 'none');
assert.strictEqual(cloud.physicsCount(), 40);
assert.strictEqual(cloud.getItems(assets).length, 40, 'swarm stays a cloud');

const moth = run('hype', 'none', 3);
assert.strictEqual(moth.physicsCount(), 40, 'hype physics count unchanged');
assert.strictEqual(moth.getItems(assets).length, 40 * 3, 'body=3 emits spine segments');

const bi = run('hype', 'bilateral', 1);
assert.strictEqual(bi.physicsCount(), 40, 'bilateral does not double the SoA');
assert.strictEqual(bi.getItems(assets).length, 40 + 80, 'spore + two wings');
assert.ok(bi.getItems(assets).some((it) => it._mirrored && it.role === 'wing'));
assert.ok(bi.getItems(assets).every((it) => typeof it.u === 'number' && it.u >= 0 && it.u <= 1));

bi.resetPhase();
assert.ok(bi.particles.every((p) => p.phase === 0));
assert.strictEqual(bi.particles[0].assetIndex, 0);

const a = run('hype', 'bilateral', 2);
const b = run('hype', 'bilateral', 2);
assert.deepStrictEqual(
  a.particles.map((p) => [p.x, p.y]),
  b.particles.map((p) => [p.x, p.y]),
  'same seed same leaders',
);

const dish = run('hype', 'bilateral', 3, 90);
for (const p of dish.particles) {
  assert.ok(p.x >= 0 && p.x <= 1000, `x left the dish: ${p.x}`);
  assert.ok(p.y >= 0 && p.y <= 700, `y left the dish: ${p.y}`);
}

console.log('organisms.selfcheck: OK');
