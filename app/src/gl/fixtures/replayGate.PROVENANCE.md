# Replay gate fixture — provenance (#1638)

- **What:** one scripted 60-second performance, recorded through the app's real recording taps
  (the performance recorder on the resolve taps, the spectrum recorder on the spectrum tap).
- **File:** `replayGate.kcperf` — 144276 bytes, sha256 `a47a296758d50bc0585f4e4155c81d0c2fb5fd732da519de9cbb84d0ac687733`.
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
- **Recorded with:** `node scripts/recordReplayGateFixture.mjs` on commit `262a4f64`.
- **Re-record:** run the same command. It is deterministic — the sha256 must be identical unless
  behaviour changed. When an intentional behaviour change moves the replay, re-record in the same
  PR and say so in its body, with the reason. Never re-record just to make a red gate green.
- **#1356 publish finish (2026-10-21, Matt's re-record ruling):** the finishing look pass's
  layered part art (F1) and dish accent split (F2) rehash every take drawing the enriched
  parts (items embed the full asset record). Re-recorded on the rebased branch (base main
  `bd9a181d`): sha256 6d40b91c… → a47a2967…, 144276 bytes; deep diff vs main's fixture =
  61 checkpoint hashes changed, nothing else — recorded inputs byte-identical. Control:
  the recorder on clean main `bd9a181d` reproduces main's fixture byte-for-byte; the
  branch recording is deterministic across two runs. A first re-record staged 2026-10-20
  against the pre-travel fixture was superseded by the publish rebase and re-done here.
- **#1794 checkpoint refresh (2026-10-30):** the streamline sampler added its knob family
  (streamlineTraces / streamlineSteps / streamlineStep) to the shared layout defaults; a new
  default key echoes into the hashed resolver output, so every checkpoint moves while the
  recorded inputs stay untouched — the sanctioned shape (same as #1183 / #1694 S3 / travel).
  Checkpoint-only refresh via `scripts/refreshFixtureCheckpoints.mjs --write`: sha256
  a47a2967… → a51ba1e4…, 144276 bytes; deep diff = 61 checkpoint hashes changed, nothing else
  (nonCheckpointDiffs []). Control: with the three keys stripped (`--strip
  streamlineTraces,streamlineSteps,streamlineStep`) the pre-refresh fixture verifies
  byte-for-byte on this tree — the divergence is the keys, only the keys; the refresh is
  deterministic (two runs, identical sha256).
