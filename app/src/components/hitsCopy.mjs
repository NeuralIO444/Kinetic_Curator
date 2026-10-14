/**
 * CLEAR confirm copy for the HITS row. Pure module (no JSX) so the copy contract is unit-testable.
 * It states the count, like the snapshot gallery's: a confirm that does not say what is at stake is a speed bump,
 * not a guard. It also says what stays: the keeps ledger is the artist's own finds and is not touched.
 */
export function confirmClearHitsMessage(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return `Clear ${n} hit${n === 1 ? '' : 's'} from the setlist? Your keeps stay.`;
}
