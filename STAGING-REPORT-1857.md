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

## Files (as built)

Created: `app/src/state/chapterNarrow.mjs`,
`app/src/state/chapterNarrow.selfcheck.mjs`.
Edited: `app/src/curator/tasteLedger.js` (the optional `notch` field —
provenance pattern), `app/selfcheck.manifest` (one line).
Untouched on purpose: `layoutSlice.js`, `curate.js`, `CuratorBar.jsx`,
the store, all one-writer files, the sweep's curator nudge pass,
`STAGING-REPORT.md`, `STAGING-REPORT-1855.md`, `STAGING-REPORT-1856.md`.

## What was built (the ruling-independent core)

- **`app/src/state/chapterNarrow.mjs`** — the notch machine. Pure,
  importable by suites and wiring alike (imports only `data/chapters.js`
  + `data/presets.js`). `openNarrowing(chapterId, anchorLookId)` derives
  the state once: the genre as the anchor's first keyword (categories
  then styles, authored order) whose in-chapter member set is a proper
  subset of size ≥ 2; the hand as the first remaining keyword narrowing
  the genre pool further around the anchor (singleton allowed —
  solo-artist genre narrowing to that artist's own looks), falling back
  to the style-signature subset, else no hand notch. `narrow` / `widen`
  step the notch with refusals returning the identical object; `poolFor`
  serves the notion pool, intersected with the dealt-scope deck when the
  caller passes one; `notchLabel` derives the START-pill line
  (`Marks` → `Marks · linework` → `TALLY KEEPER`);
  `notchContextFor` / `isNotchContext` / `sanitizeNotchContext` are the
  ledger vocabulary (self-contained, no imports).
- **Honest depth, measured** (movement chapters, from the library as it
  stands): depth **2** — Marks' tally-keeper / first-wall / hand-cave,
  Bauhaus' dessau / constructor, Op Art's current / vega, Japan's kamon
  (8 anchors). Depth **0** — Engraving's specimen-drawer (no keywords on
  the record) and Bauhaus' weaving-workshop (a bridge look: every
  keyword it carries is chapter-wide) (2 anchors). Everything else in
  the movement chapters (31 anchors) is depth **1**; the Now chapter is
  data-rich and mixed. The machine reports what the data has; no
  dressing-up, no synthetic notches. The acceptance for depth 2 is
  therefore *conditional on material*, which the issue's own "where the
  chapter's data has them" already says.
- **`app/src/curator/tasteLedger.js`** — the keeps ledger gains the
  optional `notch` field on the #1507 provenance pattern: present only
  when a real context is supplied (`...(notch ? { notch } : {})`).
  `ledgerRow` sanitizes it, `isLedgerRow` rejects a malformed one,
  `parseLedger` skips such a line with the usual warning. Nothing else
  about the ledger changes.
- **`app/src/state/chapterNarrow.selfcheck.mjs`** — 10,239 checks:
  hand-verified derivation pins (incl. the Marks anchor chain
  tally-keeper → linework → the stamps hand; dot-song depth 1;
  specimen-drawer depth 0 with `narrow(x) === x`), the exhaustive
  chapter × anchor battery over all 105 anchored pairs (strict shrink,
  anchor in every pool, zero cross-chapter members, widening restores
  the wider pool *by reference*), scope composition against S2's
  `chapterScopeDeck` (Marks at OFF = 'med' is byte-identical; the Now
  pool honestly shrinks at OFF), label pins, and the ledger schema
  block (plain row's key set unchanged; a notch row round-trips
  `parseLedger`; a garbled notch is dropped by `ledgerRow` and rejected
  as a whole line by the reader).
- **`app/selfcheck.manifest`** — one line added, after `roundWiring`.

## Verification (this tree, sandbox)

- `chapterNarrow` suite: **ok, 10,239 checks** (after the prettier
  reflow as well — see format below).
- Touched-file suites, all green **unmodified**: `tasteLedger` (16 ok —
  its exact-key-set pin passes because the field is conditional),
  `curate`, `chapters`, `chapterWalk`, `roundTable`, `roundWiring`,
  `loisCut`. `keepContext.js` has no suite of its own; its sanitizer is
  exercised through tasteLedger's. Selfcheck sweep for every touched
  file was run by grep before this verdict.
