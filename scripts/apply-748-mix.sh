#!/usr/bin/env bash
set -euo pipefail
F="$(cd "$(dirname "$0")/.." && pwd)/app/src/gl/shaders.mjs"
python3 - "$F" << 'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
start = t.find('  } else if (u_effect == 1)')
end = t.find('  } else if (u_effect == 5)', start)
if start < 0 or end < 0:
    raise SystemExit('effect 1/5 bounds not found')
block = '''  } else if (u_effect == 1) {                 // rgbSplit: original screen-OR alpha\n    float dx = u_p.x;                         // canvas-uv units\n    vec4 r = texture(u_src, tuv - vec2(dx, 0.0));\n    vec4 b = texture(u_src, tuv + vec2(dx, 0.0));\n    float a = 1.0 - (1.0 - r.a) * (1.0 - s.a) * (1.0 - b.a);\n    o = vec4(r.r, s.g, b.b, a);\n  } else if (u_effect == 2) {                 // grain: #744 speckle, premul-safe so it survives RGB\n    vec2 p = gl_FragCoord.xy;\n    vec3 h = fract(vec3(p.xyx) * 0.1031);\n    h += dot(h, h.yzx + 33.33);\n    float n = fract((h.x + h.y) * h.z);\n    float amt = clamp(u_p.x, 0.0, 1.0);\n    float k = (n - 0.5) * amt * 0.55;\n    o = vec4(clamp(s.rgb + vec3(k), 0.0, 1.0), s.a);\n'''
p.write_text(t[:start] + block + t[end:])
print('rgb + grain mix written')
PY
