# STAGING REPORT — #2488 (A10): WetLab CULTIVATE silently stalls while the loop is paused

Branch `feat/2488-cultivate-paused`, base `f65b8a4a` (current main). Local commit only — no push, no PR.

## Verdict

The filed hypothesis — the dry-run cannot advance while the loop is paused — is **not the
mechanism**. Nothing about the dry-run rides the loop at all. The defect is an invocation that
does not invoke: the record's CULTIVATE chip press only **opened** the dry-run panel; the
dry-run itself was bound exclusively to a second, identically labelled press inside the panel,
and the panel's standing text never said so. The panel therefore sat at "not cultivated yet"
indefinitely, in **any** loop state. The stress session's PERF PAUSED was coincident — it made
the stall read as loop starvation, and the panel gave no information to correct that read.

Fix shape: **combination** — the chip press now performs the dry-run for an uncultivated record
(the act the label promises), and the panel's uncultivated line names the press it waits for
(the A7/#2485 honesty discipline) for the states that can still reach it. Preference (a) from
the brief — advance on its own clock — is inapplicable: there is no process to advance. The
reads are an instantaneous pure derivation; the only clocked element, the sketch, already runs
on its own clock.

## Root cause, with evidence

The machinery, read on this tree (the cultivate surface is byte-identical between the stress
build `f260b74` and this base — `git log f260b74..f65b8a4a` over the cultivate files is empty):

- The reads are pure and synchronous: `cultivationNote(record, bodyAsset, seed)`
  (`app/src/components/cultivate.model.mjs`) derives cost/integrity/warnings from the record;
  the write is a zustand `set` through the one door (`cultivateCreature` in
  `app/src/state/slices/globalSlice.js` → `withCultivation` → `sanitizeCreatureRecord`).
  No clock, no tick, no loop involvement anywhere on the path.
- The sketch is not loop-driven either: `CreatureMiniature` advances on its own
  `requestAnimationFrame` + `performance.now()` clock.
- The performer's press, however, was wired to neither: in `app/src/panels/WetLab.jsx`, the
  `record-cultivate` chip's `onClick` was `() => setCultivateOpen((cur) => !cur)` — it only
  toggled the panel open (hence the filed "button becomes pressed": the chip is
  `aria-pressed`). The derivation was bound only to the panel's inner `cultivate-run` button
  in `CreatureCultivate.jsx`, also labelled "cultivate". The panel's uncultivated state
  rendered the bare line "not cultivated yet" — no mention of a second press.

Reproduced in the built app (Playwright, this tree, parents banked and a child bred through
the store's own actions, WetLab driven by DOM presses):

- **Loop running** (`running: true, slowRender: false`): one chip press → `aria-pressed`
  true; after 3.5 s the store record still had `cultivated: null`, the panel read
  "CULTIVATE · CR-585C8B3B — not cultivated yet", no `cultivate-note` element. The filed
  repro, verbatim, with no pause anywhere.
- **Filed fold** (`running: false, slowRender: true` — PERF PAUSED): the identical stall on
  a second record.
- In **both** states, pressing the panel's inner run button then landed the note
  **immediately** (`{seed, outcome: 'viable', cost, warnings}` written, all three reads
  rendered). A process that completes instantly while PERF PAUSED stands was never waiting
  for the loop.

Which pause did the repro hit? The watchdog's PERF PAUSED stood in the session, but it is
causally irrelevant: the stall occurs with the loop running, and the cure (the second press)
works with the loop stopped. The transport pause is equally uninvolved — the write path has
no paused branch.

## The fix

Two files of production code; no one-writer file touched (`liveLoop.mjs`, `liveResolve.mjs`,
`particles.js` untouched — no seam stop needed).

1. **`app/src/panels/WetLab.jsx`** — the chip press is the dry-run for an uncultivated
   record. On the opening press, if the selected record carries no note, the lab derives the
   note exactly as the panel does (`cultivationNote(selRecord, selBodyAsset, seed)` — same
   record, same body asset, same project seed) and writes it through the same door
   (`cultivateCreature`). The panel then opens on the reads. Boundaries held:
   - a record with a standing note is **never silently re-run** — the write is gated on
     `!selRecord.cultivated`; re-cultivation stays the panel's explicit "cultivate again"
     press (pinned in the browser section: a close/reopen leaves the standing note
     byte-identical);
   - closing the panel writes nothing; the beast panel (live reads, no note) is untouched;
   - CULTIVATE still never injects and never blocks injection — the store action writes the
     record alone, as before.
2. **`app/src/components/CreatureCultivate.jsx`** — the uncultivated line now names its
   press: "not cultivated yet — press cultivate to run the dry-run" (plus a header note
   recording the #2488 wiring). This state is still reachable — a hand edit retires a note
   while the panel stands open; a refused write leaves the record uncultivated beside the
   panel's existing feedback line — and it no longer sits silent about what it waits for.

Supporting change: **`app/src/engine/creatureAssembler.selfcheck.mjs`** — the new pin reads
`creatureRecords`, so it is entered in that suite's stage-reader census with an explanatory
comment, exactly as the #2339/#2340/#2341 suites were entered before it. No assertion in
that suite was weakened; the census list grew by one named test.

No registry change: the agent-UI registry already describes `wetlab.cultivate` as
"Cultivates a creature with a written note" — the fix makes the description true of the
chip press.

## The pin — `app/src/components/cultivatePress.selfcheck.mjs` (registered in `app/selfcheck.manifest`)

- **Section A (source):** the lab imports the model and selects the door; the chip handler
  carries the gated write (`if (!cultivateOpen && !selRecord.cultivated)` +
  `cultivateCreature(selRecord.id, cultivationNote(selRecord, selBodyAsset, seed))`) and
  still toggles the panel; the panel's uncultivated line names the press; the panel's own
  press remains the re-run.
- **Section B (browser, built app):** banks three parents and breeds a child through the
  store's own actions, opens the WetLab by DOM, and asserts: (1) with the loop running,
  **one** chip press lands the child's note, stamped with the project seed, and the panel
  opens on the reads; (2) a close/reopen leaves the standing note byte-identical;
  (3) in the filed PERF PAUSED fold (`running: false, slowRender: true`), one press on an
  uncultivated parent still cultivates, with the fold still standing afterwards; (4) no
  page errors. Navigation and presses are state-verified infrastructure (overlay Escape, DOM-click
  fallback on the dock tab, Space-resume if the sandbox watchdog tripped during boot);
  every assertion stays strict.

**Discrimination (A/B, scratch worktree at pristine `f65b8a4a`):**

- Full pin on base: **FAIL**, exit 1 — `AssertionError: WetLab must import cultivationNote`
  (first source pin).
- Pin with section A neutered in the scratch copy only, so the browser section runs against
  base behaviour: **FAIL**, exit 1 — `Error: one CULTIVATE press never cultivated
  cr-5dd2330b — the panel is stalled at 'not cultivated yet'`. The pin fails on the base
  tree for exactly the reported behaviour.
- Full pin on the fixed tree: **PASS** — `cultivatePress.selfcheck: ok (8 groups)`, browser
  section genuinely run (no skip suffix). The standalone probe of the same walk on the
  fixed build shows the panel opening on "cultivated under seed … · viable · cost … ·
  integrity · viable" after one press, in both loop states.

## Verification

- Targeted + neighbour suites, all exit 0: cultivate (62 checks), cultivatePress (8
  groups), strandBank (47), wetLab, wetLabBeast (8), wetLabDeal (9), creatureAssembler
  (11, with the census entry), creatureAdapter (13), kineticBirths, assetAttach,
  beastSettings (7), typeExclusivity, foldInCensus (11), uiRegistry (333 controls).
- `npm run format:check` — clean. `npm run lint` — 0 errors, 11 warnings (the standing
  count on this tree, all pre-existing).
- `npm run build` — green.
- Full manifest sweep (839 suites, run in chunks against a heavily loaded sandbox —
  a sibling lane was running browser suites in parallel throughout, with repeated
  OOM kills of bystanding processes): **834 PASS / 5 FAIL**, every failure classified
  against a pristine-`f65b8a4a` A/B:
  - `swarmWasm` exit 1 — base exits 1 identically. Sandbox-environmental.
  - `accum` exit 134 (abort) — base exits 134 identically. Sandbox-environmental.
  - `rollSafety` — base exits 1; on the fixed tree its Node groups pass (5/5) and its
    browser section dies on a closed target page under sandbox memory pressure (the
    run hit the sweep's 600 s cap). The suite's browser section cannot complete in
    this sandbox on either tree. Sandbox-environmental.
  - `resolverProbe` exit 1 — a wall-clock budget assertion ("resolver mean with four
    creatures … ms (budget 5)"): pristine base fails with the same assertion in the
    same load window (7.468 ms vs the fixed tree's 9.268 ms) and passes in quieter
    windows (base exit 0 measured). Load-dependent, base-identical in kind; the change
    touches nothing on the resolver path.
  - `cultivatePress` exit 1 **in-sweep only** — the pin's pre-hardening form starved
    on a Playwright click-stability wait under sweep load (the core one-press group
    had already passed in that run). The shipped pin hardens exactly those mechanics
    (state-verified, single-shot presses; DOM-presence polls instead of visibility
    waits; state-verified WetLab opening) while keeping every assertion strict.
    Sandbox stability record for the shipped form: passes in the final consecutive
    standalone runs (and 8 of 11 standalone attempts across its hardened forms);
    every failure traced to a harness-starvation timeout at a named
    pointer/navigation step, never to an assertion about the fix — the same profile
    the A8 pin showed in this sandbox before passing CI, which remains the deciding
    vote. The discriminating group (one press cultivates, loop running) passed in
    every fixed-tree run and failed on base as designed.

## Lane routing note

Routing is the coordinator's call; the facts that bear on it:

- The performer-visible change is the defect's own behaviour, corrected: pressing the
  record's CULTIVATE chip now cultivates (the panel opens on the reads instead of the
  waiting line). No new surface, no layout change, no copy beyond the one honest line in
  the uncultivated state and the chip doing what its label and title already promised
  ("Cultivate {id} — dry-run it before stage injection").
- One behaviour worth naming plainly: opening the cultivate panel on an uncultivated
  record now writes that record's cultivation note (through the existing door, with the
  project seed) where before it took the panel's second press. The write is the dry-run
  itself — the act the chip invokes — and a standing note is never re-written by opening.
- Nothing else moves: injection, breeding, genome edits, beasts, and every stage surface
  are untouched; the note's shape and the door's law are unchanged (the existing cultivate
  suite's 62 checks pass unmodified).
