# STAGING REPORT — #1640 "The Queen's lean, applied"

**Branch:** `ember/1640-queen-lean-applied` · **Base:** origin/main `3d79c141` · **Status:** LOCAL COMMITS ONLY — not pushed, no PR. Coordinator publishes.

## What shipped

The Queen's validated Mind lean (`{ wetness?, evolve? }`, 0..1 each — contract-validated since #1462 and, until now, applied nowhere) now moves the two dials Matt's 2026-10-16 ruling named: the **WETNESS dial** (`accumulationWetness`) and the **EVOLVE rate** (`evolveInterval`). It is the tempo ease's (M7, #1460) shape aimed at two more dials — no parallel mechanism invented:

- **`app/src/curator/queenLean.mjs` — M8 pure mechanics.** `wetnessLean` / `evolveLean` (plus `…Open` ungated twins), gated exactly like M7: MIN_KEEPS floor (8), the room's allowance > 0, a missing/non-numeric lean key = no move, closed gate = null. Bounded step scaled by `(0.5 + 0.5·allowance)`, dead-band so she stops instead of chasing the last wobble, null = no move. No clock, no randomness — pure functions of (current, lean, keeps, allowance).
- **`app/src/curator/director.js` — the host.** `leanDialSteps({ lean, wetness, evolveInterval, keeps, allowance })`, mirroring `paceStep`: counts the pull's keeps, returns `{ wetness, evolveInterval, pull }` (next values or nulls; `pull` = largest remaining gap as a fraction of span, for the mark). A throw reads as no move.
- **`app/src/curator/leanLive.js` — the driver (new), mirroring `paceLive.js`.** Holds the latest validated lean from `MIND_DECISION` (persona `queen` only). Steps **only inside an audio-silence window** (`AUDIO_SILENCE_START` opens it), **once per phrase** (CLOCK_BAR, every `PHRASE_BARS`). Writes travel the artist's own pipes with `{ cause: 'lean' }`: `LAYOUT_PARAM { key: 'accumulationWetness', value }` and `DAVIS_EVOLVE { interval }`. **Hand-silence, pace's rule unchanged:** any write to either dial that is not her own step (cause ≠ 'lean') — slider, preset, dice, MIDI — releases **both** dials until the silence ends or the input changes (`AUDIO_SILENCE_END` / `AUDIO_INPUT` re-arm). Her mark shows via a new fourth hand in `swayView.mjs` (`setDialMagnitude`; `getSwayMagnitude` is the max of the hands, as before).
- **`app/src/App.jsx` — wiring.** `startLean` beside `startPace`, same `roomNow` context (keeps + allowance), getters read `layoutParams.accumulationWetness` / `evolveInterval` from the store; `stopLean()` in the cleanup list.
- **`app/src/composition/eventRegistry.js` — honesty.** `leanLive.js` added to the handler lists of the five events it actually handles (MIND_DECISION, AUDIO_SILENCE_START/END, AUDIO_INPUT, CLOCK_BAR). LAYOUT_PARAM/DAVIS_EVOLVE stay `handler: 'wire'` per precedent (other bus listeners are unlisted there).

## Bounds chosen (flagged design calls)

