# Motion systems — inventory, jitter diagnosis, placement recommendation

*2026-09-24. Every entry traced live on main; file:line throughout. Companion play script at the bottom.*

## 1. Inventory — everything that moves pixels

| # | System | Where | Character | Kill switch |
|---|--------|-------|-----------|-------------|
| 1 | Life LFO | `liveLoop.mjs:427-428,579-580` | rotation ±0.3 rad + scale/agent terms, all × `lifeDrift` | LIFE slider → 0 |
| 2 | Wind noise field | `particles.js:722-792` | `noise3D` per particle (point) or shared `curl2` (flock/mold/murmuration), × wind × profile | Wind slider → 0 |
| 3 | Life-drift clock | `liveResolve.mjs:45-56` | quantized `floor(loopTimeMs/80)*0.04` — 12.5Hz stair-steps on jitter/displacement/noiseSpeed | code only (no slider) |
| 4 | Warp displacement | `liveResolve.mjs:386-401` + warpPhase | fBm crawl, slow drift | displacement → 0 |
| 5 | Audio reactivity | `liveLoop.mjs:403-414` via `audioBands` | mic envelope → scale/alpha/breath; mic floor = constant micro-motion | mic off |
| 6 | Boids + heading spring | `particles.js` force pass + spine C spring | deterministic flocking, smooth by design | — |
| 7 | Drives/curiosity | `particles.js:919-940` | deterministic wander × drive × metabolism (0 default = off) | metabolism 0 |
| 8 | Attractor | `particles.js:819-820` | cursor-only pull × gravityWells | cursor off canvas |
| 9 | Breath swell | `particles.js:1035-1037` | scale pulse × breath (0 on all flagships — dormant) | — |
| 10 | Transitions | MIX/morph/EVOLVE/governor | episodic by design; #471 tick-jitter fixed (seed in `morphSig`) | — |

## 2. Jitter diagnosis

No single culprit — three stacked shimmers read as "jitter": wind-field stochastic forcing (#2) + life-LFO wobble amplified by HYPE's `lifeDrift: 0.5` (`voices.js:170`, hottest flagship) (#1) + 12.5Hz stepped life clock (#3). Isolate in order: LIFE → 0, Wind → 0, mic off, displacement → 0; remainder is life-clock stepping or boids (code, trace live).

## 3. Placement recommendation: label in place + one readout — no new panel, no relocation

Motion controls live in four places today (ParamBlock turbulence/swarm/moth sections, Reactivity LIFE/audio, DAVIS EVOLVE, MasterBar tape). Gathering them into one panel breaks the 4-tab cap and the panel semantics that put them there (LIFE belongs with reactivity, EVOLVE with the system panel).

Instead, two moves that fit existing structure:
1. **Label every motion slider with its jitter role** in `helpCopy` (one line each: what moves, what stills it). Manual at the point of use; the #507 diagnostic pattern.
2. **One MOTION readout** (patch-diag shape): per-layer live motion budget — life/wind/audio/warp contributions as read from the same locals the resolver already holds. No new panel; a line, not a surface.

A mass relocation buys a second mystery to explain the first. The controls stay where performers reach for them; the readout says what they're doing.
