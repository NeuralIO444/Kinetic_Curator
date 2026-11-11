// backendIndicator.mjs — #2078: the footer backend indicator, as pure derivation.
//
// The indicator is a rendering of the mind's own published status — the
// `mind:status` payload startMind stamps from the backend chain's info()
// (the same selection logic that actually picks who answers; there is no
// second flag anywhere in this surface). This module turns one status
// payload into the footer's letter + hover text, and decides where a
// click lands. It holds no state and reads nothing.
//
// Glyphs and tooltips are Matt's rulings (2026-11-10, on the issue):
// simple letters, not emoji — O (Ollama answering) · A (Apple Intelligence
// answering) · R (rules) — in the footer's existing micro type, TE per
// KC-1 DS (a discrete signal: a glyph and a label, not a shimmer). The
// tooltip always names the state, the detail, and what the click does;
// when the DEV panel is unavailable (release build, Dev mode off) the
// click routes to the Settings Dev mode toggle instead, and the tooltip
// names that destination. A missing model or tier segment is omitted,
// never rendered as a placeholder — the tooltip claims only what the
// status actually carries.

/** The backend the indicator names for a status payload: anything that is not a model backend is the rules. */
export function indicatorBackend(status) {
  const b = status && typeof status.backend === 'string' ? status.backend : null;
  return b === 'ollama' || b === 'apple' ? b : 'rules';
}

const GLYPHS = { ollama: 'O', apple: 'A', rules: 'R' };

/**
 * @param status         the last mind:status payload ({ available, backend, model?, tier? }) or null
 * @param panelAvailable whether the DEV panel is reachable right now (the #2077 runtime gate)
 * @returns {{ backend: 'ollama'|'apple'|'rules', glyph: 'O'|'A'|'R', title: string }}
 */
export function indicatorFor(status, panelAvailable) {
  const backend = indicatorBackend(status);
  let detail;
  if (backend === 'ollama') {
    const parts = ['Ollama'];
    if (status && typeof status.model === 'string' && status.model) parts.push(status.model);
    if (status && typeof status.tier === 'string' && status.tier) parts.push(`tier ${status.tier}`);
    detail = parts.join(' · ');
  } else if (backend === 'apple') {
    detail = 'Apple Intelligence';
  } else {
    detail = 'Rules — no model linked';
  }
  const destination = panelAvailable ? 'the MEGAMIND tab' : 'the Settings Dev mode toggle';
  return { backend, glyph: GLYPHS[backend], title: `${detail} — click to open ${destination}` };
}

/** Where a click lands: the MEGAMIND tab when the panel is reachable, else the Settings Dev mode toggle. Never nowhere. */
export function backendRoute(panelAvailable) {
  return panelAvailable ? 'megamind' : 'settings';
}
