#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
F="$ROOT/app/src/data/voices.js"
python3 - "$F" << 'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
# Only the SWARM block (first flagship): count / fade / tunnel.
def repl_first(src, old, new):
    i = src.find("id: 'swarm'")
    j = src.find("id: 'hype'")
    if i < 0 or j < 0:
        raise SystemExit('SWARM block not found')
    block = src[i:j]
    if old not in block:
        if new.strip() in block:
            return src, False
        raise SystemExit(f'pattern not in SWARM: {old}')
    return src[:i] + block.replace(old, new, 1) + src[j:], True
changed = False
for old, new in [
    ('count: 420,', 'count: 260,'),
    ('accumulationFade: 16, // ~0.94 keep → half-life frames', 'accumulationFade: 8, // #743 shorter trail — readable flock'),
    ('accumulationTunnel: 0.15,', 'accumulationTunnel: 0,'),
    ('particleCount: 280,', 'particleCount: 200,'),
]:
    t, did = repl_first(t, old, new)
    changed = changed or did
p.write_text(t)
print('patched SWARM factory' if changed else 'already applied')
PY
