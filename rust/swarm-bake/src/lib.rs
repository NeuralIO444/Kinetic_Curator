//! swarm-bake — the Kinetic_Curator swarm bake inner loop (#175), compiled to
//! wasm32-unknown-unknown.
//!
//! This is a verbatim port of two JS sources, kept in lockstep with them:
//!
//! * `app/src/engine/noise.js` — `buildPerm` + 3D simplex `noise3D`
//! * `app/src/engine/particles.js` — `ParticleSystem._buildSpatialHash`,
//!   the boids force pass, and the cloud (non-organism) integration pass
//!
//! Scope (v1): cloud swarm only — no organism spine/wings, no #167 contact
//! pass, attractor optional. The JS wrapper (`swarmWasm.mjs`) scope-gates
//! every bake: anything outside this scope runs the original JS engine.
//!
//! ## Numeric fidelity
//!
//! Every integer op (`Math.imul`, `| 0`, `& 255`) is replicated with wrapping
//! i32 semantics; `Math.floor`, `Math.sqrt`, `Math.abs` are correctly-rounded
//! IEEE ops in both engines and match bit-for-bit; `Math.max`/`Math.min` are
//! replicated with NaN-propagating helpers because Rust's `f64::max` picks
//! the non-NaN operand while JS yields NaN.
//!
//! The remaining divergence source is `Math.sin`/`Math.cos`/`Math.atan2`:
//! ECMAScript does not require them to be correctly rounded, V8 ships its own
//! implementations, and this crate uses the pure-Rust `libm` crate. They agree
//! to ~1 ulp on typical inputs, but the swarm is chaotic — over 120 steps a
//! 1-ulp wind-force perturbation amplifies into a visibly different (but
//! equally valid) trajectory. This is the same property the engine already
//! has across CPU architectures (see `kernel/bake/index.js`'s header:
//! "a bake is a pure function of its inputs *on a given machine*"), and the
//! project's visual acceptance bar is <10% pixel difference, not
//! bit-identity. `swarmWasm.selfcheck.mjs` pins the contract: noise is
//! bit-identical (`Object.is`), baked trajectories must stay within a
//! documented tolerance of the JS reference on the pinned configs.

use std::ptr;

// ── JS-semantics helpers ──────────────────────────────────────────────

/// JS `Math.max` — NaN propagates (Rust's f64::max would pick the other side).
#[inline(always)]
fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a > b {
        a
    } else {
        b
    }
}

/// JS `Math.min` — NaN propagates.
#[inline(always)]
fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
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
const TAU: f64 = 6.283185307179586;

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

