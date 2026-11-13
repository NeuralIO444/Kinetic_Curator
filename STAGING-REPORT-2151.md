# STAGING REPORT — #2151: FIELD: LOIS and DAVIS request revisions when a standing poem reads empty or crowded

**Branch:** `kc-2151-revision-requests` (local only, at origin/main `58c7f11e`)
**Outcome: STOPPED AT THE SURVEY — premise contradiction found. No code was written.**

Per the build brief: *"If the survey finds a premise in the rulings that the code contradicts, STOP and report it instead of improvising."* The survey found one, and it sits under the whole slice: **the register-spanning poem supply the rulings describe does not exist in the shipped decks, and the deal path forbids one of its poles outright.** Everything else in the rulings checks out against the tree (see §3). The open questions in §5 are Matt's to rule; I did not decide any of them.

*(File name: the repo root already carries a tracked `STAGING-REPORT.md` — the #1894 report, committed to main long ago. This report follows the repo's per-issue naming instead (`STAGING-REPORT-1525.md` etc.) rather than overwriting that record.)*

---

## 1. The contradiction (measured, not inferred)

Tonight's rulings require:

- a **cache** of poems spanning the register line — *"from a word or two to a dense paragraph of several type chunks"* — dealt across in hot mode, and drawn from when a revision answer *"re-deals toward the other pole from stock"*;
- a **one-long-word poem** as the cover pole's limit, pushed hard by the type system;
- a register judgment whose poles are **cover** (*"one word, a masthead, or large type and some sub text"*) and **interior** (*"lots of dense paragraphs of type, the inside of a magazine or book"*).

The shipped poem supply is the four poets' decks (`app/src/poets/{greenleaf,teijo,rosselli,gibson}.js`) — 16 pieces total. Measured through the real deal path (`fieldDealReport` → `placePiece`, aspect 16/9, at deck density and at density 1.0):

| Measure | Shipped range | Ruled pole |
|---|---|---|
| Words per piece | **4–8** | cover limit: **1–2** |
| Lines per piece | **2–3** | interior: **several chunks (≥4)** |
| Pieces of ≤2 words | **0** | — |
| Pieces of ≥4 lines | **0** | — |
| Placed rows | 1–3 | — |
| Placed em | 0.037–0.087 | masthead: large type |
| Stamps per form | 15–35 | one word: ≤9 |

Both ends of the register line are empty. Every poem the system can deal stands mid-register: two or three short lines at one of five placement recipes (`grid`, `bands`, `single`, `two`, `square` in `app/src/poets/placement.js`). A register judgment banded at the ruled descriptions would never fire; banded anywhere else, it would fire on mid-register poems by thresholds a builder invented — a silent design decision, which Matt's standing rule forbids.

Worse for the cover pole: **a one-long-word poem cannot be dealt at all today.** `FIELD_POEM_MIN_STAMPS = 12` (`app/src/poets/fieldForm.js`) refuses any deal placing fewer than 12 letter stamps, and fieldForm's own comment states the law's consequence: *"the longest single word in any deck is 9 letters, so no word, and no scrap of two short words, clears it."* That threshold is **#1932 — Matt's own ruling of 2026-11-03** ("a poem forms only once enough letters are on stage to form one — not just three random shapes"). Tonight's #2151 comments never mention #1932. Building ruling 4 therefore needs (a) one-word poem text that does not exist, and (b) an amendment to, or a named exception from, a standing ruling of Matt's. Neither is a builder's call.

And the supply cannot be manufactured inside this slice: the issue's own first line is *"The poem writes the words"* — authorship stays with the poets, and the decks are the poets' texts. Writing new deck pieces at both poles (a one-word piece, a dense-paragraph piece) is authorship, not engineering.

**What this blocks:** the cache (nothing to cache at either end), the revision answer (no stock at the other pole to re-deal toward), the one-word push (undealable), and any honest calibration of the empty/crowded bands (no exemplars at either pole to calibrate against).

**What it does not block:** the register-judgment module's shape, the pressure law, the user-silence law, and the tuning-knob module are all buildable as designed (§3) — they are simply unshippable as a slice whose headline behaviors (cache, pole-ward re-deal, one-word push) cannot occur. Shipping the judgment + pressure scaffolding alone, with bands guessed over mid-register material, would be exactly the improvisation the brief forbids.

---

## 2. Survey — how poems are dealt and formed today

- **Pick:** `app/src/curator/fieldDirector.js` — `choosePoet()` picks a poet + piece from the decks by room temperature (cool → greenleaf/teijo, hot → rosselli/gibson), gated by the #1932 genre gate (`TYPE_NATIVE_FAMILIES`: swiss, bauhaus, japanese). Silence is the default; eligibility defaults to false.
- **Deal:** `app/src/poets/fieldForm.js` — `fieldDealReport(decision, rng, {aspect})` re-reads the piece from the deck (the deck is the authority; a decision names a piece, it does not carry one), places it via `placePiece`, counts letter stamps against `FIELD_POEM_MIN_STAMPS`, and judges the placed form through the stillborn gate (`gateFieldForm`: charset / fit / overlap). Refusals land as silence **with the verdict banked** (`fieldGateRefusal`).
- **Placement:** `app/src/poets/placement.js` — `placePiece` sets one piece per its recipe. Density (0–1, deck value ± the Director's genre lean) nudges em (≈0.054–0.092 pre-fit) and spacing; it does not change a piece's line/word structure. Rows in a placed form = the piece's lines (except `single`, which joins lines onto one baseline, and grid-plate re-breaks).
- **Commit:** `app/src/state/slices/layoutSlice.js` — `landPoem()` is the single write site for every deal outside the CURATOR press (KINETIC passes, the poem row). It draws from seeded sub-streams on `CH.curate` indexed by the document's `poemDeal` counter (`POEM_PICK_BASE`/`POEM_PLACE_BASE`, `app/src/poets/poemRow.mjs`), deals through `getDirector().dealPoet()` + `fieldDealReport`, and spreads `{ layoutParams, poemDeal, fieldGateRefusal, fieldReview }` into the same commit as the rest of the press — form, HOLD flag and deal counter can never disagree. HOLD (`lockedParams.fieldForm`) passes the standing form and both records by, untouched.
- **The standing poem** lives at `state.layoutParams.fieldForm`: `{ poetId, pieceId, layout, aspect, script?, face?, plate?, break?, register?, raygun?, review?, stamps[] }`, re-validated on every read by `sanitizeFieldForm`. The clean-transcription chip is `app/src/components/PoemRow.jsx` + `poemIdentity()` (poet surname, first words, form name) — the chip law is UI-side and untouched by anything proposed here.

## 3. Survey — what the rulings stand on (all verified in this tree)

- **The review loop (#2006)** — `app/src/curator/fieldReview.mjs` (slice 1: shadow measure of the *landed frame* — self-overlap, mark cover, coverage, crop), `fieldReviewLadder.mjs` (slices 3/4: SHRINK → SHIFT → QUIET → RE-DEAL → CUT, acting inside the landing's own commit), `fieldReviewVoice.mjs` / `fieldReviewVoiceLive.mjs` (slice 2: the voice). It judges **fresh landings only, synchronously inside the deal commit**, because a take's replay must re-derive the verdict and the adjustment from the replayed commit bit-for-bit (ladder header, §3.8). A standing poem that *comes to* read empty or crowded as the stage lives around it is genuinely not covered — #2151's gap is real. **Determinism consequence for #2151:** the pressure law reads wall-clock user tempo, which a replay cannot re-derive; the codebase's standing answer to that shape is the voice's split (live drivers are runtime theatre, muted during playback, and never decide — `fieldReviewVoiceLive`). Any #2151 ACT (a re-deal commit) driven by tempo would need its own recorded-input story. This is a spec question (Q4 below), secondary to §1.
- **The doctrines (#2013/#2016)** — `app/src/curator/doctrines.mjs`: CARSON and ASHWORTH are **caller profiles inside the Director's treatment call**, not personas and not judges. `doctrineMode(id, draw, standing)` names a raygun mode (CARSON → `carson`/`shot`; ASHWORTH → `grit`). Call sites: `layoutSlice.doctrineArm` (arms a fresh landing at deal time, vetoed by the plain landing's shadow review) and the `treatments` surface (`app/src/curator/treatmentsLive.mjs`: `doctrine(target, {call|standing, by})`). There is **no register-judgment API** on them: "CARSON reads the cover pole" has, today, no code surface to read *with* — a revision request "via the doctrines" would be a new use of the caller profile (e.g. the request names the doctrine of the pole the poem sits at, and an answer arms through the existing treatment seams). Noted as a seam decision for the spec (Q5), not a contradiction.
- **KINETIC press handling** — KINETIC taps and the CURATOR press both route through `landPoem` commits; taps announce on the bus as `Events.KINETIC_TAP` (`app/src/composition/eventBus.js`).
- **User-tempo signals exist** — `app/src/curator/loisActivity.js` already records exactly the substrate the pressure law needs: KINETIC/curate tap timestamps (`rolls`, `rollsAll`), param tweaks off the bus (`tweaks`, from `LAYOUT_PARAM`), keeps, undos, idle time; `snapshot()` exposes `rollsLastMinute`, `lastRollAgoMs`, `idleMs`, `lastTweak`, `rollCadence`, `away`. HOT (tap cadence) and LINGERING/FIDDLING (recent tweaks, no taps) are both computable from recorded signals — no new instrumentation is needed for the pressure gate.
- **Tuning-knob pattern** — the codebase's model is `fieldReview.mjs`'s: named `TUNABLE` constants at the module head + a frozen `REVIEW_GATES` record stamped into every banked verdict for provenance. A #2151 knob module would follow it exactly (one module, frozen record, surfaced read-only alongside the MIND tab's numbers).

## 4. What was built

**Nothing.** No source file was created or modified; no selfcheck was added; `app/selfcheck.manifest` is untouched. The only artifact of this staging is this report. (The register probe ran from `/tmp` against the worktree's real modules and was not committed.)

Accordingly the publish ritual is not applicable to a code tree — there is no diff to lint, format-check, sweep, or build. `git status` at handoff shows this report as the sole change on the branch.

## 5. Open questions for Matt (none decided here)

1. **The supply.** The decks hold no poem at either ruled pole. Does the cache's line get its ends from **new deck pieces** (a word-or-two piece; a dense multi-chunk paragraph piece — and if so, whose hand writes them, since authorship is the poets' by the issue's own law), or is the register line re-ruled to the range the decks actually deal (rows 1–3, 4–8 words), with cover/interior re-anchored inside it?
2. **The threshold.** If one-word poems are to exist, does #1932's `FIELD_POEM_MIN_STAMPS` gain a named exception for them (e.g. a cache-dealt cover-pole piece), or does the one-word push apply only where a single word arrives as part of a larger deal? Tonight's rulings don't mention #1932; it stands until Matt amends it.
3. **The bands.** With exemplars at the poles (Q1 answered), what separates *reads empty* from *stands well* from *reads crowded* — rows/words/em bands named by Matt, or measured from the pole pieces' placed forms the way `FIELD_MIN_LEGIBLE_EM` was grounded by measurement?
4. **Replay.** A tempo-driven re-deal cannot be re-derived by a take's replay. Is the standing pass's act (a) recorded as an input the replay re-applies (the act joins the take log, like a press), or (b) runtime theatre only, on the voice's pattern (requests may speak/propose live; the form they change is whatever the next recorded deal makes it)? The acceptance line *"takes replay identically"* stands either way, but the two readings build differently.
5. **The doctrine seam.** When a request fires, what does "CARSON reads the cover pole / ASHWORTH reads the grit side" *do* in code — name the request's provenance only (the record says whose pole was read), or also arm the answering deal through that doctrine's treatment (the `treatments.doctrine` call that already exists)?

## 6. Where the build would go, once Q1–Q2 are ruled

For the coordinator's planning only — nothing here was started:

- `app/src/curator/fieldRegister.mjs` (pure): register read of a standing form (rows, mean/max em, words, chunks — from the form + its deck piece), the request record, and the frozen knob record on the `REVIEW_GATES` pattern.
- `app/src/curator/fieldRegisterLive.mjs` (live driver, on the `fieldReviewVoiceLive` pattern): watches the standing form + `loisActivity.snapshot()`, applies the pressure law, banks requests, and answers through the existing `landPoem` re-deal seam — never editing text, never touching the #2006 loop.
- The cache as a pure bank inside the poem machinery (deck-indexed by register), consumed by the answer path and by hot-mode dealing.
- Knobs surfaced read-only with the MIND tab's numbers; no MegaMind editor (per the build shape ruling).
