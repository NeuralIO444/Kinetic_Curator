//! kc-fields — noise/scent field evaluation on flat buffers (#1319).
//!
//! The third Rust kernel crate (Rust 3/3, docs/design/rust-core-expansion.md):
//! a bit-identical port of the two noisiest kernel fields, following the
//! registry's port order (noise, then scent — every field declares costTier
//! 0, so the registry's tiers don't discriminate; the order follows measured
//! per-call cost: fBm octaves of 3D simplex per sample first, the scent
//! grid's per-frame diffuse/decay pass second).
//!
//! Verbatim ports of two JS sources, kept in lockstep with them:
//!
//! * `app/src/engine/noise.js` — `buildPerm` + 3D simplex `noise3D` +
//!   `fBm3DWith` (the `makeNoiseField` path from
//!   `app/src/engine/kernel/field/index.js`)
//! * `app/src/engine/kernel/field/scent.js` — `sample` (bilinear) + `step`
//!   (diffuse/decay). `deposit` and `gradient` stay JS-only: deposit is a
//!   single cell add (no win across the boundary) and gradient composes from
//!   `sample`.
//!
//! ## Boundary contract (same as kc-neighbor / swarm-bake)
//!
//! The crate never allocates: every export takes caller-provided pointers +
//! scalar params and writes into caller-provided output buffers. The JS
//! wrapper (`kernel/field/fieldsWasm.mjs`) owns the marshaling (a bump
//! allocator over the module's linear memory); the Rust side owns no heap
//! state — the 512-byte perm table lives on the stack per batch call.
//!
//! ## Numeric fidelity
//!
//! All arithmetic is f64 with JS op order preserved, so output is
//! bit-identical to the JS reference (`Object.is` in the parity selfcheck).
//! Integer ops (`Math.imul`, `| 0`, `& 255`) use wrapping i32 semantics;
//! `Math.floor`, `Math.sqrt`, `Math.abs` are correctly-rounded IEEE ops in
//! both engines; `Math.max`/`Math.min` are replicated with NaN-propagating,
//! ±0-respecting helpers (Rust's `f64::max` would pick +0 over -0 and drop
//! NaN). `Math.round` is `(x + 0.5).floor()` — Rust's `f64::round` rounds
//! half away from zero, JS rounds half toward +∞.
//!
//! There is NO trig in this crate (unlike the bake path's sin/cos/atan2 gap
//! documented in swarm-bake): the noise port is pure arithmetic and the
//! scent port is add/mul/div on the f64 grid. Cross-platform determinism
//! holds by construction — WASM IEEE754 is the safe native path (#1319).
//! The scent grid is f64, matching the JS reference's Float64Array
//! ("simulation state, not render state" — scent.js); an f32 grid would
//! break bit-identity. Point coordinates cross as f32 (the SoA x/y columns);
//! `as f64` is an exact widening, identical to the JS reference reading a
//! Float32Array lane.
//!
//! No RNG crosses this boundary: the noise seed only builds the perm table
//! (same `seed >>> 0` → `| 0` reduction as the JS reference), and scent is
//! fully deterministic given its deposit sequence. The deterministic-trig
//! story (#1240) governs the bake path only.

use std::slice;

// ── JS-semantics helpers ──────────────────────────────────────────────

/// JS `Math.max` — NaN propagates (Rust's f64::max picks the non-NaN
/// operand), and +0 beats -0 (Rust's f64::max returns the second operand
/// when both are zero, which would flip the sign bit vs JS).
#[inline(always)]
fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == 0.0 && b == 0.0 {
        0.0 // +0, like JS
    } else if a > b {
        a
    } else {
        b
    }
}

/// JS `Math.min` — NaN propagates, and -0 beats +0.
#[inline(always)]
fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == 0.0 && b == 0.0 {
        -0.0 // -0, like JS
    } else if a < b {
        a
    } else {
        b
    }
}

/// JS ToInt32 — exact for all finite inputs, including |x| >= 2^63 where a
/// plain `as i32` cast would saturate instead of wrapping.
#[inline(always)]
fn to_i32(x: f64) -> i32 {
    if !x.is_finite() {
        return 0; // ToInt32(±Infinity / NaN) is +0
    }
    let mut m = x.trunc() % 4294967296.0;
    if m < 0.0 {
        m += 4294967296.0;
    }
    if m >= 2147483648.0 {
        m -= 4294967296.0;
    }
    // |m| < 2^31 now, exactly representable.
    m as i32
}

