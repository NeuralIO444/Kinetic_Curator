# Creature PAINT and TEST DRIVE (spec)

Status: **SPEC ONLY.** Ordered by Matt on 2026-11-17 ("Review creature and research upgrade path … Ask questions.
Refer to open issues."). Rulings below are his answers, all taken as recommended except where marked.
Kin: `wetlab-ladder-spec.md` (the ladder), `gait-spec.md` (motion records, issues #2327–#2332), `creatures-spec.md`.

## 0. Why these two

Spore's creature maker had three modes: build, paint, test drive. KC-1's WetLab now builds (the ladder, phases 1–4).
Paint fills the genome's empty MATERIAL gene; Test Drive lets the artist see a creature move before it reaches the stage.
Research notes: Spore's Test Drive offered moods, dances and a "baby" preview; its motion was authored
morphology-independent and retargeted at runtime (Hecker et al., SIGGRAPH 2008), which is what gait's root / inner /
leaf addressing does in 2D.

## 1. Rulings (Matt, 2026-11-17)

**Test Drive**
1. **After gait M5 (#2331).** Test Drive plays real gaits; no throwaway motion code before gait lands.
2. **What it does:** play each Canon default gait (#2329: still, idle, performing) on the beat; moods from the
   creature's DRIVE genes (approval, crowding, strain, boredom) change how the gait plays; a baby preview (a bred child
   of this creature and a bank creature, shown small, not banked). **No GIF export** (Matt did not pick it).

**Paint**
3. **A material decides a fill and a pattern over the creature's body and dealt parts, coloured by the room's
   palette** — never fixed colours.
4. **Each Canon style ships a few materials as data** (like gaits in #2329), so a Swiss creature paints Swiss.
5. **MATERIAL is inherited like LOOK and VOICE** in breeding; mutation can swap it. (`creatureBreed.js` already lists
   MATERIAL as a discrete gene; it refuses to mutate it today only because it has no value space.)
6. **Paint Like:** one tap copies a banked creature's material.
7. **Applies to today's WetLab creatures**; #2168 (moth and dish as pure rigs) picks it up later.

**Gaps**
8. **RIG early unlock (#2318's quirk): fixed now** — PR #2335.
9. **Banked constructs on the stage: filed as an issue for the `liveLoop.mjs` owner** (one-writer file).

## 2. Not checked (each issue checks first and stops with a comment if it fails)

- **How a creature's style is known.** Materials are per Canon style; a creature record has LOOK and VOICE but no
  style field that I found. P2 decides the mapping (from the body's style, the LOOK's group, or the room's style) and
  stops if none is honest.
- **What fill and pattern treatments exist** for a dealt SVG asset today (an `fx/stipple` suite exists; hatch exists as
  an asset facet). P1 lists what is real before defining materials; a material may only name a treatment that renders.
- **Room colour on a banked creature tile.** `creatureTile` bakes the body's svg into the tile. Paint must use palette
  tokens (`var(--…)` / `currentColor`), not baked colours, so the room still colours it. P3 checks the tile path.

## 3. Build order (one PR each)

| # | Slice | Needs |
|---|---|---|
| P1 | Materials as data: per Canon style, a sanitizer, a selfcheck | — |
| P2 | MATERIAL gene gets its value space: assembly picks, breeding inherits, mutation swaps, old records still load | P1 |
| P3 | Draw: WetLab tiles, preview and the banked creature tile apply the material with room palette tokens | P2 |
| P4 | Genome panel: MATERIAL mutate / replace, and Paint Like from the bank | P2, P3 |
| T1 | Test Drive panel: play each Canon default gait on the beat in the WetLab preview | #2331, #2329 |
| T2 | Moods: DRIVE genes modulate the gait's amounts in Test Drive | T1 |
| T3 | Baby preview: a bred child with a chosen bank creature, small, never banked | T1 |

No points, scores or toasts (ladder spec §7). One-writer files untouched.