- **Studio reader proof (run, not reasoned):** `studio/hits_bridge.py`'s
  real `read_ledgers` / `is_ledger_row` / `ledger_seed_labels` /
  `ledger_row_to_hit` consumed fixture lines carrying the `notch` field
  — parses, labels build, hits convert; the trainer ignores the field
  whole.
- **Full manifest sweep** (line-by-line past failures so the whole
  manifest reports): **PASS 552 / FAIL 4**, every failure proven
  environmental, none in code this slice touches:
  - `swarmWasm` — `build-wasm: cargo not found on PATH` (verbatim; no
    Rust toolchain in the sandbox).
  - `fx/rollSafety` — hangs/dies in its browser section in this
    harness. Proven base-identical: pristine worktree of the branch
    base (3b694a65) and this tree both time out at 200 s with identical
    output (modulo worktree path + PID), same GL-driver death point
    (`glDriver.mjs:124` via rollSafety line 231).
  - `gl/accum` — V8 heap abort in-sweep (the documented sandbox
    behaviour); standalone with `NODE_OPTIONS=--max-old-space-size=3072`:
    **OK, 84 cases, exit 0**.
  - `gl/livingMotion` — a wall-clock budget assertion (floor cost
    ≤ 2 ms/frame at 800 marks). Failed in-sweep under full-manifest
    load; measured +2.40 ms on the pristine base standalone once, then
    +1.35 ms / +1.71 ms (pass) on the base twice more, and +1.00 ms
    (15 checks passed) on this tree. Pure sandbox timing noise; the
    measured code is untouched by this slice.
  - `kineticSweep` passed in this sweep (the ~1.5% flake, #1822, did
    not fire).
