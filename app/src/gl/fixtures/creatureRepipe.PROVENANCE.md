# Creature repipe gate fixture — provenance (#1694 slice 1, step 0)

- **What:** one scripted 15-second performance with the creature channel UP — auto spawn finding homes, the
  formation rule forming moths, Davis stamping traits at birth, the first formed pin hosting the dish creature —
  recorded through the app's real recording taps (the performance recorder on the resolve taps), with the
  channel wired exactly as the app wires it today: App's frame tap feeding the singleton trackers
  (curator/formationLive.js / curator/spawnLive.js), their decisions riding the next frame's resolver input
  through the resolveTap providers.
- **File:** `creatureRepipe.kcperf` — 17750 bytes, sha256 `7e99c5b58ea07a8c4d38c23a6825e5e21a727bfe0485c9a4120bcc9f76428cd3`
  (originally 17762 bytes, sha256 `f2da28316587552fe204aa79b67545b3ee758fbb94ad60b29acf169218bd1b01` — see the
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

## Checkpoint refresh — 2026-10-20, #1574 publish (Matt's re-record ruling)

Checkpoints refreshed on the #1574 branch tip `2c8661be` under the publish re-record
ruling recorded on #1574 (2026-10-20), following the #1356 F1/F2 finish discipline: the
fixture's recorded INPUTS are untouched (deep diff: inputs byte-identical; all 16
checkpoint hashes re-stamped, nothing else). The refresh replays the fixture's own
inputs through the current resolver and harvests the checkpoint chain — the same loop
verifyPerformance runs. Cause: the travel layout keys' echo in the hashed resolver
output (see the replayGate provenance note of the same date; wingWarp's strip proof
there is the resolver-level evidence). Control: the same refresh on clean main
`6946f393` reproduces the prior fixture byte-for-byte (sha256 7e99c5b5…); the branch
refresh is deterministic (two runs, identical sha256). Note: the session recorder
script (scripts/recordCreatureRepipeFixture.mjs) no longer runs on main — the repipe
removed a resolveTap export it imports; the refresh path above is the working route
for this fixture until that script is repaired.

## Checkpoint refresh — 2026-10-20, #1575 publish (Matt's re-record ruling)

Checkpoints refreshed on the rebased #1575 branch tip `bc7918b6` under the publish
re-record ruling recorded on #1574 (2026-10-20), same discipline as the #1574 finish:
the fixture's recorded INPUTS are untouched (deep diff: inputs byte-identical; all 16
checkpoint hashes re-stamped, nothing else). Cause: P2's travel keys echo in the
hashed resolver output (see the replayGate provenance note of the same date). Control:
the same refresh on clean main `c5fc8758` reproduces main's fixture byte-for-byte
(sha256 7b2dcd02…); the branch refresh is deterministic (two runs, identical sha256).

## Checkpoint refresh — 2026-10-20, #1576 publish (Matt's re-record ruling)

Checkpoints refreshed on the rebased #1576 branch tip `dfdbb82a` under the publish
re-record ruling recorded on #1574 (2026-10-20), same discipline as the #1574/#1575
finishes: the fixture's recorded INPUTS are untouched (deep diff: inputs
byte-identical; all 16 checkpoint hashes re-stamped, nothing else). Cause: P3's
travel keys echo in the hashed resolver output (see the replayGate provenance note
of the same date). Control: the same refresh on clean main `307253a7` reproduces
main's fixture byte-for-byte (sha256 e54eab5d…); the branch refresh is
deterministic (two runs, identical sha256).
