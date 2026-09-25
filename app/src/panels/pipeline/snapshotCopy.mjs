/**
 * #571 — CLEAR confirm copy. Pure module (no JSX) so the copy contract is
 * unit-testable: node cannot parse component files.
 *
 * The confirm states the count: "Wipe 24 kept renders?" A confirm that
 * doesn't say what's at stake is a speed bump, not a guard — the harm
 * scales with the number, so the dialog does too.
 */
export function confirmClearSnapshotsMessage(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return `Wipe ${n} kept render${n === 1 ? '' : 's'}?`;
}
