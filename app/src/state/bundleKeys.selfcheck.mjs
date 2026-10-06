// bundleKeys.selfcheck.mjs — every `kc:` storage key is either in the bundle or named as deliberately out (#1063).
//
// #1051's acceptance: "Nothing persisted under a kc: key that holds user work is
// missing from the bundle. List any key deliberately left out." The voices shelf
// was missing and nothing noticed, because that list was prose in a PR. It is now
// code (BUNDLE_STORAGE_KEYS and BUNDLE_LEFT_OUT) and this scans the source for every
// key the app uses, so a new key fails here until someone decides which side it is on.
import assert from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BUNDLE_PARTS, BUNDLE_STORAGE_KEYS, BUNDLE_LEFT_OUT } from './bundle.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const root = new URL('..', import.meta.url).pathname; // app/src
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p); continue; }
    if (/\.(js|jsx|mjs)$/.test(f) && !/\.selfcheck\.mjs$/.test(f)) files.push(p);
  }
})(root);

const used = new Set();
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(/['"`](kc:[a-z0-9:_-]+)['"`]/g)) used.add(m[1]);
}

const carried = new Set(Object.values(BUNDLE_STORAGE_KEYS).flat());
const leftOut = new Set(Object.keys(BUNDLE_LEFT_OUT));

ok('every part of the bundle names the key it carries', () => {
  for (const part of BUNDLE_PARTS) assert.ok((BUNDLE_STORAGE_KEYS[part] || []).length > 0, `${part} has no storage key`);
  assert.deepEqual(Object.keys(BUNDLE_STORAGE_KEYS).sort(), [...BUNDLE_PARTS].sort(), 'no orphan parts either way');
});

ok('a key cannot be both carried and left out', () => {
  for (const k of carried) assert.ok(!leftOut.has(k), `${k} is both`);
});

ok('every kc: key the app uses is carried or deliberately left out', () => {
  const unaccounted = [...used].filter((k) => !carried.has(k) && !leftOut.has(k)).sort();
  assert.deepEqual(unaccounted, [], `new storage key(s) with no decision: ${unaccounted.join(', ')} — add each to BUNDLE_STORAGE_KEYS (and its part) or BUNDLE_LEFT_OUT with a reason`);
});

ok('no stale entries: every carried or left-out key is still used somewhere', () => {
  const stale = [...carried, ...leftOut].filter((k) => !used.has(k)).sort();
  assert.deepEqual(stale, [], `listed but no longer in the source: ${stale.join(', ')}`);
});

ok('every left-out key has a reason in plain words', () => {
  for (const [k, why] of Object.entries(BUNDLE_LEFT_OUT)) assert.ok(typeof why === 'string' && why.length > 8, `${k} needs a reason`);
});

console.log(`bundleKeys.selfcheck: ${n} checks passed`);
