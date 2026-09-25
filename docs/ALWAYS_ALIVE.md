# 🌊 Core Physics & Animation Mandate: The "Always Alive" Protocol

**Context:** This mandate defines the animation and physics philosophy for all generative elements, nodes, and layout transitions within `Kinetic_Curator`. Every element must feel organic, deliberate, and continuously alive.

Apply these rules strictly to all future physics, state interpolation, and layout mode pull requests:

---

### 1. Absolute Smoothness (No Popping)
* **Numeric Interpolation:** All continuous numeric values (`speed`, `wind`, `scale`, `alpha`, `displacement`) must smoothly glide to their new targets. Never snap a number. Use a standardized 2-second interpolation/lerp phase for layout transitions (`blendSeconds: 2`).
* **Enum/Boolean Snaps:** State cuts (e.g., changing a behavior enum from `grid` to `orbit`) must execute cleanly at `t>0` of the transition timeline, allowing the numbers to sweep into the new structural reality.
* **Tactile Exceptions:** The *only* UI elements permitted to hard-cut or snap with `transition: none` are hardware-style indicators (like tally lights or physical toggle stamps). All canvas elements flow.

---

### 2. Continuous Motion Paths (Zero Dead States)
* **Living Nodes:** Nothing on the canvas is ever 100% frozen or static.
* **Rigid Mode Baseline:** Even structural, geometric, or rigid layout modes (such as `grid`, `rails`, or `abacus`) must maintain a microscopic baseline drift, breath, or noise warp so nodes feel suspended in a living field rather than stamped onto a dead canvas.
* **Force Over Placement:** Every element must be vector-driven by velocity and force vectors. Never hard-code static absolute coordinate locks without an underlying physics or noise evaluator.

---

### 3. Distinct Mode Personalities
* **Hardcode Motion Deltas:** When defining modes or stub voices (like `STUB_VOICES`), hardcode motion deltas into their configuration objects.
* **Heavy/Static Modes:** Keep drift and flow intentionally low but non-zero:
  * Drift: $\le 0.15$
  * Flow: $\le 0.2$
* **Fluid Modes:** When switching into fluid, energetic modes (such as `swarm`, `orbit`, or `flow`):
  * Flow: $\ge 0.35$
  * `orbit` must behave gravitationally immediately upon entering the mode (`behave: 'orbit'`).

---

### 4. Per-Node Uniqueness
* **Break the Monolith:** No two nodes may move in lockstep unison.
* **Phase & Mass Jitter:** Inject random phase offsets, distinct noise seeds, or slight mass variations into the instanced array.
* **Drift & Speed Multipliers:** Upon instantiation, assign nodes fractional randomized multipliers on `lifeDrift` and `noiseSpeed` so their pulse, wobble, and sway remain perpetually out of phase.
