//! kc-neighbor — spatial hash + neighbor loop (#1318), compiled to
//! wasm32-unknown-unknown.
//!
//! The kernel idea #4 hot spot: the O(M·N) neighbor search behind the FIELD
//! patch path (`tracks/trackGraph.js` `applyField`, called per frame from
//! `gl/liveResolve.mjs`). This crate ports the *neighbor search* — build a
//! counting-sort spatial hash over the sources, loop targets over the 3×3
//! cell neighborhood, test `d2 <= r2` — writing per-target neighbor indices
//! and counts into caller-provided buffers.
//!
//! ## Boundary discipline (non-negotiable)
//!
//! WASM takes `&[f32]` columns + scalar params and returns nothing: it writes
//! into caller-provided output buffers. **No allocation across the boundary,
//! ever.** The exported `neighbor_run` allocates its grid scratch internally
//! (freed before return — it never crosses the boundary); the only thing
//! that crosses back is an i32 status code, which carries no data.
//!
//! Column layout (SoA, #1324 — x/y as `Float32Array` columns):
//! `neighbor_col` ids are gone in favor of the stateless call shape — the
//! caller passes the four column pointers straight into `neighbor_run`.
//!
//! ## Numeric fidelity
//!
//! Inputs are `f32` columns, but the distance test widens to `f64`: the
//! widening is exact, and `f64` add/mul/div/floor are correctly rounded in
//! both engines, so the inclusion test is **bit-identical** to a JS
//! reference doing plain `f64` arithmetic on the same column values — for
//! *all* inputs, with no fixture restrictions. This also matches
//! `applyField`'s own `f64` arithmetic on the values (modulo its
//! `Number(x)||0` coercion, which typed-array columns don't need).
//!
//! Inclusion rule (verbatim from `applyField`): `d2 = dx*dx + dy*dy`;
//! `if (d2 > r2) continue` — so `d2 == r2` is included, and NaN distances
//! (NaN coordinates) are included too, exactly like the JS path.
//!
//! Neighbor order is canonicalized: per target, indices are sorted ascending
//! before being written, so the output is bit-identical to the direct O(M·N)
//! loop's index order at any radius. The grid is purely a pruning
//! accelerator — it can never change the output set.
//!
//! SIMD stays off: scalar is the reference build per the #1317 policy.
//!
//! ## Dish RNG
//!
//! The `rng` module mirrors the dish seeded-RNG discipline (streams via
//! `(seed, channel, index)` + sub-seed offsets, never consuming shared
//! streams) — same algorithm, same stream partitioning as `kernel/rng.js`.
//! Same seed ⇒ identical draws on both sides; proven by its own selfcheck
//! (`tracks/neighborWasm.selfcheck.mjs`).

pub mod rng;

use std::ptr;

use rng::Rng;

// ── JS-semantics helpers ──────────────────────────────────────────────

/// JS ToInt32 — exact for all finite inputs (see swarm-bake's `to_i32`).
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
    m as i32
}

// ── spatial hash ──────────────────────────────────────────────────────

/// Counting-sort uniform grid over the sources, sized to their actual cell
/// extent (never clamped to canvas) — the same scheme as swarm-bake's
/// `_buildSpatialHash` port. Cell math runs in f64 (exact widening of the
/// f32 inputs); the inclusion test below stays the sole arbiter of
/// membership, so grid rounding can only ever *over*-cover, never miss:
/// with cell_size == radius, |dx| <= radius implies the cell indices differ
/// by at most 1 (correctly-rounded f64 division keeps that true at any
/// sane coordinate magnitude), and the 3×3 walk covers ±1.
struct Grid {
    /// `cell_start[c]..cell_start[c+1]` spans cell c's sources in `order`.
    cell_start: Vec<i32>,
    /// Source indices grouped by cell.
    order: Vec<i32>,
    cols: i32,
    min_cx: i32,
    min_cy: i32,
    cell_size: f64,
}