1. **Wetness step 0.05 / phrase at full hand, dead-band 0.02, span [0, 1].** M7's step is ≈2.5% of its span (3 of 120 BPM); wetness at 5% of span converges 0 → 0.62 in ~12 phrases (~96 s at 120 BPM, comparable to the tempo ease's 100 → 130 in 10 phrases). Rounded to 3 decimals, like M7 rounds BPM to 0.1.
2. **Evolve read as a rate target:** goal interval = `10000 − lean × 9800` ms (lean 1 = the dial's fastest 200 ms, lean 0 = its slowest 10000 ms) — the symmetric reading of wetness (a target in the dial's own terms; the contract validates both keys identically). **Step 250 ms / phrase (~2.5% of the 9800 span, M7's fraction), dead-band 100 ms**, integer ms.
3. **M7's third gate (measurement confidence ≥ 0.6) has no analogue** — a validated lean *is* the measurement; a missing key is its absent case. Documented in the M8 header comment.
4. **"Artist activity" = a hand on either dial** (the ruling's words), implemented as pace's bus rule — not `loisActivity.idleMs`: wall-clock idleness would break replay determinism. Silence-end / input-change re-arm, exactly pace's release conditions.
5. Only `DAVIS_EVOLVE` writes **carrying an interval** count as a hand on the evolve dial — the event also carries `{mode}`, `{toggle}`, `{bumpSeed}`, `{beatRoute}`, `{source}` writes, which are not the dial and do not silence her.

## Verification evidence

- **Family:** queenLean **24 checks** (20 + 4 new M8) · queenDeniability **7** (6 + 1 new: the driver reaches the dials only through the bus — no store, no hidden module, no identifier) · **leanLive 7 (new suite)** · paceLive 5 · mind 15 · mindFace 7 · director 13 · directorSway 10 · busChain 11 · eventRegistry ok (161 events) · audioBus 3 · loisActivity ok.
- **Acceptance, proven on the bus in `leanLive.selfcheck`:** silence + lean { wetness 0.62, evolve 1 } moves both defaults in bounded steps (0.05 / 250 ms per phrase), mark visible while moving and gone at arrival (settles wetness 0.62, interval 250 ms); the identical event sequence replays to identical writes (deep-equal); empty lean / another persona's lean / no decision → zero writes, dials bit-identical; a hand on **either** dial releases **both** until silence-end or input-change; gates shut (allowance 0, < 8 keeps, window closed) → nothing.
- **Registry pins updated where the truth changed:** `mind.selfcheck` (MIND_DECISION handlers) and `audioBus.selfcheck` (AUDIO_INPUT / SILENCE_START / SILENCE_END handlers; AUDIO_TEMPO explicitly **not** hers) — both now assert the true lists including `curator/leanLive.js`.
- **Full manifest sweep** (451-line manifest, run in segments because the runner stops at first failure): every suite passed **except two base-identical sandbox exceptions**, each proven on a pristine checkout of origin/main `3d79c141` (`~/workspace/kc-1640-pristine`, left in place — scratch, safe to remove):
  - `swarmWasm.selfcheck` — fails identically on pristine: `cargo not found on PATH` (known sandbox exception; CI authoritative).
  - `fx/rollSafety.selfcheck` — non-completion identically on pristine (still running at a 60 s timeout there; 4+ min in this tree; known sandbox exception; CI authoritative).
  - `gl/accum.selfcheck` ballooned to ~3.2 GB RSS mid-run (the known V8 pressure) but **completed and passed** in this tree.
  - The new suite `leanLive.selfcheck.mjs` is registered in `app/selfcheck.manifest` directly after `paceLive` and ran green inside the sweep.
- **`npm run build` green** (✓ built in 2.99 s; only the pre-existing Tauri dynamic-import warning).
- **ESLint on all 11 touched code/test files: 0 errors.** The 3 `react-hooks/exhaustive-deps` warnings in App.jsx are pre-existing — identical on pristine App.jsx (same warnings, line numbers shifted by this change's +8 lines).

## Surprises / notes for the coordinator

- **Two suites pin the registry's handler lists exactly** (mind, audioBus) — any future driver addition will trip them; they're the registry's honesty enforcement and were updated, not weakened (the lists they assert are now *more* complete).
- **Known pre-existing quirk, unchanged:** `loisActivity` counts every LAYOUT_PARAM as a control tweak regardless of cause, so her wetness steps are recorded in LOIS's tweak ledger as dial moves (a control *did* move; they do **not** call its activity `beat()`, so the idle clock is untouched). Pace's BPM writes have no equivalent ledger. Flagging, not fixing — out of #1640's scope.
- **Take playback:** replayed decisions re-publish on the bus with cause 'replay'; if a silence window is open during playback the driver can step the *live* store's dials — the take itself renders from its own recorded writes, so replay of the take is unaffected. This exposure is pace-shaped (pace likewise keeps listening during playback) and was left as the precedent stands.
- During a live silence her steps land through `wireEventBus` like any hand move, so they are recorded in a take as ordinary dial writes — that *is* the replay record, which is why the replay test can be exact.
