// node src/curator/shelfFill.selfcheck.mjs
//
// #1590 (Keeps K2) — the Kinetic fill suite. Spec:
// docs/research/keeps-machinery-spec-2026-10-14.md §3/§5/§10 + issue
// #1590 (incl. the S-amendments). Pins, at the deepest level that runs
// headlessly (the pure deal + the real store):
//   - the FULL WEIRD table deals 8 consensus + 8 rule-breaking slots,
//     inside the 16-unit stage budget, no keep dealt twice;
//   - a fill is seeded and replays bit-exactly from the same ledger
//     state; a different seed deals a different stage;
//   - the Lois gate: a stored 'pass' verdict is out from EVERY rule —
//     the table may not resurrect it — and Lois's choice ranks by
//     gate margins with taste ignored;
//   - suppression: recently staged (current stage + the recency
//     window's fills) and chronic swap-outs (≥3×) cannot take a
//     consensus slot; swap history never feeds the Queen — a chronic
//     swap-out still takes a neglected slot;
//   - the recency lift for neglected/wild when the pool runs dry is
//     recorded in the receipt, never silent;
//   - the performing Look is pinned and dealt around (S1);
//   - a mined keep costs 2 — the budget stops the deal, named;
//   - small collections degrade honestly: undealt rules are NAMED;
//     a fill that can deal nothing changes nothing;
//   - the taste-head door (§7): a scorer may ORDER consensus — and
//     nothing else; the rule-breaking slots deal by their own rules
//     whatever the scorer says;
//   - the store end: fillStage writes stage + stamps + the fill
//     ledger record, persists all three keys, and is ONE undo step.
import assert from 'node:assert';

const lsData = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsData.has(k) ? lsData.get(k) : null),
  setItem: (k, v) => lsData.set(k, String(v)),
  removeItem: (k) => lsData.delete(k),
};
globalThis.requestAnimationFrame = (fn) => { queueMicrotask(() => fn(performance.now())); return 1; };

const { dealFill, FILL_POOL_SIZE } = await import('./shelfFill.mjs');
const { DEFAULT_SHELF_PREFS } = await import('./shelfPrefs.mjs');
const { stageSlotsUsed, fillHistoryRecord, sanitizeHistoryRecord } = await import('./shelf.mjs');
const { ASSETS } = await import('../data/assets/index.js');
const { useStore } = await import('../state/store.js');
const { KEEPS_KEY, STAGE_KEY, SHELF_HISTORY_KEY } = await import('../state/slices/davisSlice.js');

const lines = [];
const assetsById = new Map(ASSETS.map((a) => [a.id, a]));
const radialIds = ASSETS.filter((a) => a.category === 'radial').slice(0, 3).map((a) => a.id);

let seq = 0;
const keep = (id, extra = {}) => ({
  id, seed: 100 + (seq++), timestamp: '2026-10-01T00:00:00.000Z', keptAt: 1000 + seq,
  config: {
    layout: { mode: 'grid', count: 30 + (seq % 40) * 11, density: 25 + (seq % 80), scale: 0.6 + (seq % 5) * 0.3 },
    palette: { id: 'bone' }, assets: radialIds.slice(0, 2),
  },
  ...extra,
});
const handList = (n, prefix = 'k') => Array.from({ length: n }, (_, i) => keep(`${prefix}${i}`));
const verdict = (v, sp = {}) => ({
  judge: 'lois-render', version: 1, verdict: v, checks: [],
  statsProvenance: {
    fingerprint: 'fix', inkCoverage: 0.5, inkCoverageWithFonts: 0.5, judgedInk: 'font-less',
    luminanceMean: 0.5, luminanceSpread: 0.6, ...sp,
  },
});
const PREFS = DEFAULT_SHELF_PREFS;