- `npm run format:check` (after a real `npm install` in this
  worktree's `app/`): one file flagged — the new selfcheck; fixed with
  `prettier --write` on that file only; final verdict **"All matched
  files use Prettier code style!"**; the suite re-ran green after the
  reflow. `package-lock.json` untouched by the install.
- e2e selector sweep: `grep -rn "tasteLedger|chapterNarrow|notch" e2e/`
  — **zero hits**; no component, handler, or selector changed, so no
  e2e re-pin exists to make. The sweep was run, not skipped.

## Re-pins

**None.** No existing suite changed; no check weakened or deleted.
The existing tasteLedger key-set pin passes *because* the new field is
conditional — that was the design constraint, met.

## Screenshots

**None — honestly.** The D3 stop means nothing is wired live, so there
is no narrowing on a screen to photograph; inventing one would require
making the very ruling this report refuses to make. The suite
transcripts above are the evidence, per the S3 precedent. The wiring
pass (post-D3) owes the settled-board → narrowed-deal shots in Marks
and one movement chapter.

---

## The Lois pass (the 9 rules, applied to this slice's surfaces)

The only performer-facing surface this slice designs is a label on an
existing pill and a button whose behaviour is D3's — so most of the
pass lands on the decision document below, which is where the design
actually is.

1. **Think first.** The narrowing model was derived from the library's
   own data before any surface was discussed. The machine knows less
   than the issue promised (depth is 0–2 by data, not a guaranteed 2)
   and says so. Good.
2. **Seek the truth.** Two premises needed correction in the open: the
   button never deals a look, and chapters have no keyword layer. Both
   are written in this report, not smoothed over.
3. **The idea is king — scarcity is the idea.** Notches are few because
   the material is few. A notch that doesn't shrink anything is a lie
   with a label on it; the machine refuses to mint one.
4. **Kill your darlings.** The style-signature fallback survived
   because it earns its place (it names the hand for signature looks);
   the "artist" tier as a separate concept died — a singleton hand *is*
   the artist case. One less noun.
5. **Live with the tension.** The chapter name and the narrowing state
   want the same pill. The label squeezes them into one breath
   (`Marks · linework`) instead of opening a panel. Fine. Live with it.
6. **Take the blame.** If Matt hates derived genres, the derivation is
   mine, named in this report, and re-derivable in one place
   (`chapterNarrow.mjs`). No "the data made me do it."
7. **Slay the mediocrity.** The rejected path was a genre dropdown —
   an inventory UI on a performance instrument. The kept path is one
   word appearing on the pill you already read.
8. **Don't drink the Kool-Aid.** "CURATOR narrows" could have become a
   filtering model with taste scores as a gate. It didn't: pools are
   structure from the library's own cataloguing, the model still only
   ranks. The day the taste head picks your genre for you, the
   instrument is playing you.
9. **When it absolutely, positively has to be there overnight** — it
   doesn't. This slice stops at an unruled decision on purpose. A
   shipped wrong gesture is worse than a staged right core.

Blunt version: the core is honest and the stop is the point. Rule D3
and the rest is an afternoon.

---

## DECISION DOCUMENT — D3 (for Matt's ruling; nothing here is decided)

**The decision, verbatim from the spec (§9):** *"CURATOR's two jobs —
settled → narrowing; unsettled → today's whole-book roll. Confirm, or
should narrowing live on a different gesture?"* D5/D6 are **not** needed
by S4 and are not bundled into this ruling.

### Option A — Confirm: CURATOR is two jobs, told by the board

Settled board → CURATOR narrows (notch +1 per press to the floor, then
presses keep rolling *inside* the narrowed pool); unsettled → today's
shipped roll, unchanged, and the widen gesture below. 

- *Why it's coherent:* the settled/unsettled distinction is already
  board-visible — S3's `kineticRound` record and the START pill's
  chapter line tell the performer which world they're in. The two jobs
  are never ambiguous on the surface; the button means "CURATOR, work
  this" and the board says what "this" is.
- *Widen gesture under A:* the funnel order itself — a fresh KINETIC
  deal, a chapter flip, the CHAOS roll, or a launch opener all widen
  implicitly (they end the settled board; S3 already closes rounds on
  exactly those vias). A performer mid-narrowing who wants out deals
  again. No new gesture is minted.
- *Cost:* one wiring pass — settled-mode candidate bases restricted to
  `poolFor` (deck-intersected), the notch label onto the pill, the
  ledger field starts landing on settled-mode keeps. CURATOR's
  candidate-count machinery untouched.

### Option B — Narrowing lives on a different gesture

CURATOR keeps exactly one job (today's roll) in both worlds; narrowing
gets its own surface. The candidates, honestly weighed:

- **Long-press CURATOR** — no long-press exists anywhere on the deck
  today; it would be the instrument's first, undiscoverable without a
  label, and it needs its own widen twin (long-press again? a third
  state?). Buys purity of the button at the price of a hidden gesture.
- **Tap the chapter name on the START pill** — the pill is where the
  notch label already lives, and the ChapterCard is transient
  (seconds), so the pill is the only durable chapter surface. But the
  pill is a readout today — making a readout tappable is a design act
  with its own affordance problem (nothing on the deck says "this text
  is a button"), and widening needs a second behaviour on the same
  small target (tap cycles down only? tap at floor widens?).
- **A KINETIC-adjacent cadence** (e.g. narrowing rides the tap
  sequence) — collides with warm-tap absorption and the tap-3+
  curator-nudge territory S3/S2 already own; the round's laws get
  muddy exactly where S3 just made them clean.

- *Cost under B:* everything in A's wiring pass, plus the gesture's
  own discovery/affordance work, plus a widen gesture designed as a
  pair. The two-jobs "ambiguity" it avoids is, per the board-visibility
  point above, mostly theoretical.

### Coordinator's framing (not a ruling)

A is the issue's own design and the board already disambiguates it;
B's honest price is a new gesture *system*, not a new gesture. But
this is a feel decision about the deck's most-used button — it is
exactly the class of call the stop rule exists for. **The core in this
branch is complete either way**: `chapterNarrow` + the ledger field +
the label derivation serve both options unchanged; only the (short)
wiring pass differs.

**What unblocks on the ruling:** the wiring pass — settled-mode pool
restriction at the curate seam (`poolFor` against the candidate's
composition, deck-intersected), notch state held beside the round,
the pill label live, the ledger field written at keep time in settled
mode, a roundWiring-style suite over the real store, and the two
screenshot chapters (Marks + one movement chapter).

## WIRING — D3 ruled, built (2026-10-31)

**D3 RULED (Matt, 2026-10-31): Option A confirmed** (comment on #1857).
CURATOR does both jobs; the board says which. The wiring below follows
the decision document's "What unblocks" map point for point; nothing
in `chapterNarrow.mjs`'s machinery moved (two header comments updated
to the ruled/wired state, comment-only).

### What was built

- **Notch state beside the round** — `kineticNotch` in layoutSlice,
  session-only, never serialized, not in undo snapshots (same
  discipline as `kineticRound`). Opened fresh at notch 0 by
  `kineticVoicePass` whenever runRound settles a NEW round (an absorbed
  warm tap returns the standing record itself, and the narrowing is
  left identical — narrowing reads the settled board, it never reopens
  a round). Cleared in the same updates that end the board:
  `kineticLookPass` (flip), `kineticRoll` (chaos), `kineticOpenPass`
  (opener) — D3's implicit widening, no widen gesture anywhere.
- **The curate seam** — `curateUnlocked` asks `settledFunnel(state)`:
  on a settled board it advances the standing narrowing one notch
  (the machine's floor refusal returns the identical state, and the
  press rolls inside the floor pool) and builds the deck-intersected
  pool: `poolFor(advanced, chapterScopeDeck(round.chapterId,
  round.deal.dealtScope).looks)` — the same deck and scope the round's
  deal was made from. Candidates on a free explore press are BASED on
  pool looks drawn off the press's own seeded stream: the base deals
  the composition (a dealt candidate's membership IS its composition)
  and the params the look declares, locked keys excepted; the dice
  still roll every unlocked key the look does not declare, and motion
  keys always roll (motion is the voice's axis, never taken from a
  look — lookPass's own merge discipline). `pickCurated` is untouched:
  the taste head ranks inside the pool, it never filters it. No
  settled board → `settledFunnel` is null → the press is today's
  whole-book roll, byte-for-byte the old path.
- **Two disciplines named** (inside the map, recorded here): REFINE
  presses advance the funnel but mutate the standing piece as before —
  its composition is the anchor, a member of every pool by
  construction, so membership holds there too. A HELD look (a MODE
  armed, or the composition locked — the hold lookPass honours) is
  never re-based: the funnel state still advances (it describes the
  board), but a lock is never stomped. The suite pins the locked case.
- **The pill label live** — CuratorBar subscribes to `kineticNotch`;
  while a narrowing stands in the standing chapter, the START pill's
  chapter span renders `notchLabel()`'s text (chapter → chapter ·
  genre keyword → the anchor artist's own name), and the tooltip
  confesses the narrowing ("Narrowed to …: CURATOR presses roll
  inside it until the board changes."). The digits stay the chapter
  deck readout — they are the START scope's contract (what a KINETIC
  tap can reach), not the funnel's.
- **The ledger field at keep time** — `captureFavorite` (the ONE
  capture place, #719) stamps `notch: notchContextFor(state.
  kineticNotch)` whenever a narrowing stands, so every door that
  captures through it (DAVIS star, K, X, the dice crown, MIDI) writes
  the field identically; `sanitizeFavorite` carries a real one
  through (the provenance pattern), and the core's `ledgerRow` schema
  writes it. No narrowing standing → no field, at any of the three
  doors. A keep made after a settle but before any CURATOR press
  already stamps level 0 — settled mode exists from the settle.
- **The suite** — `src/state/chapterNarrowWiring.selfcheck.mjs`
  (roundWiring's shape, over the real store), registered in
  `selfcheck.manifest` after `chapterNarrow`. 7 checks: unsettled
  press unchanged and opens nothing; every settle opens its funnel at
  notch 0 on the settled anchor (asserted across every round of the
  hunt, not just the target board); warm taps leave the record
  identical; presses land inside the pool at genre, hand and floor;
  the hand-notch label is the anchor's name; the keep → sanitize →
  ledger-row path carries the context at level 2; a locked
  composition is never re-based; CHAOS clears the funnel and a keep
  afterwards carries no field. Stable across 6 consecutive runs.

Commits: `e7426b71` (wiring), `18d53c5c` (suite + manifest),
`395c700b` (prettier — see Verification).

### Verification (this tree, sandbox)

- Targeted first: chapterNarrow (10,239 checks), roundWiring,
  roundTable, tasteLedger, curate, favorites — then every suite that
  names a touched file (35 more: curate/shelf/director families,
  clock.inventory, writePathHonesty, firewall, …) — all green.
- `npm run format:check` — flagged exactly the two files this pass
  wrote (layoutSlice.js, chapterNarrowWiring.selfcheck.mjs); fixed
  with prettier and committed as `395c700b`; re-check clean, suites
  re-run green after the formatting.
- Full manifest sweep. The repo runner (`npm run selfcheck`,
  stop-at-first-failure by design) halts in this sandbox at the first
  environmental failure, so the sweep ran continue-on-error over
  every manifest line — the core pass's method, so the counts
  compare. Its own final line, verbatim:
  `SWEEP-RESULT lines=557 PASS=555 FAIL=2`
  (556 core lines + the new wiring suite, which passes in-sweep.
  Core pass on the pre-wiring tree: PASS 552 / FAIL 4.)
  The 2 failures are the core pass's environmental pair, proven
  base-identical (both failed on the pre-wiring tree under the same
  method) and reproduced standalone here:
  - `swarmWasm` — "build-wasm: cargo not found on PATH" (no Rust
    toolchain in the sandbox; CI's cargo-check is authoritative).
  - `fx/rollSafety` — "page.evaluate: Target crashed" at
    `gl/parity/glDriver.mjs:124` (the sandbox browser tab dies under
    SwiftShader).
  The core's other two environmental failures did not recur:
  `gl/accum` and `gl/livingMotion` both pass in this sweep, and the
  known kineticSweep flake (#1822) did not fire. CI remains the
  authority for all four suites.
- e2e sweep for the touched surface: the only spec referencing the
  START pill is `e2e/topbar-expand.spec.js`, which pins button
  classes/order and boots with no chapter standing — nothing to
  re-pin. **Re-pins in this pass: NONE** (no acceptance check was
  weakened, moved, or deleted).

### Screenshots (~/workspace/kc-1857-shots/, build 18d53c5c)

Six frames, driven through the real UI (KINETIC heat cadence: cool
tap = look pass, warm tap = voice pass/settle; CURATOR = the
.randomize button), state read from the pill's own text:

- Marks: `marks-01-settled-board.png` (pill: **Marks**) →
  `marks-02-notch1.png` (**Marks · linework**) →
  `marks-03-after-press2.png` (**TALLY KEEPER** — the hand notch is
  the anchor artist's name). An earlier Marks board in the same hunts
  floored honestly at its genre (`Marks · dots`, press 2 unchanged).
- Grunge (movement chapter): `grunge-01-settled-board.png`
  (**Grunge**) → `grunge-02-notch1.png` (**Grunge · fragments**) →
  `grunge-03-after-press2.png` (**TORN POSTER**).

Harness honesty: the frames are shot at 1920px wide, the pill bar's
full-width layout — below 1760px the compact bar hides the micro
spans by design (#1122), and hovering the pill inverts it and washes
the light micro text out, so the frames are taken at rest. The
watchdog's PERF PAUSED pill shows in some frames (it re-trips under
SwiftShader; a held frame keeps what had already drawn — the stages
are fully drawn). One hunt observation, not hidden: a single Marks
board in the browser hunts did not move its label on a press and the
anomaly never reproduced at store level (every Marks anchor has
depth ≥ 1 in the core's exhaustive battery, and the suite pins the
seam deterministically) — most plausibly a synthetic tap swallowed
during the landing-card animation. S5's record shape is untouched:
the settled/narrowed records are exactly the core's, and no S5
learning was built.
