#!/usr/bin/env bash
set -euo pipefail
F="$(cd "$(dirname "$0")/.." && pwd)/app/src/gl/shaders.mjs"
python3 - "$F" << 'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
old = '''    // #745: keep source alpha so BLEED paper samples cannot fill the frame.\n    o = vec4(r.r * s.a, s.g, b.b * s.a, s.a);\n'''
new = '''    // #745: source alpha only — fringe stays inside the mark, BLEED paper cannot fill.\n    o = vec4(r.r, s.g, b.b, s.a);\n'''
if old in t:
    p.write_text(t.replace(old, new, 1))
    print('softened rgb split')
elif new.strip() in t:
    print('already softened')
else:
    raise SystemExit('745 block not found')
PY
