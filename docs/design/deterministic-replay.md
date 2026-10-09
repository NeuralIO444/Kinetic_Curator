# DESIGN (deferred) — Deterministic replay

## Goal

Seed + input event log → byte-identical session replay. Three
payoffs: time-travel debugging (reproduce any reported visual bug
exactly), golden regression tests (every kernel change replays the
goldens; bit drift fails CI), and shareable performances as tiny
files (a recipe + seed + event log is kilobytes — email it, and the
recipient renders your exact performance).

## Why later (deferred)

Replay re-runs the pipeline, so it needs the dish's fixed execution
order (§4) to exist first — replaying today's ad-hoc ordering would
fossilize it. It needs frame-quantized events, which is the worker
design's protocol work (frame-indexed, never wall-clock). And it
needs the audio story settled: idea #22 established that growth
draws vary with `audioEnergy`, so a live session's replay must
include the quantized per-frame audio envelope in the log —
replay without it is deterministic-looking but wrong. Best built
after worker + SoA, so the replay harness tests the real
architecture instead of scaffolding that gets thrown away.

## Proposed architecture

New home: `app/src/engine/kernel/replay/`.

- `eventLog.js` — append-only log. Every entry:
  `{ frame, type, payload }`. Types: `seed`, `recipe-load`,
  `param-set`, `pointer`, `audio-envelope`, `dish-module-toggle`.
  The live instrument appends as the user performs; nothing
  wall-clocked, ever.
- `replayer.js` — `replay(seed, eventLog, frameCount, { snapshotEvery })`
  runs the kernel headless (no renderer, no DOM) and returns
  per-frame hashes plus optional snapshots. Seek = re-run from
  frame 0, or from the nearest snapshot (a snapshot is a full dish
  buffer dump — cheap once SoA exists, since it's raw columns).
- `goldens/` — checked-in fixtures:
  `{ name, seed, eventLog, frameHashes[], kernelVersion }`.
  `replay.selfcheck.mjs` replays each golden and compares hashes.
  A golden moves only with a `KERNEL_VERSION` bump (absorbs kernel
  research idea #17 — the version string finally gets teeth).
- Export/import: "export performance" writes
  `{ recipe, seed, eventLog }` (KBs). "Import performance"
  replays it live. This is also the answer to "render this
  performance on the studio machine."
- v1 scope guard: headless replay + goldens + export/import. No
  timeline scrubber UI, no in-app time-travel controls — those are
  a separate design built on top of the replayer, not part of it.

## Dependency on the dish core

The replayer steps the dish pipeline; the dish's module purity rule
(§2) is what makes replay tractable — pure modules replay
trivially, and any module with hidden state breaks replay loudly
instead of subtly. The registry's module list is the replay's
module list: replaying against a different module set than the log
was recorded with is a version error, caught by the
`kernelVersion` check. Dish §1b identity columns make per-frame
hashes stable and meaningful (hash the columns, not object graphs).

## Effort

M. The log format, the headless runner, and the golden harness are
the work; the kernel needs event-plumbing, not rewrites.

## Risks

- **The byte-identical law is the whole point.** Replay IS the
  enforcement mechanism — which means the burn-in period will
  surface every hidden nondeterminism in the kernel (uninitialized
  pool memory per the SoA risks, audio timing, the x64/arm64 trig
  divergence of idea #10). Expect a flake-chasing phase; that is
  the feature working, but budget for it.
- **Cross-hardware replay.** A golden recorded on arm64 will not
  bit-match x64 until deterministic trig (idea #10) exists on the
  bake path. Until then: goldens are tagged with architecture, and
  cross-hardware replay is explicitly out of scope — documented,
  not silent.
- **Scope creep into a time-travel UI.** The replayer is
  infrastructure; the scrubber is product. Keep them separate or
  the M becomes an XL.

## Unlocked after it

Golden regression tests for every kernel change from here on
(replay goldens catch bit drift that unit selfchecks miss);
exact bug reproduction ("send me the performance file");
shareable/distributable performances; and the foundation for a
future time-travel debugger and for render-farm distribution of
performances (record on iPad, render frames on the studio Mac —
once idea #10's deterministic trig closes the hardware gap).
