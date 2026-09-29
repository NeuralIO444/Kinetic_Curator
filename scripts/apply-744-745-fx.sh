#!/usr/bin/env bash
set -euo pipefail
F="$(cd "$(dirname "$0")/.." && pwd)/app/src/gl/shaders.mjs"
python3 - "$F" << 'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
grain_old = '''  } else if (u_effect == 2) {                 // grain: LUT noise, masked by src alpha
    vec4 nz = texture(u_aux, vec2(v_cuv.x, 1.0 - v_cuv.y));  // LUT bake is top-first, NEAREST
    float gA = u_p.x * nz.a * s.a;
    o = vec4(s.rgb * (1.0 - gA), gA + s.a * (1.0 - gA));
'''
grain_new = '''  } else if (u_effect == 2) {                 // grain: #744 signed LUT around 0.5
    vec4 nz = texture(u_aux, vec2(v_cuv.x, 1.0 - v_cuv.y));  // LUT bake is top-first, NEAREST
    vec3 cs = unpre(s.rgb, s.a);
    float amt = u_p.x * s.a;
    vec3 outc = clamp(cs + (nz.rgb - 0.5) * amt, 0.0, 1.0);
    o = vec4(outc * s.a, s.a);
'''
rgb_old = '''    float a = 1.0 - (1.0 - r.a) * (1.0 - s.a) * (1.0 - b.a);
    o = vec4(r.r, s.g, b.b, a);
'''
rgb_new = '''    // #745: keep source alpha so BLEED paper samples cannot fill the frame.
    o = vec4(r.r * s.a, s.g, b.b * s.a, s.a);
'''
n = 0
if grain_old in t:
    t = t.replace(grain_old, grain_new, 1); n += 1
elif 'signed LUT around 0.5' in t:
    print('grain already patched')
else:
    raise SystemExit('grain block not found')
if rgb_old in t:
    t = t.replace(rgb_old, rgb_new, 1); n += 1
elif '#745: keep source alpha' in t:
    print('rgb already patched')
else:
    raise SystemExit('rgb block not found')
p.write_text(t)
print(f'patched {n} blocks')
PY
