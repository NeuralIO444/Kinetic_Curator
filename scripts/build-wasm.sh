#!/usr/bin/env bash
# scripts/build-wasm.sh — reproducible wasm builds for the KC-1 kernel (#1317).
#
# Builds every crate in the rust/ workspace to wasm32-unknown-unknown and
# installs the artifacts as checked-in files under app/src/engine/kernel/wasm/,
# then writes app/src/engine/kernel/wasm/MANIFEST.json — the provenance record
# that swarmWasm.selfcheck.mjs and CI verify against.
#
#   ./scripts/build-wasm.sh                # build all crates, install + manifest
#   ./scripts/build-wasm.sh --crate NAME   # build one crate only
#   ./scripts/build-wasm.sh --verify       # rebuild each crate to a temp dir
#                                          # and compare against the checked-in
#                                          # artifacts (CI gate — fails naming
#                                          # the crate on mismatch; changes
#                                          # nothing on disk)
#   ./scripts/build-wasm.sh --hash-only    # re-record the manifest from the
#                                          # current sources/artifacts WITHOUT
#                                          # rebuilding (no Rust toolchain
#                                          # needed — for hand-replaced
#                                          # artifacts)
#
# Reproducibility contract (do not weaken):
#   - rustc is pinned by rust/rust-toolchain.toml; the script refuses to build
#     with any other toolchain.
#   - if rustup is present but the pinned channel is missing, the script
#     installs it (profile minimal + wasm32 target) so `npm run selfcheck`
#     gates the rebuild on CI with no workflow change; no rustup at all is a
#     loud failure, never a silent pass.
#   - every build runs `cargo build --locked` against the checked-in
#     rust/Cargo.lock.
#   - artifact name convention: <crate> -> ${crate//-/_}.wasm (the cdylib
#     output name).
#   - SIMD128 is OPT-IN per crate via KC_WASM_SIMD128 (comma-separated crate
#     names, e.g. KC_WASM_SIMD128=swarm-bake). Scalar is the reference build;
#     a SIMD-enabled artifact must pass the same parity selfchecks before
#     check-in. The choice is recorded in the manifest so CI reproduces
#     exactly what was built.
#
# Source-hash spec (MUST match the implementation in
# app/src/engine/kernel/bake/swarmWasm.selfcheck.mjs — keep them in sync):
#   per crate, files = rust-toolchain.toml, Cargo.toml, Cargo.lock
#   (workspace-level, so a toolchain/lock bump invalidates every crate),
#   plus <crate>/Cargo.toml and every *.rs under <crate>/src/ (recursive);
#   paths relative to rust/, sorted byte-wise (LC_ALL=C);
#   digest input per file = "<relpath>\n" + raw file bytes + "\n";
#   hash = sha256 of the concatenated stream, lowercase hex.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUST_DIR="$ROOT/rust"
WASM_DIR="$ROOT/app/src/engine/kernel/wasm"
MANIFEST="$WASM_DIR/MANIFEST.json"

# Portable sha256 (macOS has shasum, Linux has sha256sum).
sha256_stdin() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum | awk '{ print $1 }'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 | awk '{ print $1 }'
  else echo "build-wasm: no sha256 tool (sha256sum/shasum) on PATH" >&2; exit 1; fi
}
sha256_file() { sha256_stdin <"$1"; }

pinned_channel() {
  sed -n 's/^channel *= *"\(.*\)".*/\1/p' "$RUST_DIR/rust-toolchain.toml" | head -n1
}

# Every member crate of the workspace (parsed from rust/*/Cargo.toml).
workspace_crates() {
  for manifest in "$RUST_DIR"/*/Cargo.toml; do
    [ -f "$manifest" ] || continue
    sed -n 's/^name *= *"\(.*\)".*/\1/p' "$manifest" | head -n1
  done
}

source_hash() {
  local crate="$1"
  ( cd "$RUST_DIR" && {
      { printf 'rust-toolchain.toml\nCargo.toml\nCargo.lock\n%s/Cargo.toml\n' "$crate"
        find "$crate/src" -name '*.rs'
      } | LC_ALL=C sort |
      while IFS= read -r f; do
        printf '%s\n' "$f"
        cat -- "$f"
        printf '\n'
      done
    } | sha256_stdin )
}

simd_enabled() {
  local crate="$1" list="${KC_WASM_SIMD128:-}"
  case ",$list," in *,"$crate",*) return 0;; *) return 1;; esac
}

