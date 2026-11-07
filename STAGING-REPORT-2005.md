# STAGING REPORT — #2005: the clean plate

**Issue:** feat(field): the clean plate — moments of really great clean typography (plate face, set discipline, a quiet room)
**Branch:** `feat/clean-plate-2005` · **Base:** origin/main `752800d1` (RAY GUN, PR #2007)
**Lane:** local staging only — no push, no PR (the coordinator publishes).

Governing law (Matt, 2026-11-06): FIELD type lives at two poles — RAY GUN illegible (#2003, shipped) or really great clean type. This build is the clean pole. A plated form is never ray-gunned (the poles do not mix on one form), and #2006's review loop will treat plated forms as exempt.

---

## 1. The face — Fraunces, instanced for display

**Pick:** Fraunces (the issue's named candidate), verified rather than assumed.

- **Source (pinned):** the variable font from the google/fonts OFL tree,
  `https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf`
  — md5 `df89c7ab0af2020b3949cf8a4bece47a`, 360,440 bytes.
- **Licence:** SIL Open Font License 1.1 (font metadata: "Copyright 2018 The Fraunces Project Authors"; the OFL tree carries the licence). Only baked path data lands in the repo — no font file is committed, same as every other FIELD face.
- **Axes:** opsz 9–144, wght 100–900, SOFT 0–100, WONK 0–1. The variable defaults are opsz 9 / wght 900 / WONK 1, so an unpinned axis would silently fall to the wrong end — every axis is pinned explicitly.
- **Instance (pinned):** fonttools 4.46.0 —
  `python3 -m fontTools.varLib.instancer -o FrauncesPlate.ttf Fraunces-var.ttf opsz=144 wght=400 SOFT=0 WONK=0`
  → fully static (no fvar), 72,680 bytes. opsz 144 is the display end the letterforms are drawn for; wght 400 is the regular of the issue's light-to-regular range; SOFT 0 keeps serifs crisp; WONK 0 keeps the standard letterforms (WONK is the quirky alternate set — a plate is set clean, not wonky).
- **Generator:** `scripts/gen-plate.mjs`, on the gen-serif pattern; its header records both pins and the instancing command. The instanced TTF's container md5 is deliberately *not* treated as a pin (fonttools stamps head-table times into the container); the generated file is the pinned artefact.
- **Regen proof:** fresh fetch (md5 matches the pin) → fresh instancing → `node scripts/gen-plate.mjs` → `app/src/data/assets/assets-plate.js` md5 `9b74c180e2c07008582487f40f07dbbc`, **byte-identical** to the committed file.
- **Coverage proof:** all 52 glyphs A–Z + a–z carry real outlines (H cap height 1400 at upm 2000; x-height 868 — the lowercase is genuinely drawn, not scaled caps). The suite rasterizes every stamp with Resvg under the pinned font and asserts real ink, green also with `FONTCONFIG_FILE=/dev/null` (the #1970 CI condition). The plate outlines differ from the serif face's glyph-for-glyph (asserted) — this is a second drawn face, not a remapping.
- **Tag note:** the stamps are tagged `['type', 'letter', 'fraunces']`, and `'fraunces'` joins the `letter` canonical home in `assetStyle.js`. The raw tag `'plate'` was deliberately *not* used: it already exists in the folksonomy meaning a flat patch shape (absorbed into the `square` home; worn by assets-experimental / micro-hud), so tagging the stamps 'plate' would have dragged a shape meaning onto letterforms — the #1999 lesson (a word gaining new meaning) in reverse.

PT Serif and its law are untouched; the plate is a **new face slot**. Digits and punctuation follow the slice-3 face law: face-shared base stamps, not duplicated (gate + door pin this both ways).

## 2. The plate register

A single register-style key on the form — `plate: true` — on the WHISPER precedent. The `face` marker is *not* extended: a plate is a presentation register (like whisper), not a third value of the serif switch, and the door keeps the two from ever coexisting.

- **Deal:** `fieldDealReport` honours `decision.plate` for greenleaf only, supersedes `face` and `plateBreak` on that deal, composes with `case` (a sentence-set plate deals lowercase plate stamps), and places with `face: 'plate'` in `placePiece`.
- **Door (`sanitizeFieldForm`):** any plate value but `true` refuses the form whole; plate under a non-greenleaf poet, plate + `script`, plate + `face`, and plate + `raygun` all refuse whole. Plate stamps classify only under a declared plate form; base/serif letters inside one refuse. A whispered plate round-trips (registers compose). **Pre-plate documents sanitize byte-identically** — no plate key is ever added to a form that does not carry one (pinned).
- **The poles never mix:** the door refuses plate + raygun in any mode, and `layoutSlice.cyclePoemRaygun` no-ops on a plate form — the performer's gun gesture simply does not land on a plate (no record, no undo step, no tap drawn; control-pinned against a plain form, where the gun still arms exactly as #2003 shipped). `rayGunForm` and the raygun record law are otherwise untouched.

## 3. Set discipline — named constants, measured on dealt forms

In `poets/placement.js` (beside the recipes they govern):

| Constant | Value | Meaning |
|---|---|---|
| `PLATE_TRACK` | 0.26 | tracking, in em — the ink gap the proportional recipes set by; the grid's cell carries it too |
| `PLATE_PITCH_EM` | 2.4 | leading — row pitch in em for grid/bands/two |
| `PLATE_MARGIN` | 0.13 | optical margin, dish units, both axes |
| `PLATE_MEASURE` | 0.66 | the module's width cap, as a fraction of dish width |
| `PLATE_GLYPH_MAX_W` | 1.275 | the face's widest glyph (cap units), the grid cell's measure |

The discipline is threaded through `placePiece` as parameters whose defaults are the standing recipes' values — ordinary deals are byte-identical (placement 560,366/0 and the golden hash, §7). The suite measures dealt plate forms across **all 4 Whittier pieces × 5 aspects (0.6–2.6) × 3 seeds**: rotation 0 everywhere, one type size, row pitch exactly `PLATE_PITCH_EM`, every ink box inside the margins, ink width inside the measure; grid centre steps are whole plate cells (1 within a word, 2 across a space); bands intra-word ink gaps are exactly `PLATE_TRACK·em` and nothing anywhere is tighter. The square recipe keeps its own cell law — Rosselli is never plated (Whittier-only law), so the plate branch never reaches it.

**Measured dealt size, stated plainly:** a g1 plate at aspect 10/7 deals at em ≈ 0.029, against ≈ 0.051 for a serif reading and ≈ 0.061 for a plain deal of the same piece. Fraunces at opsz 144 is a wide face (widest glyph 1.275 cap-units), and the wider track + narrower measure compound that. It sits well above the legibility floor (`FIELD_MIN_LEGIBLE_EM` 0.01). If the feel gate wants plates bigger on the dish, `PLATE_MEASURE` is the one-line lever — flagged here rather than silently compensated elsewhere.

## 4. The room — zone quieting at the render seam

In `engine/buildPlacements.js` (beside `WHISPER_ALPHA`):

| Constant | Value | Meaning |
|---|---|---|
| `PLATE_ROOM_ALPHA` | 0.15 | the alpha multiplier for non-form marks inside the zone |
| `PLATE_ZONE_PAD_EM` | 0.75 | the zone's padding beyond the plate's ink box, in em of the form's largest stamp |

The zone is the dealt stamps' ink bounding box in stage pixels, padded. Suppression is applied at the FIELD seam to the stage's mapped items *before* the form's items append and before mirroring — item centre in zone ⇒ alpha × 0.15; outside ⇒ untouched, positions never move. Because alpha is re-derived from `layoutParams` on every build, nothing compounds across rebuilds, and when the plate leaves the item list is the pre-plate list byte-for-byte (pinned). The plate's own stamps stand at full presence — the relationship WHISPER established (the form quiets itself) is inverted: the plate stands, the room quiets. A whispered plate composes: the form draws at the whisper alpha and still quiets its room (pinned at the seam; fixture zone holds 12 of 40 marks, so both populations are real).

## 5. The producer — the Director calls the plate

**Design decision (as briefed to state):** the plate call **rides beside** the solo room's serif call and **supersedes it in the stillest band**. `PLATE_CALL_MAX_INTENSITY = 0.2` (`curator/fieldDirector.js`): solo room (DAVIS ALONE) + greenleaf + intensity ≤ 0.2 ⇒ plate; a warmer solo Whittier deal ⇒ the serif reading, exactly as slice 3 shipped. Rationale: a plate is the stillest form of the reading room's attention — it should be what the solo room deals when it is *most* alone, not a second lottery beside the serif call. No new RNG draws anywhere: the call is derived from the room state `step` already computes (conditional spreads only, the kana/serif pattern), and a plate pick consumes exactly the plain pick's 2 draws (pinned with a counting rng). `dealPoet` re-spreads the decision key; `landPoem` is untouched.

- **Who may be plated:** Whittier (greenleaf) only — at the pick, at the deal, and at the door. The plate is a Latin-face register and Whittier is the Latin reading poet; teijo's solo calls (the plate break) are undisturbed.
- **Measured frequency** (seeded sweep, `mkRng(2005)`, 3000 solo-room picks at uniform intensity): 728 picks land greenleaf. Still band (≤ 0.2): 278 picks — **all plates**. Mid band: 450 picks — **all serif**. Plates = **38% of solo Whittier deals in the sweep, 9.3% of all solo picks, and zero outside the still band**. The 38% is exactly the still band's share of the cool pool by construction — the honest statement of the design: *every* stillest solo Whittier deal is a plate, and no other deal is. Whether that is "a moment" or too often is a feel call on the constant (one line, `PLATE_CALL_MAX_INTENSITY`), not on the mechanism.

## 6. Containment — the plate pack is poem-only, on every surface

Catalogue 701 → **753**; authored bake stays 312; panel records stay **313**; poem-only union 388 → **440**; native face stays 289. Surfaces extended (each re-derived by grepping the tree for the slice-3 pack enumerations, not assumed):

- `data/assets/index.js` — catalogue spread (after ornaments, before the creature citizen).
- `poets/placement.js` — `POEM_ONLY_STAMP_IDS` union (the FIELD dealer's own law).
- `data/chapters.js` — `CHAPTER_UNDEALT`.
- `state/rollPool.mjs` — `NEVER_DEALT`.
- `panels/assetPoolLogic.mjs` — `POEM_ONLY_IDS` (the panel's records).
- `curator/dice.js` — the `dealCast` chokepoint filter.
- `gl/liveResolve.mjs` — `POEM_ONLY_IDS` (never a placeable mark).

The suite pins every one: chapter decks and the Now deck clean, `dealableRecords` clean, every voice's wardrobe clean, and a 600-cast seeded `dealCast` census identical with and without the packs present.

## 7. Verification

- **New suite:** `src/poets/fieldPlate.selfcheck.mjs`, registered in `app/selfcheck.manifest` after fieldLatin. It measures the real things: pack bijection + real ink (also under `FONTCONFIG_FILE=/dev/null` — green), plate outlines ≠ serif outlines, rulers, the discipline measured on dealt forms (above), draw-count parity, deal/gate/door law, the poles-never-mix law (door + the real store's cycle), zone suppression at the render seam, containment, the producer (pick/step/live Director + the frequency sweep).
- **Ordinary deals byte-identical:** placement **560,366 passed, 0 failed** (unchanged); goldenPlacement hash **`e892d112b20d92b6…` unchanged**; fieldBattery 15/15 including its byte-identical replay.
- **Decisive suites re-run directly by file:** fieldPlate, placement, goldenPlacement, allEraGolden, fieldLatin, fieldKana, fieldKanji, fieldStampPath, poemRow, rayGun, fieldBattery, fieldDeal, fieldLiveDeal, buildPlacements, chapters, assetStyle, assetPool, regionBake, styleLooks — all green.
- **Full manifest sweep:** 606 of 611 entries passed in the sweep itself; the five exceptions, each reconciled individually —
  - `allEraGolden` — failed in the sweep only because the sweep reached it before the §8.2 re-pin landed; re-run after the re-pin: green (above).
  - `styleLooks` — a real failure, caused by this build and fixed by the §8.6 re-pin; re-run green: "69 looks in 15 groups, all render".
  - `swarmWasm`, `rollSafety`, `accum` — **environmental, proven base-identical**: each fails the same way on a fresh detached worktree at base `752800d1` — swarmWasm: `build-wasm.sh --verify` cannot run (`cargo not found on PATH` in this sandbox); rollSafety: the headless Chromium target crashes at the same line (rollSafety.selfcheck.mjs:231) after the same passing checks; accum: V8 heap OOM at ~95 s in its GL probe section on both trees. CI (cargo-check, selfcheck-browser on the Mac runner) is authoritative for all three.
  - Net: **608 of 611 manifest entries green on this tree**, the remaining 3 red only in this sandbox and identically red at base.
- **Format/lint:** `npm run format:check` green (five files reflowed by prettier where the pack-list lines grew — reflow only, on the edited lines); `npm run lint` 0 errors, 11 warnings, all pre-existing in untouched files (App.jsx, FavoritesTray, ShelfView, DataExportRow, LootRow).

## 8. Re-pins — every one caused, none a behaviour change

1. **`data/chapters.selfcheck.mjs`** — library total 701 → 753, prose updated with the plate pack's 52. Cause: catalogue growth.
2. **`state/allEraGolden.selfcheck.mjs`** — first-render hash `a52e3bd7…` → `48f77588…`. Cause: catalogue growth — the 'all' pool renders the full catalogue. Proven before re-pinning on the suite's own #1854 protocol: my tree with only the `ASSETS_PLATE` spread removed reproduces `a52e3bd7…` exactly (701 assets, 21,183 svg bytes — byte-identical to base); with the pack, 753 assets / 25,619 bytes. The render pipeline is untouched.
3. **`poets/fieldLatin.selfcheck.mjs`** — (a) catalogue arithmetic + 52 plate; (b) poem-only union 388 → 440; (c) the solo-room serif fixtures move from intensity 0.2 to 0.3 and the live solo block now pins the plate supersession. Cause for (c) is the design itself: at 0.2 the solo Whittier deal is now a plate (§5), so the serif affirmation is pinned above the stillness line, same cool pool, same draw. The plate suite owns the still-band pins.
4. **`poets/fieldKana.selfcheck.mjs` / `fieldKanji.selfcheck.mjs`** — catalogue sums + 52, in each suite's standing RE-PIN comment style. Cause: catalogue growth.
5. **`assets/regionBake.selfcheck.mjs` / `panels/assetPool.selfcheck.mjs`** — their local poem-only exclusion lists and pack-length sums extended by the plate pack, with RE-PIN comments. Their assertions' meanings are unchanged (the exclusion is exactly the poem-only packs, by id).
6. **`data/styleLooks.selfcheck.mjs`** — the render loop's fixture seed 4242 → 4100. Cause: the loop deals pools from the *full* catalogue records (poem-only packs included), so its candidate lists grow with every pack; at 4242 the shifted sample deals diagonal-grid an all-poem-only pool (`typ_s_K, typ_s_A, typ_k_za, typ_k_a`), which renders nothing — correctly: the resolver excludes poem-only marks by design. Proven growth-only before re-pinning: the same pool renders 0 on the base tree, and the base tree's 4242 pool renders 172 items on this tree. At 4100 every look's pool again holds a placeable mark; the assertion (`blank == []`) is untouched. The re-pin comment in the suite also records the standing fragility this exposed: a dozen letterform-paired looks share one candidate set and clear or blank together per seed, and have since the first poem-only pack — the durable fix (deal from the panel's records, as production does) is a redesign of that fixture, flagged here for the coordinator rather than folded into this slice.

## 9. Not done / not touched

- No performer surface: no chip, no control — the plate is the Director's call alone.
- No runtime fonts: bake only, per the FONT RULING.
- PT Serif, the kana/kanji faces, and every shipped deck: untouched.
- The placement floor for dealt forms: untouched (all threading defaults preserve the standing recipes).
- `rayGunForm` and the raygun record law: untouched beyond the never-mix door rule and the cycle's plate guard.
- KC-1's one-writer files (`liveLoop.mjs`, `liveResolve.mjs` internals, `particles.js`): `liveResolve.mjs` received only the one-line `POEM_ONLY_IDS` set extension + its import, the identical edit slice 3 made; no logic changed there.
