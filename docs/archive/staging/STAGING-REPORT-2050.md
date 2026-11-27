# STAGING REPORT — #2050 Top bar legibility

Branch `feat/topbar-legibility-2050` off origin/main `3590da7f`. Built locally only —
no push, no PR, no merge (Matt's review lane).

Spec: `docs/design/topbar-legibility-spec-2026-11-09.md`; issue #2050 (no comments).
Scope held: readouts only. No dealing/router semantics changed — see the byte-identity
guards below. Non-goals untouched: CUR keeps/favourites readout, START legend, crown/SwayMark.

## What shipped

### 1. TASTE · \<persona\> (was VOI)
- The judge button in `CuratorBar.jsx` is labeled by its job: rest `T`, used `TAS`,
  open `taste: <style> ▾`; the always-standing readout beside it is the taster's id
  (`tasterReadout` in `src/curator/topbarTaste.mjs`) — `DAVIS` by default, `LOIS`,
  `REAS`, … and **`DICE` when off** (off honestly means a uniform dice pick).
- Tooltip, aria-label and the menu header all name the job in the shared words
  "who tastes the CURATOR candidates"; menu rows are `taste: off — honest dice` /
  `taste: <style>`. No state of the button carries VOI/VOICE any more; VOICE names
  only the costume deck again. Casing stays CSS-owned (the aria carries the raw id;
  `casingInCss` forbids case calls in JSX and its baseline was not raised).

### 2. KIN's next pass as a TE detent
- `nextKineticLayer(run, now, {chaos})` added to the router module
  `src/panels/layout/kineticHeat.mjs` — it **delegates to `routeKineticTapHeat`**
  and returns its layer, so the detent is the router's own decision by construction,
  never a parallel prediction. `KINETIC_NEXT_LABEL` = LOOK / VOICE / CUR / CHAOS.
- `KineticButton.jsx` renders the detent always (at rest it honestly reads LOOK),
  derived in render from the standing run (state mirror `runSnap` — refs stay
  handler-side per the lint rules), a detent clock (`nowMs`) ticked by taps and by
  the same 150 ms watch that decays the displayed heat, and the scope's chaos gate
  (`scopeDecks(...).chaos`). Heat still renders Davis through the existing `--heat`
  breath channel, decaying on the router's halving clock (`decayHeat`).
- The #1122 post-hoc "last tap ran …" micro-label **retires** (state, render and
  import removed; `kineticLayerLabel` stays exported, still pinned by the router suite).
- Below KOZ the detent can never read CHAOS — by the router's own gate, pinned in
  the router suite (pegged heat + `chaos:false` → CUR) and in e2e (hammering at the
  factory scope never shows CHAOS).
- The watch now also lives while a heat-0 run is inside its window, so the detent's
  step back to LOOK at lapse is rendered rather than stale; it still stops itself
  once heat is spent and the run has lapsed.

### 3. Armed ≠ live — the corner detent
- Both ModeStrip rows (`src/components/ModeStrip.jsx`): an armed chip now wears a
  pure-CSS corner detent (`.chip-detent` in `panels.css`: top-right tick,
  `border-top: 5px solid var(--kc-red)`, scoped to `.mode-strip .chip-btn`) instead
  of the Davis-amber outline + 📌 span. Filled = live, detent = armed, both = live
  and pinned. One detent per row falls out of the state (one armed value per axis).
- The detent is a pure readout of the store's `armedMode` / `armedMotion` — the
  same state the rolls read.

## Wiring doors (Canon / core API — Matt's direction)

