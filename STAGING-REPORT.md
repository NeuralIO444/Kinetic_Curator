# K4 — census readouts (#1592) — STAGING REPORT

Branch `ember/1592-keeps-census` on the K3 tip (`ember/1591-keeps-disk`).
Local staging only — no push, no PR. The Keeps stack is complete with
this stage: K1 tiers · K2 fill · K3 disk · K4 readouts.

## What shipped

The explorer's census is the shelf's natural home — **no new panel**.
DEV → CENSUS gains a **KEEPS SHELF** section reading the live store,
and the readout itself is one pure view, `shelfCensusView`, in
`app/src/curator/censusReadout.mjs` — the census discipline the issue
demands: a tally of the records handed to it (records + history
ledger + disk stubs/records + the prefs in force), measuring nothing
itself. Read-only: nothing in this stage changes shelf behaviour.

Three readouts, all tracing to ledger records:

- **Tier counts (live):** stage keeps and slots used of the 16-slot
  budget (via shelf.mjs's own `stageSlotsUsed`, so the E3 slot
  accounting — hand 1, mined 2 — has one truth), collection (in-app,
  off stage), disk split read / unread / missing, shelf total, and
  the in-app count against the soft bound.
- **Fill-rule distribution over the last 10 fills** (the window,
  `SHELF_CENSUS_FILL_WINDOW = 10`, is stated in the tab): slots dealt
  per rule and the fills each rule dealt in — **including the rules
  that dealt nothing**, which show their zero and the fills that named
  them undealt instead of backfilling.
- **Neglect coverage:** the share of the whole shelf that has ever
  reached the stage, the never-staged count, and the **longest-
  unstaged tail by name** — the off-stage keeps ordered exactly as
  the fill's neglected rule reads them (`byNeglect` from shelfFill:
  staged count, then least-recently staged, then oldest kept) — so
  the census tail IS the neglected rule's queue. Capped at 8 shown
  (`SHELF_CENSUS_TAIL`), with the remainder counted in words.

Plus the **wiring block** — the dead/alive census discipline for the
knobs this stack introduced. Each setting is named with its measured
footprint from the same tally, so a knob that stopped biting would
show a dead footprint instead of a plausible number:

- sway table (in force) → slots dealt + distinct keeps in the window
- recency window → distinct keeps the window's fills actually staged
- collection soft bound → in-app count vs the bound (over-count named)
- export prefs → exports/imports counted in the ledger

And the ledger's move totals: crowns · swaps · exports · imports,
and the anchor's honesty line (partial, with the unread disk count,
when the folder's keeps are unread — audit S5 carried into the census).

