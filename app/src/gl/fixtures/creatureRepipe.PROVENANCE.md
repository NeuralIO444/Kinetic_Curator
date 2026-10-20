# Creature repipe gate fixture — provenance (#1694 slice 1, step 0)

- **What:** one scripted 15-second performance with the creature channel UP — auto spawn finding homes, the
  formation rule forming moths, Davis stamping traits at birth, the first formed pin hosting the dish creature —
  recorded through the app's real recording taps (the performance recorder on the resolve taps), with the
  channel wired exactly as the app wires it today: App's frame tap feeding the singleton trackers
  (curator/formationLive.js / curator/spawnLive.js), their decisions riding the next frame's resolver input
  through the resolveTap providers.
- **File:** `creatureRepipe.kcperf` — 17762 bytes, sha256 `f2da28316587552fe204aa79b67545b3ee758fbb94ad60b29acf169218bd1b01`.
- **Frames:** 901 (0..900), 16 checkpoints (every 60 frames).
- **Seed:** 4242, constant. Canvas 1000x700, one content layer, layout mode 'random', count 380 marks,
  palette 'bone' — the performanceCreatures session's dish (count 380 marks here, for crowds deep enough to
  grow a second pair of wings), lengthened and fully stamped (band + hosted + pressure ride the input as
  liveLoop stamps them).
- **Script:** creatureCount 2 → 3 at frame 300 → 2 at frame 750. Stress band NORMAL → TIGHTEN at frame 300 →
  NORMAL at frame 600 → RELAX at frame 750 (a pure function of the frame, handed to the formation rule and
  stamped on the input as liveLoop stamps the stress tracker's band). Session outcome at record time:
  up to 3 standing homes, 4 recorded birth-stamp steps, second-pair growth seen,
  dish hosting seen, final frame carrying 110 moth marks and 16 dish-creature marks.
- **Recorded with:** `node scripts/recordCreatureRepipeFixture.mjs` on commit `63da9b44` — the PRISTINE
  pre-repipe code. The script records the session twice and refuses to write unless the two packed takes are
  byte-identical (sha256 above is both runs').
- **Re-record:** NEVER by the repipe. This fixture is the slice's contract: `gl/creatureGate.selfcheck.mjs`
  replays it through the repiped resolver and every checkpoint must match unmodified. If a later intentional
  behaviour change ever moves creature replay, that change re-records in its own PR and says so, with the
  reason — the gate's rule since #1638.
