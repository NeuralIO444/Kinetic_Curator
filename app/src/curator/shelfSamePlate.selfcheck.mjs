// node src/curator/shelfSamePlate.selfcheck.mjs
//
// #2499 (Stress 2026-11-24 A22) — the fill receipt's slots 4, 5, 6 and
// the KEEPS SHELF list all showed "the same keep three times":
// stratified · persona-davis · seed 4140623821. Verdict, proven below
// through the real store path: the store is faithful — three SEPARATE
// keep acts on one plate bank three records, each with its own id
// (a keep's identity everywhere in the shelf's law: stage membership,
// swaps, export, the ledger). The crown append is unconditional by
// design (K1: a crown is never refused, never evicts, nothing is
// silently lost), and no door banks more than one record per act.
// The defect is presentation: neither surface showed the one field
// that tells same-plate keeps apart — the kept moment. The list
// demoted it to a calendar date; the receipt omitted it entirely.
//
// This pin holds the whole verdict:
//   - three acts on one plate → three records, three ids, three
//     kept instants (the identity law — merging them would destroy
//     records of separate acts);
//   - a fill deals each keep id at most once, so the receipt's three
//     same-label slots are three distinct keeps, never one keep
//     rendered thrice;
//   - BOTH surfaces now render the three keeps pairwise
//     distinguishably: the list row (identity + caption) and the
//     receipt cell (label + kept moment) differ for each act;
//   - a keep with no stamp still reads 'kept (legacy)' — absent
//     stays absent.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const lsData = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsData.has(k) ? lsData.get(k) : null),
  setItem: (k, v) => lsData.set(k, String(v)),
  removeItem: (k) => lsData.delete(k),
};
globalThis.requestAnimationFrame = (fn) => {
  queueMicrotask(() => fn(performance.now()));
  return 1;
};

const { useStore } = await import('../state/store.js');
const { captureFavorite } = await import('../state/slices/davisSlice.js');
const { shelfRow, shelfRows } = await import('./shelf.mjs');
const shelfView = await import('../panels/shelfView.mjs');
const { rowIdentity, rowMeta } = shelfView;
const { ASSETS } = await import('../data/assets/index.js');
const { PALETTES } = await import('../data/palettes.js');

const lines = [];
const assetsById = new Map(ASSETS.map((a) => [a.id, a]));
const palettesById = new Map(PALETTES.map((p) => [p.id, p]));
const st = () => useStore.getState();

const FILED_LABEL = 'stratified · persona-davis · seed 4140623821';
// The session's afternoon, three acts five seconds apart — the
// fastest a hand repeats a keep, and the hardest case for the
// distinguishing field.
const ACT0 = Date.UTC(2026, 10, 24, 18, 14, 3);

// A plate capture the way the J key builds it (captureFavorite over
// the live state), with the act's instant pinned for determinism.
function capturePlate(seed, mode, paletteId, atMs) {
  const s = st();
  const rec = captureFavorite(
    { ...s, seed, layoutParams: { ...s.layoutParams, mode }, enabledAssets: s.enabled || {} },
    paletteId,
  );
  return { ...rec, keptAt: atMs, timestamp: new Date(atMs).toISOString() };
}

// Two filler keeps, then the filed plate kept three times.
st().addKeep(capturePlate(1000, 'grid', 'garnet', ACT0 - 120000));
st().addKeep(capturePlate(1077, 'grid', 'garnet', ACT0 - 60000));
for (let i = 0; i < 3; i++) st().addKeep(capturePlate(4140623821, 'stratified', 'persona-davis', ACT0 + i * 5000));

// ── the store law: three acts, three records ──────────────────────
{
  const plate = st().keeps.filter((k) => k.seed === 4140623821);
  assert.equal(
    plate.length,
    3,
    `the store holds ${plate.length} records for the filed plate — three acts must bank three records`,
  );
  assert.equal(
    new Set(plate.map((k) => k.id)).size,
    3,
    `distinct keep ids among the three records: ${new Set(plate.map((k) => k.id)).size} (ids: ${plate.map((k) => k.id).join(', ')})`,
  );
  assert.equal(
    new Set(plate.map((k) => k.keptAt)).size,
    3,
    `distinct kept instants among the three records: ${new Set(plate.map((k) => k.keptAt)).size} (${plate.map((k) => k.keptAt).join(', ')})`,
  );
  lines.push('store: three keep acts on one plate bank three records — three ids, three kept instants');
}

