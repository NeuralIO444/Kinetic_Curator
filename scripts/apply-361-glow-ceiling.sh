#!/bin/bash
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
A="$ROOT/app/src/gl/accum.mjs"
S="$ROOT/app/src/gl/accum.selfcheck.mjs"
python3 - "$A" "$S" << 'PY'
import sys
from pathlib import Path
a, s = map(Path, sys.argv[1:])
t = a.read_text()
t = t.replace('bloomAmount: 0.55 * o,', 'bloomAmount: 0.22 * o,', 1)
t = t.replace('halationAmount: 0.45 * o,', 'halationAmount: 0.16 * o,', 1)
old = '  o = vec4(base.rgb + u_amount * u_tint * glow * gate, base.a);'
new = '  vec3 lit = base.rgb + u_amount * u_tint * glow * gate;\n  o = vec4(min(lit, vec3(1.0)), base.a);'
if old not in t:
    raise SystemExit('accum.mjs shader line not found — already patched?')
t = t.replace(old, new, 1)
oldm = '      out[o] = comp[o] + p.bloomAmount * g1[0] + p.halationAmount * tr * g2[0];\n      out[o + 1] = comp[o + 1] + p.bloomAmount * g1[1] + p.halationAmount * tg * g2[1];\n      out[o + 2] = comp[o + 2] + p.bloomAmount * g1[2] + p.halationAmount * tb * g2[2];'
newm = '      out[o] = Math.min(1, comp[o] + p.bloomAmount * g1[0] + p.halationAmount * tr * g2[0]);\n      out[o + 1] = Math.min(1, comp[o + 1] + p.bloomAmount * g1[1] + p.halationAmount * tg * g2[1]);\n      out[o + 2] = Math.min(1, comp[o + 2] + p.bloomAmount * g1[2] + p.halationAmount * tb * g2[2]);'
if oldm not in t:
    raise SystemExit('accum.mjs mirror add not found — already patched?')
t = t.replace(oldm, newm, 1)
a.write_text(t)
st = s.read_text()
st = st.replace('0.55 * 0.44', '0.22 * 0.44', 1)
s.write_text(st)
print('361 applied')
PY
