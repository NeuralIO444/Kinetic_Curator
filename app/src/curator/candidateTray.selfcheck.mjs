// node src/curator/candidateTray.selfcheck.mjs
//
// Look Explorer E3 (#1507) — the candidate tray suite. Spec:
// docs/research/look-explorer-spec-2026-10-13.md §2/§5/§7/§8 (E3) +
// issue #1507. Pins, at the deepest level that runs headlessly (the
// store + bus level, E1a/E1b's pattern):
//   - provenance survives the keep boundary (sanitizeFavorite) and the
//     ledger boundary (ledgerRow/isLedgerRow), bounded and droppable
//     when hostile — a mined record is forever distinguishable IN DATA;
//   - the plain-word label (corner + axes) with NO real artist names
//     (the display policy: aliases on product surfaces);
//   - look-slot accounting: 16 slots, a mined keep counts double —
//     #1589 (Keeps K1) reframed the gate as the STAGE's predictor: at
//     the cap the crown is not refused, it lands in the collection
//     with the line; the refusal copy is dead, no silent eviction on
//     any path, ever;
//   - run-folder parsing: finalists join their candidates for the
//     sample index (the still's name) and the anchor word;
//   - the crown end-to-end: a mined radial/Haeckel-corner finalist
//     crowned through the dice crown's own door (KEEP_ADD) lands on
//     the shelf AND in the keeps ledger with provenance, and recalls
//     (RA6) identically in kind to a hand-built keep;
//   - a pass on a mined render is a passes-ledger line WITH provenance
//     and is never counted as a keep;
//   - the marker contract in the shipped components (source-level, the
//     devPanel precedent): candidates render data-source="explorer" +
//     the MINED tag; a crowned mined keep's hits pill carries the mark.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

// localStorage shim BEFORE any store import (E1a's pattern).
const lsData = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsData.has(k) ? lsData.get(k) : null),
  setItem: (k, v) => lsData.set(k, String(v)),
  removeItem: (k) => lsData.delete(k),
};
globalThis.requestAnimationFrame = (fn) => { queueMicrotask(() => fn(performance.now())); return 1; };

const { sanitizeProvenance, isProvenance, isMined, cornerWord, provenanceLabel } = await import('./provenance.mjs');
const {
  LOOK_SLOT_BUDGET, HAND_SLOT_COST, MINED_SLOT_COST,
  slotCostOf, lookSlotsUsed, crownGate, parseRunFolder,
} = await import('./candidateTray.mjs');
const { stageRecords, stageSlotsUsed, ON_SHELF_COPY } = await import('./shelf.mjs');
const { sanitizeFavorite, KEEPS_KEY } = await import('../state/slices/davisSlice.js');
const { ledgerRow, isLedgerRow, parseLedger, readLedgerText } = await import('./tasteLedger.js');
const { ASSETS } = await import('../data/assets/index.js');
const { PALETTES } = await import('../data/palettes.js');
const { useStore } = await import('../state/store.js');
const { wireEventBus } = await import('../composition/wireEventBus.js');
const { applyAction } = await import('../state/applyAction.js');
const { emit, Events } = await import('../composition/eventBus.js');
const { captureKeepContext } = await import('./keepContext.js');
const A = await import('../state/actions.js');

const lines = [];
const tick = () => new Promise((r) => setTimeout(r, 0));
const assetsById = new Map(ASSETS.map((a) => [a.id, a]));
const palettesById = new Map(PALETTES.map((p) => [p.id, p]));

// ── fixtures: miner-shaped records (E2's finalists.json shape) ──────
const radialIds = ASSETS.filter((a) => a.category === 'radial').slice(0, 3).map((a) => a.id);
assert.ok(radialIds.length >= 2, 'fixture needs radial assets in the library');
const minedRecord = {
  seed: 424242,
  seedOffsets: { spatial: 1, color: 2, asset: 3, noise: 4 },
  config: {
    layout: { mode: 'radial', count: 48 },
    palette: { id: 'hydra' },
    assets: radialIds,
  },
  provenance: {
    source: 'explorer', run: 'xpl-fixture-1', corner: 'haeckel',
    axes: { layout: 'radial', palette: 'hydra', castSize: radialIds.length },
  },
};
const handRecord = {
  seed: 777,
  seedOffsets: { spatial: 0, color: 0, asset: 0, noise: 0 },
  config: { layout: { mode: 'grid', count: 30 }, palette: { id: 'bone' }, assets: radialIds.slice(0, 2) },
};

