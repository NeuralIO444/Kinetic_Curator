# QA Report — KC-1 Strata Stack + Quantized Controls Amendment

**Subject:** `~/workspace/your_files/kc1-strata-stack-and-controls-amendment-2026-10-15.md`
**Mockup:** `~/workspace/your_files/kc-build-quantized-mockup-2026-10-15.png`
**Codebase verified against:** `~/workspace/kc-1434-build` (HEAD `7d0b8cb9`, origin/main `c5305b3e`)
**Date:** 2026-10-15 · Read-only QA — no code changed, nothing filed.

**Headline:** The amendment's direction (detents in BUILD, continuous document)
is coherent with the house TE language, and several of its code citations are
exact. But its feasibility core — *"all 24 sliders run through one shared
component, so this is a one-point change"* — is **wrong as a description of the
BUILD surface**, its gesture (**double-click**) is **already spent twice** in
the house vocabulary, its **rotation detents fit none of the real angle
controls**, its mockup's **library counts and two of its seven-aesthetics
recipes contradict the shipped rack law**, and it is silent on the fact that
**the strata stack it redesigns already shipped (#1203, closed)** with
different caps (4/4/4, not 2/4/4) and a fourth stratum family (PATTERN) the
fixed skeleton has no home for.

Grades used: **CONFIRMED** (claim checks out) · **WRONG** (claim contradicted
by evidence) · **GAP** (design is silent where it must speak) · **RISK**
(claim true today, fragile or costly tomorrow).

---

## 1. Fact-check of the amendment's §3 feasibility claims

### 1.1 BuildPanel's five sections — CONFIRMED
`app/src/panels/BuildPanel.jsx` renders exactly five `BuildSection`s:
① Layout (`BuildPanel.jsx:77`), ② Cast (`:91`, `LayerStack` inside at `:99`),
③ Motion & Behavior (`:103`), ④ Appearance (`:112`, `SunRow` at `:115`),
⑤ Math (`:119`). Tag P03 ✓. The amendment's list (Layout · Cast · Motion &
Behavior · Appearance · Math) matches, and LayerStack does live in Cast.

### 1.2 "24 sliders, one shared component" — the count is CONFIRMED, the conclusion is WRONG
`<SliderEditor` appears **exactly 24 times** in JSX source, in exactly the
spread the parent session reported — 7 files:

| File | `<SliderEditor` sites |
|---|---|
| `src/panels/layout/LayoutSliders.jsx` | 9 |
| `src/panels/layout/SwarmSliders.jsx` | 5 |
| `src/panels/layout/AppearanceSliders.jsx` | 4 |
| `src/panels/layout/CreatureSliders.jsx` | 3 |
| `src/panels/layout/AccumFamily.jsx` | 1 |
| `src/panels/layout/MapRow.jsx` | 1 |
| `src/panels/layout/SunRow.jsx` | 1 |
| **Total** | **24** |

`SliderEditor` is defined at `src/panels/build/te/editors.jsx:13` with props
`{ value, min, max, step, unit, format, onChange, ariaLabel }` ✓ (amendment's
citation is exact).

**But the 24 sites are not 24 controls, and SliderEditor is not the BUILD
surface:**

- **Factory sites multiply.** `SunRow.jsx` has *one* `<SliderEditor` site
  inside a `btn()` factory (`SunRow.jsx:20–35`) that produces **8 distinct
  controls**: SUN X, SUN Y, HEIGHT, INTENSITY, AMBIENT, BEVEL, SPEC, POOL.
  `AccumFamily.jsx`'s one site sits inside the `TrailValue` factory
  (`AccumFamily.jsx:22–40`) producing **up to ~10 controls** (ECHOES, TRAIL
  FADE, TUNNEL/PRISM/FLOW FADE, ACCUM FADE, GLOW, WETNESS, TUNNEL, PRISM,
  CURL — several conditional). `CreatureSliders.jsx` and `SwarmSliders.jsx`
  use the same `btn()` pattern.
- **Sibling editors are not counted.** The same dock hosts `DualEditor`
  (editors.jsx:34) at 4 sites — SCALE, SCALE Y, ROTATE, ALPHA
  (`LayoutSliders.jsx`) — and `DialEditor` (editors.jsx:85) at 1 site —
  HUE ROTATE (`AppearanceSliders.jsx:41`). Total dock-editor sites in
  `src/panels/`: **29, not 24**.
- **Runtime census.** Counting ValueButtons + factories + tiles in §1–§4
  shelves alone gives **≈48 continuous controls** (Layout 11 buttons ≈14
  values incl. dual ranges and the conditional spin slider; Appearance 5;
  Swarm 5; Creature 3 sliders + 3 MotionTiles; Accum ≈10; Sun 8; Map 1) —
  before any per-stratum block editors (§2 below).

**Verdict:** "one-point change plus the stop table" is true only for the
ValueButton dock editors in `panels/layout/*`. As a claim about BUILD, WRONG.

### 1.3 The panel the amendment describes is not the panel that exists — GAP (internal tension)
Since #1202, BUILD shows **no inline sliders at all**. Every continuous param
in §1–§4 is a `ValueButton` — "the ONE continuous-value control (#1202)"
(`src/panels/build/te/ValueButton.jsx:1–5`) — showing the param's name and its
**live exact value in amber**; one tap opens its editor in the `ValueDock`,
a popup "docked to the panel edge… it NEVER covers the canvas"
(`src/panels/build/te/ValueDock.jsx:1–6`), dismissed by Escape or tap-outside
(`ValueDock.jsx:16–31`). `DockProvider` mounts only in `BuildPanel.jsx` — the
blast radius of changing this system is contained to BUILD, which is good
news the amendment never states.

