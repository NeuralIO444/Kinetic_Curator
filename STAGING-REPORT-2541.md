# #2541 — cultivatePress pin: seed assertion races the live project seed (pin-side)

## Verdict

Pin-side race, exactly as filed. The panel's derivation is correct; the pin
baselined `before.seed` from a live, moving scene seconds before the press
and asserted the note — stamped at press time with the then-current seed —
against that stale sample. Fix is confined to
`app/src/components/cultivatePress.selfcheck.mjs` (browser group 1). No
production code changes; no other group touched or weakened.

## CI evidence (from the issue)

- PR #2540 CI run 45863161180, `selfcheck-browser` FAILED on this suite:
  `note.seed` actual 2451053944 vs `before.seed` expected 1391772584 — a
  wholesale re-roll between the sample and the press, not a +1 cycle.
- The identical pin passed PR #2539's CI (run 45781069659) hours earlier.
  Same code, two outcomes: intermittent by observation.

## Mechanism (confirmed by my own reading of this tree, origin/main 4a262a6f)

- The pin (browser group 1) samples `before = await store()` — including
  `seed` — then navigates (`selectRecord`: a DOM press plus a
  `waitForFunction` poll of up to 20 s), then presses the chip, then polls
  for the note. The sample-to-press window is seconds wide.
- The project seed is a live value while the loop runs, with lawful
  wholesale writers, all verified in this tree:
  - `app/src/state/slices/layoutSlice.js:521/:538/:556` — layout builds
    stamp their own build seed over the project seed
    (`seed: buildSeed ?? state.seed`).
  - `app/src/state/slices/layoutSlice.js:995` — `bumpSeed`'s XOR re-roll:
    `seed: (state.seed ^ ((Math.random() * 0xffffffff) | 0)) >>> 0`.
  - `app/src/state/slices/davisSlice.js:987` — DAVIS evolve, target 'seed':
    `seed: (state.seed + 1) % 1000000`; `:1012` the 'all' variant.
  - `app/src/state/phraseTick.js:17` — phrase wrap in 'cycle-seed' mode:
    `updates.seed = (origin + 1) >>> 0`; `:32/:36` phrase reset restores
    the origin seed (`davisSlice.js` resetPhrase path).
- The press stamps the note with the seed current at the press:
  `WetLab.jsx:179` reads `const seed = useStore((s) => s.seed)` and the
  chip handler writes `cultivationNote(selRecord, selBodyAsset, seed)`
  through `cultivateCreature` (pinned by the suite's own source groups,
  which pass deterministically, as does the node-side `cultivate` suite).
  Any seed move inside the window fails the assertion with the panel
  behaving correctly — the CI failure's exact shape.
- Same family as #2537 (pausedRecallPresent): a reference sampled from a
  moving scene is not a valid baseline for a standing frame.

## The fix (pin-side only)

Browser group 1 no longer baselines against the pre-press snapshot. The
seed sample and the press are taken in ONE synchronous page turn: a single
`page.evaluate` reads `window.__kcStore.getState().seed` and dispatches
the chip's click in the same turn. A page is single-threaded — no layout
build, re-roll, evolve tick, or phrase wrap can run inside that turn — so
the sampled seed IS the seed current at the press, which is the
invariant's own baseline, at full strength: the assertion still requires
the landed note's seed to equal it exactly, and the assertion message
carries both measured values. The DOM click is the pin's own established
press fallback ("the same real click event on the same button"); the
press's effects are still polled and asserted strictly (chip stands
pressed — now polled with measured values in the message, in the
converge-read spirit of PR #2538 — note lands, panel opens on the reads).

Why not hold-the-movers: the atomic capture closes the window by
construction, without flipping any director/phrase switch in the store —
the group keeps running against the live scene it was written for, loop
running, movers unheld. Nothing outside group 1 changes: the reopen group
compares the standing note to itself (no seed baseline), and the PERF
PAUSED variant never asserted a seed.

## Run tallies

All runs on this tree (origin/main 4a262a6f + the pin fix), `npm install`
done first, Playwright chromium present (browser section ran — 8 groups,
never skipped). Full output: `verification-2541.log` in this worktree
(gitignored, kept on disk). The batch script used to drive the repeat
runs was scratch tooling and was dropped from the commit at QA review.

- Baseline (unfixed pin, this tree): 1 run, PASS (8 groups) — the race is
  intermittent and this sandbox does not reproduce the CI frequency; the
  mechanism stands on the CI evidence plus the code reading above.
- Fixed pin, repeated full-suite runs: **15/15 PASS, 0 FAIL** (all 8
  groups each, browser section included in every run).
- Sibling `cultivate` suite: PASS (62 checks).
- Manifest sweep, components section (every `src/components/` line in
  `app/selfcheck.manifest`): **22 PASS, 0 FAIL** — the change is confined
  to one selfcheck file that no other suite imports; no state suite was
  touched. CI's selfcheck-browser remains the authoritative full sweep.
- `npm run format:check`: clean (the edited pin is Prettier-clean as
  written).
- `npm run lint`: 0 errors, 11 warnings (the standing count).
- `npm run build`: exercised inside every pin run (the pin always
  builds); all runs above built green.

## What CI should show when the PR runs

`selfcheck-browser` green on the cultivatePress suite across repeated
runs: the seed baseline and the press now happen inside one synchronous
page turn, so no lawful seed mover can land between them. If the panel's
derivation ever genuinely stamps the wrong seed, the pin still fails —
the assertion compares the landed note's seed to the at-press seed
exactly, with both values in the message.
