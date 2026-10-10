//! kc-neighbor — the dish seeded-RNG discipline, mirrored in Rust (#1318).
//!
//! This module is a verbatim port of two JS sources, kept in lockstep:
//!
//! * `app/src/engine/prng.js` — `mkRng`: xorshift32 with the `(seed|0) || 1`
//!   seed guard and the exact-1.0 clamp to `1 - Number.EPSILON`.
//! * `app/src/engine/kernel/rng.js` — `hashU32` (the avalanche seed mix),
//!   `hashChannel` (FNV-1a string→channel), the `CH.*` channel ids, and the
//!   channel→seed-offset-group table (`OFFSET_GROUP_OF`, #305/#1238).
//!
//! Stream partitioning rule (dish §2): a stream is identified by
//! `(seed, channel, index)` plus the four sub-seed offsets
//! (spatial/color/asset/noise); streams never consume shared state —
//! `neighbor_stream_seed` derives the seed, `neighbor_rng_create` opens an
//! independent xorshift32 stream on it. Same inputs ⇒ identical draws on
//! both sides of the boundary, proven by
//! `tracks/neighborWasm.selfcheck.mjs`.

mod rng_impl {
    /// FNV-1a → u32. Verbatim port of `hashChannel` in kernel/rng.js:
    /// `h = 2166136261; for each char: h ^= code; h = imul(h, 16777619)`.
    /// JS charCodeAt yields UTF-16 code units; the C-ABI entry takes raw
    /// bytes, so callers must pass UTF-8 — for the registered channel names
    /// (ASCII) the two coincide.
    pub const fn fnv1a(bytes: &[u8]) -> u32 {
        let mut h: u32 = 2166136261;
        let mut i = 0;
        while i < bytes.len() {
            h ^= bytes[i] as u32;
            h = h.wrapping_mul(16777619);
            i += 1;
        }
        h
    }

    /// `hashU32` from kernel/rng.js — avalanche mix → u32, never 0.
    /// `seed`, `channel`, `index`, `off` are the i32 values JS feeds to
    /// `Math.imul` (i.e. `seed|0`, `channel|0`, `index|0`, and the
    /// `>>> 0`-normalized offset reinterpreted as int32).
    pub fn hash_u32(seed: i32, channel: i32, index: i32, off: i32) -> u32 {
        let mut h: i32 = seed
            ^ channel.wrapping_mul(0x9e3779b9u32 as i32)
            ^ index.wrapping_mul(0x85ebca6bu32 as i32)
            ^ off.wrapping_mul(0x27d4eb2du32 as i32);
        // h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
        h = (h ^ ((h as u32 >> 16) as i32)).wrapping_mul(0x7feb352du32 as i32);
        // h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
        h = (h ^ ((h as u32 >> 15) as i32)).wrapping_mul(0x846ca68bu32 as i32);
        // (h ^ (h >>> 16)) >>> 0
        let u = (h ^ ((h as u32 >> 16) as i32)) as u32;
        // h || 1
        if u == 0 { 1 } else { u }
    }

    /// Channel ids from kernel/rng.js (`CH`).
    pub const CH_DENS: u32 = 1;
    pub const CH_GEO: u32 = 2;
    pub const CH_ATTR: u32 = 3;
    pub const CH_ASSET: u32 = 4;
    pub const CH_COLOR: u32 = 5;
    pub const CH_NOISE: u32 = 6;
    pub const CH_DYN: u32 = 7;
    pub const CH_CURATE: u32 = 8;

    /// Registered string sampling channels (kernel/rng.js
    /// `STRING_CHANNEL_GROUPS`), as FNV-1a hashes — all ride the spatial
    /// stream. `const fn` so the values are computed, not transcribed.
    pub const CH_FIELD: u32 = fnv1a(b"field");
    pub const CH_CA: u32 = fnv1a(b"ca");
    pub const CH_VORONOI: u32 = fnv1a(b"voronoi");
    pub const CH_POISSON: u32 = fnv1a(b"poisson");
    pub const CH_GROWTH: u32 = fnv1a(b"growth");