// ── noise.js port ─────────────────────────────────────────────────────

const F3: f64 = 1.0 / 3.0;
const G3: f64 = 1.0 / 6.0;

const GRAD3: [[f64; 3]; 12] = [
    [1.0, 1.0, 0.0],
    [-1.0, 1.0, 0.0],
    [1.0, -1.0, 0.0],
    [-1.0, -1.0, 0.0],
    [1.0, 0.0, 1.0],
    [-1.0, 0.0, 1.0],
    [1.0, 0.0, -1.0],
    [-1.0, 0.0, -1.0],
    [0.0, 1.0, 1.0],
    [0.0, -1.0, 1.0],
    [0.0, 1.0, -1.0],
    [0.0, -1.0, -1.0],
];

/// `buildPerm` from noise.js. `makeNoiseField` calls `createNoise(seed >>> 0)`
/// and `createNoise` applies `(seedValue | 0) || 1` — for the f64 `seed` this
/// export receives, `to_i32` performs exactly that reduction (including the
/// uint32→int32 wrap of `>>> 0` followed by `| 0`).
fn build_perm(seed: f64) -> [u8; 512] {
    let mut r: i32 = to_i32(seed);
    if r == 0 {
        r = 1;
    }
    let mut perm = [0u8; 256];
    for (i, v) in perm.iter_mut().enumerate() {
        *v = i as u8;
    }
    let mut i: i32 = 255;
    while i > 0 {
        // (Math.imul(r, 1103515245) + 12345) & 0x7fffffff
        r = r.wrapping_mul(1103515245).wrapping_add(12345) & 0x7fffffff;
        let j = (r % (i + 1)) as usize;
        let ui = i as usize;
        perm.swap(ui, j);
        i -= 1;
    }
    let mut p = [0u8; 512];
    for k in 0..512 {
        p[k] = perm[k & 255];
    }
    p
}

/// `noise3DWith` from noise.js — verbatim, f64 op order preserved.
fn noise3d_with(p: &[u8; 512], x: f64, y: f64, z: f64) -> f64 {
    let s = (x + y + z) * F3;
    let i = (x + s).floor();
    let j = (y + s).floor();
    let k = (z + s).floor();

    let t = (i + j + k) * G3;
    let x0 = x - (i - t);
    let y0 = y - (j - t);
    let z0 = z - (k - t);

    let (i1, j1, k1, i2, j2, k2): (usize, usize, usize, usize, usize, usize);
    if x0 >= y0 {
        if y0 >= z0 {
            i1 = 1;
            j1 = 0;
            k1 = 0;
            i2 = 1;
            j2 = 1;
            k2 = 0;
        } else if x0 >= z0 {
            i1 = 1;
            j1 = 0;
            k1 = 0;
            i2 = 1;
            j2 = 0;
            k2 = 1;
        } else {
            i1 = 0;
            j1 = 0;
            k1 = 1;
            i2 = 1;
            j2 = 0;
            k2 = 1;
        }
    } else if y0 < z0 {
        i1 = 0;
        j1 = 0;
        k1 = 1;
        i2 = 0;
        j2 = 1;
        k2 = 1;
    } else if x0 < z0 {
        i1 = 0;
        j1 = 1;
        k1 = 0;
        i2 = 0;
        j2 = 1;
        k2 = 1;
    } else {
        i1 = 0;
        j1 = 1;
        k1 = 0;
        i2 = 1;
        j2 = 1;
        k2 = 0;
    }

    let x1 = x0 - i1 as f64 + G3;
    let y1 = y0 - j1 as f64 + G3;
    let z1 = z0 - k1 as f64 + G3;
    let x2 = x0 - i2 as f64 + 2.0 * G3;
    let y2 = y0 - j2 as f64 + 2.0 * G3;
    let z2 = z0 - k2 as f64 + 2.0 * G3;
    let x3 = x0 - 1.0 + 3.0 * G3;
    let y3 = y0 - 1.0 + 3.0 * G3;
    let z3 = z0 - 1.0 + 3.0 * G3;

    // JS `i & 255` is ToInt32 then mask — `to_i32` replicates the wrap.
    let ii = (to_i32(i) & 255) as usize;
    let jj = (to_i32(j) & 255) as usize;
    let kk = (to_i32(k) & 255) as usize;

    let gi0 = p[ii + p[jj + p[kk] as usize] as usize] as usize % 12;
    let gi1 = p[ii + i1 + p[jj + j1 + p[kk + k1] as usize] as usize] as usize % 12;
    let gi2 = p[ii + i2 + p[jj + j2 + p[kk + k2] as usize] as usize] as usize % 12;
    let gi3 = p[ii + 1 + p[jj + 1 + p[kk + 1] as usize] as usize] as usize % 12;

    let mut t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    let n0 = if t0 < 0.0 {
        0.0
    } else {
        t0 *= t0;
        t0 * t0 * (GRAD3[gi0][0] * x0 + GRAD3[gi0][1] * y0 + GRAD3[gi0][2] * z0)
    };

    let mut t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    let n1 = if t1 < 0.0 {
        0.0
    } else {
        t1 *= t1;
        t1 * t1 * (GRAD3[gi1][0] * x1 + GRAD3[gi1][1] * y1 + GRAD3[gi1][2] * z1)
    };

    let mut t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    let n2 = if t2 < 0.0 {
        0.0
    } else {
        t2 *= t2;
        t2 * t2 * (GRAD3[gi2][0] * x2 + GRAD3[gi2][1] * y2 + GRAD3[gi2][2] * z2)
    };

    let mut t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    let n3 = if t3 < 0.0 {
        0.0
    } else {
        t3 *= t3;
        t3 * t3 * (GRAD3[gi3][0] * x3 + GRAD3[gi3][1] * y3 + GRAD3[gi3][2] * z3)
    };

    32.0 * (n0 + n1 + n2 + n3)
}

