# Slider tap-name dialog + ROTATE spin default — research & design (2026-10-07)

**Status:** research/spec only — KC-1 build halt in force since 2026-10-05
**Mockup:** `~/workspace/kc-topbar-mockups/slider-dialog.html`
**Applies KC-1 DS**

## 1. Slider inventory (25 sliders, nature review)

| Slider | Section | Nature (KC-1 DS) |
|---|---|---|
| COUNT | layout | TE · integer |
| SCALE (dual) | layout | TE · frozen range |
| ROTATE (dual) | layout | **Davis · spin default** (was frozen range) |
| ALPHA (dual) | layout | TE · frozen range |
| JITTER / DENSITY | layout | TE · integers |
| DIVERGENCE | layout | Davis · continuous |
| PARTICLES | swarm | TE · integer |
| COHESION / GRAVITY / DAMPING / NOISE SPEED | swarm | Davis · physics |
| BODY | creature | TE · integer |
| flap / breath / wind (MotionTile) | creature | Davis · animated glyphs already |
| METABOLISM | creature | Davis · continuous |
| HUE ROTATE | appearance | Davis · continuous |
| CROOKED / OPEN / SQUASH / BRANCHING | appearance | Davis · 0–1 |
| GROWTH RATE | appearance | Davis · continuous |

Rule: a slider's **nature** decides its default rendering; the dialog
offers the *other* natures as modes.

## 2. Sub-animation work found (KINEME)

- **KINEME** (`app/src/engine/kineme.js`, `docs/KINEME.md`): decoupled
  animation system. **#784 merged** per-instance primitives: spin, rock,
  pulse, blink, bob. Time model: one clock for phrases, morphs, sequencer,
  kineme; boil drivers at 6–12fps for the hand-drawn look.
- **MotionTile** (`app/src/components/MotionTile.jsx`): flap/breath/wind
  sliders with animated SVG glyphs tracking values — the existing
  sub-animation UI language to extend.
- Per-instance phase decorrelation already exists (seed hash — "copies
  never move in lockstep").

## 3. ROTATE: continuous spin default

ROTATE's default becomes KINEME **spin** (continuous rotation, rev/s)
instead of the static −70°–70° range. Not a new engine feature — the spin
primitive exists; this wires it as the default. The range becomes the
*alternative* mode (frozen random rotations per placement). DS read:
continuous rotation is time-based → Davis; the static range is frozen
values → TE. The dialog toggles between them.

## 4. Tap-name dialog (TE panel)

- **Single-tap** the slider name opens its dialog; **double-click** still
  resets (existing RangeRow behavior preserved).
- Dialog contents: segmented mode control (SPIN / RANGE / STEPPED where
  applicable), numeric min/max fields (**range expansion**), speed field
  (continuous modes), step/count (stepped), APPLY + RESET DEFAULT.
- The dialog is always TE: segmented, labeled, numeric. No mode change
  without APPLY.
- The slider row transforms with the mode: spin shows the amber spinner +
  rev/s readout; range shows dual handles; stepped shows detents.

## 5. Open questions for Matt
1. Which sliders beyond ROTATE deserve a continuous default (HUE ROTATE?
   DIVERGENCE?)?
2. Dialog scope: all 25 sliders, or start with ROTATE + the dual-ranges?
3. Should expanded ranges persist per-slider (stored) or reset per session?

## References
- `app/src/components/RangeRow.jsx` (44px hit area, click-to-type,
  double-click reset — the label already handles double-click)
- `app/src/components/MotionTile.jsx`, `app/src/engine/kineme.js`,
  `docs/KINEME.md`
- Mockup: `~/workspace/kc-topbar-mockups/slider-dialog.html`
