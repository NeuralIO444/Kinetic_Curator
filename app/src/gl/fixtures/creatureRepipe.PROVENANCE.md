# Creature repipe gate fixture — provenance (#1694 slice 1, step 0)

- **What:** one scripted 15-second performance with the creature channel UP — auto spawn finding homes, the
  formation rule forming moths, Davis stamping traits at birth, the first formed pin hosting the dish creature —
  recorded through the app's real recording taps (the performance recorder on the resolve taps), with the
  channel wired exactly as the app wires it today: App's frame tap feeding the singleton trackers
  (curator/formationLive.js / curator/spawnLive.js), their decisions riding the next frame's resolver input
  through the resolveTap providers.
- **File:** `creatureRepipe.kcperf` — 17766 bytes, sha256 `f50eea1384ade8651e5132024e350ce70f0bbcdf34dc359ce08b6754b4d65edd`
  (before the 2026-10-20 travel re-record: 17750 bytes, sha256 `7e99c5b58ea07a8c4d38c23a6825e5e21a727bfe0485c9a4120bcc9f76428cd3`;
  originally 17762 bytes, sha256 `f2da28316587552fe204aa79b67545b3ee758fbb94ad60b29acf169218bd1b01` — see the
  checkpoint re-record below; the recorded inputs are unchanged).
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
- **Checkpoint re-record (2026-10-19, #1694 slice S3, Matt's ruling):** S3 made the creature count a BUILD
  layout param (`creatures`), so the resolver's hashed output gained exactly one key and all 16 checkpoints
  moved — the same mechanism as the #1183 weatherAir re-record. The repipe itself never re-recorded this
  fixture: S1–S3 verified against it unmodified, and before this re-record the strip proof showed that with
  the `creatures` key removed from the shared defaults, the ORIGINAL checkpoints verify 16/16 on S3 code —
  the divergence is the key, only the key. Under Matt's ruling, the checkpoints — and only the checkpoints —
  were re-recorded on top of commit `421fb188` by replaying the fixture's own recorded inputs through the
  S3 resolver (the original recorder script no longer runs: S1 retired the provider channel it wires).
  Proven first: the same refresh run against the pre-S3 tree reproduces the original fixture byte-for-byte,
  and the branch refresh is deterministic across runs. A deep diff of old vs new file shows exactly 16
  differing leaves — the checkpoint hashes; the inputs (the pristine pre-repipe take, with its recorded
  spawn/formation decisions) are byte-identical.
- **Re-record:** NEVER by the repipe. This fixture is the slice's contract: `gl/creatureGate.selfcheck.mjs`
  replays it through the repiped resolver and every checkpoint must match unmodified. If a later intentional
  behaviour change ever moves creature replay, that change re-records in its own PR and says so, with the
  reason — the gate's rule since #1638. (The 2026-10-19 checkpoint re-record above is that sanctioned path,
  taken once the repipe was complete.)
- **Checkpoint re-record (2026-10-20, travel kinemes #1574–#1576, Matt's publish ruling on #1574):** the same
  sanctioned path as the S3 re-record. The stack added seven layout params (transport, transportPath,
  transportLeash, transportFlow, transportCeiling, transportParallax, transportSurge; the shared default keeps
  transport 'still'), so the resolver's hashed output gained exactly those keys and all 16 checkpoints moved.
  Proven first: with the seven keys stripped from the shared defaults the ORIGINAL checkpoints verify 16/16 on
  the stack's code; the refresh run on the base tree reproduces the previous file byte-for-byte; the refresh is
  deterministic across runs; a deep diff of old vs new shows exactly 16 differing leaves — the checkpoint
  hashes. The recorded inputs are byte-identical.