fn build_grid(sx: &[f32], sy: &[f32], n_sources: usize, cell_size: f64) -> Grid {
    let mut min_cx = i32::MAX;
    let mut min_cy = i32::MAX;
    let mut max_cx = i32::MIN;
    let mut max_cy = i32::MIN;
    // Per-source cell coords, then reused as the flat cell index.
    let mut cell_of = vec![0i32; n_sources];
    let mut cell_cy = vec![0i32; n_sources];
    for j in 0..n_sources {
        let cx = to_i32(((sx[j] as f64) / cell_size).floor());
        let cy = to_i32(((sy[j] as f64) / cell_size).floor());
        cell_of[j] = cx;
        cell_cy[j] = cy;
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
    if n_sources == 0 {
        min_cx = 0;
        min_cy = 0;
        max_cx = 0;
        max_cy = 0;
    }
    let cols = max_cx - min_cx + 1;
    let rows = max_cy - min_cy + 1;
    let num_cells = (cols as usize) * (rows as usize);

    let mut cell_start = vec![0i32; num_cells + 1];
    for j in 0..n_sources {
        let c = ((cell_cy[j] - min_cy) * cols + (cell_of[j] - min_cx)) as usize;
        cell_of[j] = c as i32; // reuse as the flat cell index
        cell_start[c + 1] += 1;
    }
    for c in 0..num_cells {
        cell_start[c + 1] += cell_start[c];
    }
    let mut order = vec![0i32; n_sources];
    let mut cursor = cell_start.clone();
    for j in 0..n_sources {
        let slot = cursor[cell_of[j] as usize] as usize;
        order[slot] = j as i32;
        cursor[cell_of[j] as usize] += 1;
    }

    Grid {
        cell_start,
        order,
        cols,
        min_cx,
        min_cy,
        cell_size,
    }
}

// ── neighbor loop ─────────────────────────────────────────────────────

/// Status codes for `neighbor_run`. Only the code crosses the boundary —
/// never data, never allocations.
pub const NEIGHBOR_OK: i32 = 0;
/// Null pointer, non-positive/non-finite radius, or size overflow.
pub const NEIGHBOR_BAD_ARGS: i32 = -1;
/// A target's neighbor count exceeded `max_neighbors`; outputs are partial
/// and must be discarded. Size the buffer generously instead.
pub const NEIGHBOR_OVERFLOW: i32 = -2;

/// Core loop: for each target, gather source indices with `d2 <= r2` via the
/// grid, sort the per-target run ascending (canonical = direct-loop order),
/// and write counts + indices. `out_indices` is `n_targets * max_neighbors`
/// u32s; `out_counts` is `n_targets` u32s.
fn run(
    tx: &[f32],
    ty: &[f32],
    sx: &[f32],
    sy: &[f32],
    radius: f64,
    out_counts: &mut [u32],
    out_indices: &mut [u32],
    max_neighbors: usize,
) -> i32 {
    let n_targets = tx.len();
    let n_sources = sx.len();
    debug_assert_eq!(ty.len(), n_targets);
    debug_assert_eq!(sy.len(), n_sources);
    debug_assert_eq!(out_counts.len(), n_targets);
    debug_assert_eq!(out_indices.len(), n_targets * max_neighbors);

    let r2 = radius * radius;
    let grid = build_grid(sx, sy, n_sources, radius);
    let rows = if grid.cols > 0 {
        (grid.cell_start.len() - 1) / (grid.cols as usize)
    } else {
        0
    };

    for i in 0..n_targets {
        // f64 widening is exact; every op below is correctly rounded in both
        // engines, so this matches the JS f64 reference bit-for-bit.
        let qx = tx[i] as f64;
        let qy = ty[i] as f64;
        let base = i * max_neighbors;
        let mut k = 0usize;

        let cx = to_i32((qx / grid.cell_size).floor());
        let cy = to_i32((qy / grid.cell_size).floor());
        // 3×3 walk, clamped to the grid extent (targets outside the source
        // extent simply find no cells — every candidate would fail d2>r2).
        let mut overflow = false;
        'cells: for ox in -1..=1 {
            let ncx = cx + ox;
            if ncx < grid.min_cx || ncx >= grid.min_cx + grid.cols {
                continue;
            }
            for oy in -1..=1 {
                let ncy = cy + oy;
                if ncy < grid.min_cy || ncy >= grid.min_cy + rows as i32 {
                    continue;
                }
                let cc = ((ncy - grid.min_cy) * grid.cols + (ncx - grid.min_cx)) as usize;
                let end = grid.cell_start[cc + 1] as usize;
                let mut p = grid.cell_start[cc] as usize;
                while p < end {
                    let j = grid.order[p] as usize;
                    debug_assert!(j < n_sources);
                    let dx = sx[j] as f64 - qx;
                    let dy = sy[j] as f64 - qy;
                    let d2 = dx * dx + dy * dy;
                    // Verbatim `applyField` inclusion: `if (d2 > r2) continue`.
                    // Spelled as `!(d2 > r2)` (not `d2 <= r2`): NaN distances
                    // are INCLUDED, exactly like the JS path.
                    if !(d2 > r2) {
                        if k >= max_neighbors {
                            overflow = true;
                            break 'cells;
                        }
                        out_indices[base + k] = j as u32;
                        k += 1;
                    }
                    p += 1;
                }
            }
        }
        if overflow {
            return NEIGHBOR_OVERFLOW;
        }
        // Canonical order: the direct loop appends sources in index order.
        out_indices[base..base + k].sort_unstable();
        out_counts[i] = k as u32;
    }
    NEIGHBOR_OK
}