// ── FULL WEIRD deals the table, inside the budget ───────────────────
{
  const keeps = handList(60);
  const stageIds = keeps.slice(0, 16).map((k) => k.id);
  const r = dealFill({ keeps, stageIds, history: [], prefs: PREFS, seed: 42, assetsById });
  assert.ok(r.stageIds, 'a rich collection deals');
  assert.strictEqual(r.dealt.length, 16);
  assert.deepStrictEqual(r.receipt.dealtByRule, { consensus: 8, neglected: 3, wild: 2, lois: 2, contrarian: 1 },
    'FULL WEIRD: 8 consensus + 8 rule-breaking slots');
  assert.strictEqual(new Set(r.stageIds).size, 16, 'no keep dealt twice');
  assert.strictEqual(stageSlotsUsed(keeps, r.stageIds), 16, 'the stage budget is exactly spent, never exceeded');
  assert.deepStrictEqual(r.receipt.undealt, [], 'every rule dealt');
  assert.strictEqual(r.receipt.poolSize, FILL_POOL_SIZE, 'Davis drafted the full pool of 48');
  assert.strictEqual(r.receipt.anchor, 'live');
  assert.ok(r.receipt.notes.some((n) => n.startsWith('gate: no stored verdicts')), 'the empty gate is said out loud');
  // suppression at work even here: no consensus slot went to a keep
  // that was on the stage being replaced.
  const consensusIds = r.receipt.slots.filter((s) => s.rule === 'consensus').map((s) => s.keepId);
  assert.ok(consensusIds.every((id) => !stageIds.includes(id)), 'the outgoing stage cannot re-take consensus');
  lines.push('FULL WEIRD: 8+3+2+2+1 dealt, budget exact, pool 48, outgoing stage barred from consensus');
}

// ── seeded replay is bit-exact; another seed deals otherwise ────────
{
  const keeps = handList(60);
  const stageIds = keeps.slice(0, 16).map((k) => k.id);
  const a = dealFill({ keeps, stageIds, history: [], prefs: PREFS, seed: 7, assetsById });
  const b = dealFill({ keeps, stageIds, history: [], prefs: PREFS, seed: 7, assetsById });
  assert.deepStrictEqual(a.stageIds, b.stageIds, 'same seed + same ledger state → the same stage');
  assert.deepStrictEqual(a.receipt.slots, b.receipt.slots, '…slot for slot, rule for rule');
  const c = dealFill({ keeps, stageIds, history: [], prefs: PREFS, seed: 8, assetsById });
  assert.notDeepStrictEqual(a.stageIds, c.stageIds, 'a different seed deals a different stage');
  lines.push('replay: seed 7 twice → identical slots; seed 8 → a different deal');
}

// ── the gate: a stored pass is out from every rule ──────────────────
{
  const keeps = handList(30);
  // the most dealable keep by every other measure — oldest, never
  // staged, extreme layout — carries a failing verdict.
  const doomed = keeps[0];
  doomed.keptAt = 1;
  doomed.config.layout = { mode: 'grid', count: 600, density: 120, scale: 3 };
  doomed.gateVerdict = verdict('pass');
  const fat = keeps[10]; // margin ≈ 0.35
  fat.gateVerdict = verdict('keep');
  const thin = keeps[11]; // margin ≈ 0.05 (spread 0.17 − 0.12)
  thin.gateVerdict = verdict('keep', { inkCoverage: 0.1, luminanceSpread: 0.17 });
  const r = dealFill({ keeps, stageIds: [], history: [], prefs: PREFS, seed: 3, assetsById });
  assert.ok(!r.stageIds.includes(doomed.id), 'a gate failure never appears on the stage — from any rule');
  assert.deepStrictEqual(r.receipt.gate, { judged: 3, passedOver: 1 });
  const loisSlots = r.receipt.slots.filter((s) => s.rule === 'lois').map((s) => s.keepId);
  assert.deepStrictEqual(loisSlots, [fat.id, thin.id], 'Lois\'s choice ranks by gate margin, fattest first');
  lines.push('gate: stored pass excluded from all five rules; Lois\'s choice ordered by margin (0.35 before 0.05)');
}