Meanwhile the amendment's mockup draws mode rows **inside strata blocks**.
Those are two different restructures:

- **(a) Quantize in place:** mode rows replace ValueButtons in the shelves;
  blocks keep today's editors.
- **(b) Quantize in the strata build:** per-layer params move inside blocks
  (today they live in §1–§4 and edit the *active* layer's `layoutParams`;
  blocks today contain only wet/blend/PATCH/dish + FX/MATH/PATTERN editors).

The amendment asserts (a)'s cost ("one-point change") while showing (b)'s
picture. The plan must pick one; they differ by an order of magnitude.

### 1.4 EF-4 dither stub — CONFIRMED
`src/fx/fxFilters.js:159`:
`{ slot: 'EF-4', label: 'Finish', kinds: ['grain', 'scanlines', 'halo'], stubs: ['dither', 'stipple'] }`
— exactly as the amendment cites. The stub already surfaces in the UI as a
"planned: dither, stipple" note (`LayerStack.jsx`, FxEffectEditor empty-slot
branch). One correction to expectations: `GRAIN_FAMILY_KINDS = ['grain']`
(`fxFilters.js:143`) with a comment that Phase 3 adds Dither and Stipple to
the grain family — dither, when built, must land in the EF-4 position and
obey the grain-family-last enforcement in `sanitizeFxEffects`. The amendment
doesn't mention the family constraint; the build will meet it anyway.

