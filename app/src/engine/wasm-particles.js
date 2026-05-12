// engine/wasm-particles.js — loads the AssemblyScript-built particle kernel
// and exposes a JS API that mirrors applyParticles' loop shape.
//
// Falls back transparently to the pure-JS path if WASM fails to load.

let wasmExports = null;
let wasmLoadPromise = null;
let wasmFailed = false;

let bufX = 0, bufY = 0, bufScale = 0, bufAlpha = 0;
let bufCapacity = 0;
let memory = null;

// Pre-allocated views into linear memory. Recreated only when we grow
// (which also moves the underlying ArrayBuffer if memory.grow() ran).
let viewX = null, viewY = null, viewScale = null, viewAlpha = null;

// Initial high-water mark — covers the EffectsPanel max particleCount.
const INITIAL_CAPACITY = 2048;

async function loadWasm() {
  if (wasmExports) return wasmExports;
  if (wasmFailed) return null;
  if (wasmLoadPromise) return wasmLoadPromise;

  wasmLoadPromise = (async () => {
    try {
      const url = new URL('/particles.wasm', import.meta.url);
      const result = await WebAssembly.instantiateStreaming(fetch(url), {
        env: {
          abort: (msg, file, line, col) => {
            console.warn('[wasm-particles] abort', { msg, file, line, col });
          },
        },
      });
      wasmExports = result.instance.exports;
      memory = wasmExports.memory;
      return wasmExports;
    } catch (err) {
      console.warn('[wasm-particles] load failed, using JS fallback:', err.message);
      wasmFailed = true;
      return null;
    } finally {
      wasmLoadPromise = null;
    }
  })();
  return wasmLoadPromise;
}

// Kick off load on first import so WASM is warm when the user enables particles.
loadWasm();

function ensureBuffers(count) {
  if (!wasmExports) return;
  if (count <= bufCapacity) return;
  // Grow by powers-of-two from a sensible floor so toggling perf-mode or
  // sliding the count slider doesn't churn the allocator every change.
  const newCapacity = Math.max(INITIAL_CAPACITY, 1 << Math.ceil(Math.log2(count)));
  wasmExports.resetAllocator();
  const bytes = newCapacity * 4;
  bufX = wasmExports.allocBuffer(bytes);
  bufY = wasmExports.allocBuffer(bytes);
  bufScale = wasmExports.allocBuffer(bytes);
  bufAlpha = wasmExports.allocBuffer(bytes);
  bufCapacity = newCapacity;
  // memory.grow may have replaced .buffer — refresh views.
  viewX = new Float32Array(memory.buffer, bufX, newCapacity);
  viewY = new Float32Array(memory.buffer, bufY, newCapacity);
  viewScale = new Float32Array(memory.buffer, bufScale, newCapacity);
  viewAlpha = new Float32Array(memory.buffer, bufAlpha, newCapacity);
}

const MOTION_TYPE_CODES = { flow: 0, swarm: 1, orbit: 2 };

/**
 * Compute particle positions via WASM.
 * Returns shared Float32Array views (no copy). The caller must consume the
 * values synchronously — calling computeParticlesWasm again may invalidate
 * earlier views if a buffer growth occurred. In practice the caller (effects.js
 * applyParticles) reads inline and pushes to a plain JS array, which is safe.
 */
export function computeParticlesWasm({
  count, seed, tick, speed, motionEnabled, motionType, canvasW, canvasH,
}) {
  if (!wasmExports || !memory) return null;
  if (count <= 0) return { x: viewX || new Float32Array(0), y: viewY || new Float32Array(0), scale: viewScale || new Float32Array(0), alpha: viewAlpha || new Float32Array(0) };
  ensureBuffers(count);
  const code = MOTION_TYPE_CODES[motionType] ?? 1;
  wasmExports.computeParticles(
    bufX, bufY, bufScale, bufAlpha,
    count, seed | 0, tick, speed,
    motionEnabled ? 1 : 0, code,
    canvasW, canvasH,
  );
  return { x: viewX, y: viewY, scale: viewScale, alpha: viewAlpha };
}

export function wasmReady() {
  return !!wasmExports;
}