// ── suppression: recency + chronic swap-outs bar consensus only ─────
{
  const keeps = handList(40);
  const byId = Object.fromEntries(keeps.map((k) => [k.id, k]));
  const stageIds = [keeps[0].id];
  const fillRec = (ids) => ({ kind: 'fill', seed: 1, table: 't', slots: ids.map((keepId) => ({ keepId, rule: 'consensus' })), at: 5 });
  const history = [
    fillRec([keeps[3].id]),           // 3 fills ago — outside window 2
    fillRec([keeps[2].id]),           // 2 fills ago — inside
    fillRec([keeps[1].id]),           // last fill — inside
    { kind: 'swap', outId: keeps[4].id, inId: keeps[9].id, at: 6 },
    { kind: 'swap', outId: keeps[4].id, inId: keeps[10].id, at: 7 },
    { kind: 'swap', outId: keeps[4].id, inId: keeps[11].id, at: 8 },
  ];
  for (const k of keeps) k.stagedCount = 5;
  byId[keeps[4].id].stagedCount = 0; // the chronic swap-out is also the most neglected
  byId[keeps[4].id].keptAt = 1;
  const scoreOf = (k) => ([keeps[1], keeps[2], keeps[3], keeps[4]].some((x) => x.id === k.id) ? 100 : 0);
  const r = dealFill({ keeps, stageIds, history, prefs: PREFS, seed: 11, scoreOf, assetsById });
  const ruleOf = (id) => r.receipt.slots.find((s) => s.keepId === id)?.rule;
  assert.notStrictEqual(ruleOf(keeps[1].id), 'consensus', 'staged in the last fill → no consensus');
  assert.notStrictEqual(ruleOf(keeps[2].id), 'consensus', 'staged 2 fills ago (window 2) → no consensus');
  assert.strictEqual(ruleOf(keeps[3].id), 'consensus', 'staged 3 fills ago → the window has passed, consensus may take it');
  assert.notStrictEqual(ruleOf(keeps[4].id), 'consensus', 'swapped out 3× → no consensus, however the scorer ranks it');
  assert.strictEqual(ruleOf(keeps[4].id), 'neglected', '…but neglect still deals it — swap history feeds suppression, never the Queen');
  assert.ok(r.receipt.notes.some((n) => n.includes('chronic swap-out')), 'the chronic suppression is named in the receipt');
  lines.push('suppression: window-2 recency + 3× swap-out barred from consensus; the swap-out still dealt by neglect');
}

// ── the dry-pool recency lift is recorded ────────────────────────────
{
  const keeps = handList(10);
  const stageIds = keeps.slice(0, 8).map((k) => k.id); // nearly everything is "recent"
  const r = dealFill({ keeps, stageIds, history: [], prefs: PREFS, seed: 5, assetsById });
  assert.ok(r.stageIds.length >= 2, 'the fill still deals from a nearly-all-recent collection');
  assert.ok(r.receipt.notes.some((n) => n.includes('recency lifted')), 'the lift is named, not silent');
  lines.push('dry pool: recency lifts for neglected/wild and the receipt says so');
}

// ── the performing Look is pinned and dealt around ───────────────────
{
  const keeps = handList(40);
  const stageIds = keeps.slice(0, 16).map((k) => k.id);
  const pinned = stageIds[5];
  const r = dealFill({ keeps, stageIds, history: [], prefs: PREFS, seed: 9, performingKeepId: pinned, assetsById });
  assert.strictEqual(r.stageIds[5], pinned, 'the pinned keep holds its slot');
  assert.strictEqual(r.receipt.slots[5].rule, 'pinned');
  assert.strictEqual(r.dealt.length, 15, 'the table deals the other fifteen');
  assert.ok(stageSlotsUsed(keeps, r.stageIds) <= 16, 'the pin\'s cost counts toward the budget');
  lines.push('pin (S1): the performing keep keeps slot 6; 15 dealt around it');
}

