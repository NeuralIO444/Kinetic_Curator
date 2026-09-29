#!/usr/bin/env bash
set -euo pipefail
F="$(cd "$(dirname "$0")/.." && pwd)/app/src/gl/shaders.mjs"
python3 - "$F" << 'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
a = t.find('} else if (u_effect == 1)')
b = t.find('} else if (u_effect == 5)', a)
if a < 0 or b < 0:
    raise SystemExit(f'bounds not found a={a} b={b}')
# include leading spaces on the == 1 line
line_start = t.rfind('\n', 0, a) + 1
block = '''  } else if (u_effect == 1) {                 // rgbSplit: original screen-OR alpha\n    float dx = u_p.x;                         // canvas-uv units\n    vec4 r = texture(u_src, tuv - vec2(dx, 0.0));\n    vec4 b = texture(u_src, tuv + vec2(dx, 0.0));\n    float ao = 1.0 - (1.0 - r.a) * (1.0 - s.a) * (1.0 - b.a);\n    o = vec4(r.r, s.g, b.b, ao);\n  } else if (u_effect == 2) {                 // grain: #744 speckle, premul-safe so it survives RGB\n    vec2 p = gl_FragCoord.xy;\n    vec3 h = fract(vec3(p.xyx) * 0.1031);\n    h += dot(h, h.yzx + 33.33);\n    float n = fract((h.x + h.y) * h.z);\n    float amt = clamp(u_p.x, 0.0, 1.0);\n    float k = (n - 0.5) * amt * 0.55;\n    o = vec4(clamp(s.rgb + vec3(k), 0.0, 1.0), s.a);\n  '''
p.write_text(t[:line_start] + block + t[b:])
print('rgb + grain mix written')
PY
