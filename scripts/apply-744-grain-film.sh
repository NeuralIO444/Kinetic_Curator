#!/usr/bin/env bash
set -euo pipefail
F="$(cd "$(dirname "$0")/.." && pwd)/app/src/gl/shaders.mjs"
python3 - "$F" << 'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
start = t.find('} else if (u_effect == 2)')
end = t.find('} else if (u_effect == 5)', start)
if start < 0 or end < 0:
    raise SystemExit('grain/posterize bounds not found')
block = '''  } else if (u_effect == 2) {                 // grain: #744 film speckle (pixel hash)\n    vec3 cs = unpre(s.rgb, s.a);\n    vec2 p = gl_FragCoord.xy;\n    vec3 h = fract(vec3(p.xyx) * 0.1031);\n    h += dot(h, h.yzx + 33.33);\n    float n = fract((h.x + h.y) * h.z);\n    float amt = clamp(u_p.x, 0.0, 1.0);\n    // low amt = fine grit; high amt = visible halide speckle. mono, no wash.\n    vec3 outc = clamp(cs + (n - 0.5) * amt * 0.55, 0.0, 1.0);\n    o = vec4(outc * s.a, s.a);\n'''
p.write_text(t[:start] + block + t[end:])
print('procedural film grain written')
PY
