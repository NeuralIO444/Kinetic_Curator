// #560 clear-confirm: the Davis CLEAR button follows #571's confirm pattern.
// #571's rule: the confirm states what's at stake. A count doesn't apply to
// a trail buffer — the irreversibility does.
export function confirmClearTrailMessage() {
  return 'Wipe the trail buffer? This cannot be undone.';
}

// The CLEAR click decision, factored pure so the selfcheck covers both paths
// without opening a dialog: confirm -> 'clear' (emit), cancel -> null (no-op).
export function decideClearTrail(confirmed) {
  return confirmed === true ? 'clear' : null;
}
