# STAGING REPORT — #2003 RAY GUN

**Issue:** feat(field): RAY GUN — poem-row type treatment, tap-cycle CARSON / GREIMAN / SHOT
**Branch:** `feat/ray-gun-2003` · **Base:** `origin/main` 3f479704 · **Status:** built, verified, NOT pushed (coordinator publishes)

## What shipped, in one paragraph

One new chip in the poem group of the poem row, after FORM: **ray gun**, tap-cycling
plain → CARSON → GREIMAN → SHOT → plain, the readout naming the armed treatment
(`ray gun · carson`). The treatment is a pure seeded transform of stamp geometry
(`poets/rayGunForm.js`). Architecturally it is a **record + render-time application**:
the standing form stays plain and carries `raygun: { mode, seed }` through
`sanitizeFieldForm` on the register marker's pattern, and `buildPlacements` draws
`rayGunForm(plain, record)` at the same point where it honours the register. The
treated stamp list is never stored — see "Translations" for why the tree requires
exactly this shape.

## File-by-file account

### NEW — `app/src/poets/rayGunForm.js` (~330 lines)

The one pure module. `rayGunForm(form, { mode, seed }) → form'`:

- Deterministic and seeded (`mkRng`, xorshift32): same (form, mode, seed) → identical
  output, bit-for-bit; takes replay exactly.
- Transforms stamp geometry only: `x`, `y`, `rotation`, `em`, plus same-letter ghost
  duplicates appended after the plain list. Output stamp *i* (for i < plain count) IS
  plain stamp *i* — same `ch`/`assetId`, moved. Every other form field (poetId,
  pieceId, layout, aspect, and the `script` / `face` / `break` / `register` markers)
  rides unchanged via object spread.
- Never throws: absent/dishonest record, unknown mode, or a stampless form returns the
  input untouched.
