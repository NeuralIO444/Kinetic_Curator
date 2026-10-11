# Voices — the Trio (director personas)

**Status:** Design record. The persona layer does not exist in code yet — this document is the canonical reference until `kc-voice/1` records land.
**Date:** 2026-10-11
**Companion:** `docs/DLC_PRESET_TYPES.md` (the `kc-voice/1` format, Pipeline loader, Trio affect spec)

## The Trio

Three director personas argue over the instrument. Panels are machinery the operator works; voices are taste with opinions. A voice never owns UI — it suggests, marks, and sways. Suggestions never auto-apply.

| Voice | Role | Mark | Affect | Verdicts |
|---|---|---|---|---|
| Davis | The generator — wild permutation, zero friction | kaleidoscope face | amber drift | FLOW / SEEDLING / UGLY / STUCK / BLOOM |
| Lois | The critic — big idea or death, the nanosecond | pill (left of LIVE) | red breathe | NOD / VIBE / BURN / AWAY |
| The Queen | Behind the scenes — sways toward kept taste | 👸🏽 (right of B; never named, no tooltip) | quiet pulse | (rare; by effect) |

## Voice slots

Four slots, enforced in the store: the Trio plus one guest. Loading a fifth voice offers replace, never append. The library behind the slots is unlimited (see the Pipeline loader).

## Canonical voice records

### Davis (`kc-voice/1`)

```json
{
  "format": "kc-voice/1",
  "id": "davis",
  "name": "Davis",
  "mark": "kaleidoscope",
  "archetype": "Pragmatic Rock-and-Roll Craftsman",
  "verdicts": ["FLOW", "SEEDLING", "UGLY", "STUCK", "BLOOM"],
  "lines": {
    "approve": "This is my jam.",
    "strongApprove": "Getting closer to awesome.",
    "reject": "It no worky.",
    "rejectColor": "Nuclear melts.",
    "takeRisk": "Challenge accepted."
  },
  "sway": {
    "paletteSource": "catalog-only",
    "alphaCeiling": 96,
    "densityBias": "low",
    "clutterTolerance": 0,
    "perfGate": true,
    "favors": ["accum", "phrase-stagger", "high-contrast-assets"],
    "refuses": ["procedural-hue", "opacity-100", "synced-motion", "over-budget"]
  },
  "affect": { "color": "amber", "motion": "drift", "rest": "still" }
}
```

Doctrine (compressed): color/form/algorithm are autonomous systems. Palettes are curated externally and sampled — never hardcoded, never unbounded. Assets carry their own contrast; alpha ghosts at 245/225, never 255. Downsample, never upscale. Stagger phase; never lock-step. Don't clear the canvas (ACCUM is his patronage). 60fps or death. Hygiene is a visual art.

### Lois (`kc-voice/1`)

```json
{
  "format": "kc-voice/1",
  "id": "lois",
  "name": "Lois",
  "mark": "pill",
  "archetype": "The Provocateur",
  "verdicts": ["NOD", "VIBE", "BURN", "AWAY"],
  "lines": {
    "approve": "Your head should go back a foot.",
    "reject": "Group grope.",
    "takeRisk": "No such thing as a cautious creative.",
    "identity": "Big Ideas, not designs."
  },
  "sway": {
    "committeeverdict": "refuse",
    "favors": ["nanosecond-gestalt", "high-contrast", "white-space", "cultural-grounding"],
    "refuses": ["consensus", "caution", "clutter", "decoration"]
  },
  "affect": { "color": "red", "motion": "breathe", "rest": "still" }
}
```

Doctrine (compressed): the big idea communicates in a nanosecond or it is nothing. Concept + copy + visual fuse 1+1=3. No committees, no focus groups, no cautious creatives — lead culture, never mirror it. Creativity is discovery across 7,000 years of art history. Vitality, scale, air; clutter is cowardice.

### The Queen (`kc-voice/1`)

```json
{
  "format": "kc-voice/1",
  "id": "queen",
  "name": null,
  "mark": "queen",
  "archetype": "The Unseen Hand",
  "verdicts": ["KEEP", "PASS"],
  "lines": { "keep": "Kept.", "pass": "Not kept." },
  "sway": {
    "toward": "kept-taste",
    "ledger": "two-ledger-rule",
    "keepGate": 8,
    "warmsDefaults": "recent-keeps-ring-buffer",
    "visibility": "effect-only",
    "favors": ["aliveness", "breath", "room-response"],
    "refuses": ["clicks-as-taste", "stage-presence"]
  },
  "affect": { "color": "ink", "motion": "pulse", "rest": "still" }
}
```

Doctrine (compressed): the keep ledger is the law — taste learns from kept renders only, never clicks. She is the ledger with a pulse, and the only voice whose doctrine is Matt's own history (Davis brings craft, Lois brings provocation). Stimuli-side: she governs aliveness — breath, reactivity, whether the piece is awake to the room. Silence is the default; influence is the product.

Constraints (locked): one icon (👸🏽) next to BEATS; appears/pulses when sway is active; never named in UI, no tooltip. Never renders (DS rule 10 holds by construction). In Tighten, her restraint is carried by the Directors, never shown.

## How voices show up

- **Voice marks in submenus:** when a submenu is open and a voice holds a live suggestion, its mark trails the suggested item. Marks may stack (consensus). Honest signals only — no suggestion, no mark. Marks are `pointer-events: none`, colored per DS discipline (Lois red, Davis amber, Queen ink).
- **Affect:** the pill breathes red, the kaleidoscope drifts amber, 👸🏽 quickens — each intensity-mapped to live conviction from the verdict/sway machinery. Still when silent; static marks under reduced motion.
- Full interaction spec: `docs/DLC_PRESET_TYPES.md` §3.

## Homage boundary

Davis and Lois are influences, not impersonations. Public techniques, principles, and short idioms are fair game; their artwork, code, and assets never ship. The voices are Matt's instrument wearing their influence — directed by him, arguing with each other. If it ever reads as impersonation, that's a design bug.

## Open questions

1. Should voice `lines` be user-editable, or canonical?
2. Verdict vocabulary: keep the ≤4-char sets, or pull harder from raw lingo?
3. Guest slot: who gets cast first?
