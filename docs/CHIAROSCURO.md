# Chiaroscuro

*The shading/material/lighting engine. Author flat, grow at runtime, light last.*

## Principle

Assets are flat paint. Bodies grow over them (spine, flap, swell), behaviors move through them (drives, graze, leak, mold), and light models them last. Nothing about light is baked; everything about light is performed. One sun, never three-point lighting.

## The five phases (in order)

1. **Sun** — position + color + intensity as uniforms; per-instance diffuse in the quad shader. Dawn side vs dusk side, following a hand or a beat.
2. **Bevel normals** — normals derived in-shader from alpha neighbors (Sprite Lamp trick). Diffuse + tight specular on existing assets: enamel wings, wet leaves, brushed metal. Zero pipeline change.
3. **Squash-and-stretch** — scale along velocity, preserve volume across it. Massy impacts, elongating acceleration. Two lines on already-packed velocity.
4. **Frame strips** — the wing-ladder `u` selector generalized to N-frame strips with rate: flutter cycles, pulse loops, crawl sequences. Animated assets declare frame count; static ones pay nothing.
5. **Parallax drift** — slow camera + per-tier factor on `zTiers`. The flat stack becomes a diorama; distant tiers fall into haze.

## Deliberately not

Spring-mesh softbodies (fights the instance pipeline), shadow maps (depth prepass nobody asked for), multi-light rigs (one sun is the constraint; three lights is a render engine, not an instrument).

## Recipes

**First light** — any voice + sun low + bevel on. Sweep the sun across the plate; watch edges catch and release.

**Wet plate** — mold + tight specular + long LEAVE fade. Colonies glisten as they forage.

**Heavy bodies** — HYPE + squash-and-stretch + short fade. Impacts land, wings elongate off the beat.

## Build record

Tracked in #594 (phases in order). Rules: one fix per PR; new GPU load declares cost tiers; selfcheck per behavior; `Closes #N` lines; Matt merges.
