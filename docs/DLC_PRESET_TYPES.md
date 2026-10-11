# KC-1 DLC as Preset Types + Pipeline Loader + Trio Affect

**Status:** Draft spec for Matt's review. No code, no branch — nothing pushes to gh until he says so.
**Date:** 2026-10-11
**Gate:** kernel FULL STOP (2026-10-10) still holds; this needs Matt's explicit lift for the build phase.

## 1. DLC broken out into preset types

One loader, typed payloads. Every DLC thing becomes a versioned preset type with the same contract: sniff `format`, validate, fail closed.

| Type | Status | Payload |
|---|---|---|
| `kc-style/1` | exists (2026-09-28) | FX chain + blend + opacity. Strict scope, unchanged. |
| `kc-look/1` | **new** | A Look: `{ mode, layoutParams, paletteId, seed? }`. Seed optional — seedless Looks apply to the live scene; seeded Looks are frozen compositions. |
| `kc-voice/1` | **new** | A Voice: `{ name, mark, verdicts[], sway }`. `mark` = the icon glyph. `verdicts` = its NOD/VIBE/BURN-style vocabulary. `sway` = how it biases params toward kept taste. The Trio ship as the three canonical `kc-voice/1` records. |
| `kc-variant/1` | drafted (2026-10-11) | Aesthetic discipline overlays (Swiss/Japan). See variant spec. |
| `kc-pack/1` | **new** (container) | `{ kind: 'styles'|'looks'|'voices'|'variants', name, author, version, items: [...] }`. One file, human-readable, paste-able like recipes. |

Rules (shared with the style draft):
- Unknown `format` → refused with a named error, never half-applied.
- Unknown fields ignored; out-of-range values clamped; hostile JSON quarantined exactly like project docs.
- Types never cross their scope: a style can't set palette, a look can't set FX, a voice can't set geometry. The split-brain bug class stays dead.
- Installing a pack never touches slots — packs install into the **Library**. Slots are filled by explicit load/replace from the Library.

## 2. Pipeline loader

Pipeline already kind-sniffs IMPORT (#1216: bundle vs project vs taste.json vs palettes vs hits). The loader extends that row, keeping Pipeline capture-first:

- **Import:** drop zone / file picker in the IMPORT section accepts `.kcpack`, `.kcstyle`, `.kclook`, `.kcvoice`, `.kcvariant`, or pasted JSON. Sniff → validate → show a quiet receipt ("Style pack · 6 styles · installed to Library") → items appear in the Library browsers. Failures quarantine with the item name, never applied.
- **Export:** select Library items → "Export as pack" → one JSON download (or copy-as-text for sharing).
- **Library UI** lives where each type is played (Styles in Build/Appearance, Looks in Build, Voices in Director, Variants on the mode tiles) — Pipeline only *installs*. No new panel; the loader is one row in IMPORT.
- Packs declare `cost.tier` aggregates where relevant (styles); the governor needs no new logic.

## 3. Trio affect — subtle, honest, alive

The voice marks (§12 of the variant spec) say *what* each Voice suggests. The affect layer says *that they're alive while suggesting it* — affective computing, KC-1 style: expression mapped to real internal state, never decoration.

**State (ephemeral, never serialized):**
```js
voiceAffect: {
  lois:  { suggesting: bool, conviction: 0..1, targetId },
  davis: { suggesting: bool, conviction: 0..1, targetId },
  queen: { suggesting: bool, conviction: 0..1, targetId },
}
```
`conviction` derives from the existing machinery — LOIS/Davis verdict strengths, the Queen's keep-ledger sway. No new opinion timers, ever (LOIS rule).

**Expression (ambient, DS-disciplined):**
- **LOIS pill** (left of LIVE): at rest, flat. When suggesting, a slow red edge-breathe; intensity tracks conviction. He *leans in*.
- **Davis kaleidoscope face**: at rest, still. When suggesting, a barely-there rotation drift in amber. He *turns it over*.
- **Queen 👸🏽** (right of B, unnamed, no tooltip): existing sway pulse stays; when she holds a *specific* suggestion, the pulse shortens — same voice, different sentence.
- **Voice marks in submenus**: the mark's opacity/scale tracks conviction — a strongly-held suggestion sits at full ink, a weak one is a ghost. You read certainty without reading text.
- **Silence is default**: no suggestions anywhere → all three rest. The instrument goes quiet the way a room does when nobody's talking.

**Constraints:**
- `prefers-reduced-motion`: affect collapses to static marks. Stillness is first-class.
- Affect never blocks input, never steals focus, never toasts. If you never look at the pill, you never know it breathed.
- All expression is a pure function of `voiceAffect` — screenshot-testable, no timers with opinions.

## 4. Build phases (after the gate lifts)

1. **Types + validation + selfchecks.** `kc-look/1`, `kc-voice/1`, `kc-pack/1` formats; Trio expressed as canonical voice records; round-trip + hostile-JSON tests. No UI.
2. **Pipeline loader.** IMPORT accept/quarantine/receipt; export-as-pack. Matt reviews the feel.
3. **Library → slot wiring.** Load/replace flows in Build (Looks) and Director (Voices); 16 Look slots / 4 Voice slots enforced in the store.
4. **Trio affect.** `voiceAffect` state + pill/face/👸🏽 expression + conviction-weighted marks. Dev-only preview harness first, then wired to live verdicts.

Each phase = one reviewable PR. Matt merges; nothing pushes without his word — per his "show me before you push to gh."

## 5. Acceptance

- A style pack, look pack, voice pack, and variant pack each install through Pipeline IMPORT with a receipt; garbage quarantines with names.
- Loading a 17th Look offers replace, never appends. The store refuses 17.
- With all three Voices suggesting, the pill breathes red, the face drifts amber, 👸🏽 quickens — and the submenu shows three marks at conviction-weighted ink.
- With no suggestions, everything rests. Reduced-motion shows static marks only.
- `npm run selfcheck` covers all four formats + the slot cap + affect purity (expression = f(state)).

## 6. Open questions

1. Should `kc-voice/1` allow community voices, or are Voices Matt-cast only? (Affects whether the Director library browser exists.)
2. Seedless vs seeded Looks — default seedless?
3. Does the affect layer need a global dimmer (a "quiet directors" toggle), or is rest-state enough?
