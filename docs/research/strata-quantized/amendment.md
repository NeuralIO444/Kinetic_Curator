# KC-1 Strata — Stack Shape + Quantized Controls Amendment

> **QA STATUS (2026-10-15): QA'd the same day — several feasibility claims in
> §3/§4 below are WRONG and are corrected in
> `qa-report.md (this folder)` §8.**
> Headline corrections: the 24 SliderEditor sites are NOT the BUILD surface
> (per-block RangeRows, MotionTiles, dual ranges, the dial and macro jogs all
> escape); double-click already means reset-to-default (DS §2.1) and rename;
> the 0/15/45/90 detents fit no real angle control; FX library = 13 kinds,
> MATH = 12 ops; the CRT recipe violates the EF-4 one-per-layer rack law;
> and #1203 already SHIPPED (caps 4/4/4 + a PATTERN family), so §5's
> "unqueued" is stale. Matt's rulings (stack shape, field-mod pointer,
> detents-in-BUILD, continuous document) stand as his direction; the
> feasibility map is the QA report's. Plan draft:
> `kc1-strata-quantized-plan-draft-2026-10-15.md`.

Status: DESIGN, approved by Matt 2026-10-15 ("Love it"). Local only — not filed, not built.
Amends: the approved strata BUILD redesign (Oct 12–13) and its UX pass
(`kc-strata-build-ux-pass-2026-10-13.md`). Mockup:
`build-quantized-mockup.png` (render source:
`~/workspace/kc-build-quant-mockup/render.mjs`).

## 1. The stack shape (fixed form)

The stack is no longer an open-ended pile of blocks. It has a fixed skeleton:

- **CONTENT — exactly 2 strata, locked, at the bottom (the ground).** A double
  exposure; there is never a third. Slot 2 may sit empty or muted — a single
  exposure is a legal Look.
- **MATH — 1 layer above content.** Its library is unbounded; the layer holds
  **only 4 active items** at a time.
- **FX — 1 layer on top (front).** Same law: unbounded library, **4 active
  items**.

Ceiling: 2 + 4 + 4 = **10 active elements**. Big catalogue, small stage — the
same rationing as the dice tray and the 16-Look keeps stage.

Stack reads ▲ FRONT (FX) → GROUND (CONTENT 1) ▼, as in the approved strata
mockups. Type language unchanged: CONTENT teal, MATH red, FX purple.

## 2. The field-mod pointer

A field→channel MATH item (field drives a visual channel) carries a **pointer**,
and the pointer aims at the **bottom CONTENT stratum**. The ground exposure is
the one the field plays on — drives its channel, warps it, breathes through it —
while the top exposure rides clean above it. (This narrows the general strata
rule "MATH modifies what is below it" for field-mod items only.)

## 3. Quantized controls — sliders abolished in BUILD

Scope: **BUILD panel only** (Matt, 2026-10-15). Other panels are untouched
until he says so.

- Every slider in BUILD becomes a **4-mode button row: OFF · LOW · MID · HIGH**.
- **Angle/rotation values** detent at **0° / 15° / 45° / 90°**.
- **Double-click any mode button → the exact-value editor**: a small floating
  popover (amber, over the panel, nothing beneath it pauses) with the numeric
  value; type it or drag its one private fine slider; Esc/click-away closes.
  No backdrop, no apply/confirm — same floating-editor doctrine as CHIAROSCURO
  (#1587).
- Mode stops come from a per-parameter table (neutral point + three stops
  derived from PARAM_SPEC ranges). Bipolar parameters get OFF + three
  magnitudes, sign preserved.

### The data law (non-negotiable)

Quantization governs **hand input, not the document**. Stored values stay
continuous numbers. Dice, curator, governor and presets keep writing in-between
values (0.37); a Look holding one displays its nearest mode lit. Seeded renders
at defaults stay identical. Same law as the taste head: machines propose
continuous, hands move in detents.

### Feasibility notes (verified in code, 2026-10-15)

- BUILD today = BuildPanel.jsx (P03), five sections: Layout · Cast (LayerStack
  lives here) · Motion & Behavior · Appearance · Math.
- All **24 sliders** run through ONE shared component — `SliderEditor`
  (`src/panels/build/te/editors.jsx`) — so the interaction change is a
  one-point change plus the per-parameter stop table.
- Precedent in-panel: symmetry is already chip buttons; the TE editors folder
  already carries the detent design language.
- **Exception:** the sun disc keeps live pointer drag (CHIAROSCURO acceptance:
  drag the sun, the light moves in the same gesture). Its numeric rows quantize
  like everything else.

## 4. Why this session happened — the seven aesthetics

Spark: @marcelgrauu's "seven aesthetics you can't name" reel (2026-10-15).
Feasibility against current code:

| Aesthetic | Today | Needs |
|---|---|---|
| CRT | ✅ FX Scanlines + RGB Split + Halo + Grain (exactly one FX layer of 4) | — |
| Pink phosphor | ✅ Grade/Channel Mix → one pink hue + Halo bloom + Scanlines + Grain | — |
| Flash light | ✅ MATH Gain + Contrast + sun + Halo vignette | — |
| One bit dither | ◐ Threshold/Quantize give the flat one-bit cut | Implement the **dither stub** already named in the FX rack's EF-4 Finish slot (`src/fx/fxFilters.js`) — ordered Bayer, same math as the ROOM codec faces |
| Receipt ticket | ◐ falls out of dither + Grain + stipple texture + paper ground | the same dither build |
| Datamosh | ◐ Tear/Displace/trails approximate it | a feedback-smear pass (the parked feedback-warp work) |
| Blob tracking | ✗ does not translate — a camera trick on a photo subject; KC-1 has no subject tracking and shouldn't grow one | — (its soul already lives here as content: Voronoi blobs, colonization) |

The dither build is the highest-leverage single item: two of the seven hang on
it, and the codec lane wants the same pass.

## 5. Open items (none blocks the design)

- Per-parameter stop table: author alongside the build (24 rows).
- Does the quantized law ever extend past BUILD (PLAY first candidate)? Parked
  until Matt says.
- The strata build itself remains unqueued — it starts on Matt's word, in queue
  order.