/// `fBm3DWith` from noise.js — verbatim, f64 op order preserved.
/// `octaves` arrives as f64 so the `o < octaves` comparison matches the JS
/// `for (let o = 0; o < octaves; o++)` exactly (fractional/negative/NaN
/// octaves behave identically; the JS wrapper scope-gates to 1–8 integers).
fn fbm3d_with(
    p: &[u8; 512],
    x: f64,
    y: f64,
    z: f64,
    octaves: f64,
    lacunarity: f64,
    gain: f64,
) -> f64 {
    let mut value = 0.0;
    let mut amplitude = 1.0;
    let mut frequency = 1.0;
    let mut max_amplitude = 0.0;
    let mut o: i64 = 0;
    while (o as f64) < octaves {
        value += amplitude * noise3d_with(p, x * frequency, y * frequency, z * frequency);
        max_amplitude += amplitude;
        frequency *= lacunarity;
        amplitude *= gain;
        o += 1;
    }
    value / max_amplitude
}

// ── scent.js port ─────────────────────────────────────────────────────

/// `at(x, y)` from scent.js — clamped cell read. Indices here are always
/// integers (loop counters in `step`, floored coordinates in `sample`), so
/// the i64 clamp replicates `Math.min(rows - 1, Math.max(0, y))` exactly.
#[inline(always)]
fn scent_at(cells: &[f64], cols: usize, rows: usize, x: i64, y: i64) -> f64 {
    let cx = x.clamp(0, cols as i64 - 1) as usize;
    let cy = y.clamp(0, rows as i64 - 1) as usize;
    cells[cy * cols + cx]
}

/// `sample(nx, ny)` from scent.js — bilinear, cell-centered, clamped to
/// [0, 4] at the top end. NaN coordinates propagate to NaN exactly like the
/// JS: `Math.min`/`Math.max` yield NaN, `Math.floor(NaN)` is NaN, the cell
/// read is `undefined`, and the clamp ternaries pass NaN through.
fn scent_sample(cells: &[f64], cols: usize, rows: usize, nx: f64, ny: f64) -> f64 {
    if nx.is_nan() || ny.is_nan() {
        return f64::NAN;
    }
    let cols_f = cols as f64;
    let rows_f = rows as f64;
    let gx = js_min(cols_f - 1.001, js_max(0.0, nx * cols_f - 0.5));
    let gy = js_min(rows_f - 1.001, js_max(0.0, ny * rows_f - 0.5));
    let x0 = gx.floor();
    let y0 = gy.floor();
    let fx = gx - x0;
    let fy = gy - y0;
    let xi = x0 as i64;
    let yi = y0 as i64;
    let a = scent_at(cells, cols, rows, xi, yi);
    let b = scent_at(cells, cols, rows, xi + 1, yi);
    let c = scent_at(cells, cols, rows, xi, yi + 1);
    let d = scent_at(cells, cols, rows, xi + 1, yi + 1);
    let v = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    if v < 0.0 {
        0.0
    } else if v > 4.0 {
        4.0
    } else {
        v
    }
}

