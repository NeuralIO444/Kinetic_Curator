# KC-1 Strata + Quantized Controls — PLAN DRAFT

Status: DRAFT for Matt's review, 2026-10-15. Nothing filed, nothing built.
Inputs: the amendment (`amendment.md (this folder)`,
Matt's rulings stand) + the QA report
(`qa-report.md (this folder)`,
whose corrected facts supersede the amendment's feasibility claims).

## What QA changed (read this first)

- The strata roster **already shipped** (#1203, closed) at caps **4/4/4** with
  a fourth family, **PATTERN**. This plan is a *second* strata change — cap
  reduction + fixed skeleton + quantized controls — not a first build.
- BUILD has had **no inline sliders since #1202**: shelf params are
  ValueButtons opening a docked exact editor. The real continuous surface is
  ≈48 shelf controls **plus** every per-block bare RangeRow (WET, PATCH,
  DISH, FX/MATH/PATTERN params), MotionTiles, the MIX bar, dual ranges
  (SCALE/ROTATE/ALPHA), the HUE dial, and macro jogs.
- **Double-click is spent** (reset-to-default, DS §2.1; rename in
  VoicesShelf) and exact entry already exists twice. The plan replaces, not
  adds.
- The mockup is approved as an *interaction* sketch; its labels/counts were
  illustrative (FX library = 13 kinds, MATH = 12 ops; FIELD→CHANNEL is the
  MapRow, not a MATH op; the ROTATION rows depict a control that doesn't
  exist yet).

## Phase 0 — Rulings and paper (docs-only, no code)

Decisions D1–D8 below get ruled and written down *before* any build,
including a **DS §2/§2.1 amendment** (the one-slider doctrine and the
double-click-reset canon must be amended on paper, or a later agent will
"fix" BUILD back). Also in this phase: name the floating-editor patterns —
CHIAROSCURO's over-canvas section editor vs the per-param value editor —
so #1587 and this lane stop growing competing popovers.

## Phase 1 — Quantize the dock (shelves §1–§4)

- ValueButton rows gain the OFF·LOW·MID·HIGH mode row (TeaMatrix kin);
  the exact numeric readout **stays on the row** (honest signals), plus a
  new named **off-detent mark** when the stored value isn't exactly a stop.
- **Stop-table law:** stops are authored per param, never derived blind;
  **the shipped default is always one of the stops** (protects Matt's
  by-eye tunes — M4's 2.5 / 1.05 / 0.78 ride this clause); stops are
  authored in taper space where a taper exists (accumulationFade, GLOW);
  OFF gets one meaning, ruled per param class in Phase 0 (identity-default
  params — saturate/chroma/lift/damping — are the hard cases).
- Gesture per D2; the exact editor remains reachable on mouse *and* touch.
- Re-pins: `cache-verify.spec.js` (drives the dock slider to an exact
  COUNT), helpCopy interaction wording, a selfcheck for the mode-row
  component.

## Phase 2 — The block editors

- Bare RangeRows inside strata blocks (WET, PATCH ×3, DISH, and every
  FX/MATH/PATTERN param row) come under the same law — or are exempted by
  name in Phase 0. `fx-row-opens-editor.spec.js` (drives the WET slider)
  is the tripwire that forces this to be explicit.
- Dispositions ruled in Phase 0 for: MotionTiles, MixBar, dual ranges,
  the HUE dial, macro jogs (#724 — "nudges, never snaps" is its concept;
  exempting it is defensible, silently quantizing it is not).

## Phase 3 — The fixed skeleton (the stack-shape half)

- CONTENT cap 4→2 with the D3 migration rule for existing 3–4-content
  Looks.
- PATTERN strata get their ruled home (D4).
- MATH: tracks→"1 layer" and/or chain cap 4 (D5 — these are two separate
  cuts; rule them separately).
- FX: 1 layer × 4 items, and the rack-law question (D6): today one EF-4
  Finish kind per FX track. Under one layer of 4, either the slot law
  becomes per-layer (Scanlines + Halo + Grain can coexist — the CRT
  recipe becomes legal) or it doesn't (they can't). Rule it knowingly.
- Field→channel: re-open #1204's home ruling on the record
  (Appearance/MapRow → MATH layer) and name the pointer apart from
  PATCH FIELD, which already has a target pointer in the shipped stack.

## Phase 4 — Dither (independent; can run any time)

- Implement the EF-4 **dither** stub as a real kind in the grain family
  (ordered Bayer; `sanitizeFxEffects` grain-family-last enforcement).
  Unlocks one-bit dither + receipt ticket from the seven-aesthetics list,
  and the ROOM codec lane wants the same pass. Smallest phase, highest
  leverage — candidate to pull ahead of Phases 1–3 entirely.

## Sequencing against the ratified queue

The ratified order (kineme → travel P0 → #1538 → #1588 → #1585 M4 →
#1587 CHIAROSCURO → T4 slices) is **unchanged by this draft** unless Matt
reorders. Interactions to respect whenever this lane runs:
- **M4 (#1585)** knobs should be born under the stop-table law's
  default-is-a-stop clause even if they ship before Phase 1 — one line
  added to #1585 when Matt says.
- **CHIAROSCURO (#1587)** relocates the sun/appearance controls; if it
  lands first, Phase 1's stop table is authored against the moved
  controls; if Phase 1 lands first, #1587 moves mode rows. Phase 0's
  editor-pattern ruling is what keeps them compatible either way.
- SUN X/Y (position params, −500..1500 / −500..1200) and M4's plate
  centre are the same unaddressed class: modes can't express position.
  Phase 0 rules the class once (2D pad in the floating editor is
  #1587's own sketch) — the amendment's "sun disc" exemption is
  replaced by this.

## Decisions log

- **D1 — RULED (Matt, 2026-10-15): FULL BUILD, phased** — the law covers
  shelves, block editors, tiles, and the MIX bar. The headline "sliders
  abolished in BUILD" must be true when the phases complete.
- **D2 — RULED (Matt, 2026-10-15): tap the readout opens the exact
  editor** (mouse and touch — the panel's existing grammar); double-click
  reset survives *inside* the editor, not on the row. One gesture
  vocabulary for the whole panel.
- **D3 — RULED (Matt, 2026-10-15): TRIM ON LOAD** — a Look with 3–4
  content strata opens with only its first 2; the rest are dropped.
  (Against the coordinator's grandfather rec — Matt chose the hard cap.)
  Implementation note: the trim is *said out loud* on load (the dropped
  strata are named in the load receipt), per the house honesty law —
  nothing vanishes silently.
- **D4 — RULED (Matt, 2026-10-15): PATTERN lives BENEATH** — patterns
  are the ground itself, under the two content exposures; they do not
  spend a content slot and sit outside the 2/4/4 count.
- **D5 — RULED (Matt, 2026-10-15): BOTH CUTS** — MATH collapses to
  **1 layer** and its op chain is **capped at 4 ops**. (Migration echo
  of D3: chains longer than 4 and tracks 2–4 need the same said-out-loud
  trim treatment on load — the plan carries this into Phase 3.)
- **D6 — RULED (Matt, 2026-10-15): FREE PICKS** — the FX layer's 4
  items are any 4 kinds from the library; the one-Finish-per-track
  family law dies with the track model, so Scanlines + Halo + Grain
  can coexist (**the CRT recipe is legal**). Engine invariant that
  survives: the grain family still renders last in the pass order
  (`sanitizeFxEffects`) — pick order is free, render order is not.
- **D7 — RULED (Matt, 2026-10-15): angles as recommended** — the HUE
  dial stays a dial; divergence-class precision params are exempt from
  detents; the 0°/15°/45°/90° set applies to a future per-stratum
  rotation param only, when one exists.
- **D8 — RULED (Matt, 2026-10-15): KEEP THE RATIFIED QUEUE** — this
  lane waits behind the small-items group (TEMPO/DENSITY → ticker →
  M4 → CHIAROSCURO). No phase pulls forward, dither included.

**All eight decisions ruled 2026-10-15. This draft is now the lane's
standing plan: when the queue reaches it, Phase 0 (paper + DS
amendment) opens it. Nothing files or builds before then.**

## Decisions for Matt (in order)

- **D1 — Scope of the law.** Full BUILD (shelves + block editors +
  tiles + MIX) or shelves-only with an honest headline ("detents in the
  shelves")? *Coordinator's rec: full BUILD, phased as above — the
  headline should be true.*
- **D2 — The gesture.** What opens the exact editor, mouse + touch, and
  what happens to double-click reset? *Rec: tap the row's readout opens
  the editor (the panel's existing grammar); double-click reset
  survives on the editor itself, not the row.*
- **D3 — Content 4→2 migration.** Existing Looks with 3–4 content
  strata: grandfather (cap gates adding only), trim on load, or refuse?
  *Rec: grandfather — caps already behave that way for ADD/DUP today.*
- **D4 — PATTERN's home.** Counts against the 2 content? Sits beneath
  as the ground itself? *Rec: beneath — patterns are ground/quilt
  strata under the #1183 doctrine, not exposures.*
- **D5 — MATH model.** Collapse 4 tracks to 1 layer? Cap op chains
  at 4? Both / either / neither?
- **D6 — FX slot law.** Under one FX layer: per-layer slot law (CRT
  recipe legal) or per-item families as today?
- **D7 — Angles, re-derived.** HUE dial stays a dial? Divergence-class
  precision params exempt? The 0/15/45/90 set applies to a future
  per-stratum rotation param only? *Rec: yes to all three.*
- **D8 — Where this lane sits.** Keep the ratified queue (this design
  waits behind the small-items group) or pull Phase 4 (dither) — or
  more — forward?

## Known costs (from QA §6, budgeted, not discovered mid-build)

e2e re-pins ×2 (cache-verify, fx-row-opens-editor) · mode-row selfcheck
to write · helpCopy pass · DS amendment (Phase 0) · the stop table
itself (the real design labor: ~48 shelf values + FX 13 × params +
MATH 12 × params, minus Phase-0 exemptions).
