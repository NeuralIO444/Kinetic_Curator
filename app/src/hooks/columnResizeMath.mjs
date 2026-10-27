// columnResizeMath.mjs — useColumnResize's pure core (audit standards,
// hooks tests slice 1, #1686). Factored out of the hook verbatim.

/**
 * One divider drag: shift `deltaFraction` between the fractions at
 * `index` (gains) and `index + 1` (loses). When a side would fall below
 * `minFraction`, its deficit is pushed back onto the other side. If
 * BOTH sides then still can't hold the minimum, the resize is rejected
 * (null) — the hook leaves the layout untouched rather than clamping
 * into an illegal state. Never mutates the input; accepted results
 * preserve the fractions' total.
 */
export function resizeFractions(startFractions, index, deltaFraction, minFraction) {
  const next = [...startFractions];
  const left = index;
  const right = index + 1;

  next[left] = startFractions[left] + deltaFraction;
  next[right] = startFractions[right] - deltaFraction;

  // Enforce minimums
  if (next[left] < minFraction) {
    next[right] += next[left] - minFraction;
    next[left] = minFraction;
  }
  if (next[right] < minFraction) {
    next[left] += next[right] - minFraction;
    next[right] = minFraction;
  }

  // Final clamp
  if (next[left] >= minFraction && next[right] >= minFraction) {
    return next;
  }
  return null;
}
