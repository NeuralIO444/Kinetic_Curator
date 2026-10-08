#!/bin/bash
# mlx_setup.sh — one-time Mac Studio setup for the MLX curator + harness.
# Collapses MLX_CURATOR_RUNBOOK.md §0 into one command.
set -uo pipefail
cd "$(dirname "$0")"

FAILS=0
pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FAILS=$((FAILS + 1)); }

echo "== mlx setup =="
command -v python3 >/dev/null || { echo "python3 not found — install it first"; exit 1; }
if [ "$(uname -m)" != "arm64" ] || [ "$(uname)" != "Darwin" ]; then
  echo "  WARN  not Apple Silicon macOS — MLX needs it; continuing anyway"
fi

echo "-- install curator extras"
if python3 -m pip install -e ".[curator]"; then pass "pip install -e .[curator]"; else fail "pip install"; fi

echo "-- model prefetch (~2 GB, one time, ~/.cache/huggingface)"
if python3 -c "
import sys; sys.path.insert(0, '.')
from curator import mlx_embed_model, DEFAULT_MODEL
mlx_embed_model(DEFAULT_MODEL); print('model ok')"; then
  pass "SigLIP weights"
else
  fail "model download"
fi

echo "-- selfcheck (no model needed)"
if python3 curator.py selfcheck; then pass "curator selfcheck"; else fail "selfcheck"; fi

if [ "$FAILS" -eq 0 ]; then echo "SETUP OK — next: python3 mlx_run.py --phase 1"; else echo "SETUP FAILED ($FAILS)"; exit 1; fi