- **TASTE** ← the canonical persona standing in `src/curator/taste.js`:
  `voiceOptions()` / `getActivePersonaId()` — the same resolver `getActiveCurator()`
  picks through when a CURATOR press actually deals, over the persona records that
  carry Canon style ids (#2045). Persona state has exactly one writer
  (`CuratorBar.pickVoice` → `setActivePersona`), so the readout and the pick read
  one standing and cannot drift. The readout resolver lives in
  `src/curator/topbarTaste.mjs`, the bar's standing pure-resolver module.
  No bus event was added: the canonBus snapshot carries stage Canon state, and a
  second channel for a single-writer readout would be the parallel plumbing the
  direction forbids.
- **KIN detent** ← the router itself (`kineticHeat.mjs`), the standing core surface
  every KINETIC press routes through; the chaos gate is the store's START scope
  state (`scopeDecks`), the same state that arms CHAOS for the real tap.
- **Chips** ← the store's roll-scope state (`armedMode` / `armedMotion`), the same
  state `pinRollScope` consumes on every roll and the bus announces on
  `roll:scopeClear`. ModeStrip was already subscribed via `useStore`; only the
  mark changed.

## Deviation — Item 3's lifecycle sentence (read this one)

The spec says: *"The detent clears in the same commit a roll of its axis consumes
the arm; it survives rolls that don't deal its axis."* **No code path consumes an
arm.** Arms are written only by `toggleArmMode` / `toggleArmMotion` /
`clearRollScope`; every roll only *reads* them (`pinRollScope`). Persistence is
the standing law everywhere else it is written down: the issue body itself
("arms bind **every** roll of their axis"), the ModeStrip header ("Arms persist
until disarmed", #964), and `e2e/roll-scope.spec.js`, which asserts arms survive
CHAOS + LOOK rolls. Building consumption would change roll semantics — exactly
what this issue's scope law forbids ("readouts only… if a readout and the router
disagree, the readout is the bug") — and would contradict the spec's own
single-source law (detent ⇔ arm present in roll-scope state).

**Resolution:** the detent ⇔ arm presence, exactly. It clears in the same commit
the arm itself clears (disarm / clear-scope / ✕) and survives rolls precisely as
the arm does. Pinned that way in `e2e/roll-scope.spec.js`. If consumption is ever
wanted, it is a behaviour change for its own issue.

## Re-pins (standing law the spec supersedes, re-pinned at full strength)

- `pinkDiscipline.selfcheck` + `colorTribes.selfcheck` pinned "armed = waiting →
  Davis-amber outline". #2050 rules armed is a boolean and renders TE, so both now
  pin the new law **and** the retirement (no `.chip-btn.armed` Davis rule may
  exist; `.chip-detent` must spend `--kc-red`). The `.big-btn.armed` amber outline
  is a different surface, untouched, still pinned as amber.
- `expandLabel.selfcheck` examples/pins modelled on this button moved `v`/`voice:`
  → `t`/`taste:` (identical shapes/lengths).
- `e2e/topbar-expand.spec.js`: `Voice` → `Taste` throughout (role name, rest/cool
  forms `t`/`tas`), titles updated; two #2050 tests added (TASTE readout incl.
  menu + DICE; KIN detent walk LOOK→VOICE→CUR, never-CHAOS below KOZ, lapse→LOOK).
- `e2e/roll-scope.spec.js`: 📌 comment retired; detent presence/survival/clearing
  asserted alongside the existing arm assertions.

## Left alone, flagged

- `src/data/palettes.js` era strings read "Persona voice · after <artist>" —
  palette provenance data, not the judge surface. Renaming canonical palette data
  is outside the three fixes (and would ripple catalogue pins); flagged here for
  a ruling if Matt wants the word gone there too.

## Verification

- New/updated suites (by file): `kineticHeat` (§9: detent ≡ router over a
  6-run × 8-time × 2-scope grid + the spec's table incl. decay step-down),
  `topbarTaste` 9 checks (`tasterReadout` vs the real option list),
  `topbarLegibility` 6 checks (new suite, registered in `app/selfcheck.manifest`).
  The three run **10× each — 30/30 green** (KIN heat is timing-shaped).
- Neighbour sweep: 36 suites that pin the touched files or guard the dealing side
  — all green, including the byte-identity guards **unchanged**: `canon`
  (70 looks / 72 voices byte-identical), `chapters`, `taste`, `kineticSweep`,
  `canonBus` ("replay unchanged").
- Full manifest sweep (all 650 suites, continue-on-error, in two passes):
  failures were exactly the standing sandbox-environmental set plus two
  explained items — `swarmWasm` (no cargo in the sandbox), `rollSafety`
  (Chromium crash signature), `accum` (native-abort signature) — and
  `casingInCss` (my `toUpperCase`, caught by the sweep and fixed; re-verified
  green) and `liveLoop.dishFluid` (starved under concurrent load; solo re-run
  green, 7 groups). **No failure is attributable to this change.**
- `npm run format:check` on all touched files: clean. `eslint` on all touched
  files: clean (one iteration: a render-phase ref read + a JSX case call were
  caught by lint/`casingInCss` and fixed, see above).
- `npm run build`: green (needed this worktree's own `npm install` first — the
  borrowed toolchain lacked the declared `@tauri-apps/api`; the one-line
  package-lock churn was reverted, lockfile not in this change).
- E2E (sandbox, chromium-1248): both new #2050 tests **pass** (TASTE readout
  incl. menu/DICE walk; KIN detent LOOK→VOICE→CUR, never-CHAOS, lapse→LOOK),
  roll-scope passes 2/2 with the new detent assertions, and the re-pinned
  test 1 passes. Caveat, measured not guessed: this spec file's `boot()`
  settle (KIN's cold-open `data-open` must clear in 6 s) is marginal in this
  sandbox and fails intermittently **on pristine main too** — main failed
  6/16 in a full-file run and failed both sampled tests in one quiet-machine
  sample, then passed them in another; every failure on both branches is the
  identical settle timeout, dying before any assertion about the changed
  surfaces. CI (Mac runner) remains authoritative for this file.

## States for the coordinator's drive / screenshots

1. Bar at rest (default Davis): TASTE rests `T` with readout `DAVIS`; KIN detent `LOOK`.
2. TASTE menu open: header "WHO TASTES THE CURATOR CANDIDATES", off row
   "TASTE: OFF — HONEST DICE".
3. TASTE off: readout `DICE`. TASTE with LOIS picked: readout `LOIS`.
4. KIN: tap once → detent `VOICE`; again → `CUR`; hammer below KOZ → still `CUR`;
   set START to KOZ and hammer → `CHAOS` in red; wait ~2 s → back to `LOOK`
   while the button's glow is still cooling.
5. ModeStrip: arm PHI + FLOCK → red corner detents; make an armed chip also live
   (ModeGrid) → filled + detent; roll KINETIC → detents survive; ✕ → gone.
6. Narrow window (<1440 px): the micros (incl. both new readouts) hide per the
   standing rule — nothing strands.