/// `buildPerm` from noise.js: `r = (seedValue | 0) || 1`. Note there is NO
/// `|| 444` fallback here — call sites that want it (`ParticleSystem`,
/// `runSwarmWasm`) apply `seed || 444` themselves before calling.
fn build_perm(seed_value: f64) -> [u8; 512] {
    let mut r: i32 = to_i32(seed_value);
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

// ── simulation state ──────────────────────────────────────────────────

// f64 column ids for swarm_col_f64.
pub const COL_X: u32 = 0;
pub const COL_Y: u32 = 1;
pub const COL_VX: u32 = 2;
pub const COL_VY: u32 = 3;
pub const COL_AX: u32 = 4;
pub const COL_AY: u32 = 5;
pub const COL_MASS: u32 = 6;
pub const COL_SCALE: u32 = 7;
pub const COL_ROTATION: u32 = 8;
pub const COL_ALPHA: u32 = 9;
pub const COL_PHASE: u32 = 10;
pub const COL_U: u32 = 11;
pub const COL_SEED_OFFSET: u32 = 12;
const N_F64_COLS: u32 = 13;

// Param block layout (16 × f64, little-endian), written by the JS wrapper.
const P_NOISE_FREQ: usize = 0;
const P_NOISE_SPEED: usize = 1;
const P_DAMPING: usize = 2;
const P_MIN_SCALE: usize = 3;
const P_MAX_SCALE: usize = 4;
const P_MIN_ALPHA: usize = 5;
const P_MAX_ALPHA: usize = 6;
const P_WIND_MUL: usize = 7;
const P_GRAVITY_WELLS: usize = 8;
const P_COH_W: usize = 9;
const P_CANVAS_W: usize = 10;
const P_CANVAS_H: usize = 11;
const P_MAX_SPEED: usize = 12;
const P_ATTRACTOR_X: usize = 13;
const P_ATTRACTOR_Y: usize = 14;
const P_ATTRACTOR_ON: usize = 15;

// Cloud-path constants from particles.js.
const SEP_RADIUS: f64 = 35.0;
const ALI_RADIUS: f64 = 60.0;
const COH_RADIUS: f64 = 70.0;
const SEP_W: f64 = 1.8;
const ALI_W: f64 = 1.0;
const ATTRACTOR_GAIN: f64 = 8.0;
const PAD: f64 = 120.0;

/// Hot particle columns (mirrors ParticleSystem's SoA layout).
struct Cols {
    x: Vec<f64>,
    y: Vec<f64>,
    vx: Vec<f64>,
    vy: Vec<f64>,
    ax: Vec<f64>,
    ay: Vec<f64>,
    mass: Vec<f64>,
    scale: Vec<f64>,
    rotation: Vec<f64>,
    alpha: Vec<f64>,
    phase: Vec<f64>,
    u: Vec<f64>,
    seed_offset: Vec<f64>,
    asset_index: Vec<i32>,
    alive: Vec<u8>,
    cgroup: Vec<u8>,
    perm: [u8; 512],
}

/// Grid scratch, reused across steps within a run. Kept separate from `Cols`
/// so the grid borrow never conflicts with the column writes in the loops.
struct Scratch {
    cell_of: Vec<i32>,
    order: Vec<i32>,
    cell_start: Vec<i32>,
    cursor: Vec<i32>,
}

pub struct SwarmCtx {
    cap: usize,
    cols: Cols,
    scratch: Scratch,
}

impl SwarmCtx {
    fn new(cap: usize) -> Self {
        let zf = || vec![0.0f64; cap];
        Self {
            cap,
            cols: Cols {
                x: zf(),
                y: zf(),
                vx: zf(),
                vy: zf(),
                ax: zf(),
                ay: zf(),
                mass: zf(),
                scale: zf(),
                rotation: zf(),
                alpha: zf(),
                phase: zf(),
                u: zf(),
                seed_offset: zf(),
                asset_index: vec![0i32; cap],
                alive: vec![0u8; cap],
                cgroup: vec![0u8; cap],
                perm: [0u8; 512],
            },
            scratch: Scratch {
                cell_of: vec![0i32; cap],
                order: vec![0i32; cap],
                cell_start: Vec::new(),
                cursor: Vec::new(),
            },
        }
    }
}

struct Grid<'a> {
    cell_start: &'a [i32],
    order: &'a [i32],
    cols: i32,
    rows: i32,
    min_cx: i32,
    min_cy: i32,
    cell_size: f64,
}

