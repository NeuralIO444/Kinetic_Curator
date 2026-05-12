# Kinetic Curator — Help & User Guide

A full walkthrough of every panel, every effect, and every keyboard / pointer input. If you only have two minutes, jump to [The 30-second tour](#the-30-second-tour).

The tool has **two modes**:
- **STUDIO** (default) — making vector SVG output. Run the system, lock what you like, refine, export.
- **LIVE** — audio/webcam-reactive performance instrument. Adds Stimulus panel, WebM recording, keyframe playback.

Toggle in the masthead with the `○ STUDIO / ◉ LIVE` button.

---

## Contents

1. [Launching and stopping](#launching-and-stopping)
2. [The 30-second tour](#the-30-second-tour)
3. [The masthead](#the-masthead)
4. [P01 — Canvas](#p01--canvas)
5. [P02 — Asset Pool](#p02--asset-pool)
6. [P04 — Layout](#p04--layout)
7. [P05 — Output (export / import)](#p05--output-export--import)
8. [P06 — Stimulus (audio + webcam)](#p06--stimulus-audio--webcam)
9. [P07 — Davis Mode (evolve)](#p07--davis-mode-evolve)
10. [P07 — Effects](#p07--effects)
11. [P08 — Layers](#p08--layers)
12. [Keyframe playback](#keyframe-playback)
13. [Hotkeys and pointer reference](#hotkeys-and-pointer-reference)
14. [Recipes](#recipes)
15. [Performance tips](#performance-tips)
16. [Troubleshooting](#troubleshooting)

---

## Launching and stopping

**Quickest path:** double-click `run.command` in Finder. The first time, it installs dependencies (1–2 minutes) and compiles the WASM kernel; later runs are immediate. The browser opens to `http://localhost:5173` automatically.

To stop, either:
- Double-click **`stop.command`**, or
- Press `Ctrl-C` in the terminal window `run.command` opened.

If macOS Gatekeeper blocks the scripts the first time, open Terminal and run `bash /path/to/run.command` once; afterwards double-clicking works.

---

## The 30-second tour

For SVG output (STUDIO mode):

1. Press **▶ MOTION** in the masthead — particles swarm, the composition feels alive.
2. Press **▶ AUTO-EVOLVE** — layout parameters mutate every 2.5s.
3. In the LAYOUT panel, click the **K** button next to params you want to keep changing (e.g. `COUNT`, `SCALE`). Now AUTO-EVOLVE only mutates those; everything else stays where you set it.
4. When you see a frame you like, press `Space` (or **■ STOP**) — everything freezes.
5. Tweak any slider — they stay put now.
6. Press **↓ SVG (VECTOR)** in P05 OUTPUT — file downloads.

That's the full Studio loop. Everything else is depth. For Live performance, flip the masthead toggle to `◉ LIVE`.

---

## The masthead

Top bar, always visible.

- **Logo + version**
- **LIVE / PAUSED status pill** (red REC when recording)
- **FPS meter** — live, updated once per second. Green ≥50, yellow ≥30, red below.
- **SEED** — current 8-hex seed. Press `N` to randomise; click ↻ NEW SEED in Davis to do the same.
- **↶ / ↷** — undo / redo
- **Palette chips** — five built-in palettes. Click to apply. The active chip is highlighted.
- **▶ RUN / ■ STOP** — true pause. Halts the evolve interval, the canvas tick (motion/trails/blast), and keyframe playback. Sliders remain live so you can refine before exporting. `Space` does the same.
- **▶ MOTION** — toggles continuous particle motion + echo trails. Doesn't shuffle layout params. Click again to stop.
- **▶ AUTO-EVOLVE** — toggles the Davis randomizer. By default mutates everything not locked; if any params are K-flagged (see LAYOUT panel), only those evolve.
- **○ STUDIO / ◉ LIVE** — mode toggle. STUDIO is the SVG-output workflow; LIVE adds audio/webcam controls, WebM recording, and keyframe playback.
- **PERF ◯ / PERF ◉** — when on, particle count is capped at 200 and Echo + Trails are disabled. Useful on older laptops or when recording.
- **SVG / WEBGL toggle** — switches the canvas renderer. WebGL streams in lazily the first time and unlocks **Feedback**. SVG is canonical for vector export.

---

## P01 — Canvas

The live preview. Three header buttons:

- **BG: PALETTE / TRANSPARENT / WHITE** — cycle the background. TRANSPARENT shows the checkerboard so you can preview alpha for export.
- **RESET VIEW** — zoom = 1, pan = 0,0
- The pill on the right is the viewBox in pixels (1000×700 by default)

**Pointer:**
- **Mouse wheel** — zoom
- **Click + drag** — pan
- **Alt + click** — trigger a blast at the cursor (only fires when the Blast Radius effect is enabled in P07 EFFECTS)
- **Drag the resize grip** at the bottom-right of the canvas — change canvas height

The four corners show 0,0 / mode / preset name / dimensions.

---

## P02 — Asset Pool

The SVG library. Browse by category, search by tag, toggle individual assets in/out of the composition.

- **Category filters** — All · Organic · Geo · Floral · Line · Stamps · Radial
- **Search** — partial-match against asset id and tags
- **Grid / List toggle** — view mode
- Click an asset card to toggle it. Disabled assets get a dim overlay. Hold `Shift`/`Cmd` for ranged selection if your panel supports it.

There are ~140 built-in assets. Disable categories you don't want; the placement engine cycles through whatever's enabled.

---

## P04 — Layout

The placement engine controls.

### Presets

Grouped buttons at the top — sets of params curated for a particular look (Brutalist Grid, Cosmic Spray, Folk Totem, etc). Clicking a preset overwrites only **unlocked** params; locked params (🔒) are preserved.

### Mode tiles

12 placement algorithms:

- **grid** — uniform rectangular grid with jitter
- **fibonacci** — phyllotactic spiral
- **radial** — concentric rings
- **swarm** — clustered organic blobs
- **flow** — sine wave drift, useful for horizons
- **layers** — horizontal bands (good for foreground/background)
- **rails** — vertical columns
- **ca** — cellular automata–driven
- **orbit** — three invisible planets, assets orbit each
- **abacus** — beaded rows with ghost recoil
- **random** — pure scatter
- **(unknown fallback)** — also pure scatter

### Parameter rows

Each row has:
- **🔒 / 🔓 lock** — preserves the value when applying presets or pressing the dice. Locked params are skipped by AUTO-EVOLVE.
- **K (kinetic) flag** — opt this param INTO AUTO-EVOLVE. When at least one param is K-flagged, AUTO-EVOLVE only randomizes the K-flagged set; everything else stays put. When no params are K-flagged, AUTO-EVOLVE falls back to "everything not locked," so the button works out of the box.
- **🎲 dice** — randomize just this one param right now.
- **Double-click the label** — reset to the current preset's default value.

The lock + K combo is the heart of the Studio workflow: lock the params you've nailed down, K-flag the ones you want the system to keep exploring, leave the rest alone.

- **COUNT** (10–800) — how many items to place
- **SCALE** (range, 0.1–3.0) — random per-item scale lerps between low/high
- **ROTATE** (range, -180°–180°)
- **ALPHA** (range, 0–100%)
- **JITTER** (0–200) — pixel jitter on placement
- **DENSITY** (10–120) — used by some modes (CA, rails)
- **Z-TIERS** (1–12) — render depth bands

### 🎲 RANDOMIZE UNLOCKED

Rolls everything that isn't locked.

### Toggles row

`bleed`, `recolor`, `mirror`, `overlap` — placeholder switches reserved for future placement rules (currently visual only).

---

## P05 — Output (export / import)

### ↓ SVG (VECTOR) — the headline export

The big cyan button. Downloads the current frame as a `.svg` file. Steps performed:
1. Clones the live `<svg>` element
2. Bakes GSAP-applied transforms from inline `style` into SVG `transform=` attributes so positions survive when opened outside this app
3. Sets `xmlns`/`xmlns:xlink` so any SVG viewer (Illustrator, Inkscape, browser, plotter software) opens it
4. Wraps with the XML declaration
5. Downloads as `kinetic-curator-<seed>.svg`

This is the canonical export for the Studio workflow. Press while paused to capture exactly the frame you've refined.

### ↓ PNG SNAPSHOT

Pick a resolution (1×, 2×, 4× — up to 7680×4320) then press **↓ PNG SNAPSHOT**. The current frame's seed/palette/layout are saved into the in-app history strip below; clear with ✕ CLEAR HISTORY.

The hotkey `S` triggers a PNG snapshot at the currently-selected resolution.

### ⏺ RECORD WEBM (LIVE mode only)

Press **⏺ RECORD WEBM**. The button turns red and the masthead shows REC. While recording, every change is captured live to a 30fps video stream. Press the button again to stop and download. Combine with Keyframe Playback to bake animations.

### JSON preset I/O

- **↓ JSON** — exports the full current state (layout + effects + palette + enabled assets + locked params + perf mode + rendering mode) to a `.json` file
- **↑ IMPORT JSON** — file picker; restores any prior export

The export format also accepts legacy single-layer JSON files for backwards compatibility.

---

## P06 — Stimulus (audio + webcam)

Two switches at the top: **🎥 VIDEO** and **🎤 AUDIO**.

### Audio

- **AUDIO SRC dropdown** — pick a mic, or load a file (MP3/WAV) via the file picker below
- **🔊 / 🔈 MON ON/OFF** — monitor the routed audio through your speakers (warning: feedback risk if monitoring while micing)
- **GAIN slider** — input gain multiplier
- The **MOTION** meter shows webcam motion energy, the waveform shows live audio bands (bass/mid/treble) + beat-detection pulses

When AUDIO is on, beats trigger evolve events (if Source = BEAT in P07 DAVIS).

### Webcam (Video)

When VIDEO is on, the browser asks for camera permission. We sample 64×48 luma frames, compute per-pixel diff against the previous frame, EMA-smooth it, and publish the result as **motion energy** (0..1). When evolve Source = MOTION, peaks above 0.25 trigger an evolve. The webcam feed itself is not rendered to the canvas — only motion energy is consumed.

---

## P07 — Davis Mode (evolve)

Generative autopilot inspired by Joshua Davis's process. The masthead **▶ AUTO-EVOLVE** button is the quick toggle; this panel exposes the details.

- **TARGET** — what gets mutated (Seed Only · Layout Params · Palette · All Parameters)
- **SOURCE** — what triggers an evolve. `TIME` works in any mode. `BEAT` (audio onset) and `MOTION` (webcam) are **LIVE-only** — disabled in Studio. `MIDI` / `OSC` are placeholders.
- **INTERVAL slider** — time-based interval (0.2–10s)

**The K-flag refinement:** when TARGET = `Layout Params` or `All Parameters`, AUTO-EVOLVE respects the per-param K flags in P04 LAYOUT. With even one K-flag set, only the K-flagged params evolve — your other slider values stay put. This is the granular control that makes Studio mode actually usable: you can have AUTO-EVOLVE running while still working on a slider.
- **AUTO-SNAP** toggle — when on, every evolve also writes a PNG to disk (debounced to once per 2s to avoid browser crashes)
- **SMOOTHING** toggle — when on, item position changes tween via GSAP (looks fluid); when off, snap instantly
- **▶ EVOLVE / ■ STOP** — start/stop the autopilot
- **★ FAVORITE** — same as pressing `F`
- **⟳ NEW SEED** — same as pressing `N`

### Favorites list

Each entry shows id, seed, mode·palette, time. Per-entry buttons: ↻ recall, ✕ delete.

When ≥2 favorites exist, the **▶ PLAY KEYFRAMES** controls appear — see [Keyframe playback](#keyframe-playback).

---

## P07 — Effects

The effect pipeline. Each subsection has an ENABLE toggle plus parameters.

### ECHO

Creates fading, jittered copies of every placement.

- **COUNT** (1–10) — number of echoes per item
- **DECAY** (0.10–0.95) — multiplied alpha + scale per echo step

### TRAILS

When particles are moving, render their past positions with linear decay.

- **LENGTH** (1–60 frames) — history depth

Trails only appear when particle Motion is on — otherwise there's nothing in motion to ghost.

### FEEDBACK *(WebGL only)*

Recursive video feedback via a RenderTexture ping-pong inside PIXI. Switch the masthead to WEBGL first.

- **STRENGTH** (0–1) — opacity of the recursive layer
- **DEPTH** (1–20) — magnification per recursion step (1.005×–1.10×)

Classic tunneling effect. Combine with Particles for full chaos.

### PARTICLES

Add N decorative particles to the composition.

- **PARTICLES** toggle — add particles
- **MOTION** toggle — let them move per-frame
- **COUNT** (10–2000) — number of particles
- **SPEED** (0.1–5) — overall time scaling
- **MOTION TYPE chips** — `flow` (horizontal drift + vertical wave), `swarm` (Lissajous around centre), `orbit` (alternating-direction orbits)

When the WASM kernel is loaded (and count ≥ 32) particle compute runs in WebAssembly; otherwise an arithmetically-identical JS fallback is used.

### BLAST RADIUS

A radial impulse that pushes nearby items outward.

- **RADIUS** (10–500) — pixel radius of effect
- **FORCE** (0–5) — strength of the push

Enable, then **Alt-click** anywhere on the canvas to fire a blast at the cursor. The push decays linearly over one second.

### BLEND MODE

Apply a CSS / GPU blend mode to every item in the live composition.

- Modes: normal · multiply · screen · overlay
- **STRENGTH** (0–1) — alpha multiplier when a non-normal mode is active

In SVG mode this uses CSS `mix-blend-mode`; in WebGL it sets the PIXI sprite blend mode.

### COLOR STRATEGY

How colors are picked from the palette.

- **band** — sweep through swatches with position
- **zone** — quadrant-based zones
- **split** — odd/even split

### HARMONY

Rotates palette swatches in HSL space before colour assignment.

- **none** — palette as-defined
- **complementary** — every other swatch rotated 180°
- **triadic** — cycles 0° / 120° / 240°
- **analogous** — cycles 0° / +30° / −30°

---

## P08 — Layers

Stamp the current composition into a stacked layer, then start fresh on top. Multiple layers composite with per-layer opacity + blend mode.

### Workflow

1. Set up your first composition (palette, mode, effects, etc).
2. Click **+ ADD** in the LAYERS header. A new layer entry appears and the current composition becomes a frozen snapshot.
3. Change things (different mode, different palette, different effects). The new live composition renders on top of the frozen layer.
4. **+ ADD** again to stamp another. Repeat.

### Per-layer controls

For each layer:

- **◉ / ○ visibility toggle**
- **Editable name**
- **✎ EDIT** — load this layer's snapshot back into globals for in-place live editing. The layer's slot in the stack starts showing your edits in real time, with its layer-level opacity + blend mode still wrapping them. **✓ DONE EDITING** saves back and returns to normal mode.
- **↑ / ↓** — reorder
- **✕** — delete
- **OPACITY** slider — per-layer opacity
- **Blend chips** — NORMAL · MULTIPLY · SCREEN · OVERLAY for layer-level compositing

The active layer is highlighted with an accent outline.

---

## Keyframe playback

Once you have at least two favorites:

1. Open P07 DAVIS MODE.
2. The **▶ PLAY KEYFRAMES** controls appear under the FAVORITES header.
3. Set the per-transition duration with the slider (0.5–10s).
4. Click **▶ PLAY KEYFRAMES**.

Playback lerps numeric parameters (count, jitter, density, scale ranges, rotate ranges, alpha ranges, seed, effect numerics) between consecutive favorites. Discrete fields (mode, palette, composition) switch at the midpoint to avoid mushy blends.

To bake an animation to a file: enable WebM recording first, then press play. Stop recording when the loop closes.

---

## Hotkeys and pointer reference

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `S` | PNG snapshot at current export resolution |
| `F` | Save current state as a favorite |
| `E` | Toggle evolve mode |
| `N` | New random seed |
| `P` | Toggle perf mode |
| `f` | Toggle fullscreen |
| `?` | Toggle this hotkey overlay |
| `Cmd/Ctrl-Z` | Undo |
| `Cmd/Ctrl-Shift-Z` | Redo |

| Pointer | Action |
|---|---|
| Mouse wheel | Zoom canvas |
| Click + drag | Pan canvas |
| Alt-click | Blast at cursor (when Blast effect on) |
| Drag canvas-resize grip | Resize canvas height |

---

## Recipes

### Studio: explore → freeze → export SVG

1. In STUDIO mode (default), press **▶ MOTION** + **▶ AUTO-EVOLVE** in the masthead.
2. Watch variations stream by.
3. When the layout mode + palette look right, lock them. In P04 LAYOUT, find the *composition* preset chip that's active, then lock COUNT and SCALE if those feel right.
4. K-flag the params you want to keep exploring (e.g. ROTATE, JITTER, ALPHA). Now AUTO-EVOLVE only varies those three.
5. When a frame appears that you want to keep, press `Space` to freeze.
6. Fine-tune any slider — they stay put now.
7. Press **↓ SVG (VECTOR)** in P05 OUTPUT — file downloads to your default location.

### Joshua-Davis stamp collage

1. Switch to **WEBGL** in the masthead.
2. Set Layout = `swarm`, COUNT ~60, JITTER ~80.
3. Pick palette `praystation`.
4. Add a stamp asset (e.g. `stamp_num_03`).
5. **+ ADD** layer.
6. Change palette to `v01d`, Layout to `radial`, COUNT 200. Different asset.
7. **+ ADD** layer.
8. Switch to `flow`, enable Particles, motion `swarm`, count 400.
9. Adjust per-layer blend modes (try `multiply` on the bottom layer).

### Audio-reactive video

1. P06 STIMULUS: switch AUDIO on, route your DAW or mic.
2. P07 DAVIS: TARGET = `all`, SOURCE = `beat`. Press ▶ EVOLVE.
3. Effects: enable Echo (count 2, decay 0.6).
4. P05 OUTPUT: ⏺ RECORD WEBM.

### Webcam-driven sketch

1. P06 STIMULUS: VIDEO on.
2. P07 DAVIS: TARGET = `seed`, SOURCE = `motion`. ▶ EVOLVE.
3. Wave at the camera — peaks above 25% trigger reseeds.

### Endless tunnel

1. WebGL mode.
2. Effects: Feedback on, STRENGTH 0.85, DEPTH 8.
3. Particles on, motion `orbit`, count 200.

---

## Performance tips

- **WebGL beats SVG** for everything except final exports. Switch via the masthead toggle.
- **Press `P`** to engage perf mode if FPS drops below 30. It caps particle count to 200 and disables echo + trails.
- **Lower COUNT** in P04 Layout — placement count is the dominant factor.
- **Disable layers** you aren't actively curating; each visible layer runs its own pipeline.
- **Close other tabs** — Vite dev mode + Tone.js + PIXI is non-trivial.

The masthead FPS meter is your real-time gauge. Yellow (30–50) is fine for live performance; below 30 something needs cutting.

---

## Troubleshooting

**`run.command` won't open** — macOS Gatekeeper blocks unsigned scripts. Open Terminal and run `bash /full/path/to/run.command` once; subsequent double-clicks work.

**Stops on port 5173 already in use** — run `stop.command` first, then `run.command`.

**Webcam permission denied** — grant in System Settings → Privacy & Security → Camera, then refresh the browser.

**Mic not heard / no audio reactivity** — verify the right input device in the AUDIO SRC dropdown. Press **🔊 MON ON** to confirm signal flow (note: monitoring while micing causes feedback).

**WebM file is silent** — the recorder captures video only. Use OBS or QuickTime screen recording if you need synced audio.

**WebGL mode shows "Loading WebGL renderer…" then stays blank** — the PIXI chunk failed to load. Hard refresh (Cmd-Shift-R). If it persists, drop to SVG mode.

**Browser tab consuming lots of memory** — long sessions can grow the PIXI texture cache. Refresh once an hour during heavy use. (Eviction policy is on the polish list.)

**Tests fail with `fetch is not defined`** — running tests against the WASM module requires Node 18+. `nvm use 20` then `npm test`.

---

For developer-facing internals (state shape, engine pipeline, render flow, slice ownership) see [architecture.md](architecture.md). For the philosophical inspirations, see [manifesto.md](manifesto.md). For the build history and what each roadmap item delivered, see [enhancement_roadmap.md](enhancement_roadmap.md).
