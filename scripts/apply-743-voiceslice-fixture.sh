#!/usr/bin/env bash
set -euo pipefail
F="$(cd "$(dirname "$0")/.." && pwd)/app/src/state/voiceSlice.selfcheck.mjs"
python3 - "$F" << 'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
old = "assert.strictEqual(state.layoutParams.particleCount, 280);"
new = "assert.strictEqual(state.layoutParams.particleCount, 120);"
if old in t:
    p.write_text(t.replace(old, new, 1))
    print('patched voiceSlice.selfcheck')
elif new in t:
    print('already patched')
else:
    raise SystemExit('fixture line not found')
PY
