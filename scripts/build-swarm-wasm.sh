#!/usr/bin/env bash
# scripts/build-swarm-wasm.sh — rebuild the swarm-bake wasm module (#175).
#
# The built artifact (app/src/engine/kernel/wasm/swarm_bake.wasm) is CHECKED
# IN so CI and dev machines never need a Rust toolchain. Run this script only
# when rust/swarm-bake/src/lib.rs changes:
#
#   ./scripts/build-swarm-wasm.sh
#
# Requires: cargo + the wasm32-unknown-unknown target (rustup.rs).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/app/src/engine/kernel/wasm/swarm_bake.wasm"

if ! command -v cargo >/dev/null 2>&1; then
  echo "build-swarm-wasm: cargo not found on PATH." >&2
  echo "  Install Rust from https://rustup.rs, then:" >&2
  echo "    rustup target add wasm32-unknown-unknown" >&2
  exit 1
fi

# Best effort: make sure the wasm target is installed. `rustup` may not be
# the toolchain manager (e.g. system cargo) — failure here is non-fatal; the
# build below will surface the real error.
if command -v rustup >/dev/null 2>&1; then
  rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true
fi

cd "$ROOT/rust/swarm-bake"
cargo build --release --target wasm32-unknown-unknown

mkdir -p "$(dirname "$OUT")"
cp -f target/wasm32-unknown-unknown/release/swarm_bake.wasm "$OUT"
echo "build-swarm-wasm: wrote $OUT"
ls -la "$OUT"
