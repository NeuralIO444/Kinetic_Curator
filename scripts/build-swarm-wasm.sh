#!/usr/bin/env bash
# scripts/build-swarm-wasm.sh — rebuild the swarm-bake wasm module (#175).
#
# The built artifact (app/src/engine/kernel/wasm/swarm_bake.wasm) is CHECKED
# IN so CI and dev machines never need a Rust toolchain. Run this script only
# when rust/swarm-bake sources change:
#
#   ./scripts/build-swarm-wasm.sh
#
# The script also writes app/src/engine/kernel/wasm/swarm_bake.wasm.sha256 —
# the sha256 "source hash" of the Rust sources (Cargo.toml, Cargo.lock, and
# every *.rs under rust/swarm-bake/src/). swarmWasm.selfcheck.mjs recomputes
# the hash from the checked-in sources and fails CI if it doesn't match the
# recorded sidecar (#1235), so a stale or hand-rebuilt wasm can no longer
# ship silently.
#
#   ./scripts/build-swarm-wasm.sh --hash-only
#
# --hash-only re-records the sidecar from the current sources WITHOUT
# rebuilding — for machines with no Rust toolchain (e.g. after replacing the
# wasm with a build produced elsewhere).
#
# Requires (full rebuild only): cargo + the wasm32-unknown-unknown target
# (rustup.rs).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/app/src/engine/kernel/wasm/swarm_bake.wasm"
SIDECAR="$OUT.sha256"

# Source-hash spec (MUST match the implementation in
# app/src/engine/kernel/bake/swarmWasm.selfcheck.mjs — keep them in sync):
#   files  = Cargo.toml, Cargo.lock, every *.rs under src/ (recursive),
#            paths relative to rust/swarm-bake/, sorted byte-wise (LC_ALL=C);
#   digest input per file = "<relpath>\n" + raw file bytes + "\n";
#   hash = sha256 of the concatenated stream, lowercase hex.
source_hash() {
  local src_dir="$ROOT/rust/swarm-bake"
  ( cd "$src_dir" && {
      { printf 'Cargo.toml\nCargo.lock\n'; find src -name '*.rs'; } | LC_ALL=C sort |
      while IFS= read -r f; do
        printf '%s\n' "$f"
        cat -- "$f"
        printf '\n'
      done
    } | sha256sum | awk '{ print $1 }' )
}

record_sidecar() {
  local h
  h="$(source_hash)"
  mkdir -p "$(dirname "$SIDECAR")"
  printf '%s\n' "$h" > "$SIDECAR"
  echo "build-swarm-wasm: source hash $h -> $SIDECAR"
}

HASH_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --hash-only) HASH_ONLY=1 ;;
    -h|--help)
      sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "build-swarm-wasm: unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if [ "$HASH_ONLY" -eq 1 ]; then
  record_sidecar
  exit 0
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "build-swarm-wasm: cargo not found on PATH." >&2
  echo "  Install Rust from https://rustup.rs, then:" >&2
  echo "    rustup target add wasm32-unknown-unknown" >&2
  echo "  ...or record the source hash only:" >&2
  echo "    ./scripts/build-swarm-wasm.sh --hash-only" >&2
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

record_sidecar