// ── provenance: the boundary ─────────────────────────────────────────
{
  assert.deepStrictEqual(sanitizeProvenance(minedRecord.provenance), minedRecord.provenance, 'a miner provenance survives sanitizing whole');
  assert.strictEqual(sanitizeProvenance({ source: 'dice' }), undefined, 'an unrecognized origin is dropped whole — a record never claims a false origin');
  assert.strictEqual(sanitizeProvenance(null), undefined, 'absent stays absent (legacy records grow no provenance)');
  assert.strictEqual(sanitizeProvenance({ source: 'explorer', run: 'x'.repeat(500) }).run.length, 80, 'provenance strings are bounded');
  assert.strictEqual(isProvenance(minedRecord.provenance), true);
  assert.strictEqual(isProvenance({ source: 'explorer', corner: 42 }), false, 'a malformed provenance is not one');
  assert.strictEqual(isMined(minedRecord), true);
  assert.strictEqual(isMined(handRecord), false, 'a hand record is not mined');
  assert.strictEqual(isMined({ provenance: { source: 'dice' } }), false);
  lines.push('provenance boundary: explorer origin survives whole; unknown origins and malformed shapes dropped; absent stays absent; strings bounded');
}

// ── the label: plain words, aliases only, never a real name ─────────
{
  const label = provenanceLabel(minedRecord, { assetsById, palettesById });
  assert.strictEqual(label, 'radial cast · hydra palette · SPECIMEN corner', `label is corner + axes in plain words, got: ${label}`);
  assert.ok(!/reas|haeckel|davis|molnar/i.test(label), 'no real artist name reaches a product surface');
  assert.strictEqual(cornerWord('reas'), 'PROCESS FIELD');
  assert.strictEqual(cornerWord('wilderness'), 'wilderness', 'the wilderness names itself, plainly');
  assert.strictEqual(provenanceLabel(handRecord, { assetsById, palettesById }), '', 'a hand record has no provenance label');
  lines.push(`label: "${label}" — layout word from the cast's category, palette word lowercased, corner as its TE alias`);
}

// ── sanitizeFavorite carries provenance (the shelf door) ────────────
{
  const kept = sanitizeFavorite({ ...minedRecord, timestamp: '2026-10-14T00:00:00.000Z' });
  assert.deepStrictEqual(kept.provenance, minedRecord.provenance, 'the shelf record keeps its provenance');
  const hostile = sanitizeFavorite({ ...minedRecord, timestamp: 't', provenance: { source: 'forged', run: 'x' } });
  assert.ok(!('provenance' in hostile), 'a forged origin does not survive the shelf door');
  const legacy = sanitizeFavorite({ ...handRecord, timestamp: 't' });
  assert.ok(!('provenance' in legacy), 'a hand keep grows no provenance key');
  lines.push('shelf door: provenance carried for mined keeps, dropped when forged, never invented for hand keeps');
}

// ── the ledger door ──────────────────────────────────────────────────
{
  const row = ledgerRow({ ...minedRecord, timestamp: '2026-10-14T00:00:00.000Z', context: null });
  assert.deepStrictEqual(row.provenance, minedRecord.provenance, 'the ledger line keeps the provenance');
  assert.strictEqual(isLedgerRow(row), true, 'a provenance line is a valid ledger row');
  const handRow = ledgerRow({ ...handRecord, timestamp: '2026-10-14T00:00:00.000Z', context: null });
  assert.ok(!('provenance' in handRow), 'a hand line carries no provenance');
  assert.strictEqual(isLedgerRow({ ...row, provenance: { source: 'forged' } }), false, 'a forged provenance line is off-schema');
  lines.push('ledger door: keeps/passes lines carry provenance; the schema admits it optionally and rejects forgeries');
}