// ── C ABI ─────────────────────────────────────────────────────────────

/// Allocate `size` bytes (16-byte aligned) for caller-owned buffers carved
/// out of wasm linear memory. The caller sizes inputs/outputs, copies the
/// f32 columns in, reads results out, and frees with `neighbor_free`.
/// Returns null on size 0 or allocation failure.
#[no_mangle]
pub extern "C" fn neighbor_alloc(size: usize) -> *mut u8 {
    if size == 0 {
        return ptr::null_mut();
    }
    let layout = match std::alloc::Layout::from_size_align(size, 16) {
        Ok(l) => l,
        Err(_) => return ptr::null_mut(),
    };
    unsafe { std::alloc::alloc(layout) }
}

/// Free a buffer from `neighbor_alloc`. Null-safe; `size` must match the
/// allocation call.
#[no_mangle]
pub extern "C" fn neighbor_free(ptr: *mut u8, size: usize) {
    if ptr.is_null() || size == 0 {
        return;
    }
    if let Ok(layout) = std::alloc::Layout::from_size_align(size, 16) {
        unsafe { std::alloc::dealloc(ptr, layout) };
    }
}

/// Neighbor search over SoA position columns.
///
/// * `tx`, `ty`: `n_targets` f32s — target positions (the SoA x/y columns).
/// * `sx`, `sy`: `n_sources` f32s — source positions.
/// * `radius`: f32 search radius; must be finite and > 0.
/// * `out_counts`: `n_targets` u32s — per-target neighbor counts.
/// * `out_indices`: `n_targets * max_neighbors` u32s — per-target neighbor
///   source indices, ascending within each target's run.
/// * `max_neighbors`: per-target capacity of `out_indices`.
///
/// Both output buffers are zeroed on entry (including the unused tail past
/// each target's count), so the whole buffer the caller reads is defined.
///
/// Returns `NEIGHBOR_OK` (0), `NEIGHBOR_BAD_ARGS` (-1), or
/// `NEIGHBOR_OVERFLOW` (-2). Pointers may be null only when the
/// corresponding count is 0.
#[no_mangle]
pub extern "C" fn neighbor_run(
    tx: *const f32,
    ty: *const f32,
    n_targets: usize,
    sx: *const f32,
    sy: *const f32,
    n_sources: usize,
    radius: f32,
    out_counts: *mut u32,
    out_indices: *mut u32,
    max_neighbors: u32,
) -> i32 {
    if !(radius > 0.0) || !radius.is_finite() {
        return NEIGHBOR_BAD_ARGS;
    }
    let max_n = max_neighbors as usize;
    let idx_len = match n_targets.checked_mul(max_n) {
        Some(l) => l,
        None => return NEIGHBOR_BAD_ARGS,
    };
    if out_counts.is_null() || out_indices.is_null() {
        return NEIGHBOR_BAD_ARGS;
    }
    if (tx.is_null() || ty.is_null()) && n_targets > 0 {
        return NEIGHBOR_BAD_ARGS;
    }
    if (sx.is_null() || sy.is_null()) && n_sources > 0 {
        return NEIGHBOR_BAD_ARGS;
    }
    // Empty inputs: counts are already conceptually zero; still zero them
    // so the caller sees a defined buffer.
    let tx = unsafe { std::slice::from_raw_parts(tx, n_targets) };
    let ty = unsafe { std::slice::from_raw_parts(ty, n_targets) };
    let sx = unsafe { std::slice::from_raw_parts(sx, n_sources) };
    let sy = unsafe { std::slice::from_raw_parts(sy, n_sources) };
    let out_counts = unsafe { std::slice::from_raw_parts_mut(out_counts, n_targets) };
    let out_indices = unsafe { std::slice::from_raw_parts_mut(out_indices, idx_len) };
    // Zero both buffers fully: the tail past each target's count must be
    // defined (deterministic), not stale heap garbage — neighbor_alloc
    // does not zero, and the byte-identical contract covers the whole
    // buffer the caller reads.
    for c in out_counts.iter_mut() {
        *c = 0;
    }
    for v in out_indices.iter_mut() {
        *v = 0;
    }
    if n_targets == 0 || n_sources == 0 {
        return NEIGHBOR_OK;
    }
    run(
        tx,
        ty,
        sx,
        sy,
        radius as f64,
        out_counts,
        out_indices,
        max_n,
    )
}

