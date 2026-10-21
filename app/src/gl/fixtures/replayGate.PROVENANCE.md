# Replay gate fixture — provenance (#1638)

- **What:** one scripted 60-second performance, recorded through the app's real recording taps
  (the performance recorder on the resolve taps, the spectrum recorder on the spectrum tap).
- **File:** `replayGate.kcperf` — 144229 bytes, sha256 `726aea0b12e1f096ff3fdbf44654034300583fd5b47697429a8219794572db50`.
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
- **Recorded with:** `node scripts/recordReplayGateFixture.mjs` on commit `2c8661be`.
- **Re-record:** run the same command. It is deterministic — the sha256 must be identical unless
  behaviour changed. When an intentional behaviour change moves the replay, re-record in the same
  PR and say so in its body, with the reason. Never re-record just to make a red gate green.

## Re-record — 2026-10-20, #1574 publish (Matt's re-record ruling)

Re-recorded on the #1574 branch tip `2c8661be` (travel kinemes P1 + the Q2 traveler
budget) under the publish re-record ruling recorded on #1574 (2026-10-20). Cause, proven
before re-recording: P1's travel layout-param family (transport / transportLeash /
transportFlow at their parity defaults still/112/0.8) and Q2's travelIpadClass machine
key echo into the recorded inputs and the hashed resolver output — nothing else moved.
Deep diff against the prior fixture: inputs gain exactly 7 additive leaves (the three
travel keys in frame 0's layout params, live and in one snapshot, plus the machine key's
name in machineKeys); the spectrum section is unchanged; all 61 checkpoint hashes moved
on the key echo alone. Control: the same recorder run on clean main `6946f393`
reproduces the prior fixture byte-for-byte (sha256 23bd414f…). Deterministic: recorded
twice, identical sha256 both runs.
