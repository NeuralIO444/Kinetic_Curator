#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
python3 - "$ROOT" << 'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])

# 1) packer: grain amount -> u_p.y
b = (root / 'app/src/gl/bridge/builtinEffects.mjs').read_text()
old_g = "make: (id) => one(id.grain, (p) => [knob(p.amount, 0, 1, 0.4), 0, 0, 0]) }"
new_g = "make: (id) => one(id.grain, (p) => [0, knob(p.amount, 0, 1, 0.4), 0, 0]) }"
if old_g in b:
    b = b.replace(old_g, new_g, 1)
    (root / 'app/src/gl/bridge/builtinEffects.mjs').write_text(b)
    print('packer: grain -> u_p.y')
elif new_g in b:
    print('packer already split')
else:
    raise SystemExit('grain packer not found')

# 2) shader: grain reads u_p.y
s = (root / 'app/src/gl/shaders.mjs').read_text()
old_s = '    float amt = clamp(u_p.x, 0.0, 1.0);'
new_s = '    float amt = clamp(u_p.y, 0.0, 1.0);'
if old_s in s:
    s = s.replace(old_s, new_s, 1)
    (root / 'app/src/gl/shaders.mjs').write_text(s)
    print('shader: grain reads u_p.y')
elif new_s in s:
    print('shader already split')
else:
    raise SystemExit('grain amt line not found')
PY
