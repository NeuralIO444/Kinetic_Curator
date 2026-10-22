// loreBank.selfcheck.mjs — #1560 S4: the lore bank — a versioned offline artifact behind a fail-closed
// validator (05), provenance on every record, and date/tag draws that replay exactly.
// The curation pass itself (studio/curate-lore.py) machine-verifies each date against its source;
// this suite proves the app side: what may enter, what the shipped bank actually holds, and how it draws.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LORE_KIND, LORE_VERSION, validateLore, getLoreBank, loreById, loreForDate, pickOnThisDay, drawLore,
} from './loreBank.js';
import { BEAT_FORMS } from './storyState.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const bank = getLoreBank();
const entry = (over = {}) => ({
  id: 'otd-test-born-0101', kind: 'onthisday', fact: 'A fact, worded here.', month: 1, day: 1,
  tags: { family: 'print', movement: 'test', mood: 'calm' },
  source_id: 'wikidata:Q1', source_url: 'https://www.wikidata.org/wiki/Q1',
  rights: 'CC0 — test', retrieved_date: '2026-10-22', bank_version: 'test.1', ...over,
});
const file = (entries, over = {}) => ({ kind: LORE_KIND, version: LORE_VERSION, bank_version: 'test.1', entries, ...over });

ok('the shipped bank validates: kind, version, and a size worthy of a first pass', () => {
  assert.ok(bank, 'lore.json on disk is a bank this app may read');
  assert.equal(bank.kind, 'kc-lore');
  assert.equal(bank.version, 1);
  assert.ok(bank.entries.length >= 40 && bank.entries.length <= 120, `a modest first pass (got ${bank.entries.length})`);
  for (const kind of ['maxim', 'ancestor', 'fact', 'onthisday']) {
    assert.ok(bank.entries.some((e) => e.kind === kind), `the bank holds ${kind} entries`);
  }
});

ok('provenance rides every record: source, rights basis, retrieval date, bank version', () => {
  const ids = new Set();
  const stamps = new Set();
  for (const e of bank.entries) {
    assert.ok(e.source_id && e.source_url.startsWith('https://'), `${e.id}: a source, reachable in principle`);
    assert.ok(!e.source_url.includes('wikipedia.org'), `${e.id}: facts come from structured data — Wikipedia prose is CC BY-SA and never a source`);
    assert.ok(!/wikipedia/i.test(e.fact), `${e.id}: no lifted prose`);
    assert.ok(/CC0|public domain|Original KC-1 wording/.test(e.rights), `${e.id}: the rights basis is named in the record`);
    assert.ok(!ids.has(e.id), `${e.id}: ids are unique`);
    ids.add(e.id);
    stamps.add(e.retrieved_date);
    assert.equal(e.bank_version, bank.bankVersion, `${e.id}: of this bank version`);
    if (e.kind === 'onthisday') {
      assert.ok(Number.isInteger(e.month) && Number.isInteger(e.day), `${e.id}: the date is data, not prose`);
    }
  }
  assert.equal(stamps.size, 1, 'one curation pass, one retrieval date');
});

ok('the validator refuses, fail-closed: shape, kind, version, and every provenance field', () => {
  const refuses = (raw, why) => assert.equal(validateLore(raw).ok, false, why);
  refuses(null, 'not an object');
  refuses([], 'an array is not a file');
  refuses('kc-lore', 'a string is not a file');
  refuses(file([entry()], { kind: 'kc-taste' }), 'wrong kind');
  refuses(file([entry()], { version: 2 }), 'a version this app does not read');
  refuses(file([entry()], { bank_version: '' }), 'no bank version');
  refuses(file([]), 'an empty bank is a broken file, not a quiet one');
  refuses(file([entry({ rights: '' })]), 'no rights basis, no entry');
  refuses(file([entry({ retrieved_date: 'yesterday' })]), 'the retrieval date is a date');
  refuses(file([entry({ retrieved_date: '2026-02-30' })]), 'a date that does not exist');
  refuses(file([entry({ source_url: 'http://www.wikidata.org/wiki/Q1' })]), 'sources are https');
  refuses(file([entry({ source_id: '' })]), 'no source, no entry');
  refuses(file([entry({ kind: 'rumour' })]), 'kinds are the four 05 names');
  refuses(file([entry({ fact: 'x'.repeat(401) })]), 'a fact is a sentence, not an essay');
  refuses(file([entry({ tags: { family: 'print', era: 'old' } })]), 'tag axes are 05’s three');
  refuses(file([entry({ tags: { movement: 'test' } })]), 'the family axis is required');
  refuses(file([entry({ month: 13 })]), 'month in range');
  refuses(file([entry({ month: 2, day: 30 })]), 'day in range for the month');
  refuses(file([entry({ kind: 'fact' })]), 'a date on a non-date kind is a curation error');
  refuses(file([entry({ bank_version: 'other.9' })]), 'an entry of another bank version');
  refuses(file([entry(), entry()]), 'duplicate ids');
  const good = validateLore(file([entry()]));
  assert.ok(good.ok, 'a well-formed file passes');
  assert.equal(good.bank.entries[0].fact, 'A fact, worded here.');
});

