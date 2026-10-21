// banks.selfcheck.mjs — #1720 MIDI banks: the sanitizer, the bank edits, and
// the key legend. Pure — the store behaviour lives in midi.selfcheck.mjs.
import assert from 'node:assert';
import {
  DEFAULT_BANK_NAME, MAX_BANKS, MAX_BANK_NAME, sanitizeBankName, sanitizeMidiBanks,
  sanitizeMidiActiveBank, activeBankMap, nextBankName, addBank, removeBank, renameBank,
  withBankMap, legendEntries,
} from './banks.mjs';

// ── names ────────────────────────────────────────────────────────────────
assert.strictEqual(sanitizeBankName('  PAL   A '), 'PAL A', 'trimmed, whitespace collapsed');
assert.strictEqual(sanitizeBankName('x'.repeat(40)).length, MAX_BANK_NAME, 'capped');
assert.strictEqual(sanitizeBankName(''), DEFAULT_BANK_NAME, 'empty falls back');
assert.strictEqual(sanitizeBankName(null), DEFAULT_BANK_NAME);
assert.strictEqual(sanitizeBankName('   ', 'BANK 2'), 'BANK 2', 'blank falls back to the given name');

// ── the bank list sanitizer ──────────────────────────────────────────────
assert.deepStrictEqual(sanitizeMidiBanks(null), [{ name: 'MAIN', map: {} }], 'nothing → the one MAIN bank');
assert.deepStrictEqual(sanitizeMidiBanks(undefined, { 'note:1:36': 'evolve.toggle' }),
  [{ name: 'MAIN', map: { 'note:1:36': 'evolve.toggle' } }], 'a legacy midiMap becomes the MAIN bank');
assert.deepStrictEqual(sanitizeMidiBanks('hostile'), [{ name: 'MAIN', map: {} }], 'garbage → one empty bank');
assert.deepStrictEqual(sanitizeMidiBanks([{ name: 'PAL A', map: { 'note:1:53': 'palette.hydra', junk: 'x', 'note:1:54': 'nope' } }]),
  [{ name: 'PAL A', map: { 'note:1:53': 'palette.hydra' } }], 'each bank map passes the same sanitizer as midiMap');
{
  const messy = sanitizeMidiBanks([
    { name: 'MAIN', map: { 'note:1:36': 'evolve.toggle' } },
    { name: 'MAIN', map: { 'note:1:37': 'seed.new' } },      // duplicate name: dropped whole
    'junk', null, 7,                                          // not banks at all
    { name: '', map: {} },                                    // unnamed: takes its positional name
    { map: { 'cc:1:7': 'param.lifeDrift' } },                  // no name field at all
  ]);
  assert.deepStrictEqual(messy, [
    { name: 'MAIN', map: { 'note:1:36': 'evolve.toggle' } },
    { name: 'BANK 2', map: {} },
    { name: 'BANK 3', map: { 'cc:1:7': 'param.lifeDrift' } },
  ], 'duplicates dropped, junk skipped, unnamed banks named by position');
  assert.deepStrictEqual(sanitizeMidiBanks(messy), messy, 'sanitizing is a fixed point');
}
{
  const many = Array.from({ length: 30 }, (_, i) => ({ name: `B${i}`, map: {} }));
  assert.strictEqual(sanitizeMidiBanks(many).length, MAX_BANKS, 'the bank count is capped');
  const hostile = sanitizeMidiBanks([{ name: 'MAIN', map: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`cc:1:${i % 128}`, 'evolve.toggle'])) }]);
  assert.ok(Object.keys(hostile[0].map).length <= 128, 'a hostile map inside a bank is capped like any map');
}
// a valid bank list beats a legacy map riding in the same document
assert.deepStrictEqual(
  sanitizeMidiBanks([{ name: 'VOX', map: {} }], { 'note:1:36': 'evolve.toggle' }),
  [{ name: 'VOX', map: {} }],
  'midiBanks wins; the legacy field is only a fallback',
);

