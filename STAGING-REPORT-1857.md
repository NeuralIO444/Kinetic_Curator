# STAGING REPORT — #1857 Nash Book S4 (CURATOR narrows)

Branch: `feat/1857-book-s4-narrows` (stacked on `feat/1856-book-s3-round` @ 3b694a65).
Local-stack rule: publishes only after S3 merges; coordinator rebases and publishes.
**Not pushed, no PR. Review lane: Matt judges and merges.**

## STOP — D3 is unruled, and the live narrowing needs it

**D3** (spec §9: "CURATOR's two jobs — settled → narrowing; unsettled →
today's whole-book roll. Confirm, or should narrowing live on a different
gesture?") is S4's own decision and it is **unruled**. The live behaviour —
what the CURATOR button *does* when a board is settled, and which gesture
widens — cannot be built without it. Per the assignment's stop rule I am
building everything that does not depend on the ruling (the notch machine,
the pool derivations, the keeps-ledger notch schema, the readout label
derivation), choosing **no default**, and wiring **nothing live**:
`curateUnlocked`, the CuratorBar, and the store are untouched. The full
decision document is at the end of this report.

## Premise verification (checked against the tree at the branch base)

- ✅ The CURATOR button does not narrow (issue premise TRUE). Its handler
  is `curateUnlocked` (layoutSlice): roll candidates over the unlocked
  params, keep `pickCurated`'s pick. Chain confirmed in `curate.js`:
  MLX head (imported taste.json, fidelity ≥ 0.3) → persona curator →
  null/dice. `CURATE_CANDIDATES = 8` is the base count; the press scales
  it by the room's kin_weight, clamped [2, 16] (#1145) — the issue's "8
  candidates / candidate count unchanged" means that shipped machinery,
  which this slice does not touch.
- ✅ **The button never deals a look.** `composition` is not in
  `RANDOMIZABLE_KEYS`, the markov chains don't carry it, and render-profile
  shaping only biases/forces numeric param keys. Candidates are param
  scenes over the standing composition. Consequence for scope item 1:
  "candidates rolled only from the settled chapter's deck" can only mean
  candidates *based on* deck-member looks in settled mode (the look-pass
  merge discipline is the existing shape for that). A candidate's pool
  membership is therefore its composition — that is the definition the
  acceptance suite can and does assert. The dealing itself is wiring-pass
  work; the pools and the membership law are built here.
- ⚠️ **Premise refinement (materials exist; the layer does not):** the
  issue calls genres "the S1 registry's keyword layer". `chapters.js`
  carries no keyword layer and no named subsets — it derives decks from
  lookGroups / assetStyles / assetFamilies / voiceStyles. The keywords
  live on the look records themselves (`categories[]`, `styles[]`,
  authored per look), and the families live in `assetStyle.js`. So the
  keyword layer is *derived in this slice* from exactly the sources the
  issue's parenthetical names — no authored records edited, the
  assetStyle/chapters derivation pattern followed.
- ⚠️ **"Named subsets" likewise do not pre-exist for looks.** The
  library's named sets (`SHAPE_SETS`) are asset sets named for voices.
  The deepest notch's hand is therefore *derived* (the anchor look's kin
  by keyword intersection, below) and *named by the anchor look* — an
  artist's name on the subset, which is what "artist-flavoured" asks
  the surface to say. Named builder decision; overruleable.
- ✅ The settled board is as S3 left it: `kineticRound` after a voice
  pass is the settled record (`settled: true`, standing `deal` with
  `lookId`, `cut` when spent, full log). S4 consumes it as-is.
- ✅ Keeps ledger: `curator/tasteLedger.js` (JSONL, append-only, honest
  keypresses only). The schema-additive precedent is `provenance`
  (#1507): an optional top-level field, absent stays absent, validated
  when present. The Studio trainer's reader is
  `studio/hits_bridge.py:is_ledger_row` — a Python mirror that checks
  known keys and ignores unknown ones; tolerance is proven by running
  it (verification section), not asserted.
- ✅ Deck readout area: the START pill in `CuratorBar.jsx` already
  renders the standing chapter's name + deck counts
  (`chapterDeckReadout`). The notch label derivation targets that
  surface at wiring time. No new panel.

## Design of the ruling-independent core (named decisions)

- **Anchor.** Narrowing anchors on the settled deal's look
  (`kineticRound.deal.lookId`). The funnel narrows *around what
  settled* — the only anchor the board itself offers, and the one
  Matt's description implies ("narrows it down to genres of artists
  working in that area" — the area you're in).
- **Genre (notch 1).** The anchor's keywords in authored order
  (`categories` then `styles`, as the record declares them); the genre
  is the first keyword whose member set inside the chapter is a proper
  subset of at least 2. A keyword covering the whole chapter narrows
  nothing and is skipped; a singleton is an artist, not a genre.
- **Hand (notch 2).** Inside the genre pool: the first remaining
  keyword (authored order) whose intersection with the genre pool is a
  proper subset containing the anchor (a singleton hand is allowed —
  the funnel may end at the artist alone); failing that, the
  style-signature subset (same declared `styles` list) when it is a
  proper subset; failing that, there is no hand notch for this anchor.
- **Honest depth.** Pools strictly shrink by construction, so depth is
  whatever the data honestly has: some anchors narrow twice, some
  once, some not at all (e.g. Engraving's specimen-drawer, whose only
  category covers its whole chapter; Bauhaus's weaving-workshop, the
  bridge look whose keywords are all whole-chapter or singleton).
  A press at the floor is refused (identical object back), never a
  silent re-roll at a wider pool. The machine reports depth; it does
  not borrow depth from a neighbour keyword.
- **Widening** is the machine's step back (`widen`), restoring the
  wider pool exactly — the gesture that triggers it is D3's to name.
- **Scope.** Pools derive from the chapter's full look list and are
  intersected with the live dealt-scope deck (`chapterScopeDeck` via
  `poolFor(state, deckLookIds)`) at use time — S2's honest-scope
  machinery composes, it is not reimplemented.
- **Models never gate.** The taste engine is untouched; the pools are
  structure (which looks a candidate may be based on), the engine
  still ranks and picks inside them, exactly the standing law.

## Files (planned)

Created: `app/src/state/chapterNarrow.mjs`,
`app/src/state/chapterNarrow.selfcheck.mjs`.
Edited: `app/src/curator/tasteLedger.js` (the optional `notch` field —
provenance pattern), `app/selfcheck.manifest` (one line).
Untouched on purpose: `layoutSlice.js`, `curate.js`, `CuratorBar.jsx`,
the store, all one-writer files, the sweep's curator nudge pass,
`STAGING-REPORT.md`, `STAGING-REPORT-1855.md`, `STAGING-REPORT-1856.md`.

*(Verification, re-pins, the Lois pass, and the D3 decision document are
appended below as the build lands.)*
