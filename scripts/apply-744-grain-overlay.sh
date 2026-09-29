#!/usr/bin/env bash
set -euo pipefail
F="$(cd "$(dirname "$0")/.." && pwd)/app/src/gl/shaders.mjs"
python3 - "$F" << 'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
# Any current signed-grain body → overlay on LUT alpha.
start = t.find('} else if (u_effect == 2)')
end = t.find('} else if (u_effect == 5)', start)
if start < 0 or end < 0:
    raise SystemExit('grain/posterize bounds not found')
block = '''  } else if (u_effect == 2) {                 // grain: #744 overlay on LUT alpha\n    vec4 nz = texture(u_aux, vec2(v_cuv.x, 1.0 - v_cuv.y));\n    vec3 cs = unpre(s.rgb, s.a);\n    float n = nz.a;\n    vec3 g = vec3(n);\n    vec3 ov;\n    ov.r = cs.r <= 0.5 ? 2.0 * cs.r * g.r : 1.0 - 2.0 * (1.0 - cs.r) * (1.0 - g.r);\n    ov.g = cs.g <= 0.5 ? 2.0 * cs.g * g.g : 1.0 - 2.0 * (1.0 - cs.g) * (1.0 - g.g);\n    ov.b = cs.b <= 0.5 ? 2.0 * cs.b * g.b : 1.0 - 2.0 * (1.0 - cs.b) * (1.0 - g.b);\n    float amt = clamp(u_p.x, 0.0, 1.0);\n    vec3 outc = mix(cs, ov, amt);\n    o = vec4(outc * s.a, s.a);\n'''
t = t[:start] + block + t[end:]
p.write_text(t)
print('grain overlay mix written')
PY