/// Counting-sort uniform grid — verbatim port of `_buildSpatialHash`.
/// Sized to the particles' actual cell extent, never clamped to canvas.
fn build_spatial_hash<'a>(
    x: &[f64],
    y: &[f64],
    alive: &[u8],
    scratch: &'a mut Scratch,
    n: usize,
    cell_size: f64,
) -> Grid<'a> {
    let mut min_cx = i32::MAX;
    let mut min_cy = i32::MAX;
    let mut max_cx = i32::MIN;
    let mut max_cy = i32::MIN;
    let mut live = 0usize;
    for i in 0..n {
        if alive[i] == 0 {
            scratch.cell_of[i] = -1;
            continue;
        }
        live += 1;
        let cx = to_i32((x[i] / cell_size).floor());
        let cy = to_i32((y[i] / cell_size).floor());
        if cx < min_cx {
            min_cx = cx;
        }
        if cx > max_cx {
            max_cx = cx;
        }
        if cy < min_cy {
            min_cy = cy;
        }
        if cy > max_cy {
            max_cy = cy;
        }
    }
    if live == 0 {
        min_cx = 0;
        min_cy = 0;
        max_cx = 0;
        max_cy = 0;
    }
    let cols = max_cx - min_cx + 1;
    let rows = max_cy - min_cy + 1;
    let num_cells = (cols as usize) * (rows as usize);

    if scratch.cell_start.len() < num_cells + 1 {
        scratch.cell_start = vec![0i32; num_cells + 1];
    } else {
        for v in scratch.cell_start.iter_mut().take(num_cells + 1) {
            *v = 0;
        }
    }
    if scratch.cursor.len() < num_cells + 1 {
        scratch.cursor = vec![0i32; num_cells + 1];
    }

    for i in 0..n {
        if alive[i] == 0 {
            continue;
        }
        let cx = to_i32((x[i] / cell_size).floor()) - min_cx;
        let cy = to_i32((y[i] / cell_size).floor()) - min_cy;
        let c = (cy * cols + cx) as usize;
        scratch.cell_of[i] = c as i32;
        scratch.cell_start[c + 1] += 1;
    }
    for c in 0..num_cells {
        scratch.cell_start[c + 1] += scratch.cell_start[c];
    }
    scratch.cursor[..num_cells + 1].copy_from_slice(&scratch.cell_start[..num_cells + 1]);
    for i in 0..n {
        if alive[i] == 0 {
            continue;
        }
        let slot = scratch.cursor[scratch.cell_of[i] as usize] as usize;
        scratch.order[slot] = i as i32;
        scratch.cursor[scratch.cell_of[i] as usize] += 1;
    }

    Grid {
        cell_start: &scratch.cell_start,
        order: &scratch.order,
        cols,
        rows,
        min_cx,
        min_cy,
        cell_size,
    }
}

