# Design-system migration map

**Against:** `DESIGN_SYSTEM.md` v1.0 · **Source:** `~/workspace/kc-system-review/SYSTEM_STYLE.md` breaks.
**Rule:** no code here — one fix per issue/PR, Matt merges. Ordered by leverage, highest first.

Effort: **S** = under a day, one file or a copy pass · **M** = a few days, several files, some judgment ·
**L** = a week+, architectural.

---

## M1 — One slider everywhere (fixes B1) · M

**The highest-leverage fix.** `components/RangeRow.jsx` is the house slider; converge every bare
`input[type=range]` onto it. Give `RangeRow` a `tone` prop (`build`/`stim`/`ink`, default `build`)
for the thumb color per §2.1, and make the 44px hit area its default.

| File | Change |
|---|---|
| `components/RangeRow.jsx` | Add `tone` prop → thumb color var; lock glyphs `🔒/🔓` → `▪/▫` (folds in M2) |
| `styles/controls.css` | Thumb/track tokens per tone; kill any 2–4px radii leftovers (folds in M8) |
| `panels/stimulus/ModSlider.jsx` | Replace with `RangeRow tone="stim"` — kills the native-blue slider |
| `panels/stimulus/ModMatrix.jsx`, `ReactivityControls.jsx`, `SourceControls.jsx` | Same replacement |
| `panels/davis/EvolveControls.jsx`, `MorphControls.jsx`, `PhraseControls.jsx`, `QueueTransport.jsx` | Same replacement (PLAY's blue sliders die here) |
| `panels/build/LayerStack.jsx`, `panels/build/MathEffectEditor.jsx` | Opacity/FX-param sliders → `RangeRow` (44px already in `styles/panels.css`) |
| `panels/layout/AccumFamily.jsx`, `MixBar.jsx`, `components/MotionTile.jsx`, `panels/AssetStudioModal.jsx` | Audit: converge or justify the exception in the PR body |

**Acceptance:** zero bare `input[type=range]` outside `RangeRow.jsx`; one thumb feel in every panel.

## M2 — Emoji → glyphs (fixes B4) · S

Ten-minute pass, mechanical. Per the §6 dictionary:

| File | Change |
|---|---|
| `panels/StimulusPanel.jsx:67,75` | `🎤 AUDIO` → `◉ AUDIO`; `⚙ SETUP` → `≡ SETUP` |
| `panels/stimulus/SourceControls.jsx:59` | `🔊/🔈 MON ON/OFF` → `((·)) MON ON/OFF` |
| `components/PaletteWing.jsx:115` | `🎲 GENERATE` → `⚄ GENERATE` |
| `components/RangeRow.jsx:53,187`, `components/MotionTile.jsx:69` | `🔒/🔓` → `▪/▫` |
| `panels/BuildPanel.jsx:38` | lock badge `🔒` → `▪` |
| `App.jsx:278` | settings `⚙` → `≡` |

**Acceptance:** `grep` for emoji codepoints in `app/src` returns nothing outside the LOIS pill.

## M3 — Casing into CSS (fixes B2) · M

1. Add utility classes in `styles/controls.css`: `.lbl` (lowercase), `.act` (uppercase), `.ttl` (uppercase + letterspacing). Apply `text-transform` there — never in JSX.
2. Sweep ~150 button/label strings: JSX strings go lowercase; each element gets the class matching its role per §5 (labels instrumental-lower, actions command-upper, titles letterspaced-upper, proper names untouched).
3. Hotspots: PIPELINE/DIRECTOR/BUILD labels (upper → check role), PLAY/STIMULI (already lower — mostly just get the class), top-bar mixed strings (`START: K.O.Z.`, `FADE`, `rand`, `Curator`, `coral DLA growth`).

**Acceptance:** `text-transform: none` is the exception, not the default; no uppercase/lowercase literals that contradict the element's class.

## M4 — Pink discipline (fixes B5) · S

Pink (`--kc-live`) is "live/armed/go" and nothing else:

| File / surface | Change |
|---|---|
| Master bar `PERF PAUSED` pill | Pink border → `--kc-ok` green (paused = safe to look away) |
| `chip-btn.armed` outline `#ffd166` | → `--kc-warn` amber; yellow stays BUILD-only |
| Any pink-bordered paused/idle state | Audit and recolor per §1.1 |

**Acceptance:** pink appears only where something is live, armed, or executing.

## M5 — Numerals: Arabic everywhere (fixes B7) · S — IN FLIGHT (#1016)

Matt's ruling stands: `panels/build/trackNumeral.mjs` Roman-for-KC is retired. KC keeps identity
via the `KC` badge (§1.1 `--kc-kc`). Fold into the #1016 builder's scope (already extended to
MATH blend-row removal).

## M6 — Density scale (fixes B6) · M

Apply the §1.3 scale — 44px live rows, 28px headers, 6px section gaps, 4px control gaps:

| Surface | Change |
|---|---|
| `panels/stimulus/*` route matrix | Row height → 44px; dropdowns get the §2.5 house style; LIVE column aligns to the grid |
| PIPELINE form rows (SETUP/CANVAS, IN, PROCESS) | → 28px form rows, 6px section gaps |
| DIRECTOR GENERATE buttons | Keep their size (they're deliberate stage buttons) — but their spacing joins the scale |

**Acceptance:** moving BUILD → STIMULI → PIPELINE feels like changing tabs, not rooms.

## M7 — LOIS voice leak (fixes B3, voice half) · S

One LOIS-blunt line per panel, in the empty state or naming moment — never on a live control.
Palette wing ("NAME IT — VOID didn't become real from hex values") is the template. Copy-only
pass; Matt approves the lines.

**Acceptance:** BUILD, DIRECTOR, STIMULI, PLAY each carry exactly one voice-1 line.

## M8 — Radii zero + dropdown house style · S

Fold into M1/M6 passes: zero any remaining `border-radius: 2–4px`; style STIMULI's native
`<select>`s per §2.5.

## M9 — Layer-stack convergence (encodes the VERDICT.md winner) · M — QUEUED

The refined row-stack (C) is the system model — this is the already-queued #1014–#1019 work
plus the #1022/#1023 additions. System requirements on top of that queue:
- Track badges per §1.1 (`KC` ink / `FX` violet / `M` BUILD-yellow), Arabic numerals (M5).
- Params collapsed by default, tap-to-expand (density through disclosure).
- One-tap `+` per section, long-press/chevron chooser (ghosts gone).
- Whole-row 44px targets; reorder feedback + DUP-at-cap signal.

**Acceptance:** §2.6 holds verbatim.

---

## Sequencing

1. **M1** (slider) — the feel of the instrument, first.
2. **M2** (glyphs) — while M1 is in review; mechanical.
3. **M3** (casing) + **M4** (pink) — the glance pass.
4. **M5** (numerals) — rides the #1016 builder.
5. **M6** (density) + **M8** (radii/dropdowns) — the room-to-room pass.
6. **M7** (LOIS lines) — copy pass, needs Matt's line approvals.
7. **M9** (layer stack) — the queued builder train, already running.

Do not bundle: one migration item per PR, matching the one-fix-per-PR lane rule.
