# Slider Response-Curve Audit — Kinetic_Curator @ c86eb33

Method: static end-to-end trace of every slider, panel → state → render math
(`engine/particles.js`, `engine/placement.js`, `gl/accum.mjs`, `hooks/useCanvasLife.js`,
`hooks/useContinuousLife.js`, `fx/fxFilters.js`). No code changed.

Terminology for Matt: what he's asking about is the **response curve** (audio engineers
call it **taper** — linear-taper vs log/audio-taper pots). A slider is honest when equal
travel gives equal visible change; it's broken when part of its travel does nothing
(dead zone) or a nudge blows up the image (hair-trigger).

## The single biggest structural finding

The eight physics sliders (PARTICLES / COHESION / GRAVITY / DAMPING / WIND / BODY /
FLAP / TIGHT) only mean anything in **swarm** and **hype** modes. In the other 12 layout
modes they are visible, draggable, and completely inert. Worse, several are neutered
even inside the modes where they should work (details below).

## Full table

| # | Control | Range / default | Where the value lands | Response | Default zone | Notes |
|---|---------|-----------------|----------------------|----------|--------------|-------|
| 1 | COUNT | 10–800 / 240 | `buildPlacements` count | linear | fine | Governor `countClamp` overrides it under load (disclosed in badge) |
| 2 | SCALE (dual) | 0.1–3.0 / [0.4,1.6] | placement scale multiplier | linear | fine | — |
| 3 | ROTATE (dual) | −180–180 / full | placement rotation | linear | fine | — |
| 4 | ALPHA (dual) | 0–100 / [40,100] | placement opacity | linear | fine | — |
| 5 | JITTER | 0–200 / 24 | px scatter (`placement.js`) | linear | fine | — |
| 6 | DENSITY | 10–120 / 78 | keep-probability % (`placement.js:123`: `if (density<100 && hash*100>density) continue`) | linear, then **dead 100–120** | fine | Top 17% of travel does nothing |
| 7 | Z-TIERS | 1–12 / 4 | depth = 0.6 + tier/(tiers−1)·0.8 | linear-ish | fine | — |
| 8 | HUE ROTATE | 0–360 / 0 | throws every frame (`renderer.mjs:459`) | **broken** | — | C1, filed as #262 |
| 9 | NOISE FREQ | 0.001–0.03 / 0.005 | fBm sample scale (`placement.js:135`) | **hair-trigger at bottom** | fine | Log-perceptual: 0.001→0.006 (17% of travel) sweeps wavelength 1000→167px; 0.024→0.03 (20% of travel) only 42→33px |
| 10 | NOISE SPEED | 0.1–3.0 / 0.5 | `nt = time·noiseSpeed·0.001` | linear | fine | — |
| 11 | DISPLACE | 0–250 / 0 | px offset = fBm·displacement | linear | off (legit) | 200–250 = total chaos; first 10% subtle |
| 12 | PARTICLES | 10–500 / 150 | swarm re-init count | linear | fine | swarm/hype only |
| 13 | COHESION | 0–5 / 1.5 | **hype: ignored** (`cohW = profile.coh`); swarm: steering accel | **dead above ~0.33 in swarm; fully dead in hype** | default 1.5 sits deep in the dead zone | Terminal v = cohW·damp/(1−damp), clamped at 8px/f → saturates for cohW>~0.33 at default damping. 12 other modes: inert |
| 14 | GRAVITY | 0–5 / 1.0 | attractor force = gw·attractMul·8/max(20, d·0.05), **only while pointer is over canvas** (`useCanvasViewport.js:48`) | weak/subtle | default subtle | hype: scaled by profile.attract (0.15–1). At default, weaker than wind except near cursor. Undisclosed hover requirement. 12 modes: inert |
| 15 | DAMPING | 0.80–0.99 / 0.95 | `v *= damp` per frame | **dead in hype; pinned in swarm** | default fine in swarm | hype: `damp = max(damping, 0.97)` → slider 0.80–0.97 does nothing, and speed clamp 1.65px/f saturates the rest → effectively fully dead in hype. Swarm: live zone ≈0.80–0.93, pinned by speed clamp above |
| 16 | BODY | 1–7 / 3 | spine segment count (hype) | linear | fine | hype only; multiplies node count (perf note) |
| 17 | FLAP | 0–1 / 0.35 | wing amp = flap·sin, reach 16+\|amp\|·20, ±18° | linear | fine | **Dead unless SYMMETRY = bilateral** (wings only built in that branch, `particles.js:763`) |
| 18 | TIGHT | 0.05–0.95 / 0.55 | spine follow factor | linear-ish | fine | hype only |
| 19 | WIND | 0–3 / 1 | `windMul = organism ? wind·profile.wind : 1` | **ignored in swarm; ~5× attenuated in hype** | default = dead in swarm | Hint says "Hype-only" but slider is shown (and dead) in swarm mode. Hype: profile.wind = 0.12–0.35 |
| 20 | FADE (accum) | 0.5–0.98 / 0.88 | `accum.rgb *= keep` per frame | **hyperbolic** | sits at the knee | Trail half-life: 1f @0.5, 5.4f @0.88, 13.5f @0.95, 34f @0.98. Bottom half (0.5–0.75) all reads "short trails"; all the drama is 0.9–0.98 |
| 21 | GLOW (accum optics) | 0–1 / 0 | bloomAmount=0.55·o, halation=0.45·o, blur σ=5·o — **added into the feedback buffer every frame** (`accum.mjs`: `accum.rgb += bloomAmount·blurred`) | **hair-trigger** | off (legit) | Feedback compounding: equilibrium ≈ bloom/(1−keep) ≈ **8.3×** per-frame at keep=0.88. 0→0.2 of travel covers most of the visible drama. Audio adds up to +0.4 (0.3·rms+0.1·beat), so with loud audio the top of the slider pegs at max |
| 22 | TUNNEL | 0–1 / 0 | zoom 1.01^t/frame, spin 0.01·t rad/frame | strong but smooth | off (legit) | t=1 → 1.8×/s zoom. OK |
| 23 | PRISM | 0–1 / 0 | 0.001·pr UV offset/channel | gentle | off (legit) | "tasteful below 0.4" per code comment. OK |
| 24 | GAIN (stimulus) | 0–5 / 1 | audio input gain | linear | fine | — |
| 25 | DEPTH (stimulus) | 0–1 / 0.65 | **applied twice**: `scaleMul = 1+(…)·depth`, `alphaBoost ∝ depth`, `glow ∝ depth` (`useCanvasLife.js:38-50`) | **quadratic** | fine | Dead with no audio input (undisclosed). With loud audio at depth=1: scaleMul up to ~1.6 — dramatic |
| 26 | SCALE (stimulus) | 0–1 / 0.45 | audio→size amount, gated by DEPTH | linear | fine | dead without audio |
| 27 | ALPHA (stimulus) | 0–1 / 0.25 | `alphaBoost = pulse·18·alphaMod·depth` | linear | fine | dead without audio |
| 28 | LIFE | 0–1 / 0.35 | two paths: breath (±1.2% scale, ±0.6° rot **at max** — invisible) + drift overlay (jitter ±12·depth px, displace ±18·depth, noiseSpeed ±0.25·depth — visible) | **breath path dead, drift path live** | fine | The "breathing" half of the slider is imperceptible at every setting |
| 29 | Layer opacity | 0–1 | layer composite | linear | fine | — |
| 30 | FX params (rgbSplit, displace, tear, grain, blur, scanlines, posterize) | various px/0–1 | honest shader uniforms (`fx/fxFilters.js`) | linear | fine | Blur 0–40px is a true gaussian at every setting (honest-blur contract). No issues found |
| 31 | DAVIS timing (BPM 40–240, phrase 4–32, morph 300–4000ms, evolve 200–10000ms) | — | clocks | linear | fine | — |

