# #1550 — Write-path honesty: staging report

**Branch:** `ember/1550-writepath` (local only — not pushed, no PR, per staging rules)
**Base:** origin/main `081c6df4` — the branch was staged on `13a7e4ff`; the coordinator rebased it onto current main (#1553) mid-flight, which rewrote the commit hashes below, and added the fourth commit. All hashes in this report were verified against `git log` at writing time.
**Commits:**
- `540388bb` — feat(state): write-path honesty — one roll-ranges table, validated randomize writes *(original builder; staged as ef6f2741 before the rebase)*
- `b28bc360` — fix(state): Evolve targets land through the validating door too *(finisher — see §1)*
- `eda0c404` — test(state): #1550 acceptance — writePathHonesty suite + census re-derivation *(finisher)*
- `f19bb94e` — test(state): mathRandomGuard allowlist 4 → 2 *(coordinator, at the rebase: the feat's dedup removed two `Math.random` call sites in paramUtils.js, and the guard's per-file allowlist is an exact count — a one-line pin update with the reason recorded in the entry itself; audited and endorsed by the finisher)*
- this report

**What this does, in plain language:** the instrument had three separate copies of "how far each knob may roll," and they had quietly drifted apart, so the Evolve button could push five knobs to places the dice could never reach — one of them (noiseFreq) could even land on a value the document itself forbids. Separately, the randomize door wrote its rolls into the document without the safety check every other door uses, so an out-of-bounds value could sit in the document until some later edit happened to fix it. Now there is one table, every door derives from it, and every door's writes are checked at the moment they land.

---

## 1. Audit of the landed feat commit (`540388bb`)

Read against the issue's fix law, line by line. **Verdict: the commit implements the contract, with one violation — found, and fixed in a follow-up commit (`b28bc360`), not by rewriting history.**

What checks out:

- **One table.** `DICE_RANGES` in `state/paramUtils.js` is the single declared roll-ranges table. `randomizeKey` rolls from it; `generateLayoutTargets` (Evolve) derives from it; `refineMutate`'s `REFINE_RANGES` is now the table itself (object identity — it was previously an exact hand mirror, so this is behavior-preserving). Proven bit-identical for the dice: see §4.
- **The disagreements are resolved the way the issue demands** — unified or declared, in the open (table in §3). The one remainder is named (`EVOLVE_TARGET_OVERRIDES.swarmCohesion`), carries its reason in a comment (a morph is a journey the performer watches, not a dice slam), and is suite-pinned.
- **The randomize doors validate.** `randomizeParam`, `randomizeUnlocked`, and the CURATE pick in `layoutSlice.js` all land through `validateLayoutParams` — the same door as every other write.
- **The density overhang is declared, not hidden.** The table comment states it plainly: density proposes to 120 while the document caps at 100 (#272), and that is legal only because the write doors clamp at write time. The acceptance suite pins it as the *only* overhang, at exactly those numbers.

The violation:

- **Evolve's own landing still wrote raw.** `davisSlice.triggerEvolve` spread `generateLayoutTargets` output straight into `layoutParams`. Before the feat this happened to be harmless for density (Evolve's private range was 10–100, the document cap itself) — but the feat unified Evolve onto the dice range (20–120), which made a raw, out-of-spec landing (density 101–120 sitting unclamped in the document) reachable through Evolve for the first time, contradicting the feat's own "no landed value is ever out of spec." The morph path was already safe (its per-tick writes go through the validating `setLayoutParams`); the direct spread was not. **Fix (`b28bc360`):** `triggerEvolve` validates the rolled targets and takes only the target keys from the validated params — a rejected key would keep its current value, per the door's partial-accept contract — so both Evolve landings clamp density at the door and put scale in the document's linked `{x, y}` shape, like every other door.

One lesser note, no action taken: the feat's comments in `paramUtils.js` and `refineMutate.js` referenced `writePathHonesty.selfcheck` before it existed. It exists now (§5) and pins everything the comments promise.

## 2. The five disagreements — resolution table

Measured before/after with the parity harness (§4): seeded draws against pristine origin/main and against this branch, per key, all other keys locked.

| Key | Dice (shared) range | Old Evolve range | Resolution |
|---|---|---|---|
| count | 30–600 int | 10–500 int (observed 10–499) | **Unified** onto the dice range |
| density | 20–120 int | 10–100 int (observed 10–99) | **Unified** onto the dice range; the 101–120 overhang past the document cap now clamps at every write door, Evolve's included (see §1) |
| noiseFreq | 0.002–0.015, 4dp | 0.002–0.02, **2dp** (observed 0–0.02 — the 2dp rounding produced exactly-0.00 targets) | **Unified** onto the dice range and precision; the 0.00 target is gone at the source |
| gravityWells | 0.1–3.0, 2dp | 0.1–3.5, 2dp | **Unified** onto the dice range |
| swarmCohesion | 0.2–4.0, 2dp | 0.5–3.5, 2dp | **Declared** — `EVOLVE_TARGET_OVERRIDES`: Evolve keeps its narrower band, named and reasoned in code, suite-pinned. Its seeded target stream is bit-identical to the old Evolve behavior (§4) |

Also unified by the single table, as part of the same E1a finding (construction differences, named in the feat's own table comment): the pair constructions for **scale** (mid-split at 1.55 → the dice's [0.1–1.0]/[1.0–3.0] element ranges), **rotate** (float pairs → the dice's int pairs), and **alpha** (mid-split from 10–100 → the dice's [15,60]/[70,100] element ranges); and the int-endpoint constructions on **jitter** (floor of [0,150) → inclusive 150), **zTiers** (floor of [1,10) → 10 reachable), **displacement** (declared hi 120 → dice 150), and **particleCount** (declared lo 30 → dice 50). The remaining keys (noiseSpeed, damping, wind, flap, breath, lifeDrift) already agreed — their Evolve target streams are bit-identical before/after, measured.

## 3. Parity — what changed, enumerated

Evidence: `~/workspace/kc-1550-evidence/` (`parity-pure.mjs`, `parity-store.mjs`, `parity-diff.mjs`, outputs alongside; pristine side is a detached worktree at `13a7e4ff`).

- **`randomizeKey` (the dice door): bit-identical.** All 18 keys × 10,000 seeded draws — every value identical to pristine main. The refactor of the switch into the table changed no dice behavior at all.
- **Evolve targets:** differ exactly where §2 says — the five resolutions plus the construction unifications. Streams identical on the seven keys that already agreed (noiseSpeed, damping, wind, flap, breath, lifeDrift — and swarmCohesion, preserved exactly by its declared override).
- **`randomizeParam('density')`, 400 seeded draws:** 327 land identically; the 73 differences are all the same case — pristine landed the raw roll (101–120) in the document, the branch lands exactly 100. No other difference exists.
- **`randomizeParam('scale')`, 50 seeded draws:** pristine landed the raw pair as an array; the branch lands the *same values* in the document's linked `{x, y}` shape — 50/50 draws, values equal.
- **`randomizeParam` on a non-randomizable key:** pristine *changed the document and wrote `undefined` over the key* (measured: `mode` became `undefined`). The branch refuses the write entirely — nothing changes, no undo step.
- **CURATE, 12 seeded presses from a fixed seed:** the same candidate wins every press (streams and scoring untouched). Landed differences per press are only: **scale** (every press — raw array → linked `{x, y}`, same values) and **density** (7 of 12 presses — raw 102–119 → 100). Every other key identical on every press.
- **Evolve direct landing, seeds 1–60:** pristine landed the raw array for scale 60/60; the branch lands linked `{x, y}` 60/60. Landed density differs on all 60 seeds because the *target itself* now rolls the unified range (e.g. seed 1: target 48 → 63) — every branch landing is within the document spec, and the acceptance suite replays each seed against the generator to prove the landed value equals the target clamped at the door.

Nothing else moved. In-spec values land identically everywhere except the enumerated clamp-at-write and shape-migration cases above.

## 4. Acceptance suite — `writePathHonesty.selfcheck`

New suite at `app/src/state/writePathHonesty.selfcheck.mjs`, registered in `app/selfcheck.manifest` (the package.json script untouched). It pins:

- **(a) Derivation:** `DICE_RANGES` covers exactly the randomizable keys; `REFINE_RANGES === DICE_RANGES` (identity); every table range sits inside the document spec (`PARAM_SPEC`/`RANGE_SPEC`) except density's declared overhang, pinned at exactly 120-over-100; `EVOLVE_TARGET_OVERRIDES` contains exactly swarmCohesion, a strict sub-range of the shared table, itself inside the spec; 4,000 seeded `generateLayoutTargets` draws never leave their key's declared range, and locks still bite.
- **(b) In-spec by construction (RA2 method):** 4,000 seeded `randomizeKey` rolls per key — every raw roll inside its table range with the table's int/dec shape, both outer quartiles reached, and every value landed through `validateLayoutParams` inside the document spec; density's landed value is exactly `min(roll, 100)`.
- **(c) The store doors land only validated values**, against the real store: `randomizeParam('density')` replayed roll-for-roll against the raw stream (every over-cap roll lands at exactly 100; the stream provably rolls past the cap); `randomizeParam` for every key × 200 draws lands in-spec; a non-randomizable key is refused without a write; `randomizeUnlocked` leaves the whole document in-spec; and both Evolve landings — direct spread and morph targets — replayed seed-for-seed against the pure generator land clamped, with scale in the linked shape.

Result: **pass**.

## 5. Coverage + census — re-run, pins re-derived

- **Coverage (`coverage.selfcheck`): pass, unchanged.** Its RA2 Evolve section asserts per-draw properties (presence, finiteness, locks), which the unification preserves.
- **Census (`census.selfcheck`): pass, with its routed-question section re-measured** — the section E1a/E1b wrote to pin the *disagreement* now pins the *unification*, each change commented as a #1550 re-derivation (never quietly edited, per the census's own philosophy):
  - the 0.00 noiseFreq target assertion inverted: none occurs in 4,000 seeded Evolve draws (it was previously asserted to occur);
  - zTiers: Evolve now targets 10 (was pinned at max 9 under the old floor construction);
  - the five-key band table re-measured: **Evolve and dice bands identical to the endpoint** on count (30–600), density (20–120), noiseFreq (0.002–0.015), gravityWells (0.1–3.0); swarmCohesion Evolve 0.5–3.5 inside dice 0.2–4.0 — the declared override, fingerprinted;
  - the "clamp answer" is now a door property measured on a synthetic 0.00 write (no door can roll one any more): still lands at 0.001;
  - the "two doors" finding is replaced by the one-door measurement: of 400 seeded `randomizeParam('density')` draws, **79 rolled past the document cap and every one landed at exactly 100** (was: the suite asserted a raw >100 landing).

## 6. Build + sweep

- `npm run build`: **green** (9.3s).
- Targeted neighbours, all green: refineMutate, renderProfiles, davisState, evolveProgress, clock.evolve-accum, kineticRoll, qaRegression, favorites, projectDocument, undoLayers.
- Full manifest sweep (407 suites, continue-on-error driver; run in two parts after a service restart killed the first attempt mid-run): **403/407 in-sweep; 404/407 counting the solo rollSafety re-run below.** The failures are all in the sandbox's known environmental classes, each verified against pristine base:
  - `swarmWasm` — fails identically on base, verbatim: "cargo not found on PATH" (the sandbox has no Rust toolchain).
  - `accum` — V8 OOM abort (SIGABRT) on the branch; the base control aborts identically (exit 134, same native stack).
  - `rollSafety` — killed by the sweep driver's 900s cap during peak contention, *while progressing through its checks*. Solo re-run in calm conditions, per the standing rule: **PASS — 7 checks, 9m44s**, against a pristine-base control of **9m42s** (user/sys profiles near-identical). The timeout was load, full stop; counted as a pass in the tally above, so the sweep reads **404/407** with this line resolved.
  - `phase6` — likewise killed at the driver's 900s cap *while progressing* (its section-F line logged OK, the same checkpoint the base control reached). The pristine-base control, given a 1500s cap, **hit the cap too**: 25m00s wall against only ~55s of total CPU — the suite is wait-bound (timer/frame pacing), and its wall-clock in this sandbox tonight exceeds 25 minutes on unmodified code. Environmental and base-identical; it is the one suite of the 407 without a green verdict in this sandbox, on either tree. Neither it nor rollSafety touches any code path #1550 changed (gl/fx vs state/curator), and every suite in the changed areas — writePathHonesty, census, coverage, refineMutate, davisState, and the rest of the curator/state blocks — passes inside the sweep itself.
- Playwright e2e does not run in this sandbox (standing limitation) — not attempted; CI on the PR will carry it.

## 7. Judgment calls, flagged

1. **The Evolve-landing fix (`b28bc360`) goes one door beyond the feat commit** — but not beyond the issue: the fix law's first line is "*every* write validates at write time," and the feat's own comment asserted the property the raw spread broke. Leaving it would have shipped a comment claiming a law the code didn't keep. The change is minimal (validate, extract the target keys, keep current values for any rejected key) and both landings are pinned in the suite.
2. **The density overhang is pinned, not "fixed."** The dice have proposed density to 120 against a document cap of 100 since #272; the issue forbids retuning ranges beyond resolving the disagreement, so the honest end-state is: overhang declared in the table, clamped at every door, pinned in two suites. If Matt ever wants the dice themselves capped at 100, that's a one-line table change — but it's a feel call, not this issue.
3. **Census pins were rewritten, with the reasoning inline.** Three assertions in the routed-question section described the bug as a finding; they now assert its absence, each with a comment saying what E1b pinned and what #1550 measured instead. No other census pin moved — the full census output was diffed section by section in the re-run; all other sections (parameter census, dish matrix, reachability, RA6, PA3) pass byte-identical.
4. **`randomizeParam`'s refusal of non-randomizable keys** is a behavior change the feat introduced and this report endorses: the old door demonstrably wrote `undefined` into the document (§3). No UI path calls it with such a key; the refusal matches every other door's contract.

## 8. What was NOT done

- The morph pure-step extraction (named gap since E1b) — explicitly out of scope in the issue; untouched.
- No range was retuned: where the tables disagreed, the dice range won for four keys and Evolve's band was declared for one — the values themselves are the ones the two tables already had.
- Favorites/keeps caps and the other `slice(-MAX)` doors — not this issue.
- No push, no PR — staging only, per the lane rules.