# Build one crate; echo "<artifact_path> <simd true|false>" on stdout
# (progress goes to stderr). Returns nonzero when the build fails.
build_crate() {
  local crate="$1" out_dir="$2"
  local artifact="${crate//-/_}.wasm"
  local simd=false
  if simd_enabled "$crate"; then
    simd=true
    echo "build-wasm: [$crate] SIMD128 opt-in (KC_WASM_SIMD128) — parity selfchecks must pass before check-in" >&2
    ( cd "$RUST_DIR" && cargo build --locked --release --target wasm32-unknown-unknown \
        -p "$crate" --config 'build.rustflags=["-C", "target-feature=+simd128"]' >&2 )
  else
    ( cd "$RUST_DIR" && cargo build --locked --release --target wasm32-unknown-unknown -p "$crate" >&2 )
  fi
  cp -f "$RUST_DIR/target/wasm32-unknown-unknown/release/$artifact" "$out_dir/$artifact"
  printf '%s/%s %s\n' "$out_dir" "$artifact" "$simd"
}

write_manifest() {
  # args: lines of "<crate>\t<artifact>\t<sourceHash>\t<artifactHash>\t<simd>"
  local entries_file="$1" rustc_version="$2"
  CRATES_TSV="$entries_file" RUSTC_VERSION="$rustc_version" \
    BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" MANIFEST_OUT="$MANIFEST" \
    python3 - <<'PYEOF'
import json, os
crates = {}
with open(os.environ['CRATES_TSV']) as f:
    for line in f:
        crate, artifact, source_hash, artifact_hash, simd = line.rstrip('\n').split('\t')
        crates[crate] = {
            "crate": crate,
            "artifact": artifact,
            "rustcVersion": os.environ['RUSTC_VERSION'],
            "sourceHash": source_hash,
            "artifactHash": artifact_hash,
            "simd128": simd == "true",
            "builtAt": os.environ['BUILT_AT'],
        }
manifest = {"schema": 1, "generatedBy": "scripts/build-wasm.sh", "crates": crates}
with open(os.environ['MANIFEST_OUT'], 'w') as f:
    json.dump(manifest, f, indent=2, sort_keys=False)
    f.write('\n')
PYEOF
  echo "build-wasm: wrote $MANIFEST"
}

CRATE_FILTER=""
VERIFY=0
HASH_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --crate)
      [ $# -ge 2 ] || { echo "build-wasm: --crate needs a value" >&2; exit 2; }
      CRATE_FILTER="$2"; shift 2 ;;
    --crate=*) CRATE_FILTER="${1#--crate=}"; shift ;;
    --verify) VERIFY=1; shift ;;
    --hash-only) HASH_ONLY=1; shift ;;
    -h|--help)
      sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "build-wasm: unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ "$VERIFY" -eq 1 ] && [ "$HASH_ONLY" -eq 1 ]; then
  echo "build-wasm: --verify and --hash-only are mutually exclusive" >&2; exit 2
fi

CRATES="$(workspace_crates)"
if [ -z "$CRATES" ]; then echo "build-wasm: no crates found in $RUST_DIR" >&2; exit 1; fi
if [ -n "$CRATE_FILTER" ]; then
  if ! printf '%s\n' "$CRATES" | grep -qx "$CRATE_FILTER"; then
    echo "build-wasm: crate '$CRATE_FILTER' is not a workspace member" >&2; exit 1
  fi
  CRATES="$CRATE_FILTER"
fi

PINNED="$(pinned_channel)"
if [ -z "$PINNED" ]; then echo "build-wasm: cannot parse channel from rust/rust-toolchain.toml" >&2; exit 1; fi

# --hash-only needs no toolchain: re-record the manifest from disk.
if [ "$HASH_ONLY" -eq 1 ]; then
  tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
  for crate in $CRATES; do
    artifact="${crate//-/_}.wasm"
    [ -f "$WASM_DIR/$artifact" ] || { echo "build-wasm: --hash-only: $WASM_DIR/$artifact missing (build first)" >&2; exit 1; }
    simd=false; simd_enabled "$crate" && simd=true
    printf '%s\t%s\t%s\t%s\t%s\n' "$crate" "$artifact" "$(source_hash "$crate")" \
      "$(sha256_file "$WASM_DIR/$artifact")" "$simd" >>"$tmp"
  done
  write_manifest "$tmp" "$PINNED"
  exit 0
fi

# Self-install the pinned toolchain (#1317): CI's lint/selfcheck runners carry
# rustup but not this channel, so install it on demand — no workflow change
# needed. No rustup at all -> fail loudly below (never a silent pass); a
# failed install aborts the build (set -e), also loudly.
if command -v rustup >/dev/null 2>&1; then
  if ! rustup toolchain list 2>/dev/null | grep -q -- "^${PINNED}-"; then
    echo "build-wasm: installing pinned toolchain $PINNED via rustup (profile minimal, wasm32 target)..." >&2
    rustup toolchain install "$PINNED" --profile minimal --target wasm32-unknown-unknown
  fi
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "build-wasm: cargo not found on PATH." >&2
  echo "  Install Rust from https://rustup.rs — rust/rust-toolchain.toml" >&2
  echo "  selects the pinned toolchain ($PINNED) automatically." >&2
  echo "  ...or re-record the manifest only: ./scripts/build-wasm.sh --hash-only" >&2
  exit 1
