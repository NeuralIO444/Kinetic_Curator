#!/usr/bin/env bash
# DEPRECATED (#1317): scripts/build-wasm.sh is the canonical workspace builder
# (it builds every rust/ crate and maintains MANIFEST.json). This shim stays
# for muscle memory and old docs — it builds just swarm-bake.
echo "build-swarm-wasm.sh: deprecated — delegating to scripts/build-wasm.sh --crate swarm-bake" >&2
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/build-wasm.sh" --crate swarm-bake "$@"
