# Deferred kernel upgrades — build order

Status: DESIGN ONLY. None of this is approved to build. The dish core
(#1183) is being built today; these five plug into it when it lands.

## Ranked: build this first when the dish core lands

1. **soa-hot-paths.md** — struct-of-arrays + pooled typed arrays end-to-end
2. **worker-thread-kernel.md** — simulation off the main thread
3. **deterministic-replay.md** — seed + event log → byte-identical replay
4. **gpu-field-eval.md** — fields as GPU compute (transform feedback now, WebGPU later)
5. **rust-core-expansion.md** — native hot paths with verified reproducible builds

## Why this order

Data model first: every other upgrade consumes flat typed arrays —
worker transferables, GPU uploads, the WASM boundary, replay snapshots —
and the dish core's named point sets are the natural SoA columns, so
building SoA against the dish contract means writing it once. Then the
worker, because flat buffers plus pure dish modules make the thread
boundary tractable, and it is the single biggest iPad smoothness win
(the UI thread never janks on a heavy sim frame). Then replay, because it
needs the dish's fixed execution order and then becomes the regression
harness that de-risks everything after it — every later change gets
caught by golden replay before it ships. Then GPU fields, because they
need the field registry plus SoA buffers to exist, and they are
hardware-dependent by nature (tolerance-based, never in the
byte-identical path). Rust last, because the native boundary must be
drawn around a settled, profiled core: porting today's object-churned
hot spots would fossilize the wrong architecture, and bit-identical
parity demands the JS reference stay canonical until a port proves
itself. The through-line: each step makes the next one cheaper, and
none of them can be built well before the dish contract exists.

## One line each

- **SoA hot paths**: kill per-frame small-object churn with pooled typed
  arrays from placement through render; the dish's point sets become the
  columns. Unlocks everything below.
- **Worker thread**: kernel sim runs off the main thread, ships
  transferable buffers to the renderer; the dish's reads/writes
  declarations become the transfer manifest.
- **Deterministic replay**: log seed + frame-quantized input events;
  replay headless for golden regression tests, time-travel debugging,
  and shareable performances as kilobyte files.
- **GPU field eval**: port dish field modules (pure functions of
  seed/x/y/t) to transform-feedback shaders; 10–100× field resolution,
  explicitly outside the byte-identical path.
- **Rust core expansion**: grow `rust/swarm-bake` into neighbor search
  and field eval on flat buffers, with source-hash-verified reproducible
  builds; bit-identical parity against the JS reference before any JS
  path retires.