// ── mined keeps cost 2 — the budget stops the deal, named ────────────
{
  const mined = (id) => keep(id, {
    provenance: { source: 'explorer', run: 'xpl-1', corner: 'haeckel', axes: { layout: 'radial', palette: 'hydra', castSize: 3 } },
  });
  const keeps = Array.from({ length: 30 }, (_, i) => mined(`m${i}`));
  const r = dealFill({ keeps, stageIds: [], history: [], prefs: PREFS, seed: 2, assetsById });
  assert.strictEqual(r.dealt.length, 8, 'eight mined keeps spend the whole 16-unit budget');
  assert.strictEqual(stageSlotsUsed(keeps, r.stageIds), 16);
  assert.ok(r.receipt.notes.some((n) => n.includes('budget ran out')), 'the short deal is explained');
  lines.push('budget: 30 mined keeps → 8 dealt (cost 2 each), the budget stop named');
}

// ── small collections degrade honestly ───────────────────────────────
{
  const keeps = handList(5);
  const r = dealFill({ keeps, stageIds: [], history: [], prefs: PREFS, seed: 4, assetsById });
  assert.strictEqual(r.dealt.length, 5, 'the whole small collection is dealt');
  assert.ok(r.receipt.undealt.includes('neglected') && r.receipt.undealt.includes('contrarian'),
    'rules that dealt nothing are NAMED, never quietly backfilled');
  const empty = dealFill({ keeps: [], stageIds: [], history: [], prefs: PREFS, seed: 4 });
  assert.strictEqual(empty.stageIds, null, 'an empty collection changes nothing');
  const doomed = handList(6).map((k) => ({ ...k, gateVerdict: verdict('pass') }));
  const gated = dealFill({ keeps: doomed, stageIds: ['x'], history: [], prefs: PREFS, seed: 4, assetsById });
  assert.strictEqual(gated.stageIds, null, 'an all-failed collection changes nothing — the stage is never emptied by a fill');
  assert.strictEqual(gated.receipt.gate.passedOver, 6);
  lines.push('degradation: 5 keeps → 5 dealt + undealt rules named; empty/all-failed → no change, receipt explains');
}

// ── the taste-head door: scores order consensus, nothing else ───────
{
  const keeps = handList(40);
  const target = keeps[25];
  const scoreOf = (k) => (k.id === target.id ? 1000 : 0);
  const r = dealFill({ keeps, stageIds: [], history: [], prefs: PREFS, seed: 6, scoreOf, assetsById });
  assert.strictEqual(r.receipt.slots.find((s) => s.keepId === target.id)?.rule, 'consensus',
    'a usable head\'s top score takes a consensus slot — it ORDERS');
  assert.deepStrictEqual(r.receipt.dealtByRule, { consensus: 8, neglected: 3, wild: 2, lois: 2, contrarian: 1 },
    '…and the table still deals all 8 rule-breaking slots by their own rules');
  // and the head cannot buy a rule-breaking slot: score the
  // margin-richest keep dead last; Lois takes him anyway.
  const keeps2 = handList(40);
  const judged = keeps2[30];
  judged.gateVerdict = verdict('keep');
  const scoreDown = (k) => (k.id === judged.id ? -1000 : 0);
  const r2 = dealFill({ keeps: keeps2, stageIds: [], history: [], prefs: PREFS, seed: 6, scoreOf: scoreDown, assetsById });
  assert.strictEqual(r2.receipt.slots.find((s) => s.keepId === judged.id)?.rule, 'lois',
    'Lois\'s choice ignores the score entirely — taste never gates or deals');
  lines.push('§7 door: the head orders consensus (top score dealt); it cannot touch Lois\'s choice or the table\'s shape');
}

