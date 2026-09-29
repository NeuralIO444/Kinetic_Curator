#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
F="$ROOT/app/src/data/voices.js"
python3 - "$F" << 'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
i = t.find("id: 'swarm'")
j = t.find("id: 'hype'")
if i < 0 or j < 0:
    raise SystemExit('SWARM block not found')
block = t[i:j]
subs = [
    ('count: 260,', 'count: 160,'),
    ('count: 420,', 'count: 160,'),
    ('particleCount: 200,', 'particleCount: 120,'),
    ('particleCount: 280,', 'particleCount: 120,'),
    ('accumulationFade: 8, // #743 shorter trail — readable flock', 'accumulationFade: 4, // #743 second cut'),
    ('accumulationFade: 16, // ~0.94 keep → half-life frames', 'accumulationFade: 4, // #743 second cut'),
    ('accumulationOptics: 0.35,', 'accumulationOptics: 0.18,'),
    ('density: 78,', 'density: 55,'),
    ('fx: { grain: 0.6, vignette: true, posterize: false, edge: false, glow: 0.35, contrast: 1.0 }',
     'fx: { grain: 0.35, vignette: true, posterize: false, edge: false, glow: 0.2, contrast: 1.0 }'),
]
n = 0
for old, new in subs:
    if old in block:
        block = block.replace(old, new, 1)
        n += 1
t = t[:i] + block + t[j:]
p.write_text(t)
print(f'applied {n} SWARM cuts')
PY
