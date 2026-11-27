# STAGING REPORT — #1917: live Director runs without fieldRng

**Branch:** `fix/1917-fieldrng` (worktree `~/workspace/kc-1917-build`), off origin/main @ `84dffec9`.
**Lane:** review — built and verified locally; NOT pushed, no PR (coordinator publishes, Matt merges).

## The defect, re-verified on current main before any change

The issue's line numbers had drifted slightly; the shape is exactly as filed:

- `app/src/curator/director.js:342` — `createDirector({ now, onRoom, fieldRng = null })`.
- `app/src/curator/director.js:355` — `const rng = typeof fieldRng === 'function' ? fieldRng : () => 0.5;`
- `getDirector()` (the live singleton, same file) constructs with only `onRoom` — no `fieldRng`, so every live tick ran `fieldStep` → `choosePoet` on the constant 0.5: pool index 1, piece index 2, forever.

Measured through the live construction (`resetDirector()` + `getDirector()`, 60 ticks per band, band set by the tick's audio input), pre-fix:

| band | result |
|---|---|
| cool (audio 0.1) | teijo **t3** on 60/60 ticks |
| neutral (audio 0.5) | rosselli **r3** on 60/60 ticks |
| hot (audio 0.8) | gibson **w3** on 60/60 ticks |

Whittier (greenleaf) dealt 0 times; 3 of 16 deck pieces ever appeared. The issue's evidence is confirmed verbatim.

## The fix

**`app/src/curator/director.js`** — the default (non-injected) deal stream is no longer a constant. Each tick now deals from a *fresh* hash stream keyed by the tick index:

- `dealRng = rngForIndex(FIELD_DEAL_SEED, 'field-deal', fieldTicks)` with `FIELD_DEAL_SEED = 1917` (fixed, arbitrary — the deal must replay, so the seed can never come from the wall clock or `Math.random`; no determinism-allowlist entry was needed or added).
- `fieldTicks` increments once per tick and restarts at 0 in `reset()`, so a reset Director re-deals the identical stream from the top.
- An injected `fieldRng` still wins exactly (the test seam — `fieldSilence` and other suites pin exact draws through it, and a new assertion in `fieldLiveDeal` proves the old constant-0.5 picks still come out of an injected `() => 0.5`).

**How it mirrors the sanctioned pattern:** this is the placement path's per-press stream, transposed from presses to ticks. `layoutSlice.curate()` deals the FIELD form off `rngForIndex(seed, CH.curate, press + 0x30000, seedOffsets)` — a fresh, index-keyed hash stream per press. The Director has no document seed (it is deliberately store-free), so its stream is keyed by its own tick index off a construction-fixed seed; `fieldEval.evalLoop` already used the same per-step fresh-stream shape offline. Per-tick freshness also makes the deal immune to draw-count variance inside `choosePoet`/`preferredNext` (rejection damp, room transitions) — no shared sequential stream to desync.

**`app/src/engine/kernel/rng.js`** — the one supporting change: `'field-deal': 'spatial'` registered in `STRING_CHANNEL_GROUPS` with the reason recorded, per the #1238 rule (an unregistered string channel silently locks to offset 0). The Director passes no offsets, so the group is the identity for its draws; the registration keeps the name accounted for. No other kernel behaviour touched.

**No one-writer files touched** (`liveLoop.mjs`, `liveResolve.mjs`, `particles.js` untouched). An install-time `package-lock.json` sync line (from #1846's license field) appeared during `npm install` and was reverted — not part of this fix.

## Measured deal distribution after the fix (same live-construction probe)

| band | poets (of 60 ticks) | pieces |
|---|---|---|
| cool | teijo 23, **greenleaf 37** | 8/8 cool-pool pieces |
| neutral | greenleaf 18, teijo 19, rosselli 15, gibson 8 | **16/16 pieces** |
| hot | rosselli 37, gibson 23 | 8/8 hot-pool pieces |

All four poets appear; every one of the 16 authored pieces is dealt in the neutral band alone; band pools are respected exactly (cool deals only greenleaf/teijo, hot only rosselli/gibson); silence never triggers on the tick path (the Director passes `rejected: false`, as before).

## Replay proof

- **Director level:** two fresh live singletons driven by an identical 48-tick mixed-band script produce byte-identical poet sequences (probe + `fieldLiveDeal` assertion). A `reset()` director re-deals the same 24-tick sequence identically (assertion).
- **Take/store level:** the landed form is document data placed off the (seed, press #) stream, and the existing `src/state/fieldDeal.selfcheck.mjs` passes unchanged — same (seed, press #) → bit-identical form, form held across a voice pass, no-op press deals nothing. A recorded take therefore replays with the same poems.

## The new pin

**`app/src/curator/fieldLiveDeal.selfcheck.mjs`** (8 checks, added to `app/selfcheck.manifest` after `fieldSilence`): drives the real live construction (no injected rng) through the three bands and asserts per-band pool discipline, both/all poets per band with floors, piece-spread floors, Whittier reachability (≥14/16 pieces across bands), replay identity, reset replay, and the injected-seam behaviour. **Mutation-proved:** restoring the constant `() => 0.5` fallback makes the suite fail on the exact defect signature (cool = teijo only, 1 piece).

## Suite edits with named causes (no silent re-pins)

1. **`fieldSilence.selfcheck.mjs`** — its "live-singleton configuration" block constructed the Director with an explicit `fieldRng: () => 0.5` and labelled that the live configuration. That premise *was* the defect. The block now constructs with no injected rng (the shipped default stream) and says so; its assertion (poets arm at pick time) is unchanged and passes.
2. **`director.selfcheck.mjs`** — the surface-reference allowlist gains `'curator/fieldLiveDeal.selfcheck.mjs'` with its cause, the same treatment every director-driving suite has there. No assertion weakened.
3. **`directorRoom.selfcheck.mjs`** — one assertion re-pinned with the cause recorded in the suite: "exactly one publish for an unchanged room" only held because the stuck deal made two identical ticks produce identical payloads; `poetId` is part of the room payload by #1907's design, so two identical ticks dealing *different* poets now legitimately publish twice. The pin now guarantees what the contract actually promises — the room fields are identical across publishes, the cause is `director`, the payload shape is exact, and a bare Director publishes nothing. Exact-count dedup of truly identical payloads remains pinned by the synthetic 'the publisher sends only changes' block, which passes unchanged. (Considered and rejected: excluding `poetId` from the publisher's change key — that would change the #1145×Mind bus contract so the minds stop hearing poem changes in a static room; outside this issue's scope.)

## Verification

- **Targeted family (21 suites), all PASS:** fieldLiveDeal (new), fieldSilence, fieldDirector, fieldEval, director, directorSway, directorRank, directorRoom, directorPresence, directorDebt, directorSense, directorTable, directorsMatrix, state/fieldDeal, poets/placement, poets/fieldStampPath, kernel/rng, kernel/rng.scratch, takeStrip, kernel/replay, kernel/replay/inputLog.
- **Full manifest sweep: 565/568 pass.** The 3 failures are sandbox-environmental and **base-identical** — each reproduced on pristine origin/main (`84dffec9`) in a throwaway worktree:
  - `engine/kernel/bake/swarmWasm` — fails on base too (missing wasm toolchain in the sandbox).
  - `fx/rollSafety` — fails on base too (sandbox Playwright/GL target crash/timeout).
  - `gl/accum` — heap-aborts in the sweep context on BOTH trees; run standalone on this tree with its documented heap (`NODE_OPTIONS=--max-old-space-size=3072`) it passes: `accum.selfcheck: OK (85 cases)`.
- **`npm run lint` in `app/`: exit 0** — 11 warnings, all pre-existing in untouched files; eslint on every touched file is clean. The determinism rule passes with **no allowlist change** (this fix adds no `Date.now`/`Math.random`).
- **`npm run format:check`: passes** (the new suite was prettier-formatted; re-ran green afterwards).

## Files in this change

- `app/src/curator/director.js` — per-tick seeded deal stream (the fix).
- `app/src/engine/kernel/rng.js` — `'field-deal'` channel registration.
- `app/src/curator/fieldLiveDeal.selfcheck.mjs` — NEW pinning suite.
- `app/selfcheck.manifest` — one line for the new suite.
- `app/src/curator/fieldSilence.selfcheck.mjs` — live-config block corrected (cause above).
- `app/src/curator/director.selfcheck.mjs` — allowlist line for the new suite.
- `app/src/curator/directorRoom.selfcheck.mjs` — one re-pinned assertion (cause above).

## Review this (for Matt, via the coordinator)

- The poems should now *change* when you play: press CURATOR repeatedly in a quiet room and in a loud one — different poets and different poems should show up, including Whittier (the held, plain voice that could never appear before).
- Nothing else about the room, the gains, or the bus changed: the Director's picks, sway, and room readouts behave as before; only the poem deal unstuck.