// ── dish-RNG C ABI ────────────────────────────────────────────────────

/// Open an independent xorshift32 stream on `seed` (see `rng::Rng`).
/// Returns null only on allocation failure. Destroy with
/// `neighbor_rng_destroy`.
#[no_mangle]
pub extern "C" fn neighbor_rng_create(seed: u32) -> *mut Rng {
    Box::into_raw(Box::new(Rng::new(seed)))
}

/// Destroy a stream from `neighbor_rng_create`. Null-safe.
#[no_mangle]
pub extern "C" fn neighbor_rng_destroy(rng: *mut Rng) {
    if !rng.is_null() {
        unsafe {
            drop(Box::from_raw(rng));
        }
    }
}

/// One draw in [0, 1) — bit-identical to the JS `mkRng` closure, including
/// the exact-1.0 clamp. Returns NaN on a null handle (loud, not silent).
#[no_mangle]
pub extern "C" fn neighbor_rng_next(rng: *mut Rng) -> f64 {
    if rng.is_null() {
        return f64::NAN;
    }
    unsafe { (*rng).next_f64() }
}

/// `hashU32` avalanche mix (kernel/rng.js). All integer args are the i32
/// values JS feeds `Math.imul`; `off` is the `>>> 0`-normalized offset.
/// Never returns 0.
#[no_mangle]
pub extern "C" fn neighbor_hash_u32(seed: i32, channel: u32, index: u32, off: u32) -> u32 {
    rng::hash_u32(seed, channel as i32, index as i32, off as i32)
}

/// FNV-1a string→channel hash (`hashChannel` in kernel/rng.js). Takes UTF-8
/// bytes (the registered channel names are ASCII, where UTF-8 == UTF-16
/// code units). Returns 0 on a null pointer.
#[no_mangle]
pub extern "C" fn neighbor_hash_channel(name: *const u8, name_len: usize) -> u32 {
    if name.is_null() {
        return 0;
    }
    let bytes = unsafe { std::slice::from_raw_parts(name, name_len) };
    rng::fnv1a(bytes)
}

