# Studio Assistant — scoping note (Matt, 2026-11-09, voice)

## What it is (Matt's words, paraphrase-tight)
A new persona/module for KC-1 that **uses the native system in clever ways** to make a wider variety of looks and styles. Its first example already happened by hand: the Riso paper-texture stack (tiny pattern layer + FX grain under the Riso field + overprint bleed) — a found recipe, not a new feature.

## The Riso paper rule (Matt, 2026-11-09 — refinement of the first recipe)

When — and only when — the Riso print is on, the background pattern is **paper, not pattern**: **low contrast, very subtle, settings lowered** until the pattern layer fakes a paper texture rather than reading as a design element. The print sits *on* something; the ground should be felt, not seen. (First demo ran the pattern at opacity 0.55 — too visible. **Confirmed recipe (Matt, 2026-11-09, "This looks good"):** pattern FIELD at finest density, layer opacity **0.25**, grain 0.55, overprint 0.85 / 2px shift, on the merged main `6d37f9b0` — screenshots `~/workspace/kc-riso-paper-low-a/b.png`. Known residue: faint tile-to-tile tone steps remain because tiles carry slightly different tones; "0.25 + flatter tile tones" is the candidate lock if a lighter palette reads too strong — unruled, Matt's eye.)

## Scope — lined up with the strata rebuild (#2038)
- Studio Assistant is **scoped to the new strata area** and lined up with the #2038 PR — it works in the post-rebuild stack: PATTERNS/GLYPHS (bottom, pinned) → one CONTENT layer → FX → MATH.
- It does **not** need the whole system. Its territory is mostly **effects, math, and the strata themselves, combined in interesting ways** — e.g. a tear, a blur, or another treatment at one stratum creating further artistic effects in combination.
- Working method: it can **look through the new strata system** — the inventory of strata, FX, and math available — and think "I can make this, or I can make that," the way the Riso combination was found. It **creates** candidate setups/effects from that inventory.
- **Taste tie-in:** it must be tied into the **taste database** (or the equivalent standing system) so it knows *what is what and when* — which combinations exist, what they read as, and when they're appropriate. Taste also judges: what Matt keeps vs cuts teaches it what "clever" means for him.

## Genre baselines + the intertwined taste system (Matt, 2026-11-09, voice — second pass)

Matt extended the idea the same morning:

- **Taste database, Looks, and Voices are intertwined by genre.** When a genre is named ("Japanese style…"), the looks, the voices, and the taste system should all know that genre *together* — one shared genre knowledge, not three separate systems that happen to share a word.
- **Tie into the Nash Book** — flip through the book more. The pull is toward specificity: looks that are *less mushy, more specific*.
- **Weighted combination.** Naming a treatment + a genre should produce the treatment *in* that genre, with the styles weighted: his example — "Riso Japanese kanji" should look like **Riso, but Japanese-kanji** (the print system stays Riso; the visual language is the genre's).
- **Artist/style mixing needs a baseline first.** The ambition: take three different artists and come up with new looks and ideas from the mix. Matt's own precondition, stated plainly: *"we have to have a visual reference database of what those styles throughout history look like — op art, Warhol, Joshua Davis — we have to know the baseline for what these styles are before we can mix and match them."*
- **Consequence for the build order:** the **visual reference database of historical style baselines** is a foundation piece — baselines first, mixing second. Each baseline needs to be expressed in the native system (what the style *is* in KC-1's own terms: marks, palettes, motion, density, rules) so the Assistant and the taste system can weigh and combine them — a mood board alone can't be dealt.
- **Form of a baseline (Matt, 2026-11-09, follow-up):** a style baseline is a **settings record in the database the Looks/Voices/taste already run on** — each artistic style is a row of settings the three systems read together, not a separate image library.
- **One unified database (Matt, 2026-11-09, completing the thought):** a **single shared database of looks and styles** that everything references — Looks, Voices, taste, and the Studio Assistant all read the same store, and its style entries are **anchored to actual art history** (op art, Andy Warhol, the named artists/movements), so when styles combine, the combination stays specific to real art-historical baselines rather than drifting mushy. Unified in that sense: one database, shared by all the systems, grounded in art history.
- **Motion is in the database too (Matt, 2026-11-09, voice):** the unified database also covers the BUILD menu's **layouts**, **flocking**, and **animation** — one database of *established animations and looks*, referencing graphic-design and layout-animation traditions. A style record isn't complete without how it moves.
- **The Canon works with the core API buses (Matt, 2026-11-09, voice):** the Canon is not a static catalogue — it connects to the core API buses so **the trio (LOIS/Davis/TE) can see what's happening in there**. The trio's awareness of the live system — what's running, what's being driven — runs through the Canon; style records and live bus state meet in one place. (Consistent with the standing bus-records-first ruling from the RAY GUN headroom line.)
- **The database is named: the Canon (RULED by Matt, 2026-11-09, voice).** From here on, issues, specs, and the audit refer to the unified looks/styles/layouts/animation database as **the Canon** (sitting beside the Nash Book).

## Standing law it lives under
- Native system only: no new machinery; combinations must be lawful in the current system.
- Proposes/scores/orders — the performer picks. It never deals or gates on its own (standing Mind doctrine).
- Local AI only (no cloud), per the Mind backend rules.

## Queue position
- Scoped alongside #2038 (the last item in the full-auto line, before the stop ahead of the RAY GUN epic). Spec first, build after #2038 lands and Matt gives the word — it depends on the rebuilt strata existing.

## Open (for Matt, one at a time, later)
- Exact surface: where its proposals appear for audition (deck chip vs drawer).
- How much it may vary a running stage vs only proposing between takes.