// ── slot accounting (K1: the gate predicts the STAGE landing) ───────
{
  assert.strictEqual(LOOK_SLOT_BUDGET, 16, 'the stage is 16 looks (spec §5)');
  assert.strictEqual(slotCostOf(handRecord), HAND_SLOT_COST);
  assert.strictEqual(slotCostOf(minedRecord), MINED_SLOT_COST, 'an unearned (mined) keep counts double');
  assert.strictEqual(lookSlotsUsed([handRecord, handRecord, minedRecord]), 4);
  assert.strictEqual(crownGate(Array(15).fill(handRecord), handRecord).ok, true, '15 hand + 1 hand = 16 takes the last stage slot');
  const toCollection = crownGate(Array(15).fill(handRecord), minedRecord);
  assert.strictEqual(toCollection.ok, false, '15 hand + 1 mined (2) = 17 does not take a stage slot');
  assert.ok(!('copy' in toCollection), 'there is no refusal copy anymore — a not-ok gate is a landing prediction, not a refusal');
  assert.strictEqual(crownGate(Array(14).fill(handRecord), minedRecord).ok, true, '14 + 2 = 16 fits the stage exactly');
  lines.push('slots: budget 16 · hand 1 · mined 2 · 15+mined predicts the collection (no copy, no refusal) · 14+mined fits exactly');
}

// ── run-folder parsing ───────────────────────────────────────────────
{
  const other = { ...handRecord, seed: 888 };
  const cand = (index, corner, anchor, record) => ({ index, corner, anchor, bakePath: 'particles', fingerprint: 'f', fontContingent: false, features: {}, stats: {}, record });
  const model = parseRunFolder({
    run: { runId: 'xpl-fixture-1', config: { runSeed: 1 }, report: { yield: {} } },
    finalists: [minedRecord, other],
    candidates: [cand(114, 'haeckel', 'radial', minedRecord), cand(7, null, null, other), cand(9, 'reas', null, handRecord)],
  });
  assert.strictEqual(model.runId, 'xpl-fixture-1');
  assert.strictEqual(model.cards.length, 2);
  assert.strictEqual(model.cards[0].sampleIndex, 114, 'the finalist joins its candidate by record identity');
  assert.strictEqual(model.cards[0].stillBase, 'finalist-01-sample-114', 'the still name is the run\'s own (finalist-NN-sample-<index>)');
  assert.strictEqual(model.cards[0].anchor, 'radial');
  assert.strictEqual(model.cards[1].sampleIndex, 7);
  assert.strictEqual(model.cards[1].stillBase, 'finalist-02-sample-7');
  const orphan = parseRunFolder({ run: { runId: 'r' }, finalists: [{ seed: 1, config: { layout: {}, palette: {}, assets: [] } }], candidates: [] });
  assert.strictEqual(orphan.cards[0].stillBase, null, 'a finalist that joins nothing renders still-less, never with a fabricated still');
  lines.push('run parsing: finalists join candidates by record (sample index + anchor ride along); orphans stay honest');
}

