// candidateTray.mjs — #1507 (Explorer E3): the candidate tray's pure logic.
//
// Two jobs, both pure (no store, no DOM, no clock):
//
// 1. LOOK-SLOT ACCOUNTING. The instrument keeps 16 Looks (spec §5: the
//    scarcity is the product). A hand-earned keep costs 1 slot; a mined
//    keep is unearned — the explorer found it, the performer didn't —
//    so it counts double. #1589 (Keeps K1) reframed the gate: the 16
//    slots are now the STAGE's budget (curator/shelf.mjs owns tiers),
//    and the gate no longer refuses anything — it predicts whether a
//    crown takes a stage slot or lands in the collection with the line
//    ("on the shelf — swap it in"). The E3 refusal copy is dead for
//    every crown kind (Matt, 2026-10-14); nothing is ever evicted to
//    make room. The accounting reads keep records (kc:keeps:v1):
//    favorites are setlist copies of keeps, not slots of their own.
//
// 2. RUN-FOLDER PARSING. The miner (#1506) writes run.json +
//    finalists.json + candidates.json + stills/. This turns those
//    artifacts into the tray's view model — finalist cards with their
//    provenance, and the run's yield by corner (spec §6). Artifact data
//    only: a tally of records the run itself wrote, never a measurement.
import { sanitizeProvenance } from './provenance.mjs';

export const LOOK_SLOT_BUDGET = 16;
export const HAND_SLOT_COST = 1;
export const MINED_SLOT_COST = 2;

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Slot cost of one shelf record: mined (explorer provenance) counts double. */
export const slotCostOf = (rec) => (rec?.provenance?.source === 'explorer' ? MINED_SLOT_COST : HAND_SLOT_COST);

/** Slots a list of keep records holds (the stage's records, in K1 terms). */
export function lookSlotsUsed(keeps) {
  let n = 0;
  for (const k of keeps || []) n += slotCostOf(k);
  return n;
}

/**
 * The crown gate, K1 reading: pass the STAGE's records. ok when the
 * candidate takes a stage slot; not-ok when it lands in the collection
 * instead (the crown still lands — curator/shelf.mjs routeCrown is the
 * store's routing; this is the same arithmetic as a pure predictor, so
 * the tray's line and the store's routing can never disagree). There is
 * no refusal and no copy: nothing about a not-ok answer stops a write.
 */
export function crownGate(stageKeeps, candidate) {
  const used = lookSlotsUsed(stageKeeps);
  const cost = slotCostOf(candidate);
  const ok = used + cost <= LOOK_SLOT_BUDGET;
  return { ok, used, cost, budget: LOOK_SLOT_BUDGET };
}

// ── run-folder parsing ────────────────────────────────────────────────

const recordKey = (rec) => JSON.stringify(rec ?? null);
const fallbackKey = (rec) =>
  [
    rec?.seed ?? '',
    rec?.config?.palette?.id ?? '',
    rec?.config?.layout?.mode ?? '',
    ...(Array.isArray(rec?.config?.assets) ? rec.config.assets : []),
  ].join('|');

/**
 * Parse the miner's three artifacts into the tray model.
 *   run:        run.json's object ({ runId, config, report })
 *   finalists:  finalists.json's array of keep-shaped records
 *   candidates: candidates.json's array ({ index, corner, anchor, record })
 * Finalists join to their candidate by record identity (the run wrote
 * the same record into both files), falling back to seed+palette+mode+
 * cast — the join buys the sample index (its still's filename) and the
 * anchor word; a finalist that joins nothing still renders, still-less
 * lines are the component's honest state, never a fabricated still.
 */
export function parseRunFolder({ run, finalists, candidates } = {}) {
  const runId = typeof run?.runId === 'string' ? run.runId : null;
  const candByRecord = new Map();
  const candByFallback = new Map();
  for (const c of candidates || []) {
    if (!isPlainObject(c?.record)) continue;
    candByRecord.set(recordKey(c.record), c);
    const fk = fallbackKey(c.record);
    if (!candByFallback.has(fk)) candByFallback.set(fk, c);
  }
  const cards = (finalists || []).map((rec, pick) => {
    const cand = candByRecord.get(recordKey(rec)) ?? candByFallback.get(fallbackKey(rec)) ?? null;
    const provenance = sanitizeProvenance(rec?.provenance) ?? null;
    const sampleIndex = Number.isInteger(cand?.index) ? cand.index : null;
    return {
      key: `${runId ?? 'run'}:${pick}:${rec?.seed ?? '?'}`,
      pick,
      sampleIndex,
      anchor: typeof cand?.anchor === 'string' && cand.anchor ? cand.anchor : null,
      record: rec,
      provenance,
      // The still the run baked for this finalist (component resolves the
      // actual file; a missing file renders the no-still state).
      stillBase: sampleIndex != null ? `finalist-${String(pick + 1).padStart(2, '0')}-sample-${sampleIndex}` : null,
    };
  });
  // Yield by corner is the readout's tally of these same artifacts —
  // censusReadout.yieldByCornerView owns it; the tray model stays cards.
  return {
    runId,
    config: isPlainObject(run?.config) ? run.config : null,
    report: isPlainObject(run?.report) ? run.report : null,
    cards,
  };
}
