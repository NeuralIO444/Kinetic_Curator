#!/usr/bin/env bash
set -euo pipefail
F="$(cd "$(dirname "$0")/.." && pwd)/app/src/gl/shaders.mjs"
python3 - "$F" << 'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
old = '''    vec3 cs = unpre(s.rgb, s.a);
    float amt = u_p.x * s.a;
    vec3 outc = clamp(cs + (nz.rgb - 0.5) * amt, 0.0, 1.0);
    o = vec4(outc * s.a, s.a);
'''
new = '''    vec3 cs = unpre(s.rgb, s.a);
    float amt = u_p.x * s.a;
    // LUT stores grain in alpha (Phase-1 bake). RGB is unused / often dark.
    float n = nz.a;
    vec3 outc = clamp(cs + (n - 0.5) * amt, 0.0, 1.0);
    o = vec4(outc * s.a, s.a);
'''
if old in t:
    p.write_text(t.replace(old, new, 1))
    print('grain now uses LUT alpha')
elif 'LUT stores grain in alpha' in t:
    print('already patched')
else:
    raise SystemExit('grain signed block not found')
PY
