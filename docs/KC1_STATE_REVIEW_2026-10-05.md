# KC-1 state review and roadmap review

**Date:** 2026-10-05. **For:** Matt. **Status:** draft, one reviewer's opinion. Nothing here is ordered work, and `ROADMAP_V1.md` has not been edited.

## Basis and limits

- Read: `ROADMAP_V1.md`, about 25 open issues and their specs, the design-system docs, `PATTERN_SPEC.md`, and parts of the engine, MIDI, audio, layer and state code on `origin/main` (98dca66).
- Checked against the tracker and the code where a claim mattered. Those are marked **checked**.
- **Not done:** the app was not run and no set was watched. Nothing here judges how KC-1 feels. Performance was not measured.

### Corrections to what I said earlier in chat

- I said shareable recipe URLs were unbuilt. **Wrong.** #534 closed on 2026-10-03 and the code is live (`state/recipeUrls.js`, share link in the favorites tray, hash boot in `useProjectAutosave.js`). I took the roadmap's Stage 2 text at face value, and that text is stale. This is itself a roadmap finding (Part 2).
- I called #878 an issue. It is a merged PR that added the deferred seams for the stage window, Syphon and MIDI learn.

---

# Part 1 — State of KC-1

## What is strong

- **A verified engine.** 226 selfcheck files over 545 source files, a browser selfcheck job in CI, and a "LIVE or cut" rule that has actually been used to cut dead code.
- **Determinism as a product feature.** Seeds are stored integers, and a composition already travels as a URL.
- **Honesty rules that are written down.** The governor sheds resolution before anything visible is cut, and the roadmap flags its own disputed items rather than hiding them.

## Weaknesses

