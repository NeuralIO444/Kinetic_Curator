# STAGING REPORT — #1856 Nash Book S3 (the round)

Branch: `feat/1856-book-s3-round` (stacked on `feat/1855-book-s2-landing` @ 1573dfe5).
Local-stack rule: publishes only after S2 merges; coordinator rebases and publishes.
**Not pushed, no PR. Review lane: Matt judges and merges.**

## STOP — two decisions are unruled, and the live round needs both

**D2** (LOIS's cut shape: both shapes / kill-only / trim-only) and **D4** (settle
trigger: automatic on completion vs explicit performer lock gesture) are S3's own
decisions per S2's mapping, and both are **unruled**. The live round genuinely
requires both rulings: "kill" needs a smaller-pool definition the spec never
gives; "trim" needs an element granularity; a D4-explicit gesture has no
designed surface. Per the assignment's stop rule I built everything that does
not depend on either ruling, chose **no default for either**, and wired
**nothing live**. The full decision document is at the end of this report.

What that means concretely: `layoutSlice.js`, the store, and `loisActivity`
are untouched. No live behaviour changes anywhere. The round exists as a
proven machine, a proven judge, and a CUT face that nothing live sets yet.

## What shipped (ruling-independent core)

**`app/src/state/roundTable.mjs`** — the pure round state machine.
Phases `dealt → judging → standing → settled → closed`.

- `openRound({seq, chapterId, deal})` — throws on a missing deal or chapter;
  deep-freezes the deal; logs `deal`.
- `openJudgement`, `passCut` — the judgement opens exactly once; a pass moves
  the round to `standing` uncut.
- `spendCut(round, {verdict, deal})` — **refuses a silent cut**: an empty or
  blank verdict reason returns the identical object. On a real cut it installs
  the post-cut deal (frozen) and the cut record keeps both before/after deals.
- `settle(round)` — lands **only** from `standing`. An interrupted round has
  no `settle` in its log; the record is honest about it.
- `absorbWarmTap(round)` — a deliberate, named no-op seam: warm taps never
  disturb a round (S4's CURATOR pass reads the standing board later).
- `closeRound(round, via)` with `ROUND_CLOSE_VIAS = ['flip','chaos','opener']`;
  the outcome is derived: `'settled' | 'unsettled'`.
- **Every refused transition returns the identical object (===).** The one-cut
  law is structural: the phase graph never returns to `judging`, so a second
  cut is not a rule the code checks — it is a state the machine cannot reach.
- Round record keys exactly: `chapterId, cut, deal, log, phase, seq, settled`.
  Log types: `deal, judging, pass, cut, settle, close`.
- Design decision (named): a round opens on the **completed** deal
  (post-voice-pass), because a half-dealt hand can't be judged or frozen.

**`app/src/curator/loisCut.mjs`** — LOIS's cut judge.

- `judgeDeal(dealParams, deckParams)` computes `extractFeatures` over the dealt
  look against the chapter deck's mean (the same math `rankLois` uses), scores
  with the existing `scoreLoisHeuristic`, and finds the first failing gate in
  `loisVerdict`'s own order. Exports `LOIS_CUT_GATES = {glance: 0.28,
  originality: 0.22, boldness: 0.30}`.
- The `reason` returned is `loisVerdict(parts)` **verbatim** — LOIS speaks in
  her own shipped lines ('No hit at a glance. Out.' / 'Too close to the pile.
  Habit.' / 'Cautious or creative, kid. Pick one.'), never a paraphrase.
- Judges the **look only** (the voice rides the look — documented in the file).
- Empty deck → `{cut:false, parts:null, gate:null, reason:''}`: no deck, no cut.

**The CUT face** — `app/src/curator/loisFace.js` gains CUT:
glyph `( ─|─)`, tone `'red'`, label `'Cut. That one does not stand.'`
`resolveLoisFace` gains an optional `cut = false` flag; priority
**AWAY > CUT > NOD > BURN > VIBE**. `app/src/styles/layout.css` gains
`.lois-pill[data-tone="red"] { color: var(--kc-red); }` (LOIS's existing red,
`--kc-red: #ff4d00`). The `loisActivity` `cut` flag that will drive this is
future wiring — nothing sets it live, so the pill's live behaviour is
byte-unchanged.