/// Full `rngForIndex` seed derivation: resolve the channel's seed-offset
/// group, pick that group's offset, run the avalanche. Offsets arrive
/// already `>>> 0`-normalized; unknown channels are the identity (offset 0).
#[no_mangle]
pub extern "C" fn neighbor_stream_seed(
    seed: i32,
    channel: u32,
    index: u32,
    off_spatial: u32,
    off_color: u32,
    off_asset: u32,
    off_noise: u32,
) -> u32 {
    rng::stream_seed(
        seed,
        channel,
        index as i32,
        off_spatial,
        off_color,
        off_asset,
        off_noise,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Direct-loop oracle (the pre-#1254 semantics `applyField` keeps):
    /// sources in index order, `!(d2 > r2)` inclusion (NaN included, like
    /// `applyField`'s `if (d2 > r2) continue`), f64 arithmetic.
    fn oracle(
        tx: &[f32],
        ty: &[f32],
        sx: &[f32],
        sy: &[f32],
        radius: f64,
    ) -> Vec<Vec<u32>> {
        let r2 = radius * radius;
        tx.iter()
            .zip(ty.iter())
            .map(|(&qx, &qy)| {
                let (qx, qy) = (qx as f64, qy as f64);
                sx.iter()
                    .zip(sy.iter())
                    .enumerate()
                    .filter_map(|(j, (&sjx, &sjy))| {
                        let dx = sjx as f64 - qx;
                        let dy = sjy as f64 - qy;
                        let d2 = dx * dx + dy * dy;
                        if !(d2 > r2) {
                            Some(j as u32)
                        } else {
                            None
                        }
                    })
                    .collect()
            })
            .collect()
    }

    fn check(tx: &[f32], ty: &[f32], sx: &[f32], sy: &[f32], radius: f64, max_n: usize) {
        let n_t = tx.len();
        let mut counts = vec![0u32; n_t];
        let mut indices = vec![0xdeadbeefu32; n_t * max_n];
        let rc = run(tx, ty, sx, sy, radius, &mut counts, &mut indices, max_n);
        assert_eq!(rc, NEIGHBOR_OK);
        let want = oracle(tx, ty, sx, sy, radius);
        for (i, w) in want.iter().enumerate() {
            assert!(w.len() <= max_n, "fixture exceeds max_n");
            assert_eq!(counts[i] as usize, w.len(), "count target {i}");
            assert_eq!(&indices[i * max_n..i * max_n + w.len()], w.as_slice());
        }
    }

    #[test]
    fn parity_against_direct_loop() {
        // Mixed fixture: inside / on / outside the radius, far target.
        let tx = [0.0f32, 0.9, 0.35];
        let ty = [0.0f32, 0.9, 0.0];
        let sx = [0.1f32, -0.2, 0.0, 0.34, 0.36, 0.9, 0.35];
        let sy = [0.0f32, 0.2, 0.3, 0.0, 0.0, 0.9, 0.0];
        check(&tx, &ty, &sx, &sy, 0.35, 16);
        // Degenerate: all points coincident.
        let t = [0.5f32; 4];
        check(&t, &t, &t, &t, 0.35, 4);
        // Empty sources.
        check(&tx, &ty, &[], &[], 0.35, 16);
        // Tiny radius: sparse hits.
        check(&tx, &ty, &sx, &sy, 0.05, 16);
        // Huge radius: all pairs.
        check(&tx, &ty, &sx, &sy, 5.0, 16);
    }

    #[test]
    fn overflow_reports_and_discards() {
        let t = [0.0f32, 0.0];
        let s = [0.0f32, 0.0];
        let mut counts = vec![0u32; 2];
        let mut indices = vec![0u32; 2]; // max_n = 1 < 2 neighbors
        let rc = run(&t, &t, &s, &s, 1.0, &mut counts, &mut indices, 1);
        assert_eq!(rc, NEIGHBOR_OVERFLOW);
    }

    #[test]
    fn nan_coordinates_match_js_inclusion() {
        // NaN distance: `d2 > r2` is false → included, like applyField.
        let tx = [f32::NAN];
        let ty = [0.0f32];
        let sx = [f32::NAN];
        let sy = [0.0f32];
        check(&tx, &ty, &sx, &sy, 0.35, 4);
    }
}