// ── crown end-to-end + RA6 + pass + collection landing (the store) ──
{
  wireEventBus(applyAction);
  const st0 = useStore.getState();
  const used0 = stageSlotsUsed(st0.keeps, st0.keepStage);
  const keepsLines0 = parseLedger(readLedgerText('keeps')).rows.length;

  // The component's crown act, verbatim in shape: gate over the STAGE's
  // records first (it predicts the landing), then the dice crown's own
  // door with the candidate's record + provenance — ALWAYS. A not-ok
  // gate no longer stops the write; the crown lands in the collection.
  const crownAttempt = (record) => {
    const s = useStore.getState();
    const gate = crownGate(stageRecords(s.keeps, s.keepStage), record);
    emit(Events.KEEP_ADD, {
      keep: {
        seed: record.seed, seedOffsets: { ...record.seedOffsets },
        timestamp: new Date().toISOString(), context: captureKeepContext(s.paletteId),
        config: record.config, provenance: record.provenance,
      },
    });
    return gate;
  };

  const gate = crownAttempt(minedRecord);
  assert.strictEqual(gate.ok, true, 'the fixture crown fits the stage');
  await tick(); await tick();
  let st = useStore.getState();
  assert.strictEqual(stageSlotsUsed(st.keeps, st.keepStage), used0 + MINED_SLOT_COST, 'the mined crown takes a stage slot at double cost');
  assert.ok(st.keepStage.includes(st.keeps[st.keeps.length - 1].id), 'the crowned keep is staged');
  const keep = st.keeps[st.keeps.length - 1];
  assert.deepStrictEqual(keep.provenance, minedRecord.provenance, 'the shelf record carries the provenance');
  const keepRows = parseLedger(readLedgerText('keeps')).rows;
  assert.strictEqual(keepRows.length, keepsLines0 + 1, 'the keeps ledger gained exactly one line');
  const line = keepRows[keepRows.length - 1];
  assert.deepStrictEqual(line.provenance, minedRecord.provenance, 'the ledger line carries the provenance (forever distinguishable)');
  lines.push('crown: mined radial finalist crowned through KEEP_ADD — shelf + keeps ledger both carry provenance');

  // RA6 — recall the mined keep; it must behave identically in kind to
  // a hand-built keep recalled the same way.
  const recallAndCheck = (rec, tag) => {
    useStore.getState().recallFavorite(rec);
    const s = useStore.getState();
    assert.strictEqual(s.paletteId, rec.config.palette.id, `${tag}: recall applies the palette`);
    assert.strictEqual(s.layoutParams.mode, rec.config.layout.mode, `${tag}: recall applies the layout mode`);
    assert.deepStrictEqual(
      Object.keys(s.enabledAssets).filter((k) => s.enabledAssets[k]).sort(),
      [...rec.config.assets].sort(),
      `${tag}: recall applies the cast`,
    );
  };
  recallAndCheck(keep, 'mined keep');
  assert.strictEqual(crownAttempt(handRecord).ok, true);
  await tick(); await tick();
  st = useStore.getState();
  const handKeep = st.keeps[st.keeps.length - 1];
  assert.ok(!('provenance' in handKeep), 'the hand crown carries no provenance');
  recallAndCheck(handKeep, 'hand keep');
  lines.push('RA6: the mined keep recalls identically in kind to a hand-built keep (palette, mode, cast all applied by the same recall)');

  // Persistence: what localStorage holds re-sanitizes with provenance.
  const stored = JSON.parse(lsData.get(KEEPS_KEY));
  const storedMined = stored.find((k) => k.seed === minedRecord.seed);
  assert.deepStrictEqual(sanitizeFavorite(storedMined).provenance, minedRecord.provenance, 'provenance survives the storage round-trip (RA6 persist/reload)');

  // Pass: a passes-ledger line WITH provenance; never a keep.
  const passRows0 = parseLedger(readLedgerText('passes')).rows.length;
  const keepsBefore = useStore.getState().keeps.length;
  const usedBefore = stageSlotsUsed(useStore.getState().keeps, useStore.getState().keepStage);
  applyAction({
    type: A.ADD_PASS,
    pass: {
      seed: minedRecord.seed, seedOffsets: { ...minedRecord.seedOffsets },
      timestamp: new Date().toISOString(), context: captureKeepContext(useStore.getState().paletteId),
      config: minedRecord.config, provenance: minedRecord.provenance,
    },
  });
  const passRows = parseLedger(readLedgerText('passes')).rows;
  assert.strictEqual(passRows.length, passRows0 + 1, 'the pass wrote exactly one passes line');
  assert.deepStrictEqual(passRows[passRows.length - 1].provenance, minedRecord.provenance, 'the pass line carries provenance (spec Q5: passes are recorded)');
  assert.strictEqual(useStore.getState().keeps.length, keepsBefore, 'a pass adds no keep');
  assert.strictEqual(stageSlotsUsed(useStore.getState().keeps, useStore.getState().keepStage), usedBefore, 'a pass is never counted as a keep');
  lines.push('pass: one passes-ledger line with provenance; keeps and stage usage untouched');

  // A full stage refuses NOTHING: the crown lands in the collection,
  // the line is spoken, the stage is untouched, nothing is evicted.
  st = useStore.getState();
  while (stageSlotsUsed(st.keeps, st.keepStage) < 15) {
    applyAction({ type: A.ADD_KEEP, keep: { ...handRecord, seed: 1000 + st.keeps.length, timestamp: new Date().toISOString() } });
    st = useStore.getState();
  }
  assert.strictEqual(stageSlotsUsed(st.keeps, st.keepStage), 15);
  const oldestId = st.keeps[0].id;
  const keepsCountAtCap = st.keeps.length;
  const ledgerAtCap = parseLedger(readLedgerText('keeps')).rows.length;
  const stageAtCap = [...st.keepStage];
  const landedGate = crownAttempt(minedRecord);
  assert.strictEqual(landedGate.ok, false, 'at 15 stage slots a mined crown (cost 2) does not take a stage slot');
  assert.ok(!('copy' in landedGate), 'the gate carries no refusal copy');
  await tick(); await tick();
  st = useStore.getState();
  assert.strictEqual(st.keeps.length, keepsCountAtCap + 1, 'the crown still landed — in the collection');
  const landedKeep = st.keeps[st.keeps.length - 1];
  assert.deepStrictEqual(landedKeep.provenance, minedRecord.provenance, 'the collection landing keeps its provenance');
  assert.ok(!st.keepStage.includes(landedKeep.id), 'the collection landing holds no stage slot');
  assert.deepStrictEqual(st.keepStage, stageAtCap, 'the stage is untouched by a collection landing');
  assert.strictEqual(stageSlotsUsed(st.keeps, st.keepStage), 15, 'stage usage unchanged by the landing');
  assert.strictEqual(st.keeps[0].id, oldestId, 'nothing was evicted — the oldest keep still stands');
  assert.strictEqual(st.shelfNotice, ON_SHELF_COPY, 'the landing speaks the line: on the shelf — swap it in');
  assert.strictEqual(parseLedger(readLedgerText('keeps')).rows.length, ledgerAtCap + 1, 'the landing wrote its keeps-ledger line like any crown');
  lines.push('collection landing: full stage → the crown lands in the collection with the line, stage untouched, no eviction, ledger written');
}

