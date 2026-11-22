// node src/project/projectRecents.selfcheck.mjs
// #1711 — the recent-projects list, pure. Pins Matt's rulings (2026-11-21): most-recent-first, capped at 8; an entry
// is never dropped silently by the logic (unreachable folders stay listed — marking and removing are the caller's
// explicit acts); corrupt storage reads as an empty list, never a throw.
import assert from 'node:assert/strict';
import { RECENTS_CAP, parseRecents, touchRecents, removeRecent, renameRecent, sanitizeRecents } from './projectRecents.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const e = (name, root, at = null) => ({ name, root, at });

ok('touch puts the project first, most-recent-first', () => {
  let list = [];
  list = touchRecents(list, e('A', '/p/A'), 't1');
  list = touchRecents(list, e('B', '/p/B'), 't2');
  assert.deepEqual(
    list.map((x) => x.name),
    ['B', 'A'],
  );
  list = touchRecents(list, e('A', '/p/A'), 't3');
  assert.deepEqual(
    list.map((x) => [x.name, x.at]),
    [
      ['A', 't3'],
      ['B', 't2'],
    ],
    'reopening moves it to the front with the new time',
  );
});

ok(`the list caps at ${RECENTS_CAP}: the oldest falls off the end, nothing else moves`, () => {
  let list = [];
  for (let i = 1; i <= RECENTS_CAP + 3; i++) list = touchRecents(list, e(`P${i}`, `/p/${i}`), `t${i}`);
  assert.equal(list.length, RECENTS_CAP);
  assert.equal(list[0].name, `P${RECENTS_CAP + 3}`);
  assert.equal(list[RECENTS_CAP - 1].name, 'P4');
});

ok('remove takes exactly that entry out; an unknown root changes nothing', () => {
  const list = [e('A', '/p/A'), e('B', '/p/B')];
  assert.deepEqual(removeRecent(list, '/p/A'), [e('B', '/p/B')]);
  assert.deepEqual(removeRecent(list, '/p/zzz'), list);
});

ok('rename moves the entry in place: same slot, new name and root', () => {
  const list = [e('A', '/p/A'), e('B', '/p/B')];
  assert.deepEqual(renameRecent(list, '/p/B', { name: 'Bee', root: '/p/Bee' }), [e('A', '/p/A'), e('Bee', '/p/Bee')]);
  assert.deepEqual(renameRecent(list, '/p/zzz', { name: 'X', root: '/p/X' }), list);
});

ok('parse sanitizes: junk entries dropped, duplicates by root keep the first, corrupt text is an empty list', () => {
  assert.deepEqual(parseRecents('not json'), []);
  assert.deepEqual(parseRecents(null), []);
  assert.deepEqual(parseRecents('{"x":1}'), []);
  const messy = JSON.stringify([
    e('A', '/p/A'),
    { name: 7, root: '/p/bad' },
    { root: '/p/noname' },
    e('A again', '/p/A'),
    null,
    e('B', '/p/B', 42),
  ]);
  assert.deepEqual(parseRecents(messy), [e('A', '/p/A'), e('B', '/p/B')]);
  assert.deepEqual(sanitizeRecents('nope'), []);
});

console.log(`projectRecents.selfcheck: ${n} checks passed (#1711 — recents: MRU, capped, never silently dropped)`);
