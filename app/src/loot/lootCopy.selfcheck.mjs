// node src/loot/lootCopy.selfcheck.mjs
// #1479 slice 9 — a file that left the folder is said out loud, with what happens to the thing already taken in.
import assert from 'node:assert/strict';
import { missingLines } from './lootCopy.mjs';

const it = (rel, kind, extra = {}) => ({ rel, kind, state: 'missing', ingested: true, ...extra });
const ix = (...items) => ({ items: Object.fromEntries(items.map((x, i) => [`id${i}`, x])) });

assert.deepEqual(missingLines(null), []);
assert.deepEqual(missingLines(ix({ rel: 'a.svg', kind: 'image', state: 'ok' })), []);
assert.deepEqual(missingLines(ix(it('images/a.svg', 'image'))), [
  'images/a.svg: source missing, the pool keeps its copy',
]);
assert.deepEqual(missingLines(ix(it('audio/k.wav', 'audio'))), [
  'audio/k.wav: source missing, it leaves the STIMULI menu',
]);
assert.deepEqual(missingLines(ix(it('images/x.svg', 'image', { ingested: false }))), ['images/x.svg: source missing']);
const many = missingLines(ix(...['d', 'c', 'b', 'a', 'e'].map((n) => it(`images/${n}.svg`, 'image'))));
assert.equal(many.length, 4);
assert.match(many[0], /^images\/a\.svg/);
assert.equal(many[3], 'and 2 more missing');
console.log('lootCopy.selfcheck: 6 checks passed');
