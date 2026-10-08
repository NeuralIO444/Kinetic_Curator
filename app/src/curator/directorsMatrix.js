// directorsMatrix.js — the 20 rooms: what LOIS and Davis say to each other (#1126).
//
// Every string below is copied verbatim from docs/research/directors-copy-matrix-2026-10-07.md (extracted from the
// mockup, Matt's direction). **Do not invent lines.** directorsMatrix.selfcheck re-parses that document and fails if
// a character differs, so the copy cannot drift from the page Matt signs off.
//
// A room exists only when BOTH Directors have a state (each reads a real measurement of the honest feed, DS rule 3):
// with no Davis state there is no room and nobody speaks (rule 4, silence is default). LOIS AWAY is a room whose LOIS
// line is `null`: he goes silent and Davis gets the room.
//
// READOUT ONLY: this module says what the room is. Nothing here acts, rewards or steers.

/** @type {Record<string, Record<string, {n:number, verdict:string, verdictLine:string, lois:(string|null), davis:string}>>} */
export const DIRECTORS_MATRIX = {
  NOD: {
    FLOW: { n: 1, verdict: "THE CLASH", verdictLine: "the critic points, the generator rolls. Neither backs down.",
      lois: "That's the one. Tell the gardener to put the hose down.",
      davis: "He's pointing at one. I'm still rolling — the next one might be the one after the one." },
    SEEDLING: { n: 2, verdict: "THE CLASH", verdictLine: "the critic points, the generator rolls. Neither backs down.",
      lois: "Already? Fine — new seed. But I'm watching this one.",
      davis: "Fresh seed and he's already pointing? He points fast. I plant anyway." },
    UGLY: { n: 3, verdict: "THE CLASH", verdictLine: "the critic points, the generator rolls. Neither backs down.",
      lois: "Stop digging through the compost. It's right there.",
      davis: "He found his one in my compost pile. You're welcome, George." },
    STUCK: { n: 4, verdict: "THE CLASH", verdictLine: "the critic points, the generator rolls. Neither backs down.",
      lois: "Forty rolls to find what I saw on roll three. Keep it. You're welcome.",
      davis: "He's pointing at a seed I've rolled forty times. Fine — he's right. Take it." },
    BLOOM: { n: 5, verdict: "AGREEMENT", verdictLine: "the ugly paid off. They both earned this one.",
      lois: "Even the gardener finds one eventually. This one's real — keep it.",
      davis: "The ugly paid off. He can point at this one — we both earned it." },
  },
  VIBE: {
    FLOW: { n: 6, verdict: "THE ROOM", verdictLine: "working. They know each other's moves.",
      lois: "Quiet. He's rolling, I'm watching. This is how it works.",
      davis: "Quiet room, good rolls. This is the job." },
    SEEDLING: { n: 7, verdict: "THE ROOM", verdictLine: "working. They know each other's moves.",
      lois: "New seed. I'll wait. I can wait — I just can't watch you get precious.",
      davis: "New seed, quiet room. Anything could happen — that's the point." },
    UGLY: { n: 8, verdict: "THE ROOM", verdictLine: "working. They know each other's moves.",
      lois: "Digging. I'll allow it — for now.",
      davis: "Sifting. The ugly is not the enemy — the stopping is." },
    STUCK: { n: 9, verdict: "THE ROOM", verdictLine: "working. They know each other's moves.",
      lois: "Stuck. Say the word and I'll pick one for you.",
      davis: "Same seed, nothing kept. The system is bored. I am bored. Roll." },
    BLOOM: { n: 10, verdict: "THE ROOM", verdictLine: "working. They know each other's moves.",
      lois: "Good. Now stop before you ruin it.",
      davis: "A keep after the ugly. Savor it for exactly one minute, then roll." },
  },
  BURN: {
    FLOW: { n: 11, verdict: "FULL BURN", verdictLine: "the critic and the generator, both barrels. Ride it.",
      lois: "You're on fire and he's flowing. Don't stop. Don't think. Roll.",
      davis: "He's burning and I'm flowing. This is the peak — ride it." },
    SEEDLING: { n: 12, verdict: "THE ROOM", verdictLine: "working. They know each other's moves.",
      lois: "Burning already? Good. Strike while it's hot.",
      davis: "Burning on a fresh seed? Bold. I like it." },
    UGLY: { n: 13, verdict: "THE ROOM", verdictLine: "working. They know each other's moves.",
      lois: "Burn through it. The ugly can't survive this pace.",
      davis: "Burning through the ugly — now we're sifting at speed." },
    STUCK: { n: 14, verdict: "THE ROOM", verdictLine: "working. They know each other's moves.",
      lois: "All this heat and nowhere to go? Pick one. Move.",
      davis: "Burning but stuck? That's spinning the wheels hot. Roll something new." },
    BLOOM: { n: 15, verdict: "THE ROOM", verdictLine: "working. They know each other's moves.",
      lois: "That's the one. At full burn. Keep it forever.",
      davis: "Bloom at full burn. Remember this one." },
  },
  AWAY: {
    FLOW: { n: 16, verdict: "DAVIS ALONE", verdictLine: "no critic in the room. The system dreams unwatched.",
      lois: null,
      davis: "No critic in the room. The system dreams better unwatched." },
    SEEDLING: { n: 17, verdict: "DAVIS ALONE", verdictLine: "no critic in the room. The system dreams unwatched.",
      lois: null,
      davis: "New seed, nobody watching. My favorite audience." },
    UGLY: { n: 18, verdict: "DAVIS ALONE", verdictLine: "no critic in the room. The system dreams unwatched.",
      lois: null,
      davis: "Nobody watching the ugly. Good. It needs privacy." },
    STUCK: { n: 19, verdict: "DAVIS ALONE", verdictLine: "no critic in the room. The system dreams unwatched.",
      lois: null,
      davis: "Stuck and alone. The honest place. Roll." },
    BLOOM: { n: 20, verdict: "DAVIS ALONE", verdictLine: "no critic in the room. The system dreams unwatched.",
      lois: null,
      davis: "Found one and he's not even here to see it. Typical." },
  },
};

/** The room for a pair of states, or null when either Director has no state. */
export function roomFor(loisCode, davisCode) {
  if (!loisCode || !davisCode) return null;
  const row = Object.prototype.hasOwnProperty.call(DIRECTORS_MATRIX, loisCode) ? DIRECTORS_MATRIX[loisCode] : null;
  return row && Object.prototype.hasOwnProperty.call(row, davisCode) ? row[davisCode] : null;
}