ok('on this day: the date is an input, the pick replays exactly, absence is honest', () => {
  const oct22 = loreForDate(bank, 10, 22);
  assert.equal(oct22.length, 1, 'the curation day itself carries one entry');
  assert.equal(oct22[0].id, 'otd-rauschenberg-born-1022');
  assert.deepEqual(loreForDate(bank, 9, 15), [], 'a day the first pass holds nothing for');
  assert.equal(pickOnThisDay(bank, { month: 9, day: 15 }, () => 0.5), null, 'no entry, no cold open — never a borrowed fact');
  const jan19 = loreForDate(bank, 1, 19);
  assert.equal(jan19.length, 2, 'two entries share 19 January');
  assert.deepEqual(jan19.map((e) => e.id), [...jan19.map((e) => e.id)].sort(), 'bank order is id order: the draw is stable');
  assert.equal(pickOnThisDay(bank, { month: 1, day: 19 }, () => 0).id, jan19[0].id, 'roll 0 takes the first');
  assert.equal(pickOnThisDay(bank, { month: 1, day: 19 }, () => 0.999).id, jan19[1].id, 'a high roll takes the last');
  assert.equal(
    pickOnThisDay(bank, { month: 1, day: 19 }, () => 0.42).id,
    pickOnThisDay(bank, { month: 1, day: 19 }, () => 0.42).id,
    'the same roll selects the same entry — selection replays exactly');
});

ok('the tag draw (05): the best-matching tier only, deterministic, silent on no match', () => {
  const dither = drawLore(bank, { family: 'dither' }, () => 0);
  assert.ok(dither && dither.tags.family === 'dither', 'a family draw lands in the family');
  assert.equal(drawLore(bank, { family: 'dither' }, () => 0.5).id, drawLore(bank, { family: 'dither' }, () => 0.5).id, 'same tags, same roll, same entry');
  const wave = drawLore(bank, { family: 'print', movement: 'ukiyo-e', mood: 'surge' }, () => 0);
  assert.equal(wave.id, 'fact-great-wave', 'matching all three axes outranks matching one');
  assert.equal(drawLore(bank, { family: 'astrophysics' }, () => 0), null, 'nothing keyed, nothing drawn');
  assert.equal(drawLore(bank, {}, () => 0), null, 'no axes named, no draw');
  assert.equal(drawLore(null, { family: 'dither' }, () => 0), null, 'no bank, no draw');
});

ok('wiring: the story machine takes the cold open as a callback form; the driver seeds and resolves it', () => {
  assert.ok(BEAT_FORMS.callback.includes('onthisday'), 'the cold open is a callback form (04: episodes open with it)');
  const live = readFileSync(new URL('./storyLive.js', import.meta.url), 'utf8');
  assert.match(live, /pickOnThisDay/, 'the driver picks the day’s entry from the bank');
  assert.match(live, /getDate/, 'the date is an injected input, not a clock read in the machinery');
  assert.match(live, /loreById/, 'the backstage view resolves a beat’s lore referent to its fact');
  const state = readFileSync(new URL('./storyState.js', import.meta.url), 'utf8');
  assert.ok(!/lore\.json|loreBank/.test(state), 'the pure module knows the bank’s shape, never the bank itself');
});

console.log(`loreBank.selfcheck: ${n} checks passed`);
