# Modulation LEDs — research, design, scope

Date: 2026-10-03. Status: design only — no build, no issues, no PRs.

The idea: when something (audio beat, a meter band, later noise or kineme) drives a property (scale, breath, alpha…), the UI shows the correlation — a tiny LED by the parameter that pulses with the live signal, a hover card showing what drives it and what it affects, and one routing view that links ins to outs.

## Research — what already exists

**#790 (assignable modulation matrix) is mostly built.** PRs 1–4 merged (#799 engine, #800 saved/undoable state, #801 band feed, #802 editable matrix). The issue is still OPEN only because PR 5 (extra targets, one per PR) was deferred. The data model the LEDs need exists today:

- `app/src/gl/audioRoutes.mjs` — `ROUTE_INPUTS` (5 coarse: beat/level/bass/mid/treble + 7 meter bands), `ROUTE_TARGETS` (9 dotted ids: render.scale/alpha/breath/glow/hue/squash/kineme/accum/sun), `DEFAULT_ROUTES`, `MAX_ROUTES = 16`, `evaluateRoutes()`.
- `audioMatrixRows()` — the live tap. Returns one row per route: `{ input, target, depth, live, inputId, targetId }`. `live` is the route's current contribution. This is what the LEDs read. It already handles enabled/off (live = 0 when audio is off).
- `app/src/panels/stimulus/ModMatrix.jsx` — the matrix is already editable (input/target selects, depth sliders, remove, RESET) with a LIVE bar per row. This is the routing list Matt described — it exists.
- The store already carries everything a LED needs: `audioEnabled, beatPulse, audioBands, audioRoutes` (the table), `layoutParams` (StimulusPanel reads all five).

**Where parameter labels live:** `RangeRow` / `DualRangeRow` (`app/src/components/RangeRow.jsx`) — labeled sliders with `hint` tooltips (native `title` attributes, #14). `ParamBlock.jsx` (BUILD) has the BREATH, SCALE, ALPHA sliders that map to route targets. There is no shared Tooltip component — tooltips are `title` attrs, so the hover in/out card is a new component.

**TE precedent in the codebase:** `TallyLight.jsx` is explicitly "Teenage Engineering-inspired" — hard-cut thresholds, no easing, no gradients. The LED follows the same rules.

**Sources today are audio-only.** Perlin noise and kineme are not modulation sources in the matrix (kineme isn't built). The LED color mapping reserves colors for them but nothing drives them yet.

**DAW conventions (for reference):** Ableton marks modulated parameters with a colored indicator dot and shows routing in a side panel; Bitwig lists modulators with per-source color coding and drag-to-assign. The common thread: color = source, indicator sits on the driven control, details live one click away. That's exactly Matt's sketch.

## Key decision

**Scope only the visualization surface — no new matrix.** #790's engine, state, persistence, band feed, and editable UI are merged. The LEDs, hover card, and row LEDs are a thin read layer over `audioMatrixRows()`. Slice 1 is a pure data module, not a matrix build.

## Design

**1. The LED dot.** New `ModLed` component: a 6px dot before the parameter label in `RangeRow`/`DualRangeRow`. Brightness follows the live signal (normalized 0–1: `row.live / row.depth` = the raw input value, so a kick spike flares the dot). TE rules per TallyLight: hard cuts, no easing, no gradients. Renders nothing when no route drives the param — clean by default. When audio is off, all LEDs go dark (the rows already zero out).

**LED color mapping (source = color):**
- coarse audio (beat, level, bass, mid, treble) → amber `#ffaa00`
- meter bands (band.sub … band.air) → cyan `#00d9ff`
- noise (future) → violet `#b48cff` (reserved)
- kineme (future) → magenta `#ff5fa2` (reserved)

One target, multiple sources: single dot, color of the source with the highest current |live|. Documented, not stacked — TE-minimal.

**Param coverage:** render.scale → SCALE slider, render.alpha → ALPHA, render.breath → BREATH. Targets with no ParamBlock slider (glow, hue, squash, kineme, accum, sun) get no dot — the routing list covers them. A static `TARGET_PARAM` map keeps this honest; unmapped targets simply don't light.

**2. The hover in/out card.** Hovering the LED (not the label — the existing `title` tooltip stays untouched) reveals a small card. Layout per Matt's sketch, in left / out right:

```
◉ KICK → SCALE → 400 PLACEMENTS
depth 60% · live 0.42
```

Top row: source icon + name, arrow, property, arrow, what it affects. "Out" copy comes from a static `TARGET_OUT` map (scale → "N placements", breath → "creature bodies", alpha → "placement opacity", glow → "frame glow"). Second row: depth and live value. Pure function builds the card content from a matrix row — selfcheckable without a browser.

**3. The routing view.** The ModMatrix already is the routing list, so no duplicate list gets built (two lists = two truths to keep in sync). Instead: each matrix row gets its source-colored LED at row start (it already has the LIVE bar — the dot adds the at-a-glance source color), each row gets the same hover in/out card, and each param LED's card links "view in matrix" to jump to STIMULI. That is the help system linking ins and outs: dot → card → matrix, one chain. If Matt wants the read-only mirror in BUILD anyway, that's a parked follow-on, not in these slices.

**Zero routings:** user deletes every route (`[]` table) → no dots anywhere, no cards, matrix shows the empty state it already has. Nothing special-cased.

**Performance:** ≤16 routes, pure math, computed in render from store selectors the panels already subscribe to. No new subscriptions beyond what StimulusPanel uses. No rAF loop — values ride the existing render cadence.

## PR slices (eval-loopable, one per PR)

- Slice 1 — `modLed.mjs`: pure `targetDrive(table, targetId)` → `{ sourceKind, level01, routes[] }` (level01 = max |live/depth| across the target's routes, sourceKind of the winner; null when undriven). Selfcheck: fake rows in → correct winner/color/level; empty table → null; audio-off rows (live 0) → level 0.
- Slice 2 — `ModLed` component + wire into `RangeRow`/`DualRangeRow` via an optional `modDrive` prop; ParamBlock passes it for SCALE/ALPHA/BREATH from the store's `audioRoutes` table + live audio selectors. Selfcheck: data module green; dev-server visual check (dot dark with audio off, pulsing with the fake mic); zero behavior change to sliders.
- Slice 3 — hover in/out card on the LED: `modCardContent(row)` pure builder (in/out/depth/live strings) + CSS hover card; existing `title` tooltips untouched. Selfcheck: card content for a kick→scale row matches the expected strings; card renders nothing without a drive.
- Slice 4 — ModMatrix row LEDs + row hover cards + "view in matrix" link from param cards. Selfcheck: row dot color matches source kind; existing matrix selfchecks green.
- Slice 5 — PARKED: noise/kineme source kinds light up only when those sources exist in the matrix. Colors reserved, nothing to build.

## Open questions for Matt

- Is the no-duplicate-list call right, or do you want the read-only PATCH mirror in BUILD as a follow-on?
- LED size 6px and the amber/cyan/violet/magenta mapping — tune on sight in the review build?
- Should the LED also appear on the STIMULI master DEPTH knob (it's the global master, not a route target — currently no)?
