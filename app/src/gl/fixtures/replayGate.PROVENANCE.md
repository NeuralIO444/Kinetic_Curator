# Replay gate fixture — provenance (#1638)

- **What:** one scripted 60-second performance, recorded through the app's real recording taps
  (the performance recorder on the resolve taps, the spectrum recorder on the spectrum tap).
- **File:** `replayGate.kcperf` — 144266 bytes, sha256 `6d40b91c249499501ea1c7f45c7684116b88c15a7e9bd2e62bbe68dafb98ce88`.
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
- **Recorded with:** `node scripts/recordReplayGateFixture.mjs` on commit `dfdbb82a`.
- **Re-record:** run the same command. It is deterministic — the sha256 must be identical unless
  behaviour changed. When an intentional behaviour change moves the replay, re-record in the same
  PR and say so in its body, with the reason. Never re-record just to make a red gate green.

## Re-record — 2026-10-20, #1576 publish (Matt's re-record ruling)

Re-recorded on the rebased #1576 branch tip `dfdbb82a` (travel kinemes P3 SURGE +
parallax drift + the Q3 Queen-stamped surge trigger) under the publish re-record
ruling recorded on #1574 (2026-10-20). Cause, proven before re-recording: P3's
travel keys (transportSurge / transportParallax at their parity defaults 0/0)
echo into the recorded inputs and the hashed resolver output — Q3 added no keys
(its surgeTrigger is recorded input data, not a layout param) and changed no
travel math. Deep diff against main's fixture (the #1575 finish): inputs gain
exactly 4 additive leaves (the two P3 keys in frame 0's layout params, live and
in one snapshot); the spectrum section is unchanged; all 61 checkpoint hashes
moved on the key echo alone. WingWarp strip proof on this branch: all eight
travel keys removed from the shared defaults (scratch tree) → the resolver
hashes return to dc0897fb / 017f6b2a exactly. Controls: the same recorder and the
creature refresh, run on clean main `307253a7`, reproduce main's fixtures
byte-for-byte. Deterministic: recorded twice, identical sha256 both runs.