// ── the deal law: one slot per keep id ────────────────────────────
st().fillStage();
const lastFill = [...st().shelfHistory].reverse().find((r) => r && r.kind === 'fill');
assert.ok(lastFill, 'the fill wrote its ledger record');
const byId = new Map(st().keeps.map((k) => [k.id, k]));
const labelOf = (id) => shelfRow(byId.get(id), st().keepStage, { assetsById, palettesById }).label;
const filedSlots = lastFill.slots.filter((s) => labelOf(s.keepId) === FILED_LABEL);
{
  const slotIds = lastFill.slots.map((s) => s.keepId);
  assert.equal(
    new Set(slotIds).size,
    slotIds.length,
    `receipt slots carry ${slotIds.length} entries, ${new Set(slotIds).size} distinct keep ids — a keep is dealt at most once`,
  );
  assert.equal(
    filedSlots.length,
    3,
    `receipt slots showing the filed label: ${filedSlots.length} (the filed state, reproduced)`,
  );
  assert.equal(
    new Set(filedSlots.map((s) => s.keepId)).size,
    3,
    `distinct keep ids behind the three same-label slots: ${new Set(filedSlots.map((s) => s.keepId)).size}`,
  );
  lines.push('deal: the receipt\u2019s three same-label slots are three distinct keeps — no id is dealt twice');
}

// ── the list surface: three rows, three readings ──────────────────
// (Asserted on rowIdentity/rowMeta alone — the exact strings the
// shelf prints — so on the pre-fix tree this group fails with the
// filed symptom itself: three rows, one reading.)
{
  const rows = shelfRows(st().keeps, st().keepStage, { assetsById, palettesById }).filter(
    (r) => r.keep?.seed === 4140623821,
  );
  assert.equal(rows.length, 3, `collection rows for the filed plate: ${rows.length}`);
  const rendered = rows.map((r) => `${rowIdentity(r)} | ${rowMeta(r).join(' · ')}`);
  assert.equal(
    new Set(rendered).size,
    3,
    `distinct rendered rows for the three same-plate keeps: ${new Set(rendered).size} of 3 — rows: ${rendered.join(' | ')}`,
  );
  lines.push('list: same-plate rows render pairwise distinct — the caption carries each act\u2019s time of day');
}

// ── the receipt surface: the kept moment tells them apart ─────────
{
  assert.equal(
    typeof shelfView.keptCaption,
    'function',
    'the kept-moment caption exists (the receipt and the list share it)',
  );
  const cells = filedSlots.map((s) => {
    const k = byId.get(s.keepId);
    return `${labelOf(s.keepId)} · ${shelfView.keptCaption(k.keptAt)}`;
  });
  assert.equal(
    new Set(cells).size,
    3,
    `distinct receipt cells for the three same-plate slots: ${new Set(cells).size} of 3 — cells: ${cells.join(' | ')}`,
  );
  const rows = shelfRows(st().keeps, st().keepStage, { assetsById, palettesById }).filter(
    (r) => r.keep?.seed === 4140623821,
  );
  for (const r of rows) {
    assert.ok(
      rowMeta(r).includes(shelfView.keptCaption(r.keep.keptAt)),
      `row ${r.id} carries its own kept moment (${shelfView.keptCaption(r.keep.keptAt)})`,
    );
  }
  const panel = readFileSync(new URL('../panels/ShelfDevPanel.jsx', import.meta.url), 'utf8');
  assert.ok(
    panel.includes("keptCaption } from './shelfView.mjs'") && panel.includes('{keptOf(s.keepId)}'),
    'the DEV > SHELF receipt cell renders the kept moment beside the label',
  );
  lines.push('receipt: each same-label slot also names its keep\u2019s kept moment — three cells, three readings');
}

// ── absent stays absent ───────────────────────────────────────────
{
  assert.equal(shelfView.keptCaption(null), 'kept (legacy)');
  assert.equal(shelfView.keptCaption(undefined), 'kept (legacy)');
  const legacy = rowMeta({ label: 'x', keep: { seed: 1 }, families: [], keptAt: null, stagedCount: null });
  assert.ok(legacy.includes('kept (legacy)'), 'a stamp-less keep still reads kept (legacy), never an invented time');
  lines.push('legacy: a keep with no stamp still reads \u2018kept (legacy)\u2019 — no time is invented for it');
}

console.log('shelfSamePlate.selfcheck:');
for (const l of lines) console.log(`  ✓ ${l}`);
console.log('shelfSamePlate.selfcheck: PASS');
