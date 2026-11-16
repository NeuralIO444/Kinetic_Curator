// node src/gl/parity/dishContacts.selfcheck.mjs — K3 slice 2a (#2188): GPU dish-contact DETECTION. The pair set is exact (the
// predicate is integer/compare logic over the same table); the normal and overlap agree to float32 noise. Pure half first (the oracle,
// pinned against the real CPU pass); the GL half skips cleanly with no Playwright browser.
import assert from 'node:assert/strict';
import { ParticleSystem } from '../../engine/particles.js';
import { createDishSession, enrolDishBody, armDish, runDishContacts } from '../../engine/dishContacts.mjs';
import { packContactBodies, referenceContacts, contactTextureLayout } from '../dishContactsGpu.mjs';
import { openHarnessPage, closeGlDriver } from './glDriver.mjs';

const fake = (xs, ys, { scale = 1, cgroup = 0, alive = 1 } = {}) => ({
  n: xs.length,
  x: Float64Array.from(xs),
  y: Float64Array.from(ys),
  scale: Float64Array.from(xs, () => scale),
  cgroup: Int32Array.from(xs, () => cgroup),
  alive: Uint8Array.from(xs, () => alive),
});

// ---- pure: layout + oracle cases
{
  assert.deepEqual(contactTextureLayout(300), { w: 128, h: 3, n: 300 });
  const e = (sys, umask = 0xffffffff) => ({ sys, radius: 10, umask });
  // two strata, one overlapping cross pair, one same-stratum overlap (ignored), one far pair
  let t = packContactBodies([e(fake([-20, 5, 400], [0, 0, 0])), e(fake([12, 700], [0, 0]))]);
  let c = referenceContacts(t);
  assert.equal(t.nb, 5);
  assert.deepEqual(
    c.map((q) => [q.a, q.b]),
    [[1, 3]],
    'only the cross-strata overlap: 0 is out of reach of 3, 0-1 share a stratum, 2 and 4 are far',
  );
  assert.ok(Math.abs(c[0].nx - 1) < 1e-12 && Math.abs(c[0].overlap - 13) < 1e-12, 'normal a->b, overlap = rr - dist');
  // a dead body is not in the table
  const dead = fake([0, 5], [0, 0]);
  dead.alive[0] = 0;
  assert.equal(packContactBodies([e(dead), e(fake([3], [0]))]).nb, 2);
  // masks: group 1 vs 2, stratum B's mask excludes group 1 -> no contact
  t = packContactBodies([e(fake([0], [0], { cgroup: 1 })), e(fake([5], [0], { cgroup: 2 }), ~(1 << 1))]);
  assert.equal(referenceContacts(t).length, 0, 'a stratum mask that excludes a group blocks the pair');
  t = packContactBodies([e(fake([0], [0], { cgroup: 1 })), e(fake([5], [0], { cgroup: 2 }))]);
  assert.equal(referenceContacts(t).length, 1);
  // coincident: a deterministic unit normal, overlap = rr
  t = packContactBodies([e(fake([50], [50])), e(fake([50], [50]))]);
  c = referenceContacts(t);
  assert.ok(Math.abs(Math.hypot(c[0].nx, c[0].ny) - 1) < 1e-12 && Math.abs(c[0].overlap - 20) < 1e-12);
  console.log('  [ok] body table + oracle cases');
}

// ---- pure: the oracle agrees with the real CPU pass about WHO touches (bodies it moves == bodies the oracle names)
{
  const assets = [{ id: 'a' }];
  const palette = { swatches: ['#ff0000', '#00ff00'] };
  for (const seed of [1, 7, 21]) {
    const mk = (n, s) => {
      const sys = new ParticleSystem();
      sys.init(n, 1000, 700, assets, palette, s);
      return sys;
    };
    const A = mk(40, seed);
    const B = mk(40, seed + 1);
    const sess = createDishSession();
    for (const [key, sys] of [
      ['a', A],
      ['b', B],
    ]) {
      enrolDishBody(sess, { key, sys, radius: 14, contactMode: 'bounce', restitution: 0.5 });
    }
    const t = packContactBodies([
      { sys: A, radius: 14, umask: 0xffffffff },
      { sys: B, radius: 14, umask: 0xffffffff },
    ]);
    const named = new Set();
    for (const q of referenceContacts(t)) {
      named.add(q.a);
      named.add(q.b);
    }
    const before = [...A.x.subarray(0, 40), ...B.x.subarray(0, 40)];
    armDish(sess, ['a', 'b']);
    assert.equal(runDishContacts(sess, A), true);
    const after = [...A.x.subarray(0, 40), ...B.x.subarray(0, 40)];
    const moved = new Set();
    after.forEach((v, i) => v !== before[i] && moved.add(i));
    assert.deepEqual(
      [...moved].sort((p, q) => p - q),
      [...named].sort((p, q) => p - q),
      `seed ${seed}: same bodies touched`,
    );
  }
  console.log('  [ok] oracle names the bodies the CPU pass moves');
}

