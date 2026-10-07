# KC-1 — phases to get back on track

**Date:** 2026-10-05. **Ordered by Matt** on that date (decisions at the end). `ROADMAP_V1.md` carries the summary; this is the detail.
**Built from:** the open issue list and `ROADMAP_V1.md`, both checked against the code on `origin/main`.

## The idea

The roadmap's own rule is "no phase advances with carryover". It stopped being followed, so this list restores it with shorter phases. Each phase has **one goal, a fixed list, and an exit you can check in an afternoon.** New ideas go to the parking list at the bottom, not into the current phase. **PATTERN is the one exception: it runs as its own lane, starting now** (Matt's call).

Order of priorities: **true → proven → safe → honest → consistent → playable → new.**

## Where we are (2026-10-05)

**Phases 0 to 3 are closed. Phase 4 is open.** The PATTERN lane runs alongside.

- **Phase 0, closed:** roadmap synced (PR #1054), #248 settled at six tabs, `main` protected with five required checks, a `Closes #N` line now required on every PR (PR #1055), merged branches auto-delete. One item carried: PR #1050 still needs its three fixes, and it now lives in Phase 3 with #980.
- **Phase 1, closed on Matt's word:** Matt signed Stage 1 and Stage 2 on 2026-10-05 **without running the recorded set or the stranger link test**. Both stay available as optional checks at any time; neither blocks anything. The half-float accum audit is waived with them.
- **Phase 2, closed 2026-10-06:** #1052, #1053 and #1051 shipped.
- **Phase 3, closed 2026-10-06:** #1023, #1022, #1046, #1048, #1037 and #980 shipped.
- **Phase 4, open now:** M1 (#1027) and M2 (#1028) shipped; M3 onward next.

## Summary

| Phase | Goal | Work | Exit |
|---|---|---|---|
| 0 ✅ | Square the books | Roadmap sync, #248, PR #1050, process fixes | Roadmap matches the tracker |
| 1 ✅ | Prove what's built | Signed on Matt's word; the two tests were not run | Stage 1 and 2 signed |
| 2 ← now | Make work safe | #1051, #1052, #1053 | Wipe and restore from one file |
| 3 | Honest UI | #1023, #1022, #1046, #1048, #1037, #980 | No control shows what the engine doesn't do |
| 4 | One look | #1027–#1033, #1043 | Design system §9 holds |
| 5 | Playable on stage | MIDI bind, FM-1, real-GPU check, #617, #608 | One set with a controller and a projector |
| PATTERN lane | New voice, in parallel from now | #1039–#1042, #1049 | PATTERN spec acceptance |
| — | Release | Stage 4 remainder | v1.0 |

---

## Phase 0 — Square the books

No feature code. A day or two.

1. **Freeze intake, except PATTERN.** New ideas are filed and parked, not specced or built, until Phase 3 exits. PATTERN keeps moving in its own lane.
2. **Sync `ROADMAP_V1.md`** to the tracker: Stage 2's three items closed (#534, #535, #536), #607 and #270 closed, and an "unplaced" list for everything below.
3. **#248 is settled: six secondary tabs (ASSETS, BUILD, DIRECTOR, STIMULI, PLAY, PIPELINE) plus DEV is the end state.** The "4-tab cap" principle is retired and `PANEL_CONSOLIDATION_PLAN.md` Phases 6–12 are superseded.
4. **Decide PR #1050** (#980 auto-setup). It is open with a **failing check** and no `Closes #980` line. It also uses a "coarse fallback on silence", where your decision on #980 was to change nothing and say there is no signal. **Decision: fix it to match, then merge.** The three fixes are on the PR.
5. **Fix the lane instructions** that say "Matt closes issues himself". `CLAUDE.md` requires `Closes #N`.
6. **Say what the version means.** It is still 0.9.0 with two stages' items closed.

**Exit:** the roadmap matches the tracker, and no open PR contradicts a recorded decision.

## Phase 1 — Prove what is built

No feature code. This phase produces a list, not a diff.

1. **Play one 30-minute set and record it, this week, on `main` as it is** (trackpad and mic). Write down everything that broke, lagged or lied.
2. **Send one share link to one person** who has never seen KC-1. Watch what happens.
3. **Close or waive the half-float accum audit** the roadmap still marks unverified.

**Exit:** Stage 1 ("nothing feels wrong") and Stage 2 ("a stranger lands in your composition") are each signed or failed in writing. The break list from the set becomes the input to Phases 2, 3 and 5, and may reorder them.

## Phase 2 — Make work safe

Three issues, filed 2026-10-05. None depends on anything else.

| Work | Why | Size |
|---|---|---|
| **#1051 Export-everything bundle**: project, palettes, hits and favorites in one file, and import it back | Clearing browser data is total loss today, and the taste model learns from those keeps | M |
| **#1052 Unprocessed audio input**: turn off Chrome's echo cancellation, noise suppression and auto gain | They pump and duck music before STIMULI sees it | S |
| **#1053 Audio device-loss handling**: notice an unplugged input and say so | The analyser goes silent with no warning today | S |

**Exit:** clear the browser's data, import one file, and everything is back. Unplug the audio input mid-run and the app says so.

## Phase 3 — Honest UI

Every item is a place where the screen says something the engine does not do. All are specced, with your decisions recorded on each issue.

Order matters here:

1. **#1023** — HUE ROTATE wet slider stops at the 50% ceiling. S.
2. **#1022** — fill the Blur slot with SHARPEN and HAZE. M.
3. **#1046** — FX editor sizes to its content. After #1022.
4. **#1048** — enforce FX before MATH in the fold, with project migration. M. Read before building: it changes how some saved projects render.
5. **#1037** — layer list reads MATH / FX / CONTENT, rows flipped. After #1048.
6. **#980** — STIMULI auto-setup, via PR #1050 once its three fixes are in.

**Exit:** on a walk through BUILD and STIMULI, no slider, slot or list shows something the renderer ignores. The layer list matches the fold.

## Phase 4 — One look

The design-system migration, in the order `DESIGN_SYSTEM_MIGRATION.md` already gives. All have specs.

1. **#1027** M1 one slider
2. **#1028** M2 glyphs
3. **#1029** M3 casing, with **#1030** M4 pink
4. **#1031** M6 density, with **#1033** M8 radii and dropdowns
5. **#1032** M7 LOIS lines (signed)
6. **#1043** Help modal and About. Placed last because its spec uses the M3 casing classes. Needs your photo and the five link targets.

Phase 3 goes first because both phases edit `LayerStack.jsx`. Doing the behaviour fixes first means the restyle touches settled code.

**Exit:** `DESIGN_SYSTEM.md` §9: every slider feels the same, pink only means live, no label changes case between rooms.

## Phase 5 — Playable on stage

Roadmap Stage 3. Part of it waits on hardware, and that part should not block the rest.

| Work | Status |
|---|---|
| Run the FM-1 arrival-day tests (Matt's local FM-1 notes) | Waits for the unit |
| A way to bind a MIDI key in the UI, or un-defer learn (**#617**) | Needs any MIDI device |
| Palette and voice picker targets, a bank layer, an on-screen key legend | After bind |
| Performance checked on real hardware, with numbers written down | Not filed. CI only runs a software renderer. |
| **#608** Syphon output | Blocked on hardware |
| MIDI clock out | Later, and reopens #617's scope |

**Exit:** one set played with a controller and a second display, with no fallback to the trackpad.

## PATTERN lane — runs in parallel, starting now

Matt's call: PATTERN is exempt from the freeze and does not wait for Phases 0–5. It is almost all new files, so it should rarely collide with the fixes. Where it does touch shared code (palettes, the BEAT clock, the track list), the one-writer rule and one-fix-per-PR still apply.

1. **#1039** engine and FIELD
2. **#1040** QUILT
3. **#1049** palette swatch weights (Matt reviews the contact sheet)
4. **#1041** GLYPH
5. **#1042** motion, DROP and bar-quantized SHUFFLE

**Exit:** the acceptance list in `PATTERN_SPEC.md`.

**Cost to watch:** this splits Matt's review time across two lanes. If Phase 0–3 PRs start queuing behind PATTERN reviews, pause the PATTERN lane, not the fixes.

## Release

What remains of roadmap Stage 4 after the above: the docs and examples layer, release notes, and the version bump to 1.0.

---

## Parked — not in any phase

| Item | Why parked |
|---|---|
| **#762** taste runbook on the Mac Studio | Blocked on hardware |
| **#926** richer taste features | Contingent on #762's result |
| GPU trail field and curl-wind (roadmap Stage 3) | Ordered in September, no code found; not needed for a set |
| OSC, mobile touch work | Not needed for a first set |
| FM-1 as a live sound source, KC-1 driving the FM-1 | Decided against 2026-10-05: one stock FM-1 cannot be a silent controller and the live sound source at once |
| A parameter registry, types on the contracts | Good ideas from the review, but a refactor. Revisit after Phase 4. |

## Rules for running this

- One numbered phase open at a time, plus the PATTERN lane. Hardware-blocked items wait without holding the phase.
- One fix per PR, with a literal `Closes #N`.
- A decision comment on an issue outranks an agent's prompt.
- A new idea during a phase goes to Parked, unless it is PATTERN.
- At each exit, update `ROADMAP_V1.md` before the next phase starts.

## Decisions (Matt, 2026-10-05)

| Question | Decision |
|---|---|
| Freeze | Yes, from now, **except PATTERN** |
| PATTERN | Its own lane, starting now |
| #248 tabs | Six secondary tabs plus DEV is the end state |
| PR #1050 | Fix to match the #980 decisions, then merge |
| The set | This week, on `main` as it is |
| Phase 2 issues | Filed: #1051, #1052, #1053 |

## Still open

- Does the version number move on closed items or on signed exit gates? It is 0.9.0 today.
- The lane instruction that says "Matt closes issues himself" still needs correcting at its source. `CLAUDE.md` requires `Closes #N`.