/// One `ParticleSystem.update()` step — cloud path only (no organism, no
/// contact pass). Verbatim f64 op order vs particles.js.
fn step(c: &mut Cols, scratch: &mut Scratch, n: usize, nt: f64, p: &[f64]) {
    let noise_freq = p[P_NOISE_FREQ];
    let noise_speed = p[P_NOISE_SPEED];
    let damping = p[P_DAMPING];
    let min_scale = p[P_MIN_SCALE];
    let max_scale = p[P_MAX_SCALE];
    let min_alpha = p[P_MIN_ALPHA];
    let max_alpha = p[P_MAX_ALPHA];
    let wind_mul = p[P_WIND_MUL];
    let gravity_wells = p[P_GRAVITY_WELLS];
    let coh_w = p[P_COH_W];
    let canvas_w = p[P_CANVAS_W];
    let canvas_h = p[P_CANVAS_H];
    let max_speed = p[P_MAX_SPEED];
    let attractor_x = p[P_ATTRACTOR_X];
    let attractor_y = p[P_ATTRACTOR_Y];
    let attractor_on = p[P_ATTRACTOR_ON] != 0.0;

    let max_radius = COH_RADIUS; // max(35, 60, 70)
    let max_radius2 = max_radius * max_radius;
    let sep_radius2 = SEP_RADIUS * SEP_RADIUS;
    let ali_radius2 = ALI_RADIUS * ALI_RADIUS;
    let coh_radius2 = COH_RADIUS * COH_RADIUS;

    // Grid borrows `scratch` only — `c` stays free for the loops below.
    let grid = build_spatial_hash(&c.x, &c.y, &c.alive, scratch, n, max_radius);
    let cell_start = grid.cell_start;
    let order = grid.order;
    let cols = grid.cols;
    let rows = grid.rows;
    let min_cx = grid.min_cx;
    let min_cy = grid.min_cy;
    let cell_size = grid.cell_size;

    for i in 0..n {
        let pxi = c.x[i];
        let pyi = c.y[i];
        let m = c.mass[i];
        let mut fax = c.ax[i];
        let mut fay = c.ay[i];

        let nfx = pxi * noise_freq;
        let nfy = pyi * noise_freq;
        let nval = noise3d_with(&c.perm, nfx, nfy, nt + c.seed_offset[i] * 0.0001);
        let wind_angle = nval * TAU;
        let wind_mag = (noise3d_with(&c.perm, nfx + 200.0, nfy + 200.0, nt) + 1.0) * 0.4 * wind_mul;
        fax += (libm::cos(wind_angle) * wind_mag) / m;
        fay += (libm::sin(wind_angle) * wind_mag) / m;

        if attractor_on && gravity_wells > 0.0 {
            let dx = attractor_x - pxi;
            let dy = attractor_y - pyi;
            let d = (dx * dx + dy * dy).sqrt();
            if d > 5.0 {
                let force_mag = (gravity_wells * 1.0 * ATTRACTOR_GAIN) / js_max(20.0, d * 0.05);
                fax += ((dx / d) * force_mag) / m;
                fay += ((dy / d) * force_mag) / m;
            }
        }

        let mut sep_x: f64 = 0.0;
        let mut sep_y: f64 = 0.0;
        let mut sep_count = 0i32;
        let mut ali_x: f64 = 0.0;
        let mut ali_y: f64 = 0.0;
        let mut ali_count = 0i32;
        let mut coh_x: f64 = 0.0;
        let mut coh_y: f64 = 0.0;
        let mut coh_count = 0i32;
        let cx = to_i32((pxi / cell_size).floor()) - min_cx;
        let cy = to_i32((pyi / cell_size).floor()) - min_cy;
        // Raw column pointers for the hot neighbour loop below (see SAFETY
        // note there). Hoisted here: the borrow checker sees only reads.
        let xs = c.x.as_ptr();
        let ys = c.y.as_ptr();
        let vxs = c.vx.as_ptr();
        let vys = c.vy.as_ptr();
        // ox outer, oy inner — the Map version's visit order. Changing it
        // reorders the float sums and moves the behaviour hashes.
        for ox in -1..=1 {
            let ncx = cx + ox;
            if ncx < 0 || ncx >= cols {
                continue;
            }
            for oy in -1..=1 {
                let ncy = cy + oy;
                if ncy < 0 || ncy >= rows {
                    continue;
                }
                let cc = (ncy * cols + ncx) as usize;
                let end = cell_start[cc + 1] as usize;
                let mut k = cell_start[cc] as usize;
                // Hot loop: every candidate index j comes from `order`, which
                // build_spatial_hash fills exclusively with values in 0..n
                // (n <= cap), so the unchecked column loads below are sound.
                // Bounds checks here cost ~15% of the whole bake (this loop
                // is ~81% of runtime per the #175 profile).
                while k < end {
                    let j = unsafe { *order.get_unchecked(k) } as usize;
                    if j != i {
                        let dx = unsafe { *xs.add(j) } - pxi;
                        let dy = unsafe { *ys.add(j) } - pyi;
                        let d2 = dx * dx + dy * dy;
                        // Squared-distance rejection: sqrt is correctly
                        // rounded, so d2 >= maxRadius2 implies every
                        // `dist < radius` test below is false. Exact, not
                        // approximate.
                        if d2 < max_radius2 {
                            if d2 > 0.0 && d2 < sep_radius2 {
                                let dist = d2.sqrt();
                                sep_x -= dx / dist;
                                sep_y -= dy / dist;
                                sep_count += 1;
                            }
                            if d2 > 0.0 && d2 < ali_radius2 {
                                ali_x += unsafe { *vxs.add(j) };
                                ali_y += unsafe { *vys.add(j) };
                                ali_count += 1;
                            }
                            if d2 > 0.0 && d2 < coh_radius2 {
                                coh_x += unsafe { *xs.add(j) };
                                coh_y += unsafe { *ys.add(j) };
                                coh_count += 1;
                            }
                        }
                    }
                    k += 1;
                }
            }
        }
        if sep_count > 0 {
            // JS `Math.sqrt(...) || 1`: 0, -0 and NaN all fall through to 1.
            let mag = (sep_x * sep_x + sep_y * sep_y).sqrt();
            let mag = if mag > 0.0 { mag } else { 1.0 };
            let sc = sep_count as f64;
            fax += ((sep_x / sc / mag) * SEP_W * sc) / m;
            fay += ((sep_y / sc / mag) * SEP_W * sc) / m;
        }
        if ali_count > 0 && ALI_W != 0.0 {
            let mag = (ali_x * ali_x + ali_y * ali_y).sqrt();
            let mag = if mag > 0.0 { mag } else { 1.0 };
            let ac = ali_count as f64;
            fax += ((ali_x / ac / mag) * ALI_W * ac) / m;
            fay += ((ali_y / ac / mag) * ALI_W * ac) / m;
        }
        if coh_count > 0 && coh_w != 0.0 {
            let steer_x = coh_x / coh_count as f64 - pxi;
            let steer_y = coh_y / coh_count as f64 - pyi;
            let mag = (steer_x * steer_x + steer_y * steer_y).sqrt();
            let mag = if mag > 0.0 { mag } else { 1.0 };
            fax += ((steer_x / mag) * coh_w) / m;
            fay += ((steer_y / mag) * coh_w) / m;
        }
        c.ax[i] = fax;
        c.ay[i] = fay;
    }

    // Integration pass — cloud path (wrap at ±PAD, no spine).
    for i in 0..n {
        // #167 — dead particles hold no state and integrate nothing.
        if c.alive[i] == 0 {
            continue;
        }
        let mut vxi = (c.vx[i] + c.ax[i]) * damping;
        let mut vyi = (c.vy[i] + c.ay[i]) * damping;
        let speed = (vxi * vxi + vyi * vyi).sqrt();
        if speed > max_speed {
            vxi = (vxi / speed) * max_speed;
            vyi = (vyi / speed) * max_speed;
        }
        let mut pxi = c.x[i] + vxi;
        let mut pyi = c.y[i] + vyi;
        c.ax[i] = 0.0;
        c.ay[i] = 0.0;
        if speed > 0.04 {
            let next = libm::atan2(vyi, vxi) * (180.0 / std::f64::consts::PI);
            c.rotation[i] = next;
        }
        let mi = c.mass[i];
        c.scale[i] = min_scale + (mi * (max_scale - min_scale));
        c.alpha[i] = min_alpha + (mi * (max_alpha - min_alpha));
        let ph = (c.phase[i] + 0.004 * noise_speed) % 1.0;
        c.phase[i] = ph;
        let spd_u = js_max(0.0, js_min(1.0, speed / max_speed));
        c.u[i] = spd_u;
        if pxi < -PAD {
            pxi = canvas_w + PAD;
        } else if pxi > canvas_w + PAD {
            pxi = -PAD;
        }
        if pyi < -PAD {
            pyi = canvas_h + PAD;
        } else if pyi > canvas_h + PAD {
            pyi = -PAD;
        }
        c.x[i] = pxi;
        c.y[i] = pyi;
        c.vx[i] = vxi;
        c.vy[i] = vyi;
    }
}