    /// Seed-offset groups (#305). Mirrors `OFFSET_GROUP_OF`: unknown
    /// channels resolve to `Group::None` (offset 0 — the identity, exactly
    /// like the JS `Map.get` miss).
    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    pub enum Group {
        Spatial,
        Color,
        Asset,
        Noise,
        None,
    }

    /// `channel` is the *resolved* channel id: a numeric `CH_*`, or the
    /// FNV-1a hash of a string channel (see `neighbor_hash_channel`).
    pub const fn group_of(channel: u32) -> Group {
        match channel {
            CH_DENS | CH_GEO | CH_ATTR | CH_DYN | CH_CURATE => Group::Spatial,
            CH_COLOR => Group::Color,
            CH_ASSET => Group::Asset,
            CH_NOISE => Group::Noise,
            _ => {
                if channel == CH_FIELD
                    || channel == CH_CA
                    || channel == CH_VORONOI
                    || channel == CH_POISSON
                    || channel == CH_GROWTH
                {
                    Group::Spatial
                } else {
                    Group::None
                }
            }
        }
    }

    /// `rngForIndex`'s seed derivation: resolve the channel's offset group,
    /// pick that group's offset, run the avalanche. Offsets arrive already
    /// `>>> 0`-normalized (see `normalizeSeedOffsets`); a missing group is
    /// the identity (offset 0), so unregistered channels are bit-identical
    /// to the JS path.
    pub fn stream_seed(
        seed: i32,
        channel: u32,
        index: i32,
        off_spatial: u32,
        off_color: u32,
        off_asset: u32,
        off_noise: u32,
    ) -> u32 {
        let off = match group_of(channel) {
            Group::Spatial => off_spatial,
            Group::Color => off_color,
            Group::Asset => off_asset,
            Group::Noise => off_noise,
            Group::None => 0,
        };
        hash_u32(seed, channel as i32, index, off as i32)
    }

    /// `mkRng` from app/src/engine/prng.js — xorshift32.
    /// Seed guard `(seed|0) || 1`: a 0 seed opens the seed-1 stream.
    #[derive(Clone, Copy, Debug)]
    pub struct Rng {
        state: u32,
    }

    impl Rng {
        pub fn new(seed: u32) -> Self {
            Self {
                state: if seed == 0 { 1 } else { seed },
            }
        }

