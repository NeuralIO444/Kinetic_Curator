// node src/curator/shelfPrefs.selfcheck.mjs
//
// #1590 (Keeps K2) — the preferences.json suite. Spec:
// docs/research/keeps-machinery-spec-2026-10-14.md §5 + issue #1590.
// Pins the file contract the fill reads:
//   - no file / unreadable file → shipped defaults (FULL WEIRD) in
//     force, and the fallback is NAMED in the lines, never silent;
//   - a clean file parses to its own values with no corrections;
//   - every bad value clamps to its nearest valid value WITH the
//     correction named (a hidden clamp breaks trust like a hidden
//     eviction);
//   - a table whose counts sum past the 16-slot stage trims from the
//     last rules in deal order, named;
//   - the defaults document (what a first setup writes) round-trips
//     to exactly the shipped defaults with zero corrections;
//   - the iCloud conflict copy is recognized — and never read.
import assert from 'node:assert';

const {
  DEFAULT_SHELF_PREFS, FULL_WEIRD_TABLE, DEFAULT_PREFERENCES_TEXT,
  parseShelfPrefs, isFullWeird, tableTotal, tableName,
  isConflictCopyName, conflictCopyLine,
} = await import('./shelfPrefs.mjs');

const lines = [];

// ── the shipped defaults ARE Full Weird ─────────────────────────────
{
  assert.deepStrictEqual(DEFAULT_SHELF_PREFS.table, { consensus: 8, neglected: 3, wild: 2, lois: 2, contrarian: 1 });
  assert.strictEqual(tableTotal(DEFAULT_SHELF_PREFS), 16, 'the default table fills the 16-slot stage');
  assert.strictEqual(DEFAULT_SHELF_PREFS.recencyWindow, 2);
  assert.strictEqual(DEFAULT_SHELF_PREFS.collectionSoftBound, 400, 'the K1 soft bound, now a real preference');
  assert.ok(isFullWeird(DEFAULT_SHELF_PREFS));
  assert.strictEqual(tableName(DEFAULT_SHELF_PREFS), 'FULL WEIRD');
  lines.push('defaults: FULL WEIRD (8 consensus · 3 neglected · 2 wild · 2 lois · 1 contrarian), window 2, soft bound 400');
}

// ── absent / unreadable → defaults + a named line ───────────────────
{
  for (const text of [null, undefined, '', '   ', '{not json', '[1,2]', '"just a string"', '42']) {
    const r = parseShelfPrefs(text);
    assert.strictEqual(r.source, 'default', `unreadable input ${JSON.stringify(text)} → defaults`);
    assert.deepStrictEqual(r.prefs, DEFAULT_SHELF_PREFS);
    assert.strictEqual(r.lines.length, 1, 'the fallback is said, once');
    assert.match(r.lines[0], /shipped defaults in force/);
  }
  lines.push('missing/unparseable file → shipped defaults in force, said in one named line');
}

// ── a clean file parses clean ───────────────────────────────────────
{
  const r = parseShelfPrefs(JSON.stringify({
    shelf: { table: { consensus: 10, neglected: 2, wild: 2, lois: 1, contrarian: 1 }, recencyWindow: 3, collectionSoftBound: 250 },
  }));
  assert.strictEqual(r.source, 'file');
  assert.deepStrictEqual(r.lines, [], 'no corrections for a valid file');
  assert.strictEqual(r.prefs.table.consensus, 10);
  assert.strictEqual(r.prefs.recencyWindow, 3);
  assert.strictEqual(r.prefs.collectionSoftBound, 250);
  assert.ok(!isFullWeird(r.prefs));
  assert.match(tableName(r.prefs), /consensus 10/);
  lines.push('clean file: values stand as written, zero corrections, table named by its counts');
}

// ── partial file: absent keys default silently ──────────────────────
{
  const r = parseShelfPrefs(JSON.stringify({ shelf: { table: { wild: 0 }, recencyWindow: 5 } }));
  assert.strictEqual(r.source, 'file');
  assert.deepStrictEqual(r.lines, []);
  assert.strictEqual(r.prefs.table.wild, 0);
  assert.strictEqual(r.prefs.recencyWindow, 5);
  assert.strictEqual(r.prefs.table.consensus, FULL_WEIRD_TABLE.consensus, 'unspelled keys take the shipped default');
  lines.push('partial file: spelled keys stand, unspelled keys default — silently, by design');
}
{
  // …but the table is read as a whole: spelling wild UP to 4 pushes
  // the sum to 18, so the tail-trim law fires and names both trims.
  const r = parseShelfPrefs(JSON.stringify({ shelf: { table: { wild: 4 } } }));
  assert.strictEqual(tableTotal(r.prefs), 16);
  assert.strictEqual(r.prefs.table.wild, 4, 'the spelled value stands');
  assert.strictEqual(r.prefs.table.contrarian, 0);
  assert.strictEqual(r.prefs.table.lois, 1);
  assert.strictEqual(r.lines.length, 2, 'each trim is its own named line');
  lines.push('partial-but-over-full: the spelled value stands, the tail yields — both trims named');
}

