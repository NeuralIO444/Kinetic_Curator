// mathRandomGuard.selfcheck.mjs — #553: no NEW bare Math.random in the app.
//
// Same-seed -> same-canvas is the contract. Every remaining Math.random call is
// either an injectable DEFAULT (`rng = Math.random`, and the seeded callers pass
// their own stream) or a DICE whose result is written into serialized state
// (seed / seedOffsets / layoutParams / paletteId / caGrid), so the roll is
// recorded and replays. Anything else — especially in the sim, the kernel or the
// GL layer — is exactly the leak this guards. A new call fails here until it is
// either routed through engine/kernel/rng.js or added below WITH a reason.
//
// Exact counts, both ways: a stale allowlist entry (site removed) also fails,
// so the list can't rot into a blanket exemption. Comments are ignored.
import assert from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

/** file (relative to src/) -> { count, why } */
const ALLOWED = {
  'curator/curate.js': { count: 1, why: 'pickCurated default rng param; CURATE passes the seeded CH.curate stream (#518)' },
  'curator/renderProfiles.js': { count: 1, why: 'applyRenderProfile default rng param; seeded by CURATE' },
  'curator/taste.js': { count: 1, why: 'pickPersona default rng param; seeded by CURATE' },
  'curator/transitions.js': { count: 1, why: 'markovPick default rng param; CURATE always injects the seeded (seed, press #) stream, and the drawn value lands in layoutParams' },
  'engine/harmony.js': { count: 1, why: 'buildHarmony default rng param' },
  'state/paramUtils.js': { count: 4, why: 'randomizeKey default rng param + morph dice (3); result lands in layoutParams' },
  'state/slices/davisSlice.js': { count: 1, why: 'EVOLVE palette dice; result lands in paletteId' },
  'state/slices/layoutSlice.js': { count: 2, why: 'bumpSeed / mutateSeedOffset dice; result lands in seed / seedOffsets' },
  'state/slices/layersSlice.js': { count: 2, why: 'layer id suffix (identity, not sim) + new-layer seed dice; seed lands in the snapshot' },
  'engine/ca-engine.js': { count: 1, why: 'createGrid dice; the grid is serialized (caGrid)' },
};

// Never allowed, whatever the reason: the sim, the kernel, placement, the GL layer.
const FORBIDDEN = [/^engine\/particles\.js$/, /^engine\/buildPlacements\.js$/, /^engine\/kernel\//, /^gl\/(?!debug\/)/];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(m?js|jsx)$/.test(name) && !/\.selfcheck\.mjs$/.test(name)) out.push(p);
  }
  return out;
}

/** Count real code occurrences: strip block comments and // comments first. */
function countCode(text) {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock.split('\n')
    .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .reduce((n, l) => n + (l.match(/Math\.random\b/g) || []).length, 0);
}

const found = {};
for (const file of walk(SRC)) {
  const rel = relative(SRC, file).split('\\').join('/');
  const n = countCode(readFileSync(file, 'utf8'));
  if (n) found[rel] = n;
}

for (const [rel, n] of Object.entries(found)) {
  assert.ok(!FORBIDDEN.some((re) => re.test(rel)),
    `${rel} calls Math.random ${n}x — forbidden in the sim / kernel / placement / GL layer; use engine/kernel/rng.js channels`);
  const a = ALLOWED[rel];
  assert.ok(a, `${rel} calls Math.random ${n}x and is not on the allowlist — route it through engine/kernel/rng.js, or add it to ALLOWED in mathRandomGuard.selfcheck.mjs with a reason`);
  assert.strictEqual(n, a.count, `${rel}: ${n} Math.random call(s), allowlist says ${a.count} — a new call needs a reason; a removed one needs the entry updated`);
}
for (const rel of Object.keys(ALLOWED)) {
  assert.ok(found[rel], `${rel} is on the allowlist but no longer calls Math.random — remove the stale entry`);
}

// The guard's own comment stripper must not hide real code (regression on the guard).
assert.strictEqual(countCode('const a = Math.random();'), 1);
assert.strictEqual(countCode('// Math.random()\n/* Math.random */\nx'), 0);
assert.strictEqual(countCode('f(Math.random) // trailing note'), 1);

console.log(`mathRandomGuard.selfcheck: OK (${Object.keys(found).length} allowlisted files, ${Object.values(found).reduce((a, b) => a + b, 0)} sites)`);