fi

# Enforce the pin: run rustc from inside rust/ so rustup applies
# rust-toolchain.toml, then require the reported version to equal the pin.
# (A non-rustup cargo ignores the toolchain file — fail closed, not silent.)
ACTUAL="$(cd "$RUST_DIR" && rustc -V | awk '{ print $2 }')"
if [ "$ACTUAL" != "$PINNED" ]; then
  echo "build-wasm: toolchain mismatch: rustc $ACTUAL != pinned $PINNED" >&2
  echo "  Install rustup (https://rustup.rs); rust/rust-toolchain.toml selects" >&2
  echo "  the pinned toolchain automatically for builds under rust/." >&2
  exit 1
fi
echo "build-wasm: toolchain $ACTUAL (pinned) — building: $(echo $CRATES | tr '\n' ' ')"

if [ "$VERIFY" -eq 1 ]; then
  # CI gate: rebuild each crate to a temp dir; the fresh artifact must be
  # bit-identical to the checked-in one. Changes nothing on disk.
  tmp_out="$(mktemp -d)"; trap 'rm -rf "$tmp_out"' EXIT
  fail=0
  for crate in $CRATES; do
    artifact="${crate//-/_}.wasm"
    if ! build_out="$(build_crate "$crate" "$tmp_out")"; then
      echo "build-wasm: [FAIL] $crate: build failed" >&2; fail=1; continue
    fi
    read -r fresh _ <<<"$build_out"
    if [ ! -f "$WASM_DIR/$artifact" ]; then
      echo "build-wasm: [FAIL] $crate: checked-in $WASM_DIR/$artifact is missing" >&2; fail=1; continue
    fi
    a="$(sha256_file "$fresh")"; b="$(sha256_file "$WASM_DIR/$artifact")"
    if [ "$a" = "$b" ]; then
      echo "build-wasm: [ok] $crate: rebuilt artifact is bit-identical ($artifact ${a:0:12}…)"
    else
      echo "build-wasm: [FAIL] $crate: rebuilt artifact differs from checked-in $artifact" >&2
      echo "  fresh:       $a" >&2
      echo "  checked-in:  $b" >&2
      fail=1
    fi
  done
  # The manifest's recorded artifact hashes must match the checked-in files.
  if [ -f "$MANIFEST" ] && command -v python3 >/dev/null 2>&1; then
    if ! MANIFEST_OUT="$MANIFEST" WASM_DIR="$WASM_DIR" python3 - <<'PYEOF'
import json, os, sys, hashlib
m = json.load(open(os.environ['MANIFEST_OUT']))
bad = False
for crate, e in m.get('crates', {}).items():
    p = os.path.join(os.environ['WASM_DIR'], e['artifact'])
    if not os.path.isfile(p):
        print(f"[FAIL] manifest: {e['artifact']} missing on disk"); bad = True; continue
    h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
    if h != e['artifactHash']:
        print(f"[FAIL] manifest: {crate} artifactHash != checked-in {e['artifact']}"); bad = True
    else:
        print(f"[ok] manifest: {crate} artifactHash matches checked-in {e['artifact']}")
sys.exit(1 if bad else 0)
PYEOF
    then
      fail=1
    fi
  fi
  [ "$fail" -eq 0 ] || { echo "build-wasm: --verify FAILED" >&2; exit 1; }
  echo "build-wasm: --verify passed — checked-in wasm reproduces bit-for-bit"
  exit 0
fi

# Full build: compile, install artifacts, write the manifest.
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
tmp_out="$(mktemp -d)"; trap 'rm -rf "$tmp_out" "$tmp"' EXIT
mkdir -p "$WASM_DIR"
for crate in $CRATES; do
  artifact="${crate//-/_}.wasm"
  if ! build_out="$(build_crate "$crate" "$tmp_out")"; then
    echo "build-wasm: [$crate] build failed" >&2; exit 1
  fi
  read -r fresh simd <<<"$build_out"
  cp -f "$fresh" "$WASM_DIR/$artifact"
  printf '%s\t%s\t%s\t%s\t%s\n' "$crate" "$artifact" "$(source_hash "$crate")" \
    "$(sha256_file "$WASM_DIR/$artifact")" "$simd" >>"$tmp"
  echo "build-wasm: [$crate] installed $WASM_DIR/$artifact"
done
write_manifest "$tmp" "$ACTUAL"
ls -la "$WASM_DIR"