// ---- GL half
let harness;
try {
  harness = await openHarnessPage('/parity/dishContacts.html');
} catch (e) {
  if (String(e && e.message).includes("Executable doesn't exist")) {
    console.log('  [skip] GPU dish contacts vs oracle: Playwright browser not installed in this environment');
    process.exit(0);
  }
  throw e;
}
const { page, close } = harness;
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  [${cond ? 'ok' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
};
const plain = (t) => ({
  nb: t.nb,
  x: [...t.x],
  y: [...t.y],
  r: [...t.r],
  stratum: [...t.stratum],
  cgroup: [...t.cgroup],
  umask: [...t.umask],
  index: [...t.index],
});
const tableOf = (count, strata, spread, seedN, mask = 0xffffffff) => {
  let s = seedN >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const active = [];
  for (let k = 0; k < strata; k++) {
    const xs = [];
    const ys = [];
    for (let i = 0; i < count; i++) {
      xs.push(rnd() * spread);
      ys.push(rnd() * spread);
    }
    const sys = fake(xs, ys, { scale: 0.5 + rnd(), cgroup: k % 3 });
    active.push({ sys, radius: 12, umask: mask });
  }
  return packContactBodies(active);
};
const keyOf = (q) => `${q.a},${q.b}`;
const compare = (name, got, want, tol = 2e-3) => {
  const gs = new Set(got.map(keyOf));
  const ws = new Set(want.map(keyOf));
  const sameSet = gs.size === ws.size && [...ws].every((k) => gs.has(k));
  check(`${name} — the pair set is exact`, sameSet, `${got.length} gpu / ${want.length} oracle`);
  const byKey = new Map(want.map((q) => [keyOf(q), q]));
  let worst = 0;
  for (const g of got) {
    const w = byKey.get(keyOf(g));
    if (w) worst = Math.max(worst, Math.abs(g.nx - w.nx), Math.abs(g.ny - w.ny), Math.abs(g.overlap - w.overlap));
  }
  check(`${name} — normal and overlap agree`, worst < tol, worst.toExponential(2));
  const ordered = got.every((q, i) => i === 0 || got[i - 1].a < q.a || (got[i - 1].a === q.a && got[i - 1].b < q.b));
  check(`${name} — canonical order (a, then b ascending)`, ordered);
};
try {
  // moderate density, three strata
  {
    const t = tableOf(100, 3, 640, 0x2a);
    const want = referenceContacts(t);
    const r = await page.evaluate((a) => window.__kcContactsRun(a), { table: plain(t), slots: 6, mode: 'sync' });
    check('moderate density produces contacts', want.length > 20 && want.length < 300, `${want.length}`);
    compare('3 strata x 100 bodies', r.contacts, want);
    check('no overflow within 6 slots', r.overflow === 0);
  }
  // masks
  {
    const t = tableOf(80, 3, 520, 0x77, 0b101); // groups 0 and 2 only; cgroup 1 bodies match nothing
    const want = referenceContacts(t);
    const r = await page.evaluate((a) => window.__kcContactsRun(a), { table: plain(t), slots: 6, mode: 'sync' });
    compare('mask excludes a group', r.contacts, want);
  }
  // coincident discs
  {
    const t = packContactBodies([
      { sys: fake([50, 90], [50, 90]), radius: 10, umask: 0xffffffff },
      { sys: fake([50, 90], [50, 90]), radius: 10, umask: 0xffffffff },
    ]);
    const want = referenceContacts(t);
    const r = await page.evaluate((a) => window.__kcContactsRun(a), { table: plain(t), slots: 6, mode: 'sync' });
    compare('coincident discs (float32 angle)', r.contacts, want, 1e-3);
    check(
      'coincident normals are unit',
      r.contacts.every((q) => Math.abs(Math.hypot(q.nx, q.ny) - 1) < 1e-3),
    );
  }
  // overflow is reported, never silent: a tight cluster with 3 slots
  {
    const t = tableOf(30, 2, 20, 0x5, 0xffffffff);
    const want = referenceContacts(t);
    const r = await page.evaluate((a) => window.__kcContactsRun(a), { table: plain(t), slots: 3, mode: 'sync' });
    const perA = new Map();
    for (const q of want) perA.set(q.a, (perA.get(q.a) || 0) + 1);
    let excess = 0;
    for (const n of perA.values()) excess += Math.max(0, n - 3);
    check(
      'overflow: the excess is reported exactly',
      r.overflow === excess && excess > 0,
      `reported ${r.overflow}, expected ${excess}`,
    );
    check('overflow: the first 3 per body survive', r.contacts.length === want.length - excess);
  }
  // async path (PBO + fence) equals sync
  {
    const t = tableOf(100, 3, 640, 0x2a);
    const s = await page.evaluate((a) => window.__kcContactsRun(a), { table: plain(t), slots: 6, mode: 'sync' });
    const a = await page.evaluate((x) => window.__kcContactsRun(x), { table: plain(t), slots: 6, mode: 'async' });
    check('PBO + fence readback equals the synchronous readback', JSON.stringify(a) === JSON.stringify(s));
  }
} finally {
  await close();
  await closeGlDriver();
}
if (failed) {
  console.error(`dishContacts.selfcheck: ${failed} FAILED`);
  process.exit(1);
}
console.log('dishContacts.selfcheck: ok — K3 slice 2a #2188');