// ── the marker contract in the shipped components ────────────────────
{
  const tray = readFileSync(new URL('../panels/davis/CandidateTray.jsx', import.meta.url), 'utf8');
  assert.ok(tray.includes('data-source="explorer"'), 'candidate cards carry data-source="explorer"');
  assert.ok(tray.includes('cand-tag'), 'candidate cards carry the MINED tag element');
  assert.ok(tray.includes('Events.KEEP_ADD'), 'the crown rides the dice crown\'s door');
  assert.ok(tray.includes('A.ADD_PASS'), 'the pass rides the X door');
  assert.ok(tray.includes('crownGate'), 'the crown gate predicts the landing before the write');
  assert.ok(tray.includes('ON_SHELF_COPY'), 'the tray speaks the shelf line when a crown lands in the collection');
  assert.ok(!tray.includes('SHELF_FULL'), 'the refusal copy is gone from the tray');
  const hits = readFileSync(new URL('../components/FavoritesTray.jsx', import.meta.url), 'utf8');
  assert.ok(hits.includes('hit-mined') && hits.includes("provenance?.source === 'explorer'"), 'a crowned mined keep\'s hits pill carries the mined mark');
  const panelsCss = readFileSync(new URL('../styles/panels.css', import.meta.url), 'utf8');
  assert.ok(panelsCss.includes('.cand-card'), 'candidate cards have their own visual language (not the keeps\')');
  const uxCss = readFileSync(new URL('../styles/ux-polish.css', import.meta.url), 'utf8');
  assert.ok(uxCss.includes('.hit-mined'), 'the mined mark is styled');
  lines.push('marker contract: data-source + MINED tag on cards; the mined mark on crowned keeps\' pills; distinct card CSS');
}

console.log('candidateTray.selfcheck:');
for (const l of lines) console.log(`  ✓ ${l}`);
console.log('candidateTray.selfcheck: PASS');
