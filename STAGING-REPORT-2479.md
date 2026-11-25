# STAGING REPORT — issue 2479 (stress 2026-11-24, finding A1)

**Branch:** `feat/2479-play-undo-stage`, base `origin/main` a2872eea.
**Verdict: NOT REPRODUCED — verified with a full code-path audit. No production
code changed.** The deliverable is a regression selfcheck that pins the
invariant the issue reports broken, so the mechanism cannot arrive silently
later. This mirrors the A13 (#2491) disposition shape: evidence first, no
speculative patch.

## What the issue reports

On the hosted build (v0.9.0 · kernel.v2 · build f260b74), in P04 PLAY: PLAY on
(hold 60s, interval 10s, morph 4s, phrase length 32), PLAY + BEAT + LAYOUT with
HIT 2/5 morphing at 184 nodes, then STOP + TIME + SEED + PALETTE + ALL +
source BEAT + morph OFF + phrase ON + METRO + EUCLID — after which the stage
read 0 nodes (fps 60.0, tape 4%), still 0 after 5s, and one Undo (12→11,
redo 0→1) did not restore the nodes. Recalling Hit 1 GARNET (117 nodes)
recovered the stage.

## Tree identity with the session build

`git merge-base --is-ancestor f260b74 a2872eea` holds, and `git log
f260b74..a2872eea` over every module this sequence touches (voiceSlice,
davisSlice, history, queueTransport, useVoiceMixDriver, useQueueTransport,
data/voices) is **empty** — the code that ran in the session is byte-identical
to this tree in all relevant paths, so results here transfer to the session
build.

## Reproduction attempts (all on this tree)

1. **Store-level, exact sequence** (`repro-2479.mjs`, scratch, deleted after
   the run): real zustand store + real live resolver, 5 captured hits, queue
   morphs to HIT 2/5 driven to completion, the full flurry, phrase ticks.
   Nodes stayed 107–362 at every step. One beat-triggered ALL evolve dipped
   to 10 nodes — the count dice floor at work (see audit) — never 0. Undo
   restored earlier states.
2. **Store-level, every layout mode** (`repro-2479-modes.mjs`, scratch,
   deleted): the same sequence swept across all modes, 30–120 resolver
   frames per step. No mode reached 0 (minima: random 11, noise 25, ca 33,
   truchet 38, streamline 45; most ≥ 65). Undo always restored ≈107.
3. **Live browser, shipped agent bridge** (`repro-2479-browser.mjs`,
   scratch, deleted): the built app (build hash a2872eea) driven through
   `window.__KC_UI__` exactly as the stress session drove the hosted build —
   5 hits captured, three flagship voice loads with a mix left standing at
   50% (the session's B19 ingredient), PLAY + morph, HIT 2 recall, STOP, the
   TIME/SEED/PALETTE/ALL flips, source BEAT, morph OFF, phrase ON + METRO +
   EUCLID, 30s settle, three Undos, Hit 1 recall. Node counts: 12 → 49 →
   100 → 80, stable through every step and every Undo; the stage never
   emptied. (Headless SwiftShader runs at 0.2–0.8 fps, so loop-time drivers
   advance slowly in-browser; the timed evolve ticks and phrase wraps those
   drivers produce were exercised directly at store level in attempts 1–2.)

## Root-cause audit — why the sequence cannot empty the stage

Node count is the live resolver's placement count. The resolver can only
reach 0 if one of its inputs collapses. Every writer of those inputs was
read:

- **`enabledAssets`** (a non-null map is a whitelist — an empty or all-off
  map yields 0 placements on every layer; this is the only single-field
  route to exactly 0). Writers: the ASSETS panel (ALL ON writes the full
  catalog map; per-asset toggles flip single keys), `commitVoiceMix`,
  keep/favorite recall, history restore, scene load. `commitVoiceMix`'s two
  branches: `'all'` rebuilds the map from the keys already present (it can
  widen, never empty); the curated branch copies the voice's own map. All
  four flagship voices carry a 4-asset pool (verified by importing
  `FLAGSHIP_VOICES`); user voices pass `sanitizeUserVoice`, which defaults a
  missing assets field to `'all'`. No shipped voice resolves to an empty or
  all-off map, so no voice commit — including the bounded-crawl commit that
  lands a stuck mix (the likely truth behind B19's mix "disappearing on its
  own") — can zero the pool.
- **`layoutParams.count`**: evolve dice ranges floor at 30 (DICE_RANGES);
  voice params are fixed positive counts; keep configs carry captured
  counts. The 10-node dip in attempt 1 is this floor plus mode geometry,
  and it recovers on the next roll — it is not the reported defect.
- **`layers`**: only a keep carrying a stack replaces layers, and it
  replaces them with a real captured stack.
- **`caGrid`**: phrase `step-ca` wraps step the grid; it is captured and
  restored by history like everything else, and Life at session density on
  the 40×28 torus does not go extinct (mode sweep: ca minimum 33).
- **Phrase / beat / queue drivers** (`phraseTick.js`, `beatArbiter.js`,
  `usePhraseLoop`, `useQueueTransport`, `triggerEvolve`): they write seed,
  palette, layout params and queue state only — no path to any field above
  except through the guarded writers already covered.
- **Undo**: history entries capture caGrid, layoutParams, enabledAssets,
  seed and palette; a morph pushes a forced entry holding the pre-morph
  state. The session's Undo demonstrably popped (12→11, redo 0→1), so an
  entry applied — under this code the only way that leaves 0 nodes is if
  the captured state was already node-less, i.e. the zeroing (whatever it
  was) happened **before** the step the session could see, or arrived from
  outside this sequence entirely.

**Conclusion:** one defect or two cannot be distinguished from the session
record, because no defect in the sequence exists on this tree to dissect.
The remaining un-eliminated lead is state arriving from outside the PLAY
sequence — e.g. a loaded project whose saved `enabledAssets` map has keys
but every value off (the scene-load guard checks key count, not values).
There is no evidence the session loaded such a project mid-sequence (it
began from a working 184-node stage), so it is recorded here as a lead for
any future recurrence, not as the root cause of this finding.

## What was built

- `app/src/state/playUndoStage.selfcheck.mjs` — new suite. Drives the real
  store through the issue's exact sequence in **all 28 layout modes**,
  counting nodes through the real live resolver after every step and
  asserting the stage never reaches 0; commits every flagship voice plus an
  `'all'`-assets user voice and asserts a live pool after each; pins the
  Undo pair directly (morph hit 1 → hit 2, finish, one Undo restores the
  pre-morph count and a live stage); then undoes down the whole sequence
  stack asserting the stage never passes through 0. Runs in ~4s.
- `app/selfcheck.manifest` — one line registering the suite after
  `queueTransport.selfcheck.mjs`.

**Mutation proof:** with `commitVoiceMix` temporarily patched to write an
empty pool, the suite fails with `voice swarm: commit left an all-off asset
pool`. The mutation was reverted immediately after the probe.

## Verification

- New suite: `playUndoStage.selfcheck: OK (28 modes x issue sequence, 4
  voice commits, morph-undo restore)`.
- Targeted neighbors, 12/12 pass: useVoiceMixDriver, usePhraseLoop,
  personaUndo, undoLayers, undoSeedOffsets, phraseTick, beatArbiter,
  voiceSlice, voices (data), queueTransport, favorites, curator voice.
- `npm run lint`: 0 errors (11 warnings, all pre-existing; the new file is
  clean standalone).
- `npm run format:check`: clean (the new suite was prettier-formatted).
- `npm run build`: green.
- Full manifest sweep (continue-on-error, verdict lines counted from the
  sweep log only): **828 PASS / 3 FAIL of 831**. The three failures are the
  known sandbox-environmental set, A/B-proven identical on a pristine
  origin/main checkout (same exit codes): swarmWasm (exit 1), rollSafety
  (exit 1), accum (exit 134). This branch changes no production code, so
  nothing in the sweep is attributable to it.

## Deliberately not done

- **No production-code fix.** No mechanism that empties the stage exists in
  this sequence on this tree; patching a guessed seam would be a symptom
  patch against the standing right-fix rule, and would risk the pool/morph
  behavior the new suite now pins.
- **No change to the scene-load `enabledAssets` guard** (the residual lead
  above): it belongs to a different finding than the one filed, with no
  session evidence behind it. It is named here so a recurrence — or a
  deliberate follow-up issue — starts from it.
- The session's exact live conditions (a real microphone driving beat
  attacks at 40–60 fps over minutes, the session's own saved project) cannot
  be recreated in the sandbox; the store-level sweep covers the same driver
  code paths those conditions feed.