        /// One draw in [0, 1). Bit-for-bit with the JS closure:
        /// `s ^= s<<13; s ^= s>>>17; s ^= s<<5` on the 32-bit pattern,
        /// draw `(s>>>0)/0xffffffff`, and the exact-1.0 clamp to
        /// `1 - Number.EPSILON` (2^-52 below 1 — exact in f64 on both sides).
        pub fn next_f64(&mut self) -> f64 {
            let mut x = self.state;
            x ^= x.wrapping_shl(13);
            x ^= x >> 17; // u32: logical shift == JS `>>>`
            x ^= x.wrapping_shl(5);
            self.state = x;
            let v = (x as f64) / 4294967295.0;
            if v == 1.0 {
                1.0 - f64::EPSILON
            } else {
                v
            }
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        // Ground truth generated from the JS sources (node):
        //   mkRng(1)    → 0.000062950188308709811 0.015747428176865780 0.61640410256022682
        //   mkRng(444)  → 0.026484804001284019 0.99039479740671688 0.068334922676052651
        //   mkRng(0)    → same as mkRng(1)  (the `|| 1` guard)
        //   mkRng(2^32-1) → 0.000059135025380909216 0.98449695109960089 0.45598746916651434
        //   hashU32(12345, 2, 7, null) → 4094089733
        //   hashU32(12345, 2, 7, {spatial:9}) → 1809433071
        //   hashU32(0, 'field', 0, null) → 890206985
        //   hashU32(7, 'voronoi', 3, {1,2,3,4}) → 230874755
        #[test]
        fn rng_draws_match_js() {
            let cases: &[(u32, [f64; 3])] = &[
                (
                    1,
                    [
                        0.000062950188308709811,
                        0.015747428176865780,
                        0.61640410256022682,
                    ],
                ),
                (
                    444,
                    [
                        0.026484804001284019,
                        0.99039479740671688,
                        0.068334922676052651,
                    ],
                ),
                (
                    0, // `|| 1` guard: seed 0 draws the seed-1 stream
                    [
                        0.000062950188308709811,
                        0.015747428176865780,
                        0.61640410256022682,
                    ],
                ),
                (
                    0xffffffff,
                    [
                        0.000059135025380909216,
                        0.98449695109960089,
                        0.45598746916651434,
                    ],
                ),
            ];
            for (seed, want) in cases {
                let mut r = Rng::new(*seed);
                for w in want {
                    let got = r.next_f64();
                    assert!(
                        got.to_bits() == w.to_bits(),
                        "seed {seed}: got {got:?}, want {w:?}"
                    );
                }
            }
        }

        #[test]
        fn hash_u32_matches_js() {
            assert_eq!(hash_u32(12345, 2, 7, 0), 4094089733);
            assert_eq!(hash_u32(12345, 2, 7, 9), 1809433071);
            // 'field' → spatial group; tested end-to-end via stream_seed.
            assert_eq!(stream_seed(0, CH_FIELD, 0, 0, 0, 0, 0), 890206985);
            assert_eq!(
                stream_seed(7, CH_VORONOI, 3, 1, 2, 3, 4),
                230874755
            );
            // Unregistered channel: offset ignored (identity).
            assert_eq!(
                stream_seed(99, 123456789, 5, 7, 7, 7, 7),
                hash_u32(99, 123456789 as i32, 5, 0)
            );
            // Avalanche never returns 0 (`|| 1`).
            assert_ne!(hash_u32(0, 0, 0, 0), 0);
        }

        #[test]
        fn exact_one_clamps_to_one_minus_epsilon() {
            // Invert one xorshift32 step to build a state that draws exactly
            // 1.0: T(seed) == 0xffffffff. Bit-level forward substitution
            // (self-verified below — a wrong inverse fails the round-trip).
            fn inv_l(y: u32, s: u32) -> u32 {
                let mut x = 0u32;
                for i in 0..32 {
                    let yb = (y >> i) & 1;
                    let xb = yb ^ if i >= s { (x >> (i - s)) & 1 } else { 0 };
                    x |= xb << i;
                }
                x
            }
            fn inv_r(y: u32, s: u32) -> u32 {
                let mut x = 0u32;
                for i in (0..32).rev() {
                    let yb = (y >> i) & 1;
                    let xb = yb ^ if i + s < 32 { (x >> (i + s)) & 1 } else { 0 };
                    x |= xb << i;
                }
                x
            }
            fn fwd(mut x: u32) -> u32 {
                x ^= x.wrapping_shl(13);
                x ^= x >> 17;
                x ^= x.wrapping_shl(5);
                x
            }
            let seed = inv_l(inv_r(inv_l(0xffffffff, 5), 17), 13);
            assert_eq!(fwd(seed), 0xffffffff, "inverse round-trip");
            let mut r = Rng::new(seed);
            let got = r.next_f64();
            let want = 1.0 - f64::EPSILON; // JS: 1 - Number.EPSILON
            assert!(
                got.to_bits() == want.to_bits(),
                "clamp: got {got:?}, want {want:?}"
            );
        }
    }
}

pub use rng_impl::{
    fnv1a, group_of, hash_u32, stream_seed, Group, Rng, CH_ASSET, CH_CA, CH_COLOR, CH_CURATE,
    CH_DENS, CH_DYN, CH_FIELD, CH_GEO, CH_GROWTH, CH_NOISE, CH_POISSON, CH_VORONOI,
};