// ── exports: caller buffers in, caller buffers out, nothing allocated ──

/// Evaluate the fBm noise field (`makeNoiseField`) at `count` points.
///
/// `xs`/`ys` are the SoA x/y columns (f32); `out` receives the clamped
/// 0..1 field values as f32 (the f64→f32 cast is correctly rounded, matching
/// a JS Float32Array store of the reference's return value).
///
/// # Safety
/// `xs`, `ys` must point to `count` readable f32s; `out` to `count` writable
/// f32s. All three may alias nothing else during the call.
#[no_mangle]
pub extern "C" fn fields_noise_batch(
    seed: f64,
    freq: f64,
    octaves: f64,
    lacunarity: f64,
    gain: f64,
    z: f64,
    xs: *const f32,
    ys: *const f32,
    out: *mut f32,
    count: usize,
) {
    let p = build_perm(seed);
    let xs = unsafe { slice::from_raw_parts(xs, count) };
    let ys = unsafe { slice::from_raw_parts(ys, count) };
    let out = unsafe { slice::from_raw_parts_mut(out, count) };
    for i in 0..count {
        // f32→f64 is an exact widening — identical to the JS reference
        // reading a Float32Array lane.
        let nx = xs[i] as f64;
        let ny = ys[i] as f64;
        let v = fbm3d_with(&p, nx * freq, ny * freq, z, octaves, lacunarity, gain);
        out[i] = js_min(1.0, js_max(0.0, (v + 1.0) / 2.0)) as f32;
    }
}

/// Sample the scent field at `count` points. `cells` is the caller's f64
/// scent grid (cols × rows, row-major — the Float64Array the JS reference
/// keeps); `out` receives f32 samples. Coordinates are f32 like the SoA
/// columns.
///
/// # Safety
/// `cells` must point to `cols * rows` readable f64s; `xs`/`ys` to `count`
/// readable f32s; `out` to `count` writable f32s.
#[no_mangle]
pub extern "C" fn fields_scent_sample(
    cells: *const f64,
    cols: usize,
    rows: usize,
    xs: *const f32,
    ys: *const f32,
    out: *mut f32,
    count: usize,
) {
    let n = cols.saturating_mul(rows);
    let cells = unsafe { slice::from_raw_parts(cells, n) };
    let xs = unsafe { slice::from_raw_parts(xs, count) };
    let ys = unsafe { slice::from_raw_parts(ys, count) };
    let out = unsafe { slice::from_raw_parts_mut(out, count) };
    for i in 0..count {
        out[i] = scent_sample(cells, cols, rows, xs[i] as f64, ys[i] as f64) as f32;
    }
}

/// One scent simulation step: diffuse toward the 4-neighbourhood, then
/// decay (`scent.js` `step`). `cells` is read AND written (mirroring
/// `cells.set(scratch)`); `scratch` is caller-provided working space of the
/// same size — no allocation inside the crate, ever.
///
/// # Safety
/// `cells` and `scratch` must each point to `cols * rows` f64s (readable,
/// and `cells`/`scratch` writable); the two ranges must not overlap.
#[no_mangle]
pub extern "C" fn fields_scent_step(
    cells: *mut f64,
    scratch: *mut f64,
    cols: usize,
    rows: usize,
    decay: f64,
    diffuse: f64,
) {
    let n = cols.saturating_mul(rows);
    let cells_in = unsafe { slice::from_raw_parts(cells as *const f64, n) };
    let scratch = unsafe { slice::from_raw_parts_mut(scratch, n) };
    for y in 0..rows as i64 {
        for x in 0..cols as i64 {
            let i = y as usize * cols + x as usize;
            let c = cells_in[i];
            let nn = (scent_at(cells_in, cols, rows, x - 1, y)
                + scent_at(cells_in, cols, rows, x + 1, y)
                + scent_at(cells_in, cols, rows, x, y - 1)
                + scent_at(cells_in, cols, rows, x, y + 1))
                * 0.25;
            scratch[i] = (c + (nn - c) * diffuse) * decay;
        }
    }
    // cells.set(scratch)
    let cells_out = unsafe { slice::from_raw_parts_mut(cells, n) };
    cells_out.copy_from_slice(scratch);
}