**An empty shelf says so in words** ("the shelf is empty — nothing
kept, nothing staged, nothing on disk; there is nothing to count
yet") instead of rendering zeros with confidence; a shelf with no
fills yet gets words instead of a zero distribution table.

Files:
- `app/src/curator/censusReadout.mjs` — `shelfCensusView` + the two
  window constants; a header note records that this one view's input
  is live shelf state rather than a snapshot artifact, by design
  (the shelf's census is telemetry of the instrument as it stands).
- `app/src/panels/CensusPanel.jsx` — the KEEPS SHELF section on top
  of the existing artifact readout; keep labels built the
  ShelfDevPanel way (`shelfRow`; stubs fall back to their stored
  label). No devTabs/registry change — the section lives inside the
  census tab the issue names.
- `app/src/curator/shelf.mjs` — header comment only: the K1 header
  said census readouts were "deliberately absent, not stubbed" for
  K4; it now points at the shipped readout.
- `app/src/curator/shelfCensus.selfcheck.mjs` (new, manifest-
  registered right after censusReadout) — the acceptance suite.

## Readout evidence — a populated fixture shelf, all three tiers

A real store booted with 30 keeps (4 pre-staged), two real fills at
the shipped FULL WEIRD table, then the soft bound set to 24 and a
real export run pushing 6 keeps to a fake loot folder. The readout,
in the panel's own lines:

```
KEEPS SHELF (#1592) — live, from the ledger
stage 16 keeps · 16/16 slots — collection 8 in-app — disk 6 (6 read · 0 unread) — total 30 keeps.
soft bound 24: under · ledger: 0 crowns · 0 swaps · 6 exports · 0 imports · anchor full weight
FILL RULES — last 10 fills: 2 of 2 fills · 32 slots dealt · 29 distinct keeps · last table: shipped defaults · FULL WEIRD
  consensus   dealt 16 · fills 2 · undealt 0
  neglected   dealt 6 · fills 2 · undealt 0
  wild        dealt 4 · fills 2 · undealt 0
  lois        dealt 4 · fills 2 · undealt 0
  contrarian  dealt 2 · fills 2 · undealt 0
  pinned      dealt 0 · fills 0 · undealt 0
NEGLECT — 29 of 30 keeps have reached the stage — coverage 97% · 1 never staged.
  tail: (8 longest-unstaged keeps by name — the one never-staged keep,
         now on disk, heads the tail; the rest are staged-once keeps
         from the first fill, disk keeps before in-app, in neglect order)
WIRING — settings in force, and their footprints
  sway table FULL WEIRD — consensus 8 · neglected 3 · wild 2 · lois 2 · contrarian 1 — 32 slots dealt across the last 2 fills (29 distinct keeps)
  recency window 2 fills — 29 distinct keeps reached the stage in the window — the rotation the window produces
  collection soft bound 24 — the shelf stands at 24 in-app — under the bound
  export on soft bound: export · folder looks · stills in — 6 exports · 0 imports in the ledger
```

(The fixture keeps share one seed/config, so their shelf labels read
identically — a fixture artifact, not a readout one; the suite's
pure-fixture block pins named labels individually.)

## Verification

- **shelfCensus.selfcheck — PASS**, five blocks:
  - **P (pure fixture, hand-counted):** 11 keeps across all tiers,
    12 fills (window keeps the last 10), a swap, 2 exports, 1 import,
    a missing disk file. Every figure asserted against counts made by
    hand from the fixture: tiers (stage 2, slots 3 = 1 hand + 1 mined,
    collection 6, disk 3 = 1 read / 2 unread / 1 missing, total 11),
    the full distribution including contrarian's and pinned's zeros
    and lois's undealt count of 2, staged-ever 7 of 11 by the union
    of stage membership + ledger + stamps, the tail's exact order.
    Inputs deep-frozen; the view called twice gives identical output.
  - **P2:** empty shelf and never-filled shelf both speak in words;
    standing on the stage counts as staged.
  - **S (the acceptance):** a real store, 30 keeps — every readout
    figure equals an independent in-test recount straight from the
    ledger, before and after a real `fillStage()`. **Neglect
    coverage moved 4 → 16 of 30 staged-ever after one fill, and
    every keep the neglected rule dealt was never-staged before the
    fill** — the issue's before/after success evidence.
  - **W (wiring alive):** the bound set to 10 flips the readout to
    "14 over the bound"; a consensus-only table is named in force by
    the readout and the next fill's deal follows it (no neglected /
    wild / lois / contrarian slots dealt).
  - **D (disk):** after a real export run at bound 5, the readout's
    tiers span app + disk (3 on disk, all read; 5 in-app; total still
    8 — nothing lost in the move) and match the recount.
- **Neighbours — all PASS:** shelf, shelfFill, shelfPrefs, shelfDisk,
  shelfDiskRun, candidateTray, census, censusReadout, devPanel.
- **`npm run build` — green.**
- **Full manifest sweep — 432 pass / 5 fail of 437** (terminal
  result; an interim figure in an early draft of this report was
  wrong and is corrected here). The five failures:
  - swarmWasm, accum, rollSafety — the known sandbox set (no cargo
    in the sandbox; V8 OOM abort; sandbox browser closes mid-run —
    CI is rollSafety's authority and passed it inside
    lint-build-selfcheck on #1617).
  - **director + lootWeb — NOT K4 regressions, and not sandbox
    flakes.** Both are stale scan assertions at the K3 staging tip
    itself: K3's governed write verb made `lootWeb.mjs` legitimately
    use `createWritable`, outrunning lootWeb's pre-K3 purity pin;
    and director's no-surface scan matched substrings, false-
    positiving on `loot/lootWrite.selfcheck.mjs`. Proven
    base-identical: both suites fail (exit 1) on a pristine checkout
    of this branch's fork point (7b21141a, zero K4 changes), and the
    K4 diff touches neither suite nor any file they scan. CI caught
    both on K3's publish PR #1625; the fixes already exist on the
    publish branch (`d017a86a` whole-identifier scan, `a203515d`
    lootWeb pin updated to the K3 write law), so K4's publish
    cherry-pick lands on the corrected assertions.
  The new shelfCensus suite passes inside the sweep.

## Design calls flagged

1. **Staged-ever evidence is a union of three witnesses:** the
  ledger (fill slots, swap-ins, stage crowns), current stage
  membership, and the records' `stagedCount` stamps (which §5 of
  the spec defines as the ledger's own cache). A keep staged before
  K1's ledger existed still reads staged via its stamps — honest,
  because the stamps are the ledger's cache, not a second truth.
2. **Disk keeps' staged evidence comes from their record when read
  this session, else from the stub's cached stamps.** A disk keep
  that was dealt by a fill is re-imported in the same move (K3), so
  no staged disk keep can hide behind an unread stub in practice.
3. **The window (10 fills) and tail cap (8) are named constants in
  censusReadout.mjs**, and N is printed in the tab itself, per the
  issue ("N stated in the tab").
4. **Slots used comes from shelf.mjs's `stageSlotsUsed`** rather
  than a readout-side recount — one accounting truth (an earlier
  draft of this stage hand-rolled it; corrected before commit).
5. No defect in K1–K3 behaviour was exposed by the readouts. The
  K2/K3-flagged gap stands as-is and is **not** K4's to close: the
  preferences.json defaults-document write on first loot setup
  remains unwired (one call site since K3's write verb) — a named
  follow-up for whoever takes it, unchanged by this stage.

## Stack state

K4 completes the Keeps stack locally: K1 (#1589, published as PR
#1623) · K2 (#1590) · K3 (#1591) · K4 (#1592) — each staged on the
previous, publishing one at a time in stack order as the coordinator
directs.
