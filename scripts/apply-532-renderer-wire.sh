#!/usr/bin/env bash
# Apply #532 PR1 renderer wire on a local checkout of feat/532-resolve-probe.
# Usage (from repo root):
#   bash scripts/apply-532-renderer-wire.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RENDERER="$ROOT/app/src/gl/renderer.mjs"
SHADERS="$ROOT/app/src/gl/shaders.mjs"

if [[ ! -f "$RENDERER" ]]; then
  echo "missing $RENDERER — run from a Kinetic_Curator checkout" >&2
  exit 1
fi

python3 - "$RENDERER" "$SHADERS" << 'PY'
import sys
from pathlib import Path

renderer_path = Path(sys.argv[1])
shaders_path = Path(sys.argv[2])
t = renderer_path.read_text()

changed = False

old_imp = """import {
  QUAD_VS, QUAD_FS, FULL_VS, COMPOSITE_FS, RESOLVE_FS, COPY_FS, UPSCALE_FS,
  blendIdFor,
} from './shaders.mjs';
"""
new_imp = """import {
  QUAD_VS, QUAD_FS, FULL_VS, COMPOSITE_FS, COPY_FS, UPSCALE_FS,
  blendIdFor,
} from './shaders.mjs';
import { RESOLVE_FS } from './resolveFs.mjs';
import { bindResolveProbe } from './resolveBind.mjs';
"""
if old_imp in t:
    t = t.replace(old_imp, new_imp, 1)
    changed = True
elif "from './resolveFs.mjs'" in t and "bindResolveProbe" in t:
    print('renderer imports already wired')
else:
    raise SystemExit('import block not found — renderer.mjs drifted; apply hunks by hand')

old_uni = """    key: 'resolve', name: 'resolve', vs: FULL_VS, fs: RESOLVE_FS,
    vsFile: 'shaders.mjs:FULL_VS', fsFile: 'shaders.mjs:RESOLVE_FS',
    uniforms: ['u_src'],
"""
new_uni = """    key: 'resolve', name: 'resolve', vs: FULL_VS, fs: RESOLVE_FS,
    vsFile: 'shaders.mjs:FULL_VS', fsFile: 'resolveFs.mjs:RESOLVE_FS',
    uniforms: ['u_src', 'u_aces', 'u_exposure', 'u_dither'],
"""
if old_uni in t:
    t = t.replace(old_uni, new_uni, 1)
    changed = True
elif "['u_src', 'u_aces', 'u_exposure', 'u_dither']" in t:
    print('resolve uniforms already wired')
else:
    raise SystemExit('resolve uniforms block not found — renderer.mjs drifted')

old_bytes = """    gl.uniform1i(U(resProg, 'u_src'), bindTex(0, mRead.tex));
    drawFullscreen(resProg);
"""
new_bytes = """    gl.uniform1i(U(resProg, 'u_src'), bindTex(0, mRead.tex));
    bindResolveProbe(gl, (n) => U(resProg, n));
    drawFullscreen(resProg);
"""
if old_bytes in t:
    t = t.replace(old_bytes, new_bytes, 1)
    changed = True
elif "bindResolveProbe(gl, (n) => U(resProg, n))" in t:
    print('resolveTargetToBytes already wired')
else:
    raise SystemExit('resolveTargetToBytes site not found')

old_present = """    gl.uniform1i(b.U(b.progs.resolve, 'u_src'), b.bindTex(0, target.tex));
    b.drawFullscreen(b.progs.resolve);
"""
new_present = """    gl.uniform1i(b.U(b.progs.resolve, 'u_src'), b.bindTex(0, target.tex));
    bindResolveProbe(gl, (n) => b.U(b.progs.resolve, n));
    b.drawFullscreen(b.progs.resolve);
"""
if old_present in t:
    t = t.replace(old_present, new_present, 1)
    changed = True
elif "bindResolveProbe(gl, (n) => b.U(b.progs.resolve, n))" in t:
    print('present already wired')
else:
    raise SystemExit('present site not found')

if changed:
    renderer_path.write_text(t)
    print('wrote', renderer_path)
else:
    print('renderer already fully wired')

# shaders.mjs — drop inline RESOLVE_FS and re-export from resolveFs.mjs
s = shaders_path.read_text()
if "export { RESOLVE_FS } from './resolveFs.mjs'" in s:
    print('shaders already re-exports resolveFs')
else:
    start = s.find('/** Final resolve:')
    if start < 0:
        start = s.find('export const RESOLVE_FS')
    if start < 0:
        raise SystemExit('RESOLVE_FS not found in shaders.mjs')
    end = s.find('/** Plain texture copy', start)
    if end < 0:
        raise SystemExit('COPY_FS marker not found after RESOLVE_FS')
    s = s[:start] + "/** Final resolve lives in resolveFs.mjs (#532). Re-export so existing imports keep working. */\nexport { RESOLVE_FS } from './resolveFs.mjs';\n\n" + s[end:]
    shaders_path.write_text(s)
    print('wrote', shaders_path)
PY

echo
echo "next:"
echo "  git add app/src/gl/renderer.mjs app/src/gl/shaders.mjs"
echo "  git commit -m 'feat(gl): #532 wire resolve probe in renderer + shaders re-export'"
echo "  git push origin feat/532-resolve-probe"
