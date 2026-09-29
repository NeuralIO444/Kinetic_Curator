#!/usr/bin/env bash
set -euo pipefail
F="$(cd "$(dirname "$0")/.." && pwd)/app/src/gl/renderer.mjs"
python3 - "$F" << 'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
old = '''            if (kind !== 'grain') return null;
            const aux = grainLuts[wrap.fxLayerId];
            if (!aux) throw new Error(`[gl] missing grain LUT for wrap ${wrap.fxLayerId}`);
            return aux;
'''
new = '''            if (kind !== 'grain') return null;
            // #749 / #748: procedural grain does not need a LUT. Missing bake
            // used to throw and abort the whole FX chain (RGB disappeared).
            return grainLuts[wrap.fxLayerId] || null;
'''
if old not in t:
    if 'procedural grain does not need a LUT' in t:
        print('already patched'); raise SystemExit(0)
    raise SystemExit('auxFor grain block not found')
p.write_text(t.replace(old, new, 1))
print('grain LUT guard written')
PY
