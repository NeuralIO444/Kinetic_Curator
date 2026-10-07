// The four voice-1 lines (#1032, M7): LOIS at her bluntest, in the empty room or
// the naming moment. Signed by Matt 2026-10-05. Exactly one per panel, never on a
// live control, never an error. Strings are authored: they carry `.name` so
// text-transform leaves them alone (docs/DESIGN_SYSTEM.md §5, §7).
export const LOIS_LINES = Object.freeze({
  build: 'NOTHING ON STAGE — a plate with no cast is a room.',
  stimuli: 'SILENT — sound is in the room and nothing is listening.',
  play: 'NO SETLIST — a night with no next plate is just this one.',
  director: "NAME THE PLATE — a roll you didn't name didn't happen.",
});