| # | Weakness | Evidence |
|---|---|---|
| 1 | **It has not survived a real set.** The performance path is the thinnest part. | MIDI learn is a stub; there is no UI to bind a key (`MidiSection.jsx` only lists and removes). The native Tauri shell cannot do Web MIDI. Syphon (#608) is unbuilt. **Checked.** |
| 2 | **Audio input is not stage-safe.** | `useAudioInput.js` calls `getUserMedia` with no processing constraints, so Chrome's echo cancellation, noise suppression and auto gain are on. There is no device-loss handling. **Checked.** |
| 3 | **The UI claims things the engine does not do.** | This week: a wet slider showing values the renderer ignores (#1023), an FX slot that can never hold an effect (#1022), an editor that opens onto a void (#1046), a layer list drawn against the fold (#1037). |
| 4 | **Your work is not safe.** | The only backup is a rolling `localStorage` slot (`projectDocument.js`). Favorites and user palettes ride in no export. #537 closed without the export-everything bundle. **Checked.** |
| 5 | **Decisions do not hold across agent lanes.** | PR #1047 built the opposite of the #1022 decision 13 minutes after it was posted. #1017 and #1018 merged without `Closes` lines and stayed open. #248 is closed while its plan is about 70% done. |
| 6 | **Scope arrives faster than stages close.** | 19 open issues sit in no roadmap stage (Part 2). About 1,000 commits landed in 30 days, with one person merging and feel-testing. |
| 7 | **No measure of real performance.** | CI runs on a software renderer. Every 60fps acceptance in the specs reads "manual, on Matt's Mac". |
| 8 | **The same parameter is described in several hand-kept lists.** | Slider specs (`layout-modes.js`), MIDI targets (`midi/targets.mjs`), stimuli targets, macro labels (`mathMacros.js`), help copy (`helpCopy.js`). They can drift, and weakness 3 is what drift looks like. |
| 9 | **No types on the contracts.** | Zero TypeScript files. The project document and the scene contract are both migrated by hand-written normalizers. **Checked.** |

## What you are missing

- **A second person.** Every exit gate is "Matt plays it and nothing feels wrong." Stage 2's exit is "a stranger opens your link and lands in your composition." The link exists. I found no record that a stranger has tried it.
- **A recorded set.** One 30-minute run would order this backlog better than another audit.
- **A freeze.** Nothing in the process ever stops intake.
- **One place where decisions live.** They are spread over issue comments, `DECISIONS.md`, the roadmap, the design-system docs and agent prompts. Weakness 5 follows from that.

## What I would do differently, knowing what is built

1. **One parameter registry that generates everything** (slider, MIDI target, MOD target, macro label, help line). A new parameter is one entry, and the UI cannot describe something the engine lacks.
2. **Design system before panels.** It was written after eight panels existed, which is why there are 6 dropdown looks and about 45 stray radii to migrate now.
3. **Types on the two contracts first**: the project document and the scene contract.
4. **Play a set in month two**, before the feature count grew.
5. **Choose the shell early.** Tauri and Chrome now have different abilities (MIDI works in one, the stage window in the other).

None of this argues for a rewrite. Items 1 and 3 can be adopted piece by piece.

---

# Part 2 — Roadmap review (`docs/ROADMAP_V1.md`)

Last edited 2026-10-03. `app/package.json` still says **0.9.0**.

## Stage by stage

| Stage | Roadmap says | Tracker and code say | Verdict |
|---|---|---|---|
| **1 · PLAY (v0.10)** | All tracked items closed. Exit gate "Matt plays it and nothing feels wrong" remains. Half-float accum audit "unverified". | Nothing newer found. | **Not exited.** Needs your sign-off and the one audit, or an explicit waiver. |
| **2 · SHARE (v0.11)** | Shareable recipe URLs, help/tour re-aim and the lowercase label pass are listed as to-do. | #534, #535, #536 all **closed 2026-10-03**. Share link is in the favorites tray. **Checked.** | **Stale.** The three headline items shipped. What is left: the UX-audit quick wins (waiting on your nod) and the exit test with a real stranger. |
| **3 · PERFORM (v0.12)** | MIDI engine merged, learn open. #607 and #608 open. Mobile pass to do. GPU trail field and curl-wind ordered. | #607 **closed**. #270 **closed**. #608 and #617 open, blocked on hardware. No GPU trail-field or curl-wind code found. | **Partly stale.** Live output is further along than stated. The two GPU fields look unstarted. |
| **4 · RELEASE (v1.0)** | #248 status disputed, your call. Export-everything bundle open. | Still 6 secondary tabs (ASSETS, BUILD, DIRECTOR, STIMULI, PLAY, PIPELINE) plus DEV. No bundle. **Checked.** | **Still blocked on the #248 call.** |

## Findings

1. **The version never moved.** Stage 1's and Stage 2's tracked items are closed, but the app is still 0.9.0. Either the stages are not really done (the exit gates say so) or the version is not tracking them.
2. **The phase-gate rule is not being followed.** "No phase advances with carryover" — yet Stage 2 and Stage 3 work shipped while Stage 1's exit gate is unsigned.
3. **The roadmap is no longer the ordering surface.** 19 open issues are in no stage:
   - PATTERN (#1039–#1042, #1049), ordered by `PATTERN_SPEC.md`'s own build order.
   - Design system (#1027–#1033), ordered by `DESIGN_SYSTEM_MIGRATION.md`'s own sequencing.
   - Layers (#1022, #1023, #1037, #1046, #1048), Help (#1043), STIMULI auto-setup (#980).
   Only 4 open issues carry an `order:` label. So three documents now order work, and the roadmap is the oldest.
4. **"4-tab cap holds" is dead in practice.** The principle is still in the roadmap, but `DESIGN_SYSTEM.md` §2.7 codifies an eight-tab bar. The #248 question has been answered by the design system without anyone recording the answer.
5. **Work since 2026-10-03 is invisible in it.** MATH tracks (#1010), the layer-stack rebuild (#1013–#1019), the LOIS pill, the design system and PATTERN are not mentioned.
6. **Two things it never had.** A real-GPU performance gate, and a stage-safety pass on audio input (weakness 2). Both belong in Stage 3's exit, "KC-1 survives contact with a real set".
7. **The dead-list has no owner or date.** It names items to wire or cut "at each gate", and no gate has been called since.

## Suggested roadmap edits (for you to make or order)

1. Mark Stage 2's three items done, with the issue numbers and dates. Leave the stranger test as the exit.
2. Update Stage 3: #607 and #270 closed; add "unprocessed audio input", "audio device-loss handling", "manual MIDI bind or learn" and "performance checked on real hardware" to the exit.
3. Replace the "4-tab cap" principle with whatever is true, and close the #248 dispute in one line.
4. Add an **Unplaced** section that lists the 19 issues and says which stage each belongs to, or that it waits.
5. Either bump the version to match closed stages, or state that the version only moves on signed exit gates.
6. Add one line naming where decisions are recorded, and that a decision comment on an issue outranks an agent's prompt.

## A possible order from here

Yours to change. It follows the roadmap's own rule of closing a stage before opening the next.

1. **Freeze new feature intake.**
2. **Play and record one 30-minute set.** List what broke. This signs or fails Stage 1.
3. **Send one share link to one person.** This signs or fails Stage 2.
4. **Safety:** the export-everything bundle (pulled forward from Stage 4, because of weakness 4).
5. **Stage safety:** the two audio-input fixes, then the UI-honesty fixes already specced (#1023, #1022, #1046).
6. **Settle #248** and correct the roadmap.
7. **Then** design-system migration, then PATTERN.

## Decisions needed from Matt

1. Is Stage 1 exited? If not, what is still wrong when you play it?
2. #248: is the current tab bar the accepted end state?
3. Does the phase-gate rule still stand, or is parallel stage work now allowed?
4. Where do PATTERN and the design-system migration sit relative to Stages 2–4?
5. Should the export-everything bundle move ahead of new features?
