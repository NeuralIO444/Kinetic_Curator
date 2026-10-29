# STAGING REPORT — #1809 slice A: wet-frame service (local only, not pushed)

Builder staging record, branch `feat/1809-wet-frame` in `~/workspace/kc-1809-build` (local only — not pushed, no PR; the coordinator verifies and publishes). This file replaces the report that was at the worktree root (#1806 slice 1's); that report remains in git history.

Issue (verbatim): **"WET: wet-frame service — decouple the field, one wet for dish and trails"**

## Premise verdict: HOLDS — built (slice A of the issue's own slicing)

Verified against code + git history before building:

- No wet-frame service existed under any name (no module, no references). The vortex sim's only caller was `liveLoop.mjs`, gated on `accumulation && !perfTier1`, returning a hand-built absent shape otherwise.
- The slot was destroyed in exactly the two places the issue names: ACCUM toggle-off (`wetSlot.vortex = null` in the session-end branch) and ACCUM fault teardown (`noteAccumFault`).
- Freeze was derived from ACCUM's controls in the loop (`accumFrozen || !running || slowRender`); exports never called the sim (no other `noteWetFrame` callers exist).
- `docs/WET_ENGINE.md` §4–§6 prescribes this extraction as Phase A with byte-identical acceptance, and the issue prescribes the slicing (A: service + ACCUM as reader; B: dish migration). No recorded decision contradicts it.

**Scope decision (first-class):** the issue's body prescribes its own slicing, and this build is **slice A, complete**. Slice B (dish on the shared field) is NOT bundled: the issue assigns it re-pins "where the field source legitimately changes values" and behaviour goldens "judged by Matt's eyes in the review lane before merge" — it is review-lane work, not full-auto material. The dish today consumes no spatial field at all (per-contact-pair wetness scalars in `src/engine/dishMedium.mjs`, grip-step counters in `dishLinks.mjs`), so B is a genuine migration, staged and named, not a silent omission.

## What shipped (plain language)

The wet field — the water under the trails — used to be a private state of the ACCUM switch: it existed only while accumulation was on, and flipping ACCUM off (or an ACCUM fault) threw the field away, so the water's memory reset with a checkbox. Now a **wet-frame service** owns the field for the whole session. Each frame, consumers *request* the field; the service steps the sim only when somebody asks (never for nothing), keeps it alive across toggles and faults, follows the one transport clock (freeze holds it, as before), and reports on every frame *how* the field was served — live, degraded, shed, or off — so a governor shed is named instead of silent. ACCUM, the only consumer wired in this slice, reads exactly the values it always read: over a scripted 60-frame session the service's output is byte-identical to the old direct path, proven per frame.

Also in the contract, for the slices that follow: the service *degrades* under the tier-1 shed for consumers that accept it (stamping continues, the mask dries in place, advection stops and no velocity is published) instead of the field dying; and it publishes the regime thresholds (damp / wet / soaked) that the wet-look pass (#1813) will read. The dish is the first degraded consumer when slice B lands — in slice A, ACCUM is shed as a tier-1 unit exactly as today, so the shed path is armed and selfcheck-proven but not yet exercised live.

## Files (8 paths, staged by name)

- `app/src/gl/wetFrame.mjs` (new) — the service: `createWetFrameService()` with `frame()` (need-based gate, ownership, shed/degraded policy, mode reporting), `stats()` (frame-profile counters), `field()` (read-only probe), `dispose()` (the only sanctioned destroy). Plus `WET_REGIMES` / `wetRegimeAt` (contract thresholds; provenance in the header: damp 0.05 = the dry-tail crossing of one stamp ≈4 s, wet 0.35 = one stationary stamp, soaked 0.8 = near the stamp clamp).
- `app/src/gl/wetFrame.selfcheck.mjs` (new, 11 cases) — equivalence golden, determinism, need gate, toggle continuity, dry gate, freeze hold, shed stand-down, degraded semantics (stamp lands / float-exact dry-down / vortons unmoved / no velocity), degraded birth, regime bands, dispose.
- `app/selfcheck.manifest` (+1 line, after wetFeed).
- `app/src/gl/vortex.mjs` — one extraction: `ensureVortex(slot, …)` (the seed/size lifetime rule, verbatim) now shared by `noteWetFrame` and the service. Sim behaviour untouched.
- `app/src/gl/liveLoop.mjs` — the slot becomes the service; the gate becomes a per-frame request with the identical inputs (freeze derivation unchanged); the two `wetSlot.vortex = null` destroys are gone (ownership comments in their place); the frame result gains `wetMode` / `wetShed`; `dispose()` calls the service's dispose.
- `docs/WET_ENGINE.md` — surgical status: Phase A marked landed (header + §6 row); the body still describes the pre-service state it replaced, now dated as such.
- `docs/review/1809/README.md` — premise, preservation proof, degraded measurements, cost table, slice map.
- `STAGING-REPORT.md` — this file.

## Verification (final bytes)

- **wetFrame.selfcheck: 11 checks passed** — incl. the Phase A acceptance: 60 scripted frames (30 live → 5 frozen → 5 wetness-0 → 10 resumed → 5 new-seed → 5 new-size) byte-identical to `noteWetFrame` per frame; final-frame golden (fnv(mask) ^ fnv(vel)) = **2550213434**; stats births 3 / full steps 50 / held 5.
- **Targeted battery: 46 suites, 46 passed, 0 failed** — every selfcheck that references a touched filename (incl. all liveLoop source-pin suites: accum.seam, accumGuard, atlas.skip, audioRoutes ×2, clock.capture/evolve/freeze/inventory, contactShadow, gestureRecord, grainFinish, liveLoopSwell, liveResolve, playback, spectrumMarks/Warp…), all dish suites (kernel/dish, dishLinks, dishMedium, dishGround, dishWeather, dishContacts, dishPins), formation, **replayGate ✔, creatureGate ✔, refreshFixtureCheckpoints ✔**, vortex (19, golden 3932816161 intact), wetFeed (7).
- **accum.selfcheck: OK (67 cases)** — solo, `NODE_OPTIONS=--max-old-space-size=3072` (this tree's base count; the suite's subject files are untouched).
- **Full manifest sweep: 529 commands — 525 passed, 4 failed, all four triaged.** swarmWasm (its log names `build-wasm.sh --verify` — needs the Rust toolchain this sandbox lacks; environmental, CI authoritative) · rollSafety (sandbox-environmental; the suite imports only fx/data/state modules — none touched by this slice; CI authoritative) · accum in-sweep (default-heap OOM, "JavaScript heap out of memory" in its own log → solo at 3 GB green, above) · livingMotion in-sweep (wall-clock budget: floor 2.81 ms vs 2 ms budget while two builders' suites shared the machine → **solo re-run: 15 checks passed**, floor 1.48 ms; both results reported per standing rule). The sweep ran in two segments (the first background session was reaped mid-run by the environment; the resume ran only the un-run commands — the union covers all 529 manifest commands exactly, verified by set difference).
- `npm run build` green (verified twice); full `npm run lint`: 0 errors (11 warnings, none in touched files); the CI format gate (`prettier --check .` in app/) passes on the whole tree including the new files. Repo-root markdown is outside that gate (the pre-existing WET_ENGINE.md is not prettier-formatted either — the docs edits stay surgical rather than reformatting the doc).
- Measured cost (sandbox VM, shared — indicative, in `docs/review/1809/`): full step via service 1.09/1.37 ms vs direct 1.43/1.98 ms (same call path — no measurable service overhead); degraded step 0.19/0.40 ms; idle frame ~0.01 ms.

## Decisions worth the coordinator's eye

1. **No new cost-tier registration.** The field's work stays registered once as `gl/vortex` (tier 1); the service is policy over that work, not a second cost centre (a duplicate registration would double-count the same step). The registered `timeMs: 0.5` is the sim's pre-existing selfcheck budget — its header admits it is not a measurement. The real-device measurement + re-registration is #1810's cost gate; my sandbox step numbers (~1.1–2.0 ms at 64² on a loaded VM) are recorded as sandbox numbers only, not a device claim.
2. **Shed visibility.** The issue's acceptance asks that degradation at perfTier1 be "visible in the show block". In slice A the shed never coincides with a *served* consumer (ACCUM is the shed unit), so what ships is the reporting surface: every service result and every liveLoop frame result carries `wetMode`/`wetShed` — the state is a named field on the show path's data, never a silent gate outcome. The persona show-block line itself belongs with the first degraded consumer (slice B), and plumbing it now would cross PR #1831's in-flight show-block work (#1807). Flagged, not buried.
3. **Fault path.** `noteAccumFault` no longer destroys the field (the issue's ownership rule). The fault path triggers only on ACCUM exceptions; the vortex is pure CPU and cannot be the fault's source; the retry now resumes against the standing field instead of a dry one. Named here because it is the one deliberate behaviour change beyond the toggle — both are the issue's explicit acceptance bullets.
4. **Regime thresholds are builder-set contract constants** (provenance documented; ordering pinned). Matt has not ruled values; #1813 consumes them in the review lane, where they can be tuned by eye without renegotiating the contract shape.

## Surprises

- `docs/WET_ENGINE.md` §2's line numbers for the gate were stale (doc says liveLoop:718, actual ~968) — the doc's *description* was exact in every other particular; the extraction it prescribes mapped 1:1 onto the code as found.
- No selfcheck pinned the loop's wet lines (the queue's usual trap did not fire here): the source-pin suites that read liveLoop.mjs pin other sections, and all pass unmodified.
- The dispatch note "wetFeed selfcheck exists" understates the pin set: the ACCUM-side wet contract is pinned by wetFeed (shaders + recipe gate + mirror) — untouched, since accum.mjs is untouched.

## For the later WET slices (staged remainder)

- **Slice B of #1809** (dish migration) — review lane per the issue; first `degradedOk: true` consumer; dish stamps will need a stamp-in API decision (the service currently stamps only from the frame's instance list — dish contacts are not instances; expect a `stamp` surface or a dish request shape in that slice).
- #1810 re-pins the wetFrame golden (2550213434) and the vortex goldens with the 128-grid constants — expected and sanctioned by that issue.
- #1815 removes the `vortex.mjs` live-only header (still accurate today — slice A deliberately leaves it).