**Manifest** — two lines added after `chapterWalk`:
`node src/state/roundTable.selfcheck.mjs`, `node src/curator/loisCut.selfcheck.mjs`.

## Premise verification (all TRUE, checked against the tree)

- `loisFace.js` had exactly NOD/VIBE/BURN/AWAY; CUT existed only as a word in
  `mindContract.js` (`lois: ['NOD','VIBE','BURN','AWAY','CUT']`). LOIS had no
  cut. The standing audit correction holds.
- `roomDither.js` already carried CUT construction params "from audio
  direction" and a manually appended `'CUT'` in `LOIS_FACE_CODES`; `mindFace.js`
  gave CUT a hash-picked micro-expression. CUT was a rumour in three files and
  a face in none.
- `queenDeniability.selfcheck.mjs` scans **all of src/** for hidden Queen
  identifiers. The new code names no Queen tokens; the suite passes untouched
  (7 checks). The sway stays hidden; nothing in this slice touches it.
- S2's seams are as the issue describes: `chapterWalk.mjs` (`dealLanding`,
  `chapterScopeDeck`, `effectiveChapterScope`), the landing record shape, cold
  tap = landing+look, warm tap = voice in-chapter, tap 3+ reserved for S4.
- One-writer files (`liveLoop.mjs`, `liveResolve.mjs`, `particles.js`) were
  never needed and are untouched.

## Acceptance criteria — proven at machine level, both readings of both decisions

`roundTable.selfcheck.mjs` — **14 checks, all passing.** Both cut shapes are
exercised through fixture executors (kill = a new hand dealt from a smaller
pool; trim = the same hand minus the voice). Deep-freeze mutation attempts
throw. The judgement slot opens exactly once. A silent cut is refused. An
interrupted round's log shows no `settle`. A trimmed-and-standing round
settles. The lock persists across 5 warm taps and unlocks only via
`closeRound`. Full transcripts for Marks (cut → redeal → settle → flip) and
Swiss (pass → settle → flip).

`loisCut.selfcheck.mjs` — **5 checks, all passing.** The gates are cross-pinned
against `loisVerdict`'s boundary behaviour so the two can never drift apart.

## The judge's measured cut rate — feel data, deliberately NOT tuned

Battery over **all chapters' real looks: 105 deals judged, 25 cuts (24%)** —
22 originality, 3 boldness, 0 glance. Small decks sit near their own mean, so
the originality gate is trigger-happy by construction: a look is "too close to
the pile" when the pile is six looks and it is one of them. I recorded the
number instead of tuning it away — whether 1-in-4 is the right cruelty for
LOIS is a feel call for Matt at the ruling, not a constant a builder buries.

## Re-pins (each names its cause; no acceptance check weakened or deleted)

1. **`loisFace.selfcheck.mjs`** — cause #1856: face table is now five keys in
   order `[NOD, VIBE, BURN, AWAY, CUT]`; CUT glyph/tone/label pinned; CUT beats
   NOD and BURN, loses to AWAY; the flagless snapshot still resolves exactly as
   before. 5 checks passing.
2. **`roomDither.selfcheck.mjs`** — cause #1856: construction params keys now
   equal the face keys exactly (the manual `'CUT'` append in `roomDither.js`
   is retired — `LOIS_FACE_CODES = Object.keys(LOIS_FACES)` — because the
   append would now double-deal the code). 14 checks passing.
3. **`directorsMatrix.selfcheck.mjs`** — cause #1856: matrix coverage is now
   pinned over the four feed faces, and the suite asserts
   `!('CUT' in DIRECTORS_MATRIX)`. **Why:** the directors' copy is Matt-signed
   verbatim from `docs/research/directors-copy-matrix-2026-10-07.md` — "do not
   invent lines" — and the suite re-parses that doc (20 rooms, untouched).
   Giving CUT rooms would mean inventing copy in Matt's name. This exclusion
   is a named builder decision, forced by the verbatim-copy law, and Matt can
   overrule it by signing CUT lines into the doc. 6 checks passing.

Also: `mindFace.js` carries a comment-only note — CUT has graduated to a fixed
face, so `loisLook('CUT')` now reads the face table instead of dealing a
hash-picked micro-expression. Named behaviour note, no code change.

## Verification

- **Full manifest sweep, run in segments** (the runner halts at first failure):
  segment 1 (lines 1–87) exit 0; segment 2 (lines 89–228) exit 0; segment 3
  (lines 230–end, 329 suites incl. roundTable, loisCut, accum, kineticSweep)
  exit 0.
- **Two suites proven environmental / base-identical** on a pristine worktree
  of the S2 base (`1573dfe5`):
  - `swarmWasm` (line 88): `build-wasm: cargo not found on PATH` + identical
    assertion failure on base and on this tree. No cargo in the sandbox.
  - `fx/rollSafety` (line 229): node-side checks all ok on both trees, then
    the browser section dies with `page.evaluate: Target crashed` on both —
    byte-identical failure point and message. CI is authoritative.
- **`npm run format:check`: clean** on the whole tree. (Prettier reformatted
  three of my own selfcheck files during the build; all re-ran green.)
- **Touched-file sweep:** every suite naming a touched file was run —
  loisFace, roomDither, directorsMatrix, mindFace (7), mind (15), loisRank,
  loisJudge, loisTicker (7), directorRoom (7), swayMark (9), queenDeniability
  (7), retiredEmoji, fx/dither — all green.
- **e2e sweep:** only `e2e/room-codec.spec.js` references LOIS (`.codec-lois`
  data-code, Mind-driven, unaffected). No live surface or selector changed,
  so **no e2e re-pin was needed** — and none was skipped: the sweep was run,
  the hit was read, it does not touch the round.

## Screenshots — none, and why

The assignment asks for screenshots of a full round in Marks and one movement
chapter. **There are none, honestly:** the round is deliberately unwired
pending D2/D4, so no live action can drive a round to photograph. Faking them
would mean wiring the very behaviour the stop rule forbids. The evidence for
this slice is the suites and the machine transcripts (Marks: cut → redeal →
settle → flip; Swiss: pass → settle → flip) in `roundTable.selfcheck.mjs`.
`~/workspace/kc-1856-shots/` was not created. When D2/D4 are ruled and the
wiring lands, the shots become possible and owed.

## Lois pass

Read `~/workspace/kc-lois-persona.md`; applied the 9 rules to the design-facing
surfaces this slice creates (the CUT face, the judge's voice, the round record).

1. **The idea is the ad.** The round has one idea: *a hand is dealt, judged
   once, and what stands, stands.* Everything here serves it. Nothing decorates
   it. Pass.
2. **Kill your darlings.** Killed: the hash-picked CUT micro-expression in
   mindFace (a face that changes every load is not a face), the manual `'CUT'`
   append in roomDither (a rumour kept alive by string surgery). Both died so
   CUT could be one fact in one table.
3. **Say it in her voice or don't say it.** The judge's reasons are
   `loisVerdict`'s shipped lines, verbatim. No new LOIS copy was written
   anywhere in this slice except the face label — and see the Kill list.
4. **Scarcity is curation.** One cut per round, enforced by the shape of the
   machine, not by a counter someone can reset. LOIS does not get a second
   opinion. That is the whole character.
5. **Honesty is the contract.** An interrupted round's log shows no settle.
   A cut without a stated reason is refused — the machine returns the round
   untouched rather than pretend. The 24% cut rate is printed above, untuned.
6. **No hedging.** The stop on D2/D4 is stated at the top of this report, not
   buried. No default was smuggled in. Where I chose (round opens on the
   completed deal; directorsMatrix exclusion), the choice is named and
   overruleable.
7. **The performer is not the audience for the machinery.** Nothing live
   changed. No new panel, no new readout. When the wiring lands, the only
   performer-visible event is the pill going red — one signal, in LOIS's red.
8. **Restraint beats coverage.** CUT got no directors' rooms because the copy
   is signed and verbatim. A smaller true thing beats a bigger invented one.
9. **Ship the proof, not the promise.** 19 new checks, a 105-deal battery,
   full transcripts. The machine either does what this report says or the
   suites say so.

**Kill list:** kill the CUT micro-expression (done). Kill the manual face-code
append (done). Kill any future "cut chance" percentage knob before it is
proposed — LOIS cuts on gates or she doesn't cut. Kill the phrase "redeal"
anywhere performer-facing; the hand is dealt again, that's all.

One flag for Matt, bluntly: the CUT face label `'Cut. That one does not
stand.'` is the one line of new LOIS-voice copy in this slice. It follows the
voice of the shipped labels, but it is mine, not signed. If it isn't her, say
the word and it's replaced before publish.

## DECISION DOCUMENT — D2 and D4 (options + implications; no ruling made)

### D2 — LOIS's cut shape

**(a) Both shapes.** The machine is ready for either. But "both" needs a second
rule nobody has written: *which* shape does LOIS spend, when? Without a chooser
rule, both-shapes is two half-decisions. It also needs both sub-definitions
below. Note the tension: issue #1856's acceptance text reads "deal → cut
(**both shapes**) → redeal-from-smaller-pool", which presumes both shapes
exist; a kill-only or trim-only ruling requires amending that acceptance line.

**(b) Kill only.** LOIS rejects the hand; a new hand is dealt from a smaller
pool. Needs the **smaller-pool definition**, which the spec never gives:
the chapter deck minus the dealt look? A scope step-down? A fixed fraction?
Each reads differently at the table — minus-the-look is a grudge, step-down is
a narrowing, a fraction is a lottery. Post-kill, LOIS's one cut is spent, so
the redealt hand stands unjudged and settles by D4's path alone.

**(c) Trim only.** LOIS cuts one element from the standing hand; no redeal.
Needs the **element granularity**: the voice? One pool member? A look element?
Trimming the voice is the cheapest to build (the fixture executor proves it)
and the least violent to the performer's hand. No redeal machinery is needed
and the funnel never stalls waiting for a second deal.

### D4 — the settle trigger

**(a) Automatic on completion.** The wiring calls `settle()` the moment the
round enters `standing`. The board signal is the phase change itself. No new
surface, no new gesture, nothing for the performer to learn or forget mid-set.
The cost: the performer never *chooses* to stand — the book decides the hand
is final the moment LOIS is done with it.

**(b) Explicit performer lock gesture** (the League lock-in precedent, spec
§11). The round stands until the performer locks it. The problem: **the
gesture's surface is undesigned.** House law forbids a new panel. Candidates —
a tap on the standing chapter card, a START-pill long-press — are each a
design act, not an implementation detail. And until the gesture lands, S4's
CURATOR tap-3+ cadence collides with an unsettled standing round, which S4
must then read honestly (is an unlocked round narrowable?).

### Post-ruling wiring map (exact, for whoever lands it)

In `layoutSlice.js`, when D2 and D4 are ruled:

- At the `kineticVoicePass` commit: build the deal snapshot from
  `kineticLanding` + the dealt look/voice; `openRound` + `openJudgement` in
  the same `set()`.
- Judge with `loisCut.judgeDeal(landedLookParams, chapterDeckParams)` where
  the deck comes from `chapterScopeDeck`.
- Spend per D2: kill → re-deal from the ruled smaller pool inside the chapter
  deck; trim → drop the ruled element. Either way, `spendCut` with the
  judge's verdict (its `reason` is mandatory — a cut with no reason is
  refused by the machine).
- `settle()` per D4: (a) immediately on entering `standing`; (b) from the
  ruled gesture's action.
- Session field `kineticRound` beside `kineticLanding` — session-only, never
  serialized, not in undo snapshots (S2 precedent).
- Warm-tap actions call `absorbWarmTap`. `closeRound` on: `kineticLookPass`
  re-flip (via `'flip'`), chaos roll (via `'chaos'`), `kineticOpenPass`
  (via `'opener'`).
- `loisActivity` gains a `cut` flag + `noteCut`, following the `frameKept`
  pattern (set on spend, cleared on next roll/seed change), so the pill
  paints CUT in red.
- S4's CURATOR pass then reads the settled board.

## Files

Created: `app/src/state/roundTable.mjs`, `app/src/state/roundTable.selfcheck.mjs`,
`app/src/curator/loisCut.mjs`, `app/src/curator/loisCut.selfcheck.mjs`.
Edited: `app/src/curator/loisFace.js`, `app/src/curator/loisFace.selfcheck.mjs`,
`app/src/curator/roomDither.js`, `app/src/curator/roomDither.selfcheck.mjs`,
`app/src/curator/directorsMatrix.selfcheck.mjs`, `app/src/curator/mindFace.js`
(comment only), `app/src/styles/layout.css`, `app/selfcheck.manifest`.
Untouched on purpose: `layoutSlice.js`, the store, `loisActivity`, all
one-writer files, `STAGING-REPORT-1855.md`, `STAGING-REPORT.md`.
