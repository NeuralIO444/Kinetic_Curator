# Replay gate fixture — provenance (#1638)

- **What:** one scripted 60-second performance, recorded through the app's real recording taps
  (the performance recorder on the resolve taps, the spectrum recorder on the spectrum tap).
- **File:** `replayGate.kcperf` — 144315 bytes, sha256 `c958c9f9e71c5f426676b8a15fce2c53ce126c2813ddb7236c9a465e2215fcc6`.
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
- **Recorded with:** `node scripts/recordReplayGateFixture.mjs` on commit `92d77144`.
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
- **#1854 checkpoint refresh (2026-10-31):** the Marks chapter pool added 18 authored asset
  records to the catalog; the resolver's hashed output embeds asset state, so every
  checkpoint moves while the recorded inputs stay untouched — the sanctioned shape (same as
  #1794 / #1356). Checkpoint-only refresh via `scripts/refreshFixtureCheckpoints.mjs
  --write`: sha256 a51ba1e4… → 9253b8bf…, 144276 → 144283 bytes; deep diff = 61 checkpoint
  hashes changed, nothing else (nonCheckpointDiffs []). Control: with only ASSETS_MARKS
  removed from the authored index (scratch tree, every other #1854 file in place) the
  pre-refresh fixture verifies byte-for-byte on this tree — the divergence is the catalog
  growth, only the growth; the refresh is deterministic (the tool's two-run check).
- **#2178 re-record (2026-11-15, Matt's clean-break ruling on the issue):** PERFORMANCE_VERSION
  2 → 3 — the fluid body left the hashed resolver output, so v2 takes retire and the parser
  refuses them. This take carries no fluid; re-recorded with the same command on the #2178
  branch: sha256 9253b8bf… → c958c9f9…, 144283 → 144315 bytes. Control: all 61 checkpoint
  hashes are byte-identical to the v2 fixture's (read with the pre-bump parser on clean
  main) — the envelope version is the only change; the recorded session replays exactly.
