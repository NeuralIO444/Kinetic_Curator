# Phase 1 plan: the dish spine (#1353)

**Status:** proposal for Matt's approval. No engine code changes until approved.
**Roadmap:** [`ROADMAP_PETRI_DISH.md`](../ROADMAP_PETRI_DISH.md), Phase 1.
**Exit:** export a live session, import it, replay it with the recorded governor note applied, and the frame hashes match the live run. Normal playback is per machine (decision 2).

## The short version

This is a smaller job than "move the instrument onto a new engine". The live instrument already computes each frame
from explicit inputs through one function, and that function is already deterministic. What is missing is recording
those inputs and replaying them through the same function. The stand-in simulation the current replayer steps is the
part to retire, not the live pipeline.

## What I measured (2026-10-11)

- **Wall-clock and randomness are already gone from the frame path.** An earlier refactor (Spine A, #387) replaced
  `Date.now()` with a loop-owned clock. In `liveLoop.mjs`, `liveResolve.mjs` and `particles.js` the remaining
  `Date.now` / `Math.random` hits are comments only.
- **One function builds the frame.** `liveLoop` assembles an `input` object each frame and calls
  `createLiveResolver().resolveLayers(input)`. The inputs are explicit: `dtSec`, `loopTimeMs`, seed and sub-seeds,
  layout params, layers and snapshots, palette, the audio-modulated ranges (`effectiveScale`, `effectiveAlpha`), the
  attractor, and the governor's state (`quality`, `perfTier`, `slowRender`).
- **It is deterministic.** Probe: two fresh resolvers, fed the same 120-frame input sequence (varying frame time, a
  count change, a seed change, an attractor that comes and goes, a modulated scale range), produced identical output
  on every frame in all 12 modes tried: scatter, grid, swarm, flow, murmuration, dla, poisson, brush, orbit, noise,
  gaussian, circlepack. The same digests came out of two separate processes.

**What the probe did not cover** (so the plan tests them before relying on them): multi-layer scenes, FIELD/FEED/MOD
patches between layers, the kineme and pattern systems, FX layers, and a second JavaScript engine (Safari on iPad).

## What "replay matches the live run" will mean

- **Matches:** the resolved items every frame (position, scale, rotation, alpha, asset, tint), hashed per frame.
  That is the instrument's state.
- **Does not promise:** identical pixels across different GPUs. Rendering is deterministic for the same items on the
  same GPU, but two graphics cards can round differently. The exit is about state, and the doc says so.
- **Same engine first.** Chrome-to-Chrome is the guarantee. Chrome-to-Safari needs the deterministic-trig work
  (#1240) because the two engines implement some math functions differently. That is called out, not hidden.

## Steps (one PR each, each with byte-identical defaults)

| # | Step | Touches a one-writer file? | Visible change |
|---|---|---|---|
| 1 | **Determinism harness.** Turn the probe into a selfcheck and extend it to multi-layer, FIELD/FEED/MOD, kineme, pattern and FX. Any mode that diverges is fixed here. | No | None |
| 2 | **Input tap.** One hook where `liveLoop` hands `input` to the resolver, feeding a recorder. Record changes only, with frame time quantized. | **Yes: one line in `liveLoop.mjs`** | None |
| 3 | **Performance file v2 and a real replayer.** The file holds the starting document plus the per-frame input changes and hash checkpoints. The replayer runs the same resolver headless. Selfcheck: record, export, import, replay, hashes match. | No | None |
| 4 | **The footer `rec` control**: start a take (the scene restarts, decision 4), stop to download the performance. Replaces the stopgap `log` export. No in-app import or playback this cycle (decision 3). | **Yes: a reset hook in `liveLoop.mjs`** | Footer button; Matt's eye |
| 5 | **The dish becomes the source of truth.** The resolver owns one dish per document and every layer fills it as a stratum (#1183). The dish roster (#1203) can then replace the LAYERS mixer. | **Yes: `liveResolve.mjs`** | Later, with #1203 |
| 6 | **Retire the stand-in.** The old replayer's own cohort and goldens become kernel unit goldens (they still pin kernel pieces) and stop being described as performances. | No | None |

Steps 1 to 3 deliver the Phase 1 exit. Steps 4 to 6 finish the phase.

## Decisions (Matt, 2026-10-11)

1. **Frame time is recorded in the file.** The live loop uses the real frame time, clamped to 8 to 50 ms, and that is
   what keeps motion smooth under load. The file records it per frame (about 25 KB for 2.5 minutes), so nothing about
   the feel changes. A fixed 1/60 step was rejected: it would stutter on slow frames.
2. **Detail is per machine. The performance is the artist's intent, not the weaker machine's limit.** "If you sketch
   on a laptop and perform on a bigger machine, we want to see an improvement." So playback never applies the
   original machine's shedding: each machine's own governor decides how much detail it can show.
   - The governor's state (`quality`, `perfTier`, `slowRender`, asset thinning) is still written to the file, as a
     **note, never an instruction**. Normal playback ignores it.
   - The automated check uses the note: it replays once with the recorded shedding applied, to prove the replay is
     exact frame for frame. That keeps the Phase 1 exit provable.
   - The file can therefore say where the original shed detail, which explains why a performance looks richer on a
     stronger machine.
   - This is a deliberate exception to "the log wins" (roadmap decision 1): the log is the authority for what the
     artist did, and the machine is the authority for how much it can draw.
3. **No live playback this cycle.** Performance files are for testing and sharing. Watching a file play inside the
   running instrument needs a playback mode in `liveLoop`; it is out of scope until Matt re-orders it. So the footer
   gets an honest **export**, and there is no in-app import yet: a file is verified headless, by the check.
4. **`rec` restarts the scene.** Found while building step 4: a take started mid-session does not replay from a
   fresh start, because the frame-builder carries state from before the take (swarm physics, the feed delay, shared
   scent, morph ledgers) and the file only holds inputs from the moment of `rec`. So pressing `rec` resets the
   frame-builder and the take begins from a known state. The motion re-settles for a moment, like a count-in.
   Rejected: always recording from launch (a cost every frame for everyone, and it keeps the first 20 minutes, not
   the last), and serializing the full state (the largest job; it is what retroactive capture, #1367, will need).

## Risks

- **Hidden state the probe missed.** Step 1 exists to find it. If a system cannot be made deterministic cheaply, it
  is named and excluded from the exit rather than papered over.
- **File size.** Recording changes only, plus quantized frame time, should stay in tens of kilobytes per few
  minutes. Step 3's selfcheck asserts a ceiling.
- **One-writer files.** Steps 2 and 5 are the only ones that touch them, each as small as possible and alone in its PR.
