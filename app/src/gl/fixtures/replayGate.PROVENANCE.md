# Replay gate fixture — provenance (#1638)

- **What:** one scripted 60-second performance, recorded through the app's real recording taps
  (the performance recorder on the resolve taps, the spectrum recorder on the spectrum tap).
- **File:** `replayGate.kcperf` — 144176 bytes, sha256 `7f3cd07a3ed4df17d427c1e00e6e1b02f95d2f421630580dc36e1b0ea99597dd`
  (before the travel checkpoint re-record below: 144195 bytes, sha256 `23bd414f4977cdf8fcac454436ffa9eb9192c84f406b8a704f64226f915516f3`).
- **Frames:** 3601 (0..3600), 61 checkpoints (every 60 frames).
- **Seed:** 1234 (changed to 77 at frame 3001, as the script's artist changes it).
- **Look:** layout params from the generator script: swarm/scatter, count 220→260 at frame 900,
  mode gaussian from frame 2000, a QUILT pattern layer, palette 'bone'.
- **The hearing:** a deterministic synthetic analyser (two travelling dB bumps, a pure function of
  the frame — no clock, no RNG). The spectrum marks' dials are up for the whole take
  (SCALE 0.8 · DISPLACE 0.35 · COLOUR 0.5), so the file carries its spectrum section (#1534) —
  the hearing playback will reproduce. The gate's checkpoint comparison covers the resolver
  chain, which is what a take's hashes are made of; the marks ride the render contract, not
  the resolver, and never entered the chain.
- **Recorded with:** `node scripts/recordReplayGateFixture.mjs` on commit `421fb188`.
- **Re-record:** run the same command. It is deterministic — the sha256 must be identical unless
  behaviour changed. When an intentional behaviour change moves the replay, re-record in the same
  PR and say so in its body, with the reason. Never re-record just to make a red gate green.
- **Checkpoint re-record (2026-10-20, travel kinemes #1574–#1576, Matt's publish ruling on #1574):** the stack
  added seven layout params (transport, transportPath, transportLeash, transportFlow, transportCeiling,
  transportParallax, transportSurge; the shared default keeps transport 'still'), so the resolver's hashed
  output gained exactly those keys and all 61 checkpoints moved. The checkpoints — and only the checkpoints —
  were re-recorded by replaying the fixture's own recorded inputs through the stack's resolver (the generator
  script was NOT re-run: it spreads the current defaults, which would change the inputs). Proven first: with
  the seven keys stripped from the shared defaults the ORIGINAL checkpoints verify 61/61 on the stack's code;
  the same refresh run on the base tree reproduces the previous file byte-for-byte; the refresh is
  deterministic across runs; a deep diff of old vs new shows exactly 61 differing leaves — the checkpoint
  hashes. The recorded inputs and the spectrum section are byte-identical.