Excluded from ranking per brief: SWELL, RECOLOR, SHADING, MATERIAL, SMOOTHING (known dead, #268).

## Ranked: top "does nothing" sliders

1. **COHESION** — ignored in hype (behave profile wins), saturated above ~0.33 in swarm (top ~93% of travel dead), inert in 12 modes. Default 1.5 is deep in the dead zone. *Fix: in swarm, narrow range to 0–0.6 with finer steps; in hype, remove or wire to profile; hide outside swarm/hype.*
2. **DAMPING** — fully dead in hype (`max(damping, 0.97)` + 1.65px/f speed clamp saturate it at every setting). *Fix: disable in hype mode, or narrow hype range to 0.97–0.995; in swarm narrow to 0.80–0.95 where it actually bites.*
3. **WIND** — ignored in swarm mode outright; ~5× attenuated in hype; inert elsewhere. *Fix: show only in hype mode (as the hint already admits); in hype, rescale so 0–3 maps to the profile-relative range honestly.*
4. **GRAVITY** — only acts while the pointer hovers the canvas (undisclosed); at default weaker than the wind force it's fighting; scaled down further in hype. This is why Matt sees nothing. *Fix: raise the gain (ATTRACTOR_GAIN 8 → ~20) so the default is felt; add a hint "move your cursor over the canvas"; show only in swarm/hype.*
5. **LIFE (breath half)** — ±1.2% scale / ±0.6° rotation at max is below perception; only the drift overlay half is visible. *Fix: boost breath amplitudes ~5× (±6% scale, ±3° rot) or drop the breath terms and let LIFE = drift only.*
6. **FLAP** — does nothing unless SYMMETRY = bilateral. *Fix: disable the slider unless bilateral is active.*
7. **DENSITY** — 100–120 dead (keep-all above 100). *Fix: cap range at 100.*
8. **STIMULUS DEPTH/SCALE/ALPHA** — dead with no mic/audio input. *Fix: not a bug, but the panel should say so when audio is off (currently the subtitle says "idle" — easy to miss).*

## Ranked: top "too dramatic" sliders

1. **GLOW (accumulation optics)** — additive per-frame feedback compounds ≈8.3× at default fade; 0→0.2 of slider travel covers most of the visible range; audio can add +0.4 and peg it. *Fix: remap slider through a curve (effective = o^2, or 0–1 → 0–0.35 optics) so the full travel is usable; default 0 stays.*
2. **NOISE FREQ** — linear slider over a log-perceptual quantity; bottom third is hair-trigger. *Fix: exponential mapping (slider 0–1 → freq = 0.001·30^s); keep default at 0.005.*
3. **FADE** — hyperbolic trail length; bottom half undifferentiated, all action 0.9–0.98. *Fix: remap slider to trail half-life in frames (1–40f) instead of the raw keep factor.*
4. **STIMULUS DEPTH** — depth multiplies twice (quadratic response). *Fix: apply once — `scaleMul = 1 + (…)·depth` is already there; remove the second gating or document the curve.*
5. **DISPLACE** (honorable mention) — linear and honest, but 0–250 ends in total canvas chaos; *consider soft-cap at ~120 with the top end reachable only deliberately.*

## Suggested implementation shape (for the fix PR)

- One shared `taper` helper (linear / exponential / half-life) applied at the panel→state boundary, so the stored param stays in physical units and only the slider position is remapped.
- Mode-gate the physics slider block: disabled state (not hidden — TE honesty) with a one-line reason when the mode ignores them ("cohesion is set by the FLOCK profile in hype mode").
- Gravity: gain bump + hover hint; wind: hype-only visibility.
