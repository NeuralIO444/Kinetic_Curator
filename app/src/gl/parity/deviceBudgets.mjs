// deviceBudgets.mjs — #1639: judge a cost dataset against the frame budgets.
//
// The budgets themselves live in src/data/quality.js (FRAME_BUDGETS) beside the other device
// budgets (REGION_BUDGETS), where the governor's tier work reads them. This module is the pure
// judgement the budget report (scripts/costBudgetReport.mjs) prints: one recipe label against one
// class's cap. Pure functions over a costBench dataset — no measuring happens here.
//
// Verdicts, per class:
//   fits      label < cap × nearBustRatio        — fits with headroom
//   near-bust cap × nearBustRatio ≤ label ≤ cap  — fits, nothing spare for the weather to come
//   bust      label > cap                        — over the class's render allowance
//   unmeasured the harness could not measure the recipe in its environment (a failed row is data:
//              it is named with its error, never silently dropped and never called a cost bust)
//
// A classification is only as device-true as the dataset's environment: the report stamps it, and
// a SwiftShader dataset's verdicts describe the software-GL environment — its portable content is
// the ordering and the spread over the base recipe, which this module also computes.
import { FRAME_BUDGETS } from '../../data/quality.js';

export const VERDICTS = Object.freeze(['fits', 'near-bust', 'bust', 'unmeasured']);

/** One label against one budget. labelMs null/non-finite (a failed harness row) is 'unmeasured'. */
export function classifyLabel(labelMs, budget) {
  if (typeof labelMs !== 'number' || !Number.isFinite(labelMs)) return { verdict: 'unmeasured', multiple: null };
  const multiple = labelMs / budget.renderCapMs;
  if (labelMs > budget.renderCapMs) return { verdict: 'bust', multiple };
  if (labelMs >= budget.renderCapMs * budget.nearBustRatio) return { verdict: 'near-bust', multiple };
  return { verdict: 'fits', multiple };
}

/**
 * Classify every row of a costBench dataset against both budgets.
 * Returns rows sorted by label descending (heaviest first; unmeasured last), each annotated:
 * { id, labelMs, overBase (label ÷ the base recipe's label, or null), failed (row error or null),
 *   desktop: {verdict, multiple}, ipad: {verdict, multiple} }, plus the dataset's environment
 * stamp passed through untouched — the caller prints it, the verdicts mean nothing without it.
 */
export function classifyDataset(ds, baseId = 'grid-base') {
  const rows = Array.isArray(ds && ds.rows) ? ds.rows : [];
  const base = rows.find((r) => r.id === baseId);
  const baseMs = base && typeof base.labelMs === 'number' && Number.isFinite(base.labelMs) ? base.labelMs : null;
  const out = rows.map((r) => ({
    id: r.id,
    labelMs: typeof r.labelMs === 'number' ? r.labelMs : null,
    overBase: baseMs && typeof r.labelMs === 'number' && Number.isFinite(r.labelMs) ? r.labelMs / baseMs : null,
    failed: r.error ? String(r.error) : null,
    desktop: classifyLabel(r.labelMs, FRAME_BUDGETS.desktop),
    ipad: classifyLabel(r.labelMs, FRAME_BUDGETS.ipad),
  }));
  out.sort((a, b) => (b.labelMs ?? -1) - (a.labelMs ?? -1));
  return {
    environment: (ds && ds.environment) || null,
    method: (ds && ds.method) || null,
    baseId,
    baseMs,
    rows: out,
    busts: {
      desktop: out.filter((r) => r.desktop.verdict === 'bust').map((r) => r.id),
      ipad: out.filter((r) => r.ipad.verdict === 'bust').map((r) => r.id),
    },
    nearBusts: {
      desktop: out.filter((r) => r.desktop.verdict === 'near-bust').map((r) => r.id),
      ipad: out.filter((r) => r.ipad.verdict === 'near-bust').map((r) => r.id),
    },
    unmeasured: out.filter((r) => r.desktop.verdict === 'unmeasured').map((r) => r.id),
  };
}