// ── clamp cases: each correction named ──────────────────────────────
{
  const r = parseShelfPrefs(JSON.stringify({
    shelf: { table: { consensus: 99, lois: -2 }, recencyWindow: -1, collectionSoftBound: 3 },
  }));
  assert.strictEqual(r.prefs.table.consensus, 16, 'a rule count clamps to the stage size');
  assert.strictEqual(r.prefs.table.lois, 0);
  assert.strictEqual(r.prefs.recencyWindow, 0);
  assert.strictEqual(r.prefs.collectionSoftBound, 16, 'the soft bound clamps to its floor');
  const joined = r.lines.join('\n');
  assert.match(joined, /shelf\.table\.consensus: 99 .* clamped to 16/);
  assert.match(joined, /shelf\.table\.lois: -2 .* clamped to 0/);
  assert.match(joined, /shelf\.recencyWindow: -1 .* clamped to 0/);
  assert.match(joined, /shelf\.collectionSoftBound: 3 .* clamped to 16/);
  lines.push('clamps: consensus 99→16, lois −2→0, window −1→0, bound 3→16 — every correction named');
}
{
  const r = parseShelfPrefs(JSON.stringify({ shelf: { table: { consensus: 'eight' }, recencyWindow: 2.6 } }));
  assert.strictEqual(r.prefs.table.consensus, 8, 'a non-number falls back to the default for that key');
  assert.match(r.lines.join('\n'), /shelf\.table\.consensus: "eight" is not a number/);
  assert.strictEqual(r.prefs.recencyWindow, 3, 'a fractional window rounds to nearest');
  lines.push('types: a word where a number belongs → that key\'s default, named; fractions round');
}

// ── the over-full table trims from the tail, named ──────────────────
{
  const r = parseShelfPrefs(JSON.stringify({
    shelf: { table: { consensus: 8, neglected: 3, wild: 2, lois: 2, contrarian: 5 } },
  }));
  assert.strictEqual(tableTotal(r.prefs), 16);
  assert.strictEqual(r.prefs.table.contrarian, 1, 'the excess comes off the last rule first');
  assert.strictEqual(r.prefs.table.consensus, 8, 'the consensus spine is trimmed last');
  assert.match(r.lines.join('\n'), /sum to 20, over the 16-slot stage — contrarian trimmed 5 → 1/);
  lines.push('over-full table (20): trims the tail rules to 16, the trim named, consensus untouched');
}

// ── unknown keys tolerated (other namespaces live here too) ─────────
{
  const r = parseShelfPrefs(JSON.stringify({
    shelf: { export: { folder: 'looks' } },
    future: { anything: true },
  }));
  assert.strictEqual(r.source, 'file');
  assert.deepStrictEqual(r.prefs, DEFAULT_SHELF_PREFS, 'a file with no shelf settings reads as all-defaults, no complaint');
  lines.push('namespaces: unknown keys (incl. K3\'s shelf.export) tolerated, never corrected');
}

// ── the shipped defaults document round-trips ───────────────────────
{
  const r = parseShelfPrefs(DEFAULT_PREFERENCES_TEXT);
  assert.strictEqual(r.source, 'file');
  assert.deepStrictEqual(r.lines, [], 'the document we ship needs no corrections');
  assert.deepStrictEqual(r.prefs, DEFAULT_SHELF_PREFS);
  assert.match(DEFAULT_PREFERENCES_TEXT, /"shelf"/, 'the defaults are spelled out under the shelf namespace');
  lines.push('DEFAULT_PREFERENCES_TEXT parses back to exactly the shipped defaults');
}

// ── the conflict copy ───────────────────────────────────────────────
{
  assert.ok(isConflictCopyName('preferences (conflicted copy).json'));
  assert.ok(isConflictCopyName('preferences (conflicted copy 2).json'));
  assert.ok(!isConflictCopyName('preferences.json'));
  assert.match(conflictCopyLine('preferences (conflicted copy).json'), /ignored — the canonical preferences\.json wins/);
  lines.push('conflict copies are recognized so the loader can ignore them — by name, out loud');
}

console.log('shelfPrefs.selfcheck:');
for (const l of lines) console.log(`  ✓ ${l}`);
console.log('shelfPrefs.selfcheck: PASS');
