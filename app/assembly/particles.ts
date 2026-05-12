// AssemblyScript particle compute kernel.
// Mirrors the JS `applyParticles` motion math from engine/effects.js so the
// JS fallback and WASM produce identical positions for the same inputs.
//
// Memory layout (positions are written, params are inputs):
//   outX:    Float32Array<count>  pointer into linear memory
//   outY:    Float32Array<count>  pointer into linear memory
// Other inputs are scalar params.

const TAU: f32 = 6.283185307179586;

function rand01(seed: i32, i: i32, salt: i32): f32 {
  // Cheap integer hash. Mirrors the JS reference but returns 0..1 floats.
  let k: u32 = (<u32>seed * 2654435761) + (<u32>i * 1664525) + <u32>salt;
  k = (k ^ (k >> 13)) * 1013904223;
  k = k ^ (k >> 16);
  return <f32>(k & 0xffff) / 65535.0;
}

export function computeParticles(
  outX: usize,
  outY: usize,
  outScale: usize,
  outAlpha: usize,
  count: i32,
  seed: i32,
  tick: f32,
  speed: f32,
  motionEnabled: i32,
  motionType: i32, // 0 = flow, 1 = swarm, 2 = orbit
  canvasW: f32,
  canvasH: f32,
): void {
  const t: f32 = tick * 0.001 * speed;

  for (let i: i32 = 0; i < count; i++) {
    const phase: f32 = rand01(seed, i, 0) * TAU;
    const radiusSeed: f32 = rand01(seed, i, 1);
    const speedSeed: f32 = rand01(seed, i, 2) + 0.5;
    const sizeSeed: f32 = rand01(seed, i, 3);

    let x: f32 = 0;
    let y: f32 = 0;

    if (motionEnabled != 0) {
      if (motionType == 0) {
        // flow: horizontal drift with vertical sine wave
        const lane: f32 = radiusSeed * canvasH;
        const xRaw: f32 = (phase * 60.0 + t * 90.0 * speedSeed) % (canvasW + 200.0);
        x = xRaw - 100.0;
        y = lane + Mathf.sin(t * 0.6 + phase) * canvasH * 0.12;
      } else if (motionType == 2) {
        // orbit: alternating-direction orbits around centre
        const r: f32 = canvasH * (0.18 + radiusSeed * 0.32);
        const sign: f32 = (i & 1) == 0 ? 1.0 : -1.0;
        const omega: f32 = t * 0.35 * speedSeed * sign;
        x = canvasW * 0.5 + Mathf.cos(phase + omega) * r;
        y = canvasH * 0.5 + Mathf.sin(phase + omega) * r;
      } else {
        // swarm (default): Lissajous around centre
        x = canvasW * 0.5 + Mathf.sin(t * speedSeed * 0.7 + phase) * canvasW * 0.42;
        y = canvasH * 0.5 + Mathf.cos(t * speedSeed * 0.9 + phase * 1.3) * canvasH * 0.42;
      }
    } else {
      x = radiusSeed * canvasW;
      y = (phase * 1000.0) % canvasH;
    }

    store<f32>(outX + (<usize>i << 2), x);
    store<f32>(outY + (<usize>i << 2), y);
    store<f32>(outScale + (<usize>i << 2), 0.15 + sizeSeed * 0.55);
    store<f32>(outAlpha + (<usize>i << 2), 45.0 + sizeSeed * 55.0);
  }
}

// Allocate a contiguous block in linear memory and return its pointer.
// Caller owns the memory until `freeBuffer` is called or the module is reset.
let nextPtr: usize = 1024; // leave room at the bottom

export function allocBuffer(byteSize: i32): usize {
  const ptr: usize = nextPtr;
  nextPtr += <usize>byteSize;
  // Grow memory by one page (64KB) at a time if needed.
  const need: i32 = <i32>(nextPtr >> 16) + 1;
  const have: i32 = memory.size();
  if (need > have) {
    memory.grow(need - have);
  }
  return ptr;
}

export function resetAllocator(): void {
  nextPtr = 1024;
}
