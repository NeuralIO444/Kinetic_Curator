# Renderer wire (#532 PR1)

`renderer.mjs` is the last live-path file. Apply these three edits (GitHub web editor is enough).

## 1. Imports (top of file)

Replace the shaders import with:

```js
import {
  QUAD_VS, QUAD_FS, FULL_VS, COMPOSITE_FS, COPY_FS, UPSCALE_FS,
  blendIdFor,
} from './shaders.mjs';
import { RESOLVE_FS } from './resolveFs.mjs';
import { bindResolveProbe } from './resolveBind.mjs';
```

## 2. RENDERER_PROGRAMS.resolve

```js
uniforms: ['u_src', 'u_aces', 'u_exposure', 'u_dither'],
fsFile: 'resolveFs.mjs:RESOLVE_FS',
```

## 3. After `uniform1i(..., 'u_src')` in `resolveTargetToBytes` and `present`

```js
bindResolveProbe(gl, (n) => U(resProg, n));
// present:
bindResolveProbe(gl, (n) => b.U(b.progs.resolve, n));
```

Bypass values: aces=0, exposure=1, dither=0. Pixel-identical to today.