// ── a preferences table edit changes the deal, measurably ───────────
{
  const keeps = handList(60);
  const allConsensus = { ...PREFS, table: { consensus: 16, neglected: 0, wild: 0, lois: 0, contrarian: 0 } };
  const r = dealFill({ keeps, stageIds: [], history: [], prefs: allConsensus, seed: 42, assetsById });
  assert.ok(r.receipt.slots.every((s) => s.rule === 'consensus'), 'a consensus-16 table deals 16 consensus slots');
  const none = { ...PREFS, table: { consensus: 0, neglected: 0, wild: 0, lois: 0, contrarian: 0 } };
  const r0 = dealFill({ keeps, stageIds: [], history: [], prefs: none, seed: 42, assetsById });
  assert.strictEqual(r0.stageIds, null, 'an all-zero table deals nothing and changes nothing');
  lines.push('table edits: consensus-16 → all consensus; all-zero → no deal, no change');
}

// ── the fill ledger record round-trips its sanitizer ─────────────────
{
  const rec = fillHistoryRecord({
    seed: 42, table: 'preferences.json · FULL WEIRD',
    slots: [{ keepId: 'k1', rule: 'consensus' }, { keepId: 'k2', rule: 'pinned' }],
    undealt: ['wild'], notes: ['gate: fine'], at: 123,
  });
  assert.deepStrictEqual(sanitizeHistoryRecord(rec), rec, 'a fill record survives its own sanitizer');
  const torn = { ...rec, slots: [{ keepId: 'k1', rule: 'rigged' }] };
  assert.strictEqual(sanitizeHistoryRecord(torn), null, 'a slot naming an unknown rule drops the record whole');
  lines.push('ledger: fill records (seed · table · per-slot rule · notes) sanitize round-trip; torn records drop whole');
}

// ── the store end: one action, one undo step, all three keys ────────
{
  lsData.clear();
  const keeps = handList(40);
  const stageIds = keeps.slice(0, 16).map((k) => k.id);
  useStore.setState({
    keeps, keepStage: stageIds, shelfHistory: [], performingKeepId: null,
    shelfPrefs: null, shelfPrefsLines: [], shelfPrefsSource: null, historyUndoStack: [], historyRedoStack: [],
  });
  useStore.getState().fillStage();
  const after = useStore.getState();
  assert.notDeepStrictEqual(after.keepStage, stageIds, 'the stage was re-dealt');
  assert.strictEqual(after.keepStage.length, 16);
  const rec = after.shelfHistory.at(-1);
  assert.strictEqual(rec.kind, 'fill', 'the fill is a ledger record');
  assert.strictEqual(rec.slots.length, 16, '…with the rule that dealt each slot');
  assert.ok(after.keepStage.every((id) => JSON.parse(lsData.get(STAGE_KEY)).includes(id)), 'the stage persisted');
  assert.ok(lsData.has(KEEPS_KEY) && lsData.has(SHELF_HISTORY_KEY), 'keeps + history persisted');
  const dealtKeep = after.keeps.find((k) => k.id === after.keepStage[0]);
  assert.strictEqual(dealtKeep.stagedCount, 1, 'a dealt keep is stamped staged');
  assert.ok(Number.isFinite(dealtKeep.lastStagedAt));
  const undoDepth = after.historyUndoStack.length;
  assert.strictEqual(undoDepth, 1, 'the fill is exactly ONE undo step (S7)');
  useStore.getState().undo();
  const undone = useStore.getState();
  assert.deepStrictEqual(undone.keepStage, stageIds, 'undo restores the pre-fill stage');
  assert.strictEqual(undone.keeps.find((k) => k.id === dealtKeep.id).stagedCount ?? 0, 0, '…and the stamps');
  assert.strictEqual(undone.shelfHistory.length, 0, '…and the ledger');
  useStore.getState().redo();
  assert.deepStrictEqual(useStore.getState().keepStage, after.keepStage, 'redo re-deals the same stage');
  lines.push('store: fillStage deals + stamps + ledgers + persists (3 keys); one undo step restores all of it; redo replays');
}

console.log('shelfFill.selfcheck:');
for (const l of lines) console.log(`  ✓ ${l}`);
console.log('shelfFill.selfcheck: PASS');