// ── the active bank ──────────────────────────────────────────────────────
const two = sanitizeMidiBanks([{ name: 'A', map: { 'note:1:1': 'seed.new' } }, { name: 'B', map: { 'note:1:2': 'accum.swell' } }]);
assert.strictEqual(sanitizeMidiActiveBank(1, two), 1);
assert.strictEqual(sanitizeMidiActiveBank(2, two), 0, 'past the end → first bank');
assert.strictEqual(sanitizeMidiActiveBank(-1, two), 0);
assert.strictEqual(sanitizeMidiActiveBank(1.5, two), 0, 'fractional → first bank');
assert.strictEqual(sanitizeMidiActiveBank('1', two), 0, 'a string is not an index');
assert.deepStrictEqual(activeBankMap(two, 1), { 'note:1:2': 'accum.swell' });
assert.deepStrictEqual(activeBankMap(two, 99), { 'note:1:1': 'seed.new' }, 'a stale index reads the first bank');
assert.deepStrictEqual(activeBankMap(null, 0), {}, 'no banks → no map');

// ── bank edits (pure) ────────────────────────────────────────────────────
assert.strictEqual(nextBankName([]), 'MAIN');
assert.strictEqual(nextBankName(two), 'BANK 3', 'the next positional name');
assert.strictEqual(nextBankName([{ name: 'BANK 2', map: {} }]), 'BANK 3', 'never reuses a live name');
{
  let banks = sanitizeMidiBanks(null);
  banks = addBank(banks);
  assert.deepStrictEqual(banks.map((b) => b.name), ['MAIN', 'BANK 2'], 'add appends an empty bank');
  assert.strictEqual(addBank(banks, 'MAIN'), banks, 'a duplicate name is refused (same list back)');
  assert.deepStrictEqual(addBank(banks, ' vox ')[2], { name: 'vox', map: {} }, 'names are sanitized on add');
  const full = Array.from({ length: MAX_BANKS }, (_, i) => ({ name: `B${i}`, map: {} }));
  assert.strictEqual(addBank(full), full, 'at the cap, add is refused');
  assert.strictEqual(removeBank(banks, 5), banks, 'an out-of-range remove is refused');
  assert.deepStrictEqual(removeBank(banks, 0).map((b) => b.name), ['BANK 2'], 'remove drops the bank');
  const single = sanitizeMidiBanks(null);
  assert.strictEqual(removeBank(single, 0), single, 'the last bank is never removed');
  assert.strictEqual(renameBank(banks, 0, 'BANK 2'), banks, 'renaming onto a live name is refused');
  assert.strictEqual(renameBank(banks, 0, '  '), banks, 'renaming to blank is refused');
  assert.strictEqual(renameBank(banks, 0, 'MAIN')[0].name, 'MAIN', 'keeping the same name is a no-op that passes');
  assert.deepStrictEqual(withBankMap(banks, 1, { 'note:1:9': 'seed.new' })[1].map, { 'note:1:9': 'seed.new' });
  assert.strictEqual(withBankMap(banks, 7, {}), banks, 'a map edit on a missing bank is refused');
  assert.deepStrictEqual(banks[1].map, {}, 'edits never mutate their input');
}

// ── the key legend ───────────────────────────────────────────────────────
{
  const map = {
    'cc:1:7': 'param.lifeDrift',
    'note:1:53': 'palette.hydra',
    'note:1:36': 'evolve.toggle',
    'note:2:36': 'seed.new',
    'cc:1:20': 'bank.next',
  };
  const rows = legendEntries(map);
  assert.deepStrictEqual(rows.map((r) => r.key), ['note:1:36', 'note:1:53', 'cc:1:7', 'cc:1:20', 'note:2:36'],
    'by key: channel, notes before CCs, then number — the order a hand meets them');
  assert.deepStrictEqual(rows[0], { key: 'note:1:36', keyLabel: 'note 36 · ch 1', targetId: 'evolve.toggle', label: 'EVOLVE / STOP' });
  assert.strictEqual(rows.find((r) => r.targetId === 'palette.hydra').label, 'PAL HYDRA', 'rows carry the registry label');
  assert.deepStrictEqual(legendEntries({}), [], 'nothing bound: no legend (silence is default)');
  assert.deepStrictEqual(legendEntries(null), []);
  assert.strictEqual(legendEntries({ 'note:1:1': 'gone.target' })[0].label, 'gone.target', 'an unknown id reads as itself, never hidden');
}

console.log('banks.selfcheck: OK');
