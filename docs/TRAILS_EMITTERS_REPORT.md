# Trails, Echo, Emitters, Spawning — methods, what KC-1 has, gaps, and the 80/20

*Research report, September 24 2026. Main as-read. Every KC-1 claim traced to file:line; external techniques cited by lineage, not URL (field-standard methods). Companion placement: [`ROADMAP_V1.md`](ROADMAP_V1.md) Stage 1 (#560) + Beyond.*

## 1. The methods catalog

### Trails (motion history)
1. **Fade buffer** — translucent background rect per frame instead of clearing. One line, beautiful, exponential tail. The beginner classic.
2. **Ping-pong FBO + decay** — the GPU version: alternate textures, lerp toward empty, addable optics (bloom, flow-advect). HDR-capable.
3. **Ribbon trails** — last-N positions per particle drawn as tapering polyline/strip. Precise, no framebuffer, cost ∝ N × particles.
4. **Velocity stretch** — smear the sprite along its motion vector. Trails on the objects, zero fullscreen passes.

### Echo (discrete past selves)
1. **Temporal multi-tap** — last K frames composited with falling weights. Rhythmic ghosts.
2. **Stroboscopic deposit** — every N frames (or on trigger), stamp a persistent copy on its own slow clock. The "leave" in echo-leave.
3. **Onion-skinning** — animation's name for the same idea: past poses under the current one.

### Fades (how history dies)
1. **Exponential decay** (`× keep`) — never quite zero; long organic tail.
2. **Linear fade** — fixed subtraction; dies on schedule, predictable, less alive.
3. **Fade-to-color** — decay toward ground/paper instead of black; trails take the ground.

### Emitters (where particles come from)
1. **Rate emitters** — N/sec from point/area with velocity spread. Fountains, smoke.
2. **Event emitters** — bursts on triggers (onset, collision, beat, pointer). Fireworks ignitions, kick-drum blooms.
3. **Brush emitters** — pointer drag emits. The fastest crowd-pleaser in interactive work.
4. **GPU emitters** — spawn/evolve in-shader (transform feedback, ping-pong textures). Thousands at zero CPU.
5. **Hierarchical emission** — rocket → explosion → embers → smoke: each generation is an emitter with its own life. The firework model; the most expressive spawning architecture in the field.

### Spawning (particles making particles/assets)
1. **Division** — split on age/collision/audio. Mitosis, organic growth.
2. **Breed** — agent-flavored division with inherited traits (costume, layer).
3. **Asset spawning** — new sprites/agents entering (vs new dots).

## 2. What KC-1 has now (traced)

| Method | Status | Where |
|---|---|---|
| Ping-pong FBO + decay | LIVE | `gl/accum.mjs` — fade/keep, optics, flow-advect, glow |
| Temporal multi-tap echo | LIVE (stills; live wiring in #560) | `accum.mjs` echo ring, weights `[0.5,0.35,0.25,0.18]` |
| Exponential decay + fade-to-paper | LIVE | `keep`, fade-to-paper grounds |
| Velocity stretch | LIVE | `gl/velocitySmear.mjs` |
| Breed (division with inheritance) | LIVE | contacts `die`/`breed`, `graze` trait, deterministic |
| Rate emitters | PARTIAL | EVOLVE/beat firing exists; no true rate emitter with N/sec + spread |
| Event emitters | MISSING | no onset→burst path (mic attacks drive params, never emission) |
| Brush emitters | MISSING | pointer is attractor-only, never emits |
| Stroboscopic LEAVE | IN BUILD | #560 (stamp FBO, CLEAR-only erase) |
| Ribbon trails | IN BUILD | #560 roster (RIBBON_FS proposed) |
| Hierarchical emission | MISSING | no generation-of-generations anywhere |
| GPU emitters | MISSING | CPU SoA + per-frame upload (transform feedback is Beyond-v1) |
| Linear fade | ABSENT (by design) | exponential only — correct, keep it |

## 3. Gaps, ranked by expressive payoff

1. **Hierarchical emission** — nothing else in the catalog produces firework-structured visuals (ignition → bloom → embers → smoke). Biggest expressive hole.
2. **Event emitters** — kick-drum blooms, collision bursts, onset ignition. The performability hole: music plays *at* the instrument, never *through* it into new matter.
3. **Stroboscopic LEAVE** — in build (#560). Persistent marks change the time signature of a set.
4. **Brush emitters** — cheapest crowd-pleaser; pointer already tracked, emission is one step.
5. **Ribbon trails** — precision line work; in #560 roster. Narrower than 1–4.
6. **GPU emitters** — perf headroom, not expression. Beyond-v1 with transform feedback.

## 4. Best for this engine

Ranked by native fit (what composes with existing contracts vs what fights them):
1. **LEAVE deposits** — reuses OVER composite + CLEAR gestures + tier-1 shedding; zero new shaders for basic LEAVE. Native.
2. **Hierarchical emission** — rides breed (inheritance), EVOLVE/beat (ignition), leak (ember fade). New logic, old contracts.
3. **Event emitters** — beatPulse/attack detection exists; needs only the spawn call. Small, honest.
4. **Ribbon trails** — one new shader + LEAVE buffer; self-contained.
5. **Brush emitters** — pointer + spawn; trivially composable, nearly free.
6. **GPU emitters** — fights CPU readers (~10), parity goldens, determinism. Last, with transform feedback.

## 5. What speaks to TE + Davis + Oxman

- **TE: constraint performs.** Four trail modes in one rack slot system (#560), one honest meter, CLEAR as a single gesture that means something. TE would bless LEAVE (ink stays until *you* clear it — the limit is yours) and refuse a twelve-mode menu. Stroboscopic discipline over infinite options.
- **Davis: the painting is never the same.** *"Pollock showed beauty in randomness… the painting is never the same from one second to the next."* Hierarchical emission is his process made playable (his Wired-described composition machine: options in, morphing out, forever). Event emitters on beats = the work answering the room. He would yawn at ribbon precision and lean into firework structure.
- **Oxman: form is metabolism.** Deposit without erosion is a stamp that only accumulates — graze (already live) + LEAVE persistence + leak melting is the full material loop: lay down, eat away, melt together. Hierarchical emission reads as growth phases (spore → bloom → decay), which is her native language. She would demand the erode half stay equal citizen with deposit — it is (graze + CLEAR).

## 6. The 80/20: four majors, deliberately not all

**Take these four and stop:**
1. **Feedback trails (HAVE)** — ACCUM as-is. The organic tail everything sits in.
2. **Stroboscopic LEAVE (BUILDING, #560)** — persistent marks, ink-on-paper time signature.
3. **Hierarchical emission (NEXT)** — ignition → bloom → embers → smoke; the expressive hole nothing else fills.
4. **Breed + event bursts (HAVE + SMALL)** — division with inheritance exists; wire onsets/beats/collisions to burst emission.

**Deliberately deferred:** ribbon trails (precision few ask for — keep in #560 roster only if cheap), brush emitters (crowd-pleaser, Stage 3 phone story), GPU emitters (Beyond-v1 with transform feedback), linear fade (wrong aesthetics — exponential stays), pressure fluids/SDF (10–50× cost for subtler motion — standing call).

Four methods cover every time signature a set needs: continuous tail, persistent mark, structured eruption, living growth. Everything else is garnish.
