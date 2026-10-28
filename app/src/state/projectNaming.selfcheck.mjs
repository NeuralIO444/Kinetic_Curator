// node src/state/projectNaming.selfcheck.mjs
// #1709 — pins project folder / session file naming: STRICT names (forbidden characters, edge spaces/dots, Windows
// reserved names and the 64-code-point cap are refused, never rewritten — NFC is the only transformation), collisions
// refused case-insensitively after NFC, and session numbers as zero-padded max+1 that never reuse gaps.
import assert from 'node:assert/strict';
import {
  FOLDER_PREFIX,
  SESSION_EXT,
  NAME_MAX,
  validateProjectName,
  folderNameFor,
  projectNameFromFolder,
  nameCollides,
  sessionFileName,
  parseSessionNumber,
  nextSessionNumber,
} from './projectNaming.mjs';

assert.equal(FOLDER_PREFIX, 'KC1_Loot_');
assert.equal(SESSION_EXT, '.kcproject');
assert.equal(NAME_MAX, 64);

// --- refusals
const refuse = (s) => {
  const r = validateProjectName(s);
  assert.equal(r.ok, false, `should refuse ${JSON.stringify(s)}`);
  assert.equal(typeof r.reason, 'string');
  assert.ok(r.reason.length > 0);
};
for (const bad of [
  undefined,
  null,
  42,
  {},
  '',
  'a/b',
  'a\\b',
  'a:b',
  'a*b',
  'a?b',
  'a"b',
  'a<b',
  'a>b',
  'a|b',
  'a\u0000b',
  'a\tb',
  'a\nb',
  'a\u001fb',
  'a\u007fb',
  ' lead',
  'trail ',
  ' ',
  'dot.',
  '.hidden',
  '.',
  '..',
  'con',
  'CON',
  'Prn',
  'aux',
  'NUL',
  'com1',
  'Com3',
  'COM9',
  'lpt1',
  'LPT9',
  'nul.txt',
  'con.v2',
  'x'.repeat(NAME_MAX + 1),
])
  refuse(bad);
assert.equal(validateProjectName('a/b').ok, false); // refused, not turned into 'ab'

// --- accepted
for (const good of [
  'Night Migration',
  'v1.2 test',
  '🦋 moths',
  'a-b_c',
  'console',
  'com10',
  'lpt0',
  'communist',
  'a.con',
]) {
  const r = validateProjectName(good);
  assert.deepEqual(r, { ok: true, name: good }, good);
}
const decomposed = 'café';
const composed = 'café';
assert.notEqual(decomposed, composed);
assert.deepEqual(validateProjectName(decomposed), { ok: true, name: composed });
assert.deepEqual(validateProjectName('🦋'.repeat(64)), { ok: true, name: '🦋'.repeat(64) });
refuse('🦋'.repeat(65));
assert.equal(validateProjectName('x'.repeat(64)).ok, true);

// --- folder names
assert.equal(folderNameFor('Night Migration'), 'KC1_Loot_Night Migration');
assert.equal(folderNameFor(decomposed), 'KC1_Loot_' + composed);
assert.throws(() => folderNameFor('a/b'));
assert.throws(() => folderNameFor(''));
assert.equal(projectNameFromFolder(folderNameFor('Night Migration')), 'Night Migration');
assert.equal(projectNameFromFolder('KC1_Loot_a_01'), 'a_01');
assert.equal(projectNameFromFolder('KC1_Loot_'), null);
assert.equal(projectNameFromFolder('KC1_Loot_bad/name'), null);
assert.equal(projectNameFromFolder('KC1_Loot_ x'), null);
assert.equal(projectNameFromFolder('Other_Foo'), null);
assert.equal(projectNameFromFolder('kc1_loot_foo'), null);
assert.equal(projectNameFromFolder(null), null);