// ── C ABI ─────────────────────────────────────────────────────────────

/// Allocate a simulation context for `cap` particles. Returns null on cap 0.
#[no_mangle]
pub extern "C" fn swarm_create(cap: usize) -> *mut SwarmCtx {
    if cap == 0 {
        return ptr::null_mut();
    }
    Box::into_raw(Box::new(SwarmCtx::new(cap)))
}

/// Free a context from `swarm_create`. Null-safe.
#[no_mangle]
pub extern "C" fn swarm_destroy(ctx: *mut SwarmCtx) {
    if !ctx.is_null() {
        unsafe {
            drop(Box::from_raw(ctx));
        }
    }
}

/// Pointer to f64 column `col` (see COL_*). Column memory is valid until
/// `swarm_destroy`; re-fetch after any call that may grow wasm memory.
#[no_mangle]
pub extern "C" fn swarm_col_f64(ctx: *mut SwarmCtx, col: u32) -> *mut f64 {
    if ctx.is_null() || col >= N_F64_COLS {
        return ptr::null_mut();
    }
    let c = unsafe { &mut (*ctx).cols };
    match col {
        COL_X => c.x.as_mut_ptr(),
        COL_Y => c.y.as_mut_ptr(),
        COL_VX => c.vx.as_mut_ptr(),
        COL_VY => c.vy.as_mut_ptr(),
        COL_AX => c.ax.as_mut_ptr(),
        COL_AY => c.ay.as_mut_ptr(),
        COL_MASS => c.mass.as_mut_ptr(),
        COL_SCALE => c.scale.as_mut_ptr(),
        COL_ROTATION => c.rotation.as_mut_ptr(),
        COL_ALPHA => c.alpha.as_mut_ptr(),
        COL_PHASE => c.phase.as_mut_ptr(),
        COL_U => c.u.as_mut_ptr(),
        _ => c.seed_offset.as_mut_ptr(), // COL_SEED_OFFSET
    }
}