- Words are read off the dealt geometry with placement's own constants: rows share an
  exact baseline `y`; proportional recipes (`bands`/`single`/`two`) put exactly
  0.16 em of ink gap within a word and 0.58 em across a space (split threshold
  0.35 em); `grid`/`square` put glyphs on an even pitch and a space is one empty
  pitch (split at > 1.5× the row's minimum pitch). A plate-break ornament is its own
  row in placement, so it segments as a one-stamp word and rides the treatments as
  furniture, never merged into a word of letters.
- The exception's floor is enforced *by construction*, not by rejection:
  - **Glyph identity** — ghosts are copies of treated glyphs (same `ch`/`assetId`).
  - **Word cells (CARSON/GREIMAN)** — each word owns the interval between the
    midpoints to its neighbouring words in the *plain* geometry (dish edges at the
    row's ends). CARSON clamps every treated centre into its word's cell AND strictly
    between its neighbours' plain centres (reading order cannot invert). GREIMAN
    span-fits each rigidly transformed block into its cell with one rigid translation.
  - **Door bounds** — every treated centre is clamped onto the dish (`x ∈ [0, aspect]`,
    `y ∈ [0, 1]`), every `em` into `[0.01, 0.3]` (the door's legibility floor and cap,
    mirrored as local constants so the module never imports the door), ghost additions
    stop at the door's 200-stamp cap.
  - **First-line anchor** — all CARSON/GREIMAN displacement magnitudes scale by
    `FIRST_LINE_FACTOR = 0.5` on line 0.
  - **SHOT** — no cell, no order, no first-line bound. By the ruling. Identity and the
    door bounds still hold.

### `app/src/poets/fieldForm.js` (+20 lines)

`sanitizeFieldForm` learns one marker, on the register's discipline exactly:

- `raygun` destructured; when present it must be a plain object whose `mode` is one of
  `'carson' | 'greiman' | 'shot'` and whose `seed` is an integer in `[0, 0xffffffff]`;
  anything else refuses the form whole. The carried copy is normalized to exactly
  `{ mode, seed }` (extra keys dropped, like every marker).
- The return gains `...(raygunMark !== undefined ? { raygun: raygunMark } : {})` after
  the register spread — field order poetId, pieceId, layout, aspect, script?, face?,
  break?, register?, raygun?, stamps. A form without the record produces **no key** and
  sanitizes byte-identically to before (pinned in the suite).
- No existing rule changed: the stamps are judged exactly as before, S4 gate included.
  The gate never sees a treated list, because treated lists are never stored.

### `app/src/poets/poemRow.mjs` (+10 lines)

`POEM_RAYGUN_BASE = 0x70000`, a dedicated sub-stream beside `POEM_PICK_BASE (0x50000)`
and `POEM_PLACE_BASE (0x60000)` on CH.curate — indexed by the session's ray-gun tap
counter, never by `poemDeal`. `keepKey` untouched: it reads poet/piece/layout/aspect/
stamps only, so a keeper keys marker-blind, exactly as it already does for `register`.

### `app/src/state/slices/layoutSlice.js` (+60 lines)

- Import: `POEM_RAYGUN_BASE` added to the poemRow import; `RAYGUN_MODES` from
  `rayGunForm.js`.
- State: `raygunTap: 0` beside `poemDeal`, session-only, same comment discipline — the
  index of the ray-gun stream the next tap draws from. The drawn seed rides the form,
  so replay never re-derives a blast from this counter.
- Action `cyclePoemRaygun`, on `togglePoemWhisper`'s pattern: no standing form →
  returns `{}` (no state change, no undo entry, no seed drawn). Otherwise computes the
  current mode from the form's record (absent or dishonest → plain), and:
  - plain/CARSON/GREIMAN → next mode with a fresh seed
    `floor(rngForIndex(seed, CH.curate, POEM_RAYGUN_BASE + tap, seedOffsets)() × 2^32) >>> 0`,
    `raygunTap` advances by 1;
  - SHOT → the record is **deleted** (absent, not nulled — the full cycle returns the
    exact original form object shape).
  - One `pushToUndo(state, true)` per tap. The stamps are never touched by the action.

### `app/src/engine/buildPlacements.js` (+15 lines)

At the FIELD draw point, after the whisper alpha is read from the sanitized form:

```js
const drawnForm = fieldForm.raygun ? rayGunForm(fieldForm, fieldForm.raygun) : fieldForm;
```

The item loop then reads `drawnForm.stamps` (count and geometry); poet/piece for the
item keys and the aspect divisor are unchanged values (the transform preserves both).
No record → `drawnForm` IS `fieldForm`, byte-identical pipeline. WHISPER and RAY GUN
compose: alpha from the register, geometry from the record (pinned in the suite).

### `app/src/components/PoemRow.jsx` (+22/−2 lines)

- Selectors: `fieldForm.raygun` (already-selected form) + `cyclePoemRaygun`.
- The chip, directly after the FORM readout span and before KEEP, per the brief:
  classes `chip-btn poem-act` (+ `active` when armed — HOLD's red `held` styling is
  never used; there is still exactly one possible red in the row). Label `ray gun`
  plain, `` `ray gun · ${mode}` `` armed. `aria-pressed` mirrors the armed state;
  titles follow the whisper chip's voice.
- Header comment updated: the group layout line now reads
  `poem [WHITTIER — …] [HELD] [ray gun · carson] [keep] [▫ hold] [whisper]`, with the
  #2003 sentence in the rulings paragraph. The group still renders only when a poem
  stands, so the button inherits the genre gate — it cannot exist without a poem.
  The identity chip is untouched: it reads the deck, so it always shows the clean
  transcription.

### NEW — `app/src/poets/rayGun.selfcheck.mjs` (registered in `app/selfcheck.manifest` after `fieldLatin`)

19 checks; see "Verification" below.

## Treatment parameters (the numbers)

All magnitudes are per-mode constants at the top of `rayGunForm.js`. "em" = the glyph's
own em; first-line values are the general values × 0.5 (`FIRST_LINE_FACTOR`).

### CARSON — per-glyph, word-correlated

| Parameter | Value |
|---|---|
| Per-word baseline step | ±0.25 em |
| Per-glyph vertical jitter | ±0.25 em (combined \|dy\| ≤ 0.50 em; ≤ 0.25 em on line 0) |
| Per-word tilt | ±12° (added to every glyph of the word) |
| Per-glyph rotation | ±13° (tilt + glyph reaches ±25°) |
| Ordinary scale | ×0.6 – ×1.8 |
| Hero glyphs | 1–2 per form, ×2.2 – ×3.0 (em-clamped at 0.3) |
| Tracking random walk | step ±0.22 em/glyph, walk clamped ±0.30 em (line 0: ±0.15 em) |
| Edge crop push | p = 0.4 per row-edge glyph, up to +0.50 em toward the nearer edge, then cell/dish clamps decide what survives |
| Misregistration duplicates | p = 0.12 per glyph, offset (+0.10 em, +0.06 em), same em/rotation as the treated glyph |

Correlations: step + tilt are drawn once per word; the walk accumulates within the
word and resets at each word — glyphs of a word drift together, neighbouring words
don't. Heroes are drawn form-wide before any row work (fixed draw order).

### GREIMAN — per-block (word) rigid similarity

| Parameter | Value |
|---|---|
| Block scale | ×0.7 – ×1.6, reduced when the block's treated span cannot fit its cell (the floor wins over the range) |
| Block rotation | 5–20°, seeded sign (line 0: 2.5–10°) |
| Diagonal | one per form, 10–35° above horizontal, up-right |
| Diagonal step | 0.5 em per block index from the form's middle block |
| Float offset | ±0.30 em per axis (line 0: ±0.15 em) |
| Grid snap | p = 0.4 per block, centre snapped to a 0.05-unit grid; span-fit runs after, so a snap never breaks the floor |
| Echo | p = 0.5 per block, one whole-word copy trailing −1.2 em along the diagonal, em ×0.62, same rotation |

Within a block: internal spacing, baselines and relative geometry are untouched —
the transform is one similarity per block (translate is the only post-adjustment,
for span-fit). Verified to float tolerance in the suite (pairwise distances scale
by exactly the block's realized scale; rotation delta uniform).

### SHOT — epicentre blast (recoverability OFF, by ruling)

| Parameter | Value |
|---|---|
| Epicentre | cx ∈ [0.25, 0.75] × aspect, cy ∈ [0.25, 0.75], seeded per blast |
| Falloff | f = exp(−d / 0.38), d in height units |
| Radial displacement | 0.55 × f dish units along the unit radial |
| Tangential rotation | ±110° × f, one seeded swirl sign per blast |
| Scale | ×(1 + 1.6 × f), em-clamped to [0.01, 0.3] |
| Ghosts | glyphs with f ≥ 0.45 trail one ghost at 0.45 of the displacement vector, em ×0.6 |

Measured on the suite's fixture spread: max displacement 0.515 dish units (the
CARSON vertical cap at poem sizes is ≈0.05); 67 reading-order inversions across
112 treated outputs — the exemption is exercised, not theoretical.

## Translations (research/issue text → this tree)

1. **"The treated form passes back through sanitizeFieldForm" → record + render-time
   application.** The research (§5/§6) was written before FIELD S4: the current door
   runs `gateFieldForm` inside `sanitizeFieldForm`, and the gate refuses any two
   stamps whose ink boxes intersect. CARSON/SHOT are licensed to overlap, so a stored
   treated list would be refused whole on every draw. The brief anticipated this
   (§7: "if it needs a carried field, add it on the register marker's pattern") —
   the carried field is `raygun: {mode, seed}`; what the door accepts is the plain
   form + record, and the treated stamps obey the door's *stamp-level* bounds
   (on-dish centres, em ≤ 0.3, count ≤ 200) by construction, pinned per-stamp in the
   suite. The overlap exemption itself is the ruling, pinned in the SHOT check.
2. **"The plain form is stashed in the treatment record" → the plain form is never
   displaced at all.** There is nothing to stash: `layoutParams.fieldForm.stamps` is
   always the plain dealt list; the record is only `{mode, seed}`. Recompute-from-plain
   is structural — cycling modes changes only the record, and the full cycle deletes
   it, returning the exact original form (deep-equal pinned, stamps included).
3. **"KEEP banks the treated materialisation as the distinct keeper" → KEEP banks the
   form *with its record*; the keeper key stays marker-blind.** The current tree's
   `keepKey` already ignores `register`, and poemRow's suite pins "the keeper is the
   poem at either register". RAY GUN follows that standing discipline rather than the
   research's older phrasing: the banked form carries `raygun`, so it re-renders the
   identical treated materialisation (pinned), and keep-dedupe treats register/record
   variants of one poem as one keeper, consistently.
4. **Markers since the research:** the form has gained `face: 'serif'` and
   `break: <ornament id>` (#2002) on top of `script: 'kana'` and `register: 'whisper'`.
   The transform spreads the whole form, so all four ride unchanged (pinned across
   native, serif, sentence-case, plate-break, and whispered fixtures). The plate-break
   ornament segments as its own word.
5. **The chip set has moved:** WHISPER (#1906) exists in the row now; the RAY GUN chip
   sits after FORM (before KEEP) exactly as the brief orders, and `togglePoemWhisper`
   is the action precedent the cycle follows.
6. **Seed source:** the brief's "dedicated sub-stream beside the poem-deal streams" is
   `POEM_RAYGUN_BASE = 0x70000` — 0x50000/0x60000 are PICK/PLACE; the tap counter is a
   new session-only state field (`raygunTap`) beside `poemDeal`, because the stream is
   indexed by taps, not deals.

## Not touched (per the brief)

`placement.js` and its floor · the Director/poet choice and the genre gate · the poet
decks · every existing `sanitizeFieldForm` rule · HOLD/KEEP semantics (the gesture
rides them, on the whisper precedent: it works on a held form; HOLD carries the record
untouched; a re-deal clears it by dealing a fresh plain form) · the deal path
(`landPoem`, `fieldDealReport` untouched — the deal never sets the record; the cycle
action is the only write site). No animation, no per-stamp alpha, no new typeface.

## Verification

### New suite — `rayGun.selfcheck.mjs`: 19 checks passed

Fixtures: 33 real dealt forms — every piece of all four poets (bands/single/two/grid/
square), Teijo native, Whittier serif, Whittier sentence-case, Whittier plate-break,
and a whispered form. Words are measured against **deck truth** (the piece's own
lines), never the module's own segmentation. The checks:

- determinism per mode (bit-identical replay; the seed is live);
- markers preserved through every treatment (script, face, break, register included);
- glyph identity + count accounting (in-place correspondence; ghosts glyph-matched;
  count ≤ 200; ghosts demonstrably occur in all three modes);
- door bounds per treated stamp (centres on dish, em ∈ (0.01, 0.3]);
- the record through the door (a recorded form sanitizes whole, gate included;
  10 dishonest record shapes refused; no record in → no key out);
- CARSON floor measured (order, cell containment, |dx|/|dy| caps, first line at half);
- CARSON non-rigidity witness (262 words across the probe pass are no single
  similarity transform);
- GREIMAN rigidity measured (pairwise distances = block scale × plain, to 1e-9;
  rotation delta uniform; span inside cell; first-line rotation ≤ 10°);
- SHOT exemption pinned (order inversions and displacements far beyond the
  CARSON/GREIMAN caps, identity + door bounds intact);
- recompute-from-plain (input never mutated; dishonest record → form untouched);
- the store cycle (exact seeds from `POEM_RAYGUN_BASE + tap`; stamps never move;
  one undo step per tap; full cycle returns the exact original form; refused with no
  poem standing);
- seed-stream isolation (a fully cycled session re-deals the bit-identical next poem);
- persistence (re-deal clears; HOLD carries the record through KINETIC passes and the
  gesture works held; KEEP banks the record and the keeper re-renders treated;
  project save/load round-trips the record through the door);
- the draw (buildPlacements renders the treated list for a recorded form, the plain
  list for a plain one; whisper + ray gun compose — alpha from the register,
  geometry from the record).

### Existing suites (run directly, verdict lines read)

| Suite | Result |
|---|---|
| poemRow | 16 checks passed |
| fieldDeal (src/state) | 5 checks passed |
| fieldLatin / fieldKana / fieldKanji / fieldStampPath | all assertions passed |
| placement | **560,366 passed, 0 failed** (unchanged) |
| goldenPlacement | OK — hash `e892d112b20d92b6…` **unchanged, not re-pinned** |
| fieldBattery | 15 checks passed |
| buildPlacements | OK |

### Full manifest sweep (continue-on-error, 610 commands)

**605 passed, 5 failed — zero failures attributable to this build.** Each failure was
run down, never asserted away:

| Suite | Sweep failure | Disposition |
|---|---|---|
| `gl/composite` | `page.evaluate: Target page, context or browser has been closed` | Passes on clean base; passes unloaded in this tree (OK, 15 cases). Sandbox Chromium died under sweep load. |
| `pattern/patternRender` | same harness death | Passes on clean base; passes unloaded in this tree (22 checks). Same flake. |
| `fx/rollSafety` | same harness death | **Base-identical:** clean 3f479704 (own worktree, own `npm ci`) fails exit 1 with the identical signature (`page.evaluate: Target crashed` there and on this tree's unloaded re-run). |
| `gl/accum` | abort (core dump) | **Base-identical:** clean base aborts with exit 134, same signature. |
| `kernel/bake/swarmWasm` | assertion | **Base-identical, verbatim:** "build-wasm.sh --verify failed — the checked-in kernel wasm does not reproduce bit-for-bit from the rust/** sources" on both trees — a sandbox toolchain reproducibility gap that predates this build. |

### Format, lint, e2e surface

- `npm run format:check` — clean (one prettier reformat of the new layoutSlice hunk,
  applied; suites re-run after it).
- `npm run lint` — 0 errors; 11 warnings, all pre-existing in files this build does
  not touch; none in any touched file.
- e2e greps (the surface + new-meaning sweeps): `grep -rnw "poem" e2e/`,
  `grep -rn "whisper" e2e/`, `grep -rni "ray gun|raygun|carson|greiman" e2e/`,
  and the poem-row selectors (`.poem-row`, `poem-act`, `poem-id`) — **zero hits**.
  No e2e spec references the poem row at all; the new chip breaks no spec.
- Selfcheck source-shape sweep: suites naming the touched files were covered by the
  full manifest sweep above (all green except the five proven rows).

### Re-pins

**None.** No existing suite was edited, no golden moved, no count changed:
placement holds at 560,366/0 and the golden hash at `e892d112b20d92b6…`.

## Live-QA script (for Matt)

1. Stand a poem: be in a type-native room (Swiss/Bauhaus/Japanese look — e.g. pick the
   raster look) and let a poem land, or tap the identity chip until one stands. The
   poem group appears: `poem [WHITTIER — …] [held] [ray gun] [keep] [▫ hold] [whisper]`.
2. **Tap `ray gun` once → `ray gun · carson`.** On the dish the poem smashes,
   Carson-style: letters of a word jitter up and down its baseline, tilt together,
   a letter or two blows up huge, tracking collapses into collisions, offset
   double-prints ghost beside some glyphs. Words are still readable — that's the
   floor. The identity chip still shows the clean title.
3. **Tap again → `ray gun · greiman`.** The smash resolves into floating blocks:
   whole words drift up-right as rigid units, some doubled by a smaller echo word
   trailing behind, a few snapped to an invisible grid. Inside each word, the
   letters sit exactly as dealt.
4. **Tap again → `ray gun · shot`.** The blast: glyphs near one point on the poem
   are blown outward and swell, spinning as they go, ghosts trailing behind them;
   far glyphs barely move. The poem may stop being readable — full texture is
   allowed here, by your ruling.
5. **Tap again → back to `ray gun` (plain).** The poem is exactly the dealt poem
   again, letter for letter — nothing accumulated.
6. Things to check: HOLD a treated poem and press KINETIC — the treated poem rides
   through. Re-deal (tap the identity chip) — the new poem arrives plain. Turn
   WHISPER on while treated — same blast, drawn quiet. Undo after a tap — the
   previous treatment (or plain) returns.
