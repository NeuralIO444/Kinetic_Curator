// candidateTray.mjs — #1507 (Explorer E3): the candidate tray's pure logic.
//
// Two jobs, both pure (no store, no DOM, no clock):
//
// 1. LOOK-SLOT ACCOUNTING. The instrument keeps 16 Looks (spec §5: the
//    scarcity is the product). A hand-earned keep costs 1 slot; a mined
//    keep is unearned — the explorer found it, the performer didn't —
//    so it counts double. The gate REFUSES at the cap with the refusal
//    copy; it never evicts anything to make room (no silent auto-evict,
//    ever). The accounting reads the keeps shelf (kc:keeps:v1 records):
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

/** The refusal copy, verbatim wherever the gate speaks. */
export const SHELF_FULL_COPY = 'shelf full — 16 looks kept; free one first';

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Slot cost of one shelf record: mined (explorer provenance) counts double. */
export const slotCostOf = (rec) => (rec?.provenance?.source === 'explorer' ? MINED_SLOT_COST : HAND_SLOT_COST);

/** Slots the shelf already holds. */
export function lookSlotsUsed(keeps) {
  let n = 0;
  for (const k of keeps || []) n += slotCostOf(k);
  return n;
}

/**
 * The crown gate. ok when the candidate fits; refused (with the copy)
 * when it would pass the budget. Pure: the caller writes nothing on a
 * refusal, and this function can make nothing fit by dropping a keep.
 */
export function crownGate(keeps, candidate) {
  const used = lookSlotsUsed(keeps);
  const cost = slotCostOf(candidate);
  const ok = used + cost <= LOOK_SLOT_BUDGET;
  return { ok, used, cost, budget: LOOK_SLOT_BUDGET, ...(ok ? {} : { copy: SHELF_FULL_COPY }) };
}

// ── run-folder parsing ────────────────────────────────────────────────

const recordKey = (rec) => JSON.stringify(rec ?? null);
const fallbackKey = (rec) => [
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
      stillBase: sampleIndex != null
        ? `finalist-${String(pick + 1).padStart(2, '0')}-sample-${sampleIndex}`
        : null,
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
