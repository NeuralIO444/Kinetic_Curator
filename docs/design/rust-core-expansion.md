# DESIGN (deferred) — Rust core expansion

## Goal

Grow `rust/swarm-bake` beyond the bake path into the hot per-frame
paths — neighbor search and field evaluation — with verified
reproducible builds. Native speed where the JS JIT is weakest
(iPad), deterministic unlike GPU, and one shared implementation
for bake and live (which structurally kills the bake/live
divergence bug class, e.g. kernel research idea #7).

## Why later (deferred — last of the five)

The native boundary must be drawn around a settled, profiled core.
Porting today's object-churned hot spots would fossilize the wrong
architecture in Rust — you'd be locking in the thing SoA is supposed
to replace. So: after SoA (flat `&[f32]` columns cross the WASM
boundary with zero copy — the boundary shape depends on it), after
the field registry exists (one module = one crate boundary), and
after profiling the post-SoA core (port the top of the governor's
shed list, not today's guesses). The verified-build story (kernel
research idea #5 — nothing currently proves the checked-in
`swarm_bake.wasm` matches `rust/swarm-bake/src/lib.rs`) must land
first: an unverified native core is worse than a slow JS one.

## Proposed architecture

`rust/` becomes a workspace:

- `swarm-bake` (exists) — the bake path, unchanged shape.
- `kc-neighbor` (new) — spatial hash + neighbor loop: the idea #4
  hot spot, operating on caller-provided `&[f32]` position columns,
  writing neighbor indices/counts into a caller-provided buffer.
- `kc-fields` (new) — noise/scent field evaluation on flat
  buffers, same contract.
- Boundary discipline: WASM takes `&[f32]` columns + scalar params
  and returns nothing — it writes into caller-provided output
  buffers. **No allocation across the boundary, ever.**
- `scripts/build-wasm.sh` builds all crates and emits
  `app/src/engine/kernel/wasm/MANIFEST.json`:
  `{ crate, rustcVersion, sourceHash, builtAt }`.
  `swarmWasm.selfcheck.mjs` asserts the manifest's source hashes
  match `rust/**` (idea #5, finally with teeth).
- Reproducible builds: `rust-toolchain.toml` pins rustc,
  `--locked` builds, CI rebuilds from source and compares the
  artifact hash against the checked-in one — a mismatch fails CI.
- `WASM_BACKEND` flag per path (neighbor, fields): every Rust path
  keeps its JS implementation as the permanent reference. Parity
  selfchecks assert bit-identical output before a JS path is
  retired from the default — and the JS fallback never gets
  deleted.

## Dependency on the dish core

Port candidates are dish modules with flat-buffer interfaces; the
registry's declared `costTier` plus post-SoA profiling picks the
order. The dish's seeded-RNG discipline (§2: streams via ctx, never
consuming shared streams) has to be mirrored in the Rust code —
the Rust RNG must be the same algorithm, same stream
partitioning, or determinism breaks at the boundary. This is the
hardest correctness requirement in the design and it needs its
own selfcheck: same seed, JS path vs Rust path, identical draws.

## Effort

XL. The Rust itself is the smaller half; the reproducible-build
pipeline, the RNG-parity work, and the ongoing toolchain
maintenance are the larger half.

## Risks

- **Determinism: safe, with one caveat.** WASM IEEE754 arithmetic
  is deterministic across platforms (unlike GPU floats) — this is
  the safe native path. The caveat is SIMD: WASM SIMD128 codegen
  can differ subtly; keep SIMD opt-in per crate and parity-checked,
  scalar as the reference.
- **Byte-identical law.** Rust ports must be bit-identical to the
  JS they replace, proven by parity selfchecks BEFORE the JS path
  stops being the default. The JS fallback is the permanent
  reference implementation — retire the default, never the code.
- **RNG parity.** Same algorithm + same stream partitioning across
  the boundary, or identical seeds diverge. Dedicated selfcheck,
  non-negotiable.
- **Build/maintenance tax.** wasm-pack/wasm-bindgen in CI, pinned
  toolchains, artifact-vs-source verification — real ongoing cost.
  Don't start until post-SoA profiling says which crates earn it.
- **Bake/live unification risk.** Sharing one implementation is
  the goal, but the bake path has looser latency constraints than
  the live path — a shared crate must not let bake-only
  optimizations (big batching, no frame budget) regress live frame
  pacing. Keep the crate parameterized, not forked.

## Unlocked after it

Native-speed neighbor search and field eval on iPad (exactly where
the JS JIT is weakest); bake and live finally sharing one
implementation, so divergence bugs become structurally impossible
instead of individually fixed; and a proven reproducible-build
pipeline the project can extend to any future native module.
This is the last step because it's the most permanent: once hot
paths live in Rust, the JS data model underneath them had better
be the right one — which is what the other four designs establish.
