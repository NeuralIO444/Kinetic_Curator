# Replay gate fixture — provenance (#1638)

- **What:** one scripted 60-second performance, recorded through the app's real recording taps
  (the performance recorder on the resolve taps, the spectrum recorder on the spectrum tap).
- **File:** `replayGate.kcperf` — 144263 bytes, sha256 `fbfe74f67f5cc5d867c29fa645f013f3cfdb05853f944493892cab7a90a240c1`.
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
- **Recorded with:** `node scripts/recordReplayGateFixture.mjs` on commit `bc7918b6`.
- **Re-record:** run the same command. It is deterministic — the sha256 must be identical unless
  behaviour changed. When an intentional behaviour change moves the replay, re-record in the same
  PR and say so in its body, with the reason. Never re-record just to make a red gate green.

## Re-record — 2026-10-20, #1575 publish (Matt's re-record ruling)

Re-recorded on the rebased #1575 branch tip `bc7918b6` (travel kinemes P2 PATH
transports + the Q4 per-stratum leashes) under the publish re-record ruling recorded
on #1574 (2026-10-20). Cause, proven before re-recording: P2's travel keys
(transportPath / transportSpeed / transportRadius at their parity defaults
orbit/1/140) echo into the recorded inputs and the hashed resolver output — Q4 added
no keys and changed no travel math. Deep diff against main's fixture (the #1574
finish): inputs gain exactly 6 additive leaves (the three P2 keys in frame 0's
layout params, live and in one snapshot); the spectrum section is unchanged; all 61
checkpoint hashes moved on the key echo alone. WingWarp strip proof on this branch:
all six travel keys removed from the shared defaults (scratch tree) → the resolver
hashes return to dc0897fb / 017f6b2a exactly. Controls: the same recorder and the
creature refresh, run on clean main `c5fc8758`, reproduce main's fixtures
byte-for-byte. Deterministic: recorded twice, identical sha256 both runs.