// --- collisions
assert.equal(nameCollides('Foo', ['KC1_Loot_Foo', 'other']), true);
assert.equal(nameCollides('foo', ['KC1_Loot_Foo']), true);
assert.equal(nameCollides('FOO', ['kc1_loot_foo']), true);
assert.equal(nameCollides(decomposed, ['KC1_Loot_' + composed]), true);
assert.equal(nameCollides(composed, ['KC1_Loot_' + decomposed]), true);
assert.equal(nameCollides('Foo', ['KC1_Loot_Foo2', 'Foo', 'other']), false);
assert.equal(nameCollides('Foo', []), false);
assert.equal(nameCollides('Foo', ['kc1_loot_FOO']), true);
assert.throws(() => nameCollides('a/b', []));

// --- session file names
assert.equal(sessionFileName('Foo', 1), 'Foo_01.kcproject');
assert.equal(sessionFileName('Foo', 9), 'Foo_09.kcproject');
assert.equal(sessionFileName('Foo', 10), 'Foo_10.kcproject');
assert.equal(sessionFileName('Foo', 99), 'Foo_99.kcproject');
assert.equal(sessionFileName('Foo', 100), 'Foo_100.kcproject');
assert.equal(sessionFileName('Foo', 101), 'Foo_101.kcproject');
for (const n of [0, -1, 1.5, NaN, '2', null]) assert.throws(() => sessionFileName('Foo', n));

// --- parse
assert.equal(parseSessionNumber('Foo', 'Foo_01.kcproject'), 1);
assert.equal(parseSessionNumber('Foo', 'Foo_99.kcproject'), 99);
assert.equal(parseSessionNumber('Foo', 'Foo_100.kcproject'), 100);
assert.equal(parseSessionNumber('Foo', 'Foo_1.kcproject'), null);
assert.equal(parseSessionNumber('Foo', 'Foo_001.kcproject'), null);
assert.equal(parseSessionNumber('Foo', 'Foo_010.kcproject'), null);
assert.equal(parseSessionNumber('Foo', 'Foo_00.kcproject'), null);
assert.equal(parseSessionNumber('Foo', 'foo_01.kcproject'), null);
assert.equal(parseSessionNumber('Foo', 'Foo_01.kcproject.bak'), null);
assert.equal(parseSessionNumber('Foo', 'Foo_01.json'), null);
assert.equal(parseSessionNumber('Foo', 'Foo_aa.kcproject'), null);
assert.equal(parseSessionNumber('Foo', 'Foo_.kcproject'), null);
assert.equal(parseSessionNumber('Foo', 'Foo_0a.kcproject'), null);
assert.equal(parseSessionNumber('Foo', 'Foo2_01.kcproject'), null);
assert.equal(parseSessionNumber('a_01', 'a_01_02.kcproject'), 2);
assert.equal(parseSessionNumber('a_01', 'a_01.kcproject'), null);
assert.equal(parseSessionNumber('a', 'a_01_02.kcproject'), null);
for (let n = 1; n <= 120; n++) assert.equal(parseSessionNumber('Foo', sessionFileName('Foo', n)), n);

// --- next
assert.equal(nextSessionNumber('Foo', []), 1);
assert.equal(nextSessionNumber('Foo', ['Foo_01.kcproject', 'Foo_03.kcproject']), 4);
assert.equal(nextSessionNumber('Foo', ['Foo_02.kcproject']), 3);
assert.equal(nextSessionNumber('Foo', ['Foo_99.kcproject']), 100);
assert.equal(nextSessionNumber('Foo', ['Foo_100.kcproject', 'Foo_05.kcproject']), 101);
assert.equal(nextSessionNumber('Foo', ['Bar_07.kcproject', 'notes.txt', 'Foo_x.kcproject', 'Foo_1.kcproject', '']), 1);
assert.equal(nextSessionNumber('Foo', ['Bar_07.kcproject', 'Foo_02.kcproject', 'junk']), 3);
assert.equal(nextSessionNumber('a_01', ['a_01_01.kcproject', 'a_01.kcproject']), 2);

console.log('projectNaming.selfcheck: ok (refusals, accepts, NFC, folders, collisions, session names, parse, next)');
