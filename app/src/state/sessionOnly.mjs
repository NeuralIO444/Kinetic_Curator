// sessionOnly.mjs — #1641: the one shared "not saved" signal for the
// small tuning surfaces. Six persist helpers (canvas presets, the
// biology policy, the taste, the experimental switch, user voices,
// the user palette library) each applied their value in memory,
// attempted the write, and swallowed the refusal — the tuning held
// for the session and silently didn't survive reload.
//
// The mechanism is deliberately tiny: any of those helpers calls
// noteSessionOnly() when storage refuses (a failed write, a failed
// remove, a stored value that no longer reads). The flag latches
// for the session — one success elsewhere doesn't un-lose the item
// that failed — and the store mirrors it beside persistStatus
// (state/store.js subscribes), where MasterBar renders it:
// "saved for this session only — this browser would not keep it."
//
// A leaf module with no imports, so every surface can report
// without an import cycle (the tasteStore lesson: module holders
// exist precisely because the store can't be reached from here).

let noted = false;
const listeners = new Set();

/** Report that a persist was refused: the value lives for this session only. */
export function noteSessionOnly() {
  if (noted) return;
  noted = true;
  for (const f of [...listeners]) f();
}

/** Has any surface reported a refusal this session? */
export function sessionOnlyNoted() {
  return noted;
}

/** Subscribe to the latch (fires immediately if already noted). */
export function onSessionOnly(f) {
  listeners.add(f);
  if (noted) f();
  return () => listeners.delete(f);
}