/// Pointer to i32 column 0 = assetIndex.
#[no_mangle]
pub extern "C" fn swarm_col_i32(ctx: *mut SwarmCtx, col: u32) -> *mut i32 {
    if ctx.is_null() || col != 0 {
        return ptr::null_mut();
    }
    unsafe { (&mut (*ctx).cols).asset_index.as_mut_ptr() }
}

/// Pointer to u8 column: 0 = alive, 1 = cgroup.
#[no_mangle]
pub extern "C" fn swarm_col_u8(ctx: *mut SwarmCtx, col: u32) -> *mut u8 {
    if ctx.is_null() || col > 1 {
        return ptr::null_mut();
    }
    let c = unsafe { &mut (*ctx).cols };
    if col == 0 {
        c.alive.as_mut_ptr()
    } else {
        c.cgroup.as_mut_ptr()
    }
}

/// Initialise the noise field — mirrors `createNoise(seed || 444)`.
#[no_mangle]
pub extern "C" fn swarm_init_noise(ctx: *mut SwarmCtx, seed: f64) {
    if ctx.is_null() {
        return;
    }
    unsafe {
        (*ctx).cols.perm = build_perm(seed);
    }
}

/// Run `steps` update steps. `params` points at 16 f64s (see P_* layout).
/// `time0`/`dt` mirror the JS `BAKE_TIME_ORIGIN + s * dt` time source.
/// Returns 0 on success, -1 on a null pointer or n > cap.
#[no_mangle]
pub extern "C" fn swarm_run(
    ctx: *mut SwarmCtx,
    n: usize,
    steps: u32,
    time0: f64,
    dt: f64,
    params: *const f64,
) -> i32 {
    if ctx.is_null() || params.is_null() {
        return -1;
    }
    let ctx = unsafe { &mut *ctx };
    if n > ctx.cap {
        return -1;
    }
    let p = unsafe { std::slice::from_raw_parts(params, 16) };
    let noise_speed = p[P_NOISE_SPEED];
    // Split the borrows once: grid scratch vs particle columns.
    let (cols, scratch) = (&mut ctx.cols, &mut ctx.scratch);
    for s in 0..steps {
        // JS: nt = (BAKE_TIME_ORIGIN + s * dt) * noiseSpeed * 0.001
        let time = time0 + (s as f64) * dt;
        let nt = time * noise_speed * 0.001;
        step(cols, scratch, n, nt, p);
    }
    0
}

/// Debug/selfcheck entry: evaluate the noise field directly, for
/// bit-exactness checks against the JS `createNoise(seed).noise3D`.
#[no_mangle]
pub extern "C" fn swarm_noise3d(seed: f64, x: f64, y: f64, z: f64) -> f64 {
    let p = build_perm(seed);
    noise3d_with(&p, x, y, z)
}

/// 16 × f64 scratch for the run-param block (see P_* layout). Single-threaded
/// wasm: one caller at a time, no reentrancy.
static mut PARAMS: [f64; 16] = [0.0; 16];

/// Pointer to the 16-f64 param block. Valid until the next call.
#[no_mangle]
pub extern "C" fn swarm_params_ptr() -> *mut f64 {
    std::ptr::addr_of_mut!(PARAMS).cast::<f64>()
}