### 1.5 Rack inventories vs the mockup's library numbers — WRONG (both numbers)
- **FX library = 13 kinds**, not 12: `FX_EFFECT_DEFS`
  (`src/fx/fxFilters.js:31`) — rgbSplit, displace, halo, grade, sharpen,
  haze, tear, grain, scanlines, posterize, invert, solarize, edge. The rack
  slots sum to the same 13 (EF-1: 2, EF-2: 4, EF-3: 4, EF-4: 3). The
  performer's *add-menu* is smaller still: `FX_MENU_KINDS` = 7
  (`fxFilters.js`, #310 curation).
- **MATH library = 12 ops**, not 11: `MATH_EFFECT_DEFS`
  (`src/fx/mathFilters.js`) — gain, lift, contrast, saturate, threshold,
  quantize, knee, tempTint, vignette, channelMix, hueRotate, levelsFixed.
  `MathEffectEditor.jsx:6` itself says "the 12-op vocabulary."
- The mockup's MATH block lists **FIELD → CHANNEL**, which is **not a MATH
  op**. Field→channel is the MapRow (`src/panels/layout/MapRow.jsx`), a
  per-layer layout-param system in §4 Appearance — see §7.3.
- The mockup's CONTENT rows are likewise illustrative, not real: CONTENT 2
  "COLONIZE" shows DENSITY/GROWTH/ROTATION, but colonize's actual knobs are
  `colonizeInfluence/Kill/Branch/Step` (`layout-modes.js`, PARAM_SPEC) and
  there is no per-stratum ROTATION scalar anywhere (see §3.4). Matt approved
  the mockup "as drawn" — the plan should treat its *interaction* as approved
  and its *labels/counts* as placeholder, and say so on the record.

### 1.6 "Precedent: symmetry is already chip buttons" — CONFIRMED in substance
`SymmetryRow`/`BehaveRow` render `TeaMatrix` (`src/panels/layout/ChipRows.jsx`),
the house discrete-choice matrix, also used by StructureToggles, MotionShelf,
SunRow, MapRow, AccumFamily. The TE kit already has the exact component family
the mode rows want to be — the mode row is a TeaMatrix with four options.
That cuts both ways: the "new" control must pass the DS earn-your-surface
gate (§7.1) precisely because TeaMatrix exists.

---

## 2. Scope holes — what on the BUILD surface is NOT SliderEditor

The law reads "every slider in BUILD becomes a 4-mode button row." These
continuous controls on the BUILD surface are **not** SliderEditor and are
**not addressed** by the amendment:

| Control | Where | Shape | Escapes the law as written? |
|---|---|---|---|
| Per-block **WET** slider | `LayerStack.jsx` (strata-composite row) | bare `RangeRow`, 0..cap | **Yes** — the single most-touched slider in the stack |
| **PATCH strength** (FEED/MOD/FIELD) | `LayerStack.jsx` | bare `RangeRow`, 0..1, ×3 conditional | Yes |
| **DISH bounce / repel** | `LayerStack.jsx` | bare `RangeRow` (contactRestitution 0..1, contactRepel 0..5) | Yes |
| **FX effect params** | `LayerStack.jsx` FxEffectEditor | bare `RangeRow` per param from `FX_EFFECT_DEFS` | Yes — every FX knob in the stack |
| **MATH op params** | `MathEffectEditor.jsx` | bare `RangeRow` per param from `MATH_EFFECT_DEFS` | Yes — every MATH knob |
| **PATTERN params** (density, mix, grout, hero, drift, movers) | `PatternEditor.jsx` | 6 bare `RangeRow`s | Yes |
| **MIX** slider | `src/panels/layout/MixBar.jsx` | bare `RangeRow` in §2 Cast | Yes |
| **MotionTiles** (flap, breath, wind) | `CreatureSliders.jsx` via `src/components/MotionTile.jsx` | own `<input type="range">` + value glyph | Yes — and its glyph *is* the value display |
| **Macro knobs** (#724) | `src/panels/build/MathSection.jsx` + `src/components/MacroKnob.jsx` | spring-back pointer-drag **jog** | Not a slider by name — but a continuous BUILD control whose entire concept ("the macro nudges, never snaps", `MathSection.jsx:14–16`) is continuous |
| **Dual ranges** SCALE / ROTATE / ALPHA | `LayoutSliders.jsx` via `DualEditor` | two coupled sliders (min/max pair) | Not SliderEditor; a 4-mode row cannot express a *range* at all — unaddressed |
| **HUE ROTATE dial** | `AppearanceSliders.jsx` via `DialEditor` | angular drag, wraps 0..360 | Not SliderEditor; see §3.4 |

Discrete and therefore fine as-is: TeaMatrix rows (symmetry, behave, mirror,
sun on/off, sun colour slot, trail family, field/channel tiles),
CompositionTiles, ShapesShelf/VoicesShelf chips, StructureToggles, LayerStack
block chrome (▲▼ ● S DUP ×, blend `<select>`, PATCH mode/target selects,
op-kind selects). The **RegionPicker** hangs off ASSETS
(`AssetPoolPanel.jsx:78` lazy-imports it), not BuildPanel; its only form
control found is a `<select>` (`RegionPicker.jsx:201`) — out of the
amendment's BUILD scope and discrete anyway.

**Judgment:** the law needs either widening ("every continuous control in
BUILD, including bare RangeRows in block editors, MotionTiles, and the MIX
bar") with a stated answer for dual ranges and the macro jog — or explicit
exemptions (sun disc is currently the *only* exemption, and it's the wrong
one; see §3.5). As written, a faithful build of the amendment leaves the
majority of BUILD's sliders — including every slider inside the strata
blocks the mockup draws — untouched, and "sliders abolished" fails on its
own terms.

---

## 3. The stop table against reality

`PARAM_SPEC` lives at `src/data/layout-modes.js:292` (the amendment never
names its location). It holds **~100 scalar keys** spanning BUILD *and*
STIMULI (audio* time constants etc.) — the stop table is a BUILD subset, and
"24 rows" (§5 of the amendment) matches neither the ~48 shelf controls
(§1.2) nor the per-block catalogs (FX 13 kinds / MATH 12 ops, each with
1–4 params of their own, which are *not* in PARAM_SPEC at all — they live
in `FX_EFFECT_DEFS`/`MATH_EFFECT_DEFS`).

### 3.1 Params whose neutral is not min/0 — the OFF problem (GAP)
The scheme's OFF silently assumes neutral = range bottom. Counterexamples:
- `damping` {0.80..0.99}, default ≈0.9–0.95 — the meaningful direction is
  *down* from near the top; "OFF" has no referent, and LOW/MID/HIGH stops
  across a 0.19-wide band are nearly indistinguishable.
- MATH `saturate.saturation` {0..2, def **1**} and FX `grade.chroma`
  {0..2, def 1}, `grade.lift` {0.5..1.5, def 1} — neutral is mid-range;
  stops "derived from the neutral point" (amendment §3) can only go one
  way, leaving desaturation (0..1) unreachable by buttons.
- `tight` {0.05..0.95, def 0.55}, MATH `contrast.amount` {0..1, def 0.5},
  `vignette.amount` {def 0.5} — mid-range defaults; same one-way problem.
- `accumulationFade` {1..40 frames, def 5.4} rides a **half-life taper**
  (`AccumFamily.jsx`, `getTaper('halfLife')`; likewise GLOW rides a power
  taper) — equal stops in param space are wildly unequal perceptually.
  Stops must be authored in *taper/slider space*, a subtlety the amendment
  doesn't know exists.
The amendment's own sentence — "neutral point + three stops" — actually
contains the fix (author per-param stops around the default), but then OFF
cannot mean "neutral" for saturate (OFF = 0 = grey is the *effect*, neutral
is 1). The plan needs a per-param ruling: for identity-default params, is
the first button NEUTRAL (labelled OFF?) or MINIMUM? One signal, one
meaning — OFF must mean the same thing on every row.

### 3.2 Bipolar params — rarer in PARAM_SPEC, concentrated in the catalogs (RISK)
In PARAM_SPEC exactly one scalar is bipolar: `phylloDivergence` {−20..20}.
The bipolar mass lives in the rack catalogs the amendment doesn't scope:
MATH `gain.exposure` {−3..+3 st}, `lift.offset` {−1..1},
`tempTint.temperature/tint` {−1..1}, `hueRotate.degrees` {−180..180};
FX `grade.hue` {−180..180}; plus `RANGE_SPEC.rotate` {−180..180} as a dual
range (`layout-modes.js`, RANGE_SPEC). The amendment's rule — "OFF + three
magnitudes, sign preserved" — leaves a question it doesn't ask: **how does
a hand ever flip the sign?** If the stored value is −2 st and the performer
taps MID, sign-preserved gives −MID forever; the only sign flip is the
exact editor. For gain/tempTint, sign *is* the creative axis (warm vs
cool). The plan must answer this per bipolar param, or give mode rows a
sign affordance.

### 3.3 Selectors and counts wearing slider clothes (GAP)
- `spectrumMap` {0..3, int} is an **enum index**, not a magnitude — OFF/
  LOW/MID/HIGH would mislabel a mode selector (DS: one signal one meaning).
- Int counts with nonlinear consequence: `count` {10..800} (default 240),
  `particleCount` {10..500}, `zTiers` {1..12}, `lsysDepth` {1..5} (effect
  grows as 5^depth), `trailCount` {1..24}, `body` {1..7} — several are
  `ATLAS_AFFECTING_PARAMS` (`layout-modes.js`), so coarse stops change
  rebake behavior, not just feel. Linear third-stops (e.g. count 273/537/
  800) don't match how these params are perceived or used.
- Rates: `kinemeBoilFps` {6..12}, `growthRate` {0..12, step 0.5},
  `noiseSpeed` {0.1..3.0} — modes are plausible but stops need authoring,
  not derivation.
- `collideMask` {0..0xFFFFFFFF, int} is in PARAM_SPEC but is a bitmask,
  not a knob — a reminder that PARAM_SPEC membership ≠ "has a slider."

### 3.4 Angle params — the 0/15/45/90 law fits NONE of the real ones (WRONG as a general law)
Every actual angle-valued control in or near BUILD:
- **HUE ROTATE** — `DialEditor`, 0..360°, *wrapping* (`editors.jsx:85`;
  `AppearanceSliders.jsx:41`). Detents at 0/15/45/90 cover a quarter turn
  and destroy the control's purpose (a hue rotation's interesting stops
  are 90/180/270 if any).
- **DIVERGENCE** — `phylloDivergence` {**−20..+20°**, step **0.1**}
  (`LayoutSliders.jsx`, DIVERGENCE button). 45° and 90° are *outside its
  range*; its precision (0.1°) is the point — a fraction of a degree
  re-counts the spiral arms (PARAM_SPEC comment, `layout-modes.js`).
- **ROTATE** — not an angle but a **dual range** [−180..180] (hard ±720)
  edited by `DualEditor` (`LayoutSliders.jsx`, ROTATE button). A detent
  row can't express a span.
- MATH `hueRotate.degrees` {−180..180} and FX `grade.hue` {−180..180} —
  bipolar angles; see §3.2.
- `lsysAngle` {5..90} exists in PARAM_SPEC but has **no panel UI at all**
  (grep: no hits in `src/panels/` or `src/components/`) — voice/preset-set
  only; 0° is below its minimum.
The mockup's ROTATION rows (0°/15°/45°/90°) depict a control that **does
not exist**. The detent set may be a fine law for a *future* per-stratum
rotation param, but as a claim about today's BUILD it is ungrounded. The
plan should re-derive angle handling per real param (dial stays a dial?
wraps get 0/90/180/270? divergence exempt as a precision control?).

### 3.5 Position params — and the exemption that exempts nothing (GAP)
SUN X {−500..1500} and SUN Y {−500..1200} (`SunRow.jsx`) are **coordinates**,
not magnitudes; OFF/LOW/MID/HIGH has no meaning for them, and their ranges
deliberately run off-canvas. The amendment's sole exemption — "the sun
disc keeps live pointer drag" — exempts a control that **does not exist
in the app**: there is no draggable sun disc in the panel or on the canvas
today (grep: no LIGHT_SET drag surface in `CanvasPanel.jsx`). #1587's
acceptance imagines "a sun drag" inside the *future* CHIAROSCURO floating
editor, possibly "a 2D angle/elevation pad" (see §5.1). So the amendment
exempts tomorrow's hypothetical control while leaving today's actual X/Y
sliders — the worst fit in the entire table — unaddressed. M4's plate
centre (§5.2) is about to add a second 2D position param with the same
problem.

---

## 4. Touch — double-click is a mouse idiom, and it's already spent (WRONG/GAP)

- **Double-click already means two other things.** On `RangeRow`,
  double-click = **reset to default** — in the component header
  (`src/components/RangeRow.jsx:1–3`: "click-to-type readout, double-click
  reset"), in `handleDoubleClick` (`RangeRow.jsx:33–38`), wired on both the
  input and the label (`:75`, `:90`), and ratified in the DS document
  itself (`docs/DESIGN_SYSTEM.md` §2.1). `MotionTile` copies the gesture
  (`MotionTile.jsx`: label and input `onDoubleClick={reset}`). In
  `VoicesShelf.jsx:68`, double-click = **rename** ("tap: load · long-press:
  overwrite · double-click: rename"). The amendment would give double-click
  a third meaning — open exact editor — on the panel where the first
  meaning is densest. It also silently deletes reset-to-default, a gesture
  the FX/MATH editors lean on (`onReset` in FxEffectEditor/MathEffectEditor
  param rows).
- **Exact entry already exists, twice.** RangeRow's readout is
  click-to-type (`RangeRow.jsx`, `startEdit`), and on the #1202 surface a
  *single* tap on a ValueButton already opens the exact editor (the dock).
  The amendment's popover is a third exact-entry surface competing with
  both.
- **On touch there is no reliable double-click.** The app's touch
  vocabulary today: tap, **long-press 650 ms** (`LayerStack.jsx`
  StrataAddSlot: `LONG_PRESS_MS = 650`, pointer down/up/leave + click
  guard; VoicesShelf overwrite), and **drag** (DialEditor vertical drag,
  `editors.jsx:89–112`; MacroKnob pointer drag). The UX pass (§6) ruled
  "long-press is spent exactly once — on the ADD bar" — shipped code
  already spends it twice. The amendment names no touch equivalent at all.
- **The obvious alternatives the design should name** (house-consistent):
  (1) **tap the row's exact readout** to open the exact editor — the
  ValueButton pattern, already the panel's grammar; (2) **long-press the
  mode row** — consistent with ADD-bar/VoicesShelf precedent, but spends
  long-press a third time and needs the UX-pass rule revisited on the
  record; (3) **drag across the mode row** to scrub modes — matches the
  dial/knob drag family. Any is defensible; silence is not, on an
  iPad-first roadmap (UX pass §6; repo AGENTS.md direction).

---

## 5. Collisions with in-flight design

### 5.1 CHIAROSCURO #1587 (OPEN) — same interaction laws, different geometry; one inherited contradiction (RISK)
#1587's form ruling (comment, 2026-10-15) specifies: a BUILD **section**,
collapsed to a compact row, whose controls open into "a large **floating
editor over the canvas**: no backdrop, the live canvas stays visible and
running underneath, Esc or click-away closes it," with acceptance "a sun
drag changes the light live in the same gesture — no apply/confirm."
The amendment's popover shares the *interaction laws* (float, no backdrop,
no apply, Esc/click-away) — that part of "same floating-editor doctrine" is
CONFIRMED. But the geometries differ: CHIAROSCURO's editor is **section-
scale and over the canvas**; the amendment's is **per-param and over the
panel**; and the existing dock is **per-param, in-panel, and doctrinally
"NEVER covers the canvas"** (`ValueDock.jsx:5–6`) — note #1587's comment
calls the over-canvas float "the app's existing grammar (the slider
editors pop this way)," which the dock's own header contradicts. The
record currently contains **three** floating-editor shapes. The plan must
reconcile them into one named pattern (or explicitly two: section editor
vs value editor) — otherwise BUILD grows CHIAROSCURO's canvas-float,
#1202's dock, and the amendment's popover side by side.
Sequencing collision: #1587 *relocates* the sun + appearance/render
controls into the new section (its inventory includes the very shelves §3
would quantize, and its other comment rules FXAA stays in Pipeline). If
#1587 lands first, the stop table must be authored against the *moved*
controls; if quantization lands first, #1587's inventory moves mode rows
instead of sliders. Neither document mentions the other. Also note #1587's
section is where SUN X/Y (§3.5) will live — the two designs must agree on
the sun's control shape (2D pad vs sliders vs modes) in one place.

### 5.2 Materials M4 #1585 (OPEN, extended 2026-10-15) — new knobs arrive after the law (RISK)
#1585 (body + scope-extension comment) turns baked constants into per-Look
params registered in PARAM_SPEC, with controls "beside the material picker
in BUILD": stipple dot scale (default **2.5**), wash strength/spread, glass
alpha (**0.78**), plate radius (**1.05**), plate centre (**(0.36, 0.30)** —
a 2D point, cf. §3.5). Collisions:
- If M4 lands first (it is queued ahead of any strata build), its controls
  will be built in the current grammar (ValueButton + SliderEditor) and
  the quantized build must re-do them; if the law lands first, M4's knobs
  must be "quantized from birth" — but **the amendment's stop table has
  no rows for them**, and three of the five are *Matt's by-eye tunes*:
  unless a stop is pinned exactly at the shipped default (2.5 / 1.05 /
  0.78), the first mode tap moves the value off his tune and the knob can
  never return to it by buttons. The stop-table law needs a clause:
  **the shipped default is always one of the stops** (which also fixes
  §3.1's neutral problem in one move).
- Plate centre is positional — same unaddressed class as SUN X/Y.

### 5.3 Keeps/dice continuous writes vs nearest-mode display — data law CONFIRMED, display honesty GAP
The data law checks out architecturally: `normalizeLayoutParams` /
`clampNum` (`src/data/layout-modes.js`) clamp to PARAM_SPEC and round
**only** `int`-flagged keys — nothing in the write path quantizes, and
stored values are unapologetically in-between (e.g. `accumulationFade`
default 5.4, `layout-modes.js:109`). Dice/curator/macros write through the
same funnel, so "machines propose continuous" needs no engine change.
Two display problems remain:
- **The mockup's mode rows show no numeric readout.** Today's ValueButton
  always shows the exact live value; the strata summary shows exact values
  in amber (`strataSummary.mjs`: "pull 0.6 · heroes 3"). A mode row that
  lights MID for a stored 0.37 — with no number anywhere — violates the
  house honest-signals rule in spirit: the display asserts a stop the
  document doesn't hold. Precedent fix is free: keep the exact readout on
  the row (ValueButton's display string) beside the modes.
- **No off-detent indicator convention exists in the TE kit.**
  `ValueButton` carries a lock pip (▪/▫) for drift-locked params — a
  different meaning; reusing it would break one-signal-one-meaning.
  `trackNumeral`'s "edited" state (`trackNumeral.mjs`; inverted numeral
  in CSS) marks *which block is open for editing* — a selection state,
  not a value state. `patchOneLiner.mjs` is a one-time hint system,
  unrelated. The design must invent (and name) the off-detent mark —
  e.g. the lit mode carries a dot/underline when the stored value isn't
  exactly the stop — and the plan should budget it as a new DS element
  subject to the earn-your-surface gate, not pretend it exists.
- **#724 macro learn** hooks the `SET_LAYOUT_PARAM` funnel
  (`src/curator/mathMacros.js:18`, registry at `:70`: "every continuous
  numeric param"). Mode buttons still emit param changes, so learn keeps
  working — but assigns in coarse steps, and macro *playback* writes
  continuous nudges that will perpetually display as "off-detent."
  Worth one line in the plan, not a blocker.

### 5.4 #1203 — it exists, it is CLOSED, and it already shipped (the amendment's biggest blind spot)
Issue #1203 ("Dish roster replacing the LAYERS mixer labels") is **CLOSED**,
and its build is what's running: `LayerStack.jsx` header — "#1203
block-stacking strata roster rebuild" — with chunky blocks, type stripes,
`TrackNumeral`, amber `strataSummary`, `MixSeam` (`LayerStack.jsx:193`),
and the one-tap/long-press ADD slot. Consequences the amendment misses:
- **Caps are 4/4/4 today**: `MAX_CONTENT_TRACKS = 4`, `MAX_FX_TRACKS = 4`,
  `MAX_MATH_TRACKS = 4` (`src/state/slices/layersSlice.js:13–19`); the
  stack header reads "n / 12 strata". The amendment's "exactly 2 CONTENT,
  locked" is a **cap reduction**, not a fresh skeleton — and nothing today
  trims on load (caps only gate ADD/DUP), so Looks with 3–4 content strata
  need a migration ruling (grandfather, trim, or refuse) the amendment
  never mentions.
- **PATTERN tracks are a fourth family** in the shipped stack
  (`ADD_TYPES` includes 'pattern', `LayerStack.jsx`; teal, content-family,
  counted separately from KC tracks) — ground/quilt strata under the #1183
  doctrine. The fixed 2/4/4 skeleton has **no home for them**. Do they
  count against the 2 content? Sit beneath as "the ground itself"? The
  amendment is silent.
- **"1 MATH layer with 4 items" ≠ today's MATH.** A shipped MATH track is
  a *chain* of ops (default GAIN → CONTRAST; the chain has **no length
  cap** in `MathEffectEditor.jsx`), and up to 4 such tracks can stack.
  The amendment's model cuts twice at once — tracks 4→1 and chain
  length →4 — without acknowledging either. FX maps cleaner (today: ≤4
  tracks, each bound to one rack family by ordinal, `src/fx/fxTrack.js:1–10`
  — "stack FX n is one family, not a 4-slot rack"), but even there
  "1 layer × 4 items" renames tracks as items.
- **Blend survives.** The UX pass ordered the blend-mode dropdown killed;
  shipped LayerStack still renders it on expanded content blocks
  (`LayerStack.jsx`, strata-composite row). Not the amendment's problem
  to fix — but its "type language unchanged" framing inherits a stack
  that diverges from the UX pass it amends, and the plan shouldn't
  assume the UX-pass state of the world.
- Nothing in #1203's shipped build contradicts the *quantized-controls*
  half of the amendment; the contradiction is confined to the stack-shape
  half (§1) and to the amendment §5's claim that "the strata build itself
  remains unqueued" — the roster half of it **already landed**.

---

## 6. Migration — what actually breaks

**Doesn't break (CONFIRMED):** stored Looks/presets. Values stay continuous
end-to-end (§5.3); seeded renders at defaults are unaffected by a control
swap; the census is **not** UI-coupled — `paramCensus()`
(`src/curator/censusReport.mjs:389–`) iterates PARAM_SPEC keys and measures
engine effect via fixtures (min/max sweeps), so no "slider granularity"
assumption exists to break. (The checklist's hypothesis here does not
survive the code — a clean negative.)

**Breaks or needs re-pinning:**
1. **e2e `cache-verify.spec.js`** drives the dock's range input directly —
   `.te-dock.open input[type="range"]` with a `setRange` helper that sets
   COUNT to an exact value and lets React commit (`e2e/cache-verify.spec.js:43–45, 86–89`).
   Replacing the dock slider with mode buttons breaks the test's mechanism
   (and the test exists to verify exact-value behavior — mode buttons
   can't set COUNT to an arbitrary exact value; the exact editor must be
   drivable instead).
2. **e2e `fx-row-opens-editor.spec.js`** drives the wet slider inside an
   expanded strata block — `.strata-composite input[type=range]`
   (`e2e/fx-row-opens-editor.spec.js:49–56`). Breaks if WET is quantized
   (§2 says the law as written doesn't even cover it — the test is a
   tripwire forcing the scope question).
3. **`rangeRow.selfcheck.mjs`** (in `app/selfcheck.manifest`, line 118)
   pins the RangeRow contract, including "a bare `<input type=range>`
   anywhere else is a bug." RangeRow survives in other panels, so the
   suite survives — but if the mode-row component is new, the selfcheck
   story for *it* must be written, and `patternEditor.selfcheck.mjs`'s
   RangeRow references re-checked if PatternEditor is touched.
4. **Help copy**: `helpCopy.js` entries describe controls by their current
   interactions (e.g. sun/map hints); #1587 already flags helpCopy move-
   with-control discipline. Any copy saying "drag"/"slider" for a BUILD
   control goes stale — a grep-and-repin chore, not a design risk.
   (Not exhaustively verified — flagged as a build-time checklist item.)
5. **Muscle memory / gesture docs**: double-click reset (§4) is the real
   migration cost — it's documented in the DS (§2.1) and in RangeRow's
   tooltip text ("Double-click to reset (default)"), so the change is a
   *documented behavior deletion*, not a quiet refactor.

---

## 7. Design coherence

### 7.1 Against KC-1 DS
- **Detents render TE — strong fit.** OFF·LOW·MID·HIGH rows are TeaMatrix
  kin; discrete, labelled, still. The quantized law is arguably *more*
  DS-true than the dock-slider status quo. ✓
- **The one-slider doctrine — direct contradiction (GAP).**
  `docs/DESIGN_SYSTEM.md` §0: "the slider you touch in STIMULI feels
  identical to the one in BUILD"; §2: "there is exactly **one slider**, one
  button, one chip…"; §2.1 canonizes RangeRow *including* "click-to-type
  readout + double-click reset"; §2's earn-your-surface gate requires a
  new component to replace ≥2 existing variants. A BUILD-only abolition
  splits the cross-panel identity the DS asserts as law, and the
  amendment never mentions amending the DS. The plan must carry an
  explicit DS §2/§2.1 amendment (Matt's ruling can do it — but it has to
  be *done*, on paper, or the next agent will "fix" BUILD back).
- **Color-as-selected — mockup deviates (RISK).** DS §2.3: "Active-by-color
  chips are retired — active is always the inversion. Color carries
  meaning, never 'selected'." The mockup fills the *active mode* with the
  stratum's type color. (Shipped code already bends this — strata stripes
  are type colors, `LayerStack.jsx` STRATA_COLORS — but the DS text is
  unambiguous, and the mockup extends color-as-state from identity to
  selection.) Also inherited: DS §1.1 assigns MATH the BUILD yellow
  (#ffd400) while shipped strata use #E5486F pink-red and the mockup
  follows the code. Pre-existing drift; the plan shouldn't deepen it
  unknowingly.
- **Amber popover — consistent.** Values render amber (DS r6 / ValueButton
  convention); an amber exact-value editor matches house practice. ✓
- **Stillness first-class — fine.** Mode buttons are static; nothing in
  the amendment adds motion. ✓ (The UX pass's performing-state readouts
  stay exact-value readouts — another reason §5.3's numeric readout must
  survive.)

### 7.2 The seam-as-mixer under the fixed skeleton — survives, with a caveat
`MixSeam` already ships (`LayerStack.jsx:193`): the stripe splits into two
crossfading hairlines between unlike neighbours, unbroken between
like ones. The fixed skeleton doesn't kill it — blocks still stack, seams
still form between every pair, and the shipped fold invariants (content
never crosses the adjustment line; FX never crosses MATH —
`LayerStack.jsx` header, `layerOrder` invariants) already enforce the
amendment's FX-over-MATH-over-CONTENT ordering, which *supports* the
skeleton. Caveat: the UX pass's Move 1 — seam **weight = coupling
strength** — is *not* in the shipped MixSeam (it renders identity only,
no coupling data). The skeleton neither helps nor harms Move 1; but note
the amendment's §1, by capping content at 2, makes the same-type unbroken
teal bed a *maximum-two* phenomenon — the seam language survives, the
"thick bed of teal" read from the UX pass (§2.3) mostly doesn't. Worth
one conscious line in the plan.

### 7.3 The field-mod pointer vs "MATH modifies below" — a relocation wearing a narrowing's clothes (GAP)
The amendment frames the pointer as "narrowing the general rule for
field-mod items only." In shipped reality:
- MATH *tracks* do modify at/below their fold position (they grade the
  composite) — doctrine intact there.
- But **field→channel is not a MATH-track item**. It's the MapRow
  (`MapRow.jsx:1–6`: "field→channel mapping (#1199), **home per #1204**…
  A MATH-stratum modulation" in *classification*, living in **Appearance**),
  stored as per-layer `layoutParams` (`fieldMapField/fieldMapChannel/
  fieldMapAmount`) and applied to **the active layer's own marks** — not
  to what's below it, and not to the bottom stratum. Its field sources are
  noise/density; its channels weight/saturation/scale.
- So the pointer is not a narrowing of an existing behavior; it is a
  **relocation** (Appearance → MATH layer, against #1204's recorded home
  ruling) plus a **retargeting** (own layer → bottom stratum). Both may be
  right — but the plan must re-open #1204 explicitly rather than inherit
  the amendment's framing.
- Terminology collision to disarm: the stack already has a **PATCH
  FIELD** mode (`LayerStack.jsx` patch select: OFF/MOD/FIELD/FEED) with
  its own target pointer (`patch.to`, a stable layer id, `#457`). "Field-
  mod points at the bottom layer" will be misread against PATCH FIELD
  unless the plan names them apart.

---

## 8. Corrected facts for the amendment

1. **FX library = 13 kinds** (not 12); **MATH library = 12 ops** (not 11).
   The performer's FX add-menu is 7 (`FX_MENU_KINDS`). — `fxFilters.js:31`,
   `mathFilters.js` MATH_EFFECT_DEFS.
2. **§4's CRT recipe is impossible as written.** Scanlines, Halo and Grain
   are *all EF-4 Finish kinds* (`fxFilters.js:159`); the rack law allows
   one EF-4 kind per FX layer (`availableFxKinds` / slot enforcement),
   and Halo sits in EF-4 while its vignette param does the recipe's work.
   CRT today = up to 3 FX *tracks* (EF-2 track for RGB Split, EF-4 track
   for one of scanlines/halo/grain) or a rack-law change — not "exactly
   one FX layer of 4."
3. **§4's pink-phosphor recipe spans two systems**: Grade is an FX kind;
   Channel Mix is a MATH op. Fine as a look, mislabelled as a simple
   one-layer recipe.
4. **"24 sliders / one-point change"** → 24 SliderEditor *sites* (7 files)
   producing ≈30 runtime controls via factories, inside a BUILD surface
   of ≈48 shelf controls + all per-block RangeRows + MotionTiles + dual
   ranges + a dial + macro jogs. The one-point claim holds only for the
   §1–§4 dock editors.
5. **Double-click is taken**: reset-to-default (RangeRow/MotionTile, DS
   §2.1) and rename (VoicesShelf). Exact-value entry already exists
   (click-to-type readout; single-tap dock). The amendment's popover is a
   *replacement* gesture, not a new one — say so.
6. **Rotation detents 0/15/45/90 match no real angle control** (dial
   0–360 wrap; divergence ±20 @ 0.1°; rotate = dual range; lsysAngle has
   no UI). The mockup's ROTATION rows depict a nonexistent control.
7. **The sun disc doesn't exist yet.** SUN X/Y are sliders over
   −500..1500 / −500..1200; the drag lives only in #1587's acceptance
   text for a future editor. The exemption should name X/Y (and the
   future 2D pad), not a disc.
8. **#1203 is CLOSED and shipped**; caps today are content 4 / FX 4 /
   MATH 4 (`layersSlice.js:13–19`), stack header "n / 12". The
   amendment's §5 "the strata build itself remains unqueued" is stale —
   the roster landed; what remains unbuilt is the *fixed skeleton +
   quantized controls* on top of it.
9. **PATTERN strata exist** (fourth family, content-classed) and are
   unaccounted for in the 2/4/4 skeleton.
10. **PARAM_SPEC is at `src/data/layout-modes.js:292`** and spans ~100
    keys across BUILD + STIMULI; FX/MATH knob ranges live in their own
    catalogs, not PARAM_SPEC. The stop table is bigger and more
    distributed than "24 rows."
11. **Five sections: confirmed** (BuildPanel.jsx:77/91/103/112/119);
    SliderEditor citation (editors.jsx:13) and EF-4 stub citation
    (fxFilters.js:159): **confirmed exact**.

---

## 9. Open questions a build plan must answer (ranked)

1. **Scope of the law:** does "sliders abolished" cover bare RangeRows in
   block editors (WET, PATCH, DISH, FX/MATH/PATTERN params), MotionTiles,
   MixBar — and if not, is the honest claim "detents in the shelves"
   rather than "sliders abolished in BUILD"? (Decides whether the
   headline survives.)
2. **Where do mode rows live** — in place of ValueButtons in §1–§4, or
   inside strata blocks (the mockup)? What happens to the #1202 dock
   either way?
3. **The gesture:** what opens the exact editor on touch *and* mouse,
   and what happens to double-click reset (RangeRow/DS §2.1) and
   click-to-type? Name one gesture vocabulary for the whole panel.
4. **Stop-table law:** is the shipped default always a stop? For
   identity-default params (saturate/chroma/lift/damping), what does OFF
   mean — minimum or neutral? Are stops authored in taper space where
   tapers exist?
5. **Bipolar sign:** how does a hand flip sign on gain/tempTint/hue
   rows — or is sign popover-only, stated as doctrine?
6. **Exemptions list, rewritten:** dual ranges (SCALE/ROTATE/ALPHA),
   the hue dial, divergence-class precision params, position params
   (SUN X/Y, M4 plate centre), macro jogs — exempt, redesigned, or
   forced into modes, one by one?
7. **The stack-shape migration:** content cap 4→2 — what happens to
   existing Looks with 3–4 content strata? Where do PATTERN strata live
   in 2/4/4? Does "1 MATH layer × 4 items" cap op chains at 4 *and*
   collapse 4 tracks to 1 — both, either?
8. **One floating-editor pattern:** reconcile #1587's over-canvas
   section editor, the #1202 in-panel dock, and the amendment's
   per-param popover into named, non-competing patterns before any of
   them is built.
9. **Sequencing vs #1587 and #1585:** which lands first; do M4's knobs
   get stops at their tuned defaults (2.5 / 1.05 / 0.78); does #1587's
   inventory move sliders or mode rows?
10. **Honest display:** exact numeric readout on every mode row
    (house precedent) + a named off-detent indicator — design it as a DS
    element, and amend DS §2/§2.1 (one-slider doctrine) in the same
    motion so the ruling is on paper.
11. **Field→channel:** re-open #1204's home ruling explicitly
    (Appearance → MATH layer) and disambiguate "field-mod pointer" from
    PATCH FIELD before the pointer is specified further.
12. **Test re-pins:** `cache-verify.spec.js` (exact COUNT via dock
    slider), `fx-row-opens-editor.spec.js` (wet slider),
    `rangeRow.selfcheck` scope, helpCopy interaction wording — listed in
    the plan as known costs, not discovered mid-build.

*End of QA. No build plan drafted, per instructions.*
