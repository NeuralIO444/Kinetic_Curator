# #2408 — Trend builds from the existing shelf

**Mandate (Matt, 2026-11-18):** instead of looting the ten "Fire Design Trends — Part 2" (James Abadi Design, 2026-11-03) into new systems, build as much of each trend as possible with what KC-1 already has — existing assets, recipes, Looks, Canon styles, FX, strata, drivers. No new systems, no new code, no new assets.

**Tree:** detached worktree at origin/main `f59efffc`. No app source was modified; the only outputs are the recipes in `trend-proofs/recipes.txt` (kc-r/3 payloads + plain-text recipes, regenerated from the exact payloads that were rendered) and the screenshots in `trend-proofs/`.

**Method:** every attempt is a saved recipe (seed + palette/overrides + layout params + strata stack + scene pool/world/light) applied through the app's own boot-hash recipe door (`#r=`), rendered in the production build (`vite build` + `vite preview`), and screenshotted from the live stage. Three trends got re-rolls after the first render missed (neo-brutalism ×3 builds, neo-swiss ×2, synthwave ×2); the earlier attempts are kept beside the finals (`*.v1`, `*.v2` full frames) and noted per trend.

## Score table

| # | Trend | Score | One-line gap |
|---|-------|-------|--------------|
| 1 | Acidwave | mostly | Blobs read amoeba/petri, not dripping slime — no drip-trail asset or run/drip behaviour exists (displace warps, it doesn't run). |
| 2 | Y2K Futurism | mostly | No chrome/gradient-metal fill capability — flat marks + glass + RGB split carry it; rails composition is columnar, not poster-dense. |
| 3 | K-Design | mostly | No letterform/Hangul marks can be dealt (type exclusivity, #2150) — pixel blocks stand in for characters; no hero-character poster hierarchy. |
| 4 | Dreamscape | mostly | Pure atmosphere — no focal subject or cover-composition element; dreaminess comes from alpha/screen/accumulation optics over flat fills. |
| 5 | Halftone | **covered** | — (the FX `stipple` effect is a true tone-following halftone dot screen.) |
| 6 | Hyperbloom | mostly | Screen blend over black washes saturation toward pastel; halo is the only bloom composite — no dedicated high-chroma bloom pass. |
| 7 | Neo-Brutalism | mostly | Club posters are type-led and no type can be dealt; mark overlaps alpha-blend instead of overprinting flat. |
| 8 | Neo-Swiss | mostly | Palette colour deals per-mark, not per-asset-class — the acid green can't be confined to the blob assets only; no dealt type. |
| 9 | Synthwave | partial | No archway/perspective-scene asset exists in the dealable pool (`pxg_arch` is undealt, letter-anatomy class); the FIELD ground deals pattern tiles, not a composed scene. |
| 10 | Vector-Surrealism | mostly | The library's marks are abstract-geometric — no cartoon character/figure assets exist to deal. |

**Tally: 1 covered · 8 mostly · 1 partial · 0 out of reach.**

## The shelf (survey summary, all verified against this tree)

- **Canon:** 11 styles (swiss, bauhaus, japanese, grunge, engraved, techno, pixel, organic, op, memphis, marks); 13 baselines in `data/canon/baselines.js` — ready-made bundles of marks pairing + palette + motion + density (e.g. tdr/MAXIMUM MINIMAL = transit palette, rails, flat signage).
- **Looks:** 82 composition presets in 19 groups (incl. the 12 looks + 19 voices that landed in #2407). A Look sets layout params only — palette and asset pool are separate axes, which is exactly what made trend-mixing cheap.
- **Modes:** 29 layout modes (grid, rails, fibonacci, noise, flow, stratified, radial, swarm, eden, dla, …).
- **Palettes:** 39, each 8 swatch slots with weights; `paletteOverrides` can re-slot any palette's bg/ink/swatches — the single most powerful trend lever (see neo-swiss and neo-brutalism below).
- **Assets:** 1,051 in the library, but the **dealable pool is 265** — the type-exclusivity law (#2150) never deals glyph/letter packs, riso icons, creatures or house constructs, and the complex-asset cut applies when the constructs gate is on. Categories: geometric, stamps, linework, radial, crystalline, organic, biosynthetic, floral, fragments, dots, scanlines. This 265-mark pool is the hard ceiling every trend hit.
- **Strata/FX:** pattern (bottom, locked) → one content stratum → FX (17 kinds: stipple, dither, riso, grain, rgbSplit, displace, halo, haze, scanlines, posterize, grade, …) → MATH (12 kinds). Pattern grounds: QUILT/GLYPH/FIELD/TIDES/REWRITE/BLOCKS/PICTURE; FIELD alone has 10 tile patterns incl. `rayBurst`, chosen per-tile by the pattern seed.
- **Recipe mechanism:** kc-r/3 URL codec (`state/recipeUrls.js`) round-trips seed, palette + overrides, layout params, the strata stack, and the scene block (enabled-asset pool, weight overrides, world ground/ink/grain, CHIAROSCURO light, canvas). Every attempt below is data in that format — loadable by pasting the payload after `#r=` in the app URL.
- **Field systems:** ACCUM (accumulation + wetness + optics: bloom/halation/stipple-diffusion), WET, Riso grain family, ferro — of these, ACCUM's optics did real work in acidwave/dreamscape/synthwave; the others had no honest job in these ten stills.

## Per-trend builds

### 1. Acidwave — mostly · `trend-proofs/01-acidwave.png`
Look `neon-brood` (noise warp), palette `dystopia` overridden to acid greens (#c6ff00/#00ff88/#06ffa5 on #03140a), pool = all dealable organic + biosynthetic marks (blobs, drops, pods, bio forms — 32 assets), screen blend, ACCUM on with wetness 0.7, FX displace (melt) + halo. Seed 240801, count 190.
**Read:** glowing slime-green amoeba field with wet grain — the colour and ooze land; the shapes stay petri/amoeba rather than slime dripping over a graphic.
**Gap:** no drip/run behaviour or drip-shaped asset exists.

### 2. Y2K Futurism — mostly · `trend-proofs/02-y2k-futurism.png`
Look `circuit`, mode rails, palette `ink-nebula` overridden toward cyan/magenta/silver on deep violet, pool = crystalline + techno-style marks (44), `glass: true`, screen blend, FX rgbSplit (dx 5) + halo. Seed 240802, count 240.
**Read:** iridescent crystal shards and HUD glyphs with chromatic fringing — the Y2K visual language is right; the rails composition is sparser and more columnar than a poster.
**Gap:** no chrome/gradient-metal fill capability in the mark renderer.

### 3. K-Design — mostly · `trend-proofs/03-k-design.png`
*Interpretation:* the reference is a Seoul Design Festival poster — bold flat blue character forms on white in a poster grid. Hangul character marks are precisely what type exclusivity keeps off the stage, so I built the poster *grammar* with the dealable pixel-block family (`pxg_*` chunky blocks) + glyph stamps, which read as character-like blocks. Look `eight-bit`, mode grid, palette `cyanotype` overridden to festival blues on #f4f8ff (one yellow accent slot), no FX — clean print. Seed 240803, count 220.
**Read:** a dense blue pixel-character field on white — unmistakably the K-design register.
**Gap:** real character/letterform marks are undealable by law; no single hero-character composition.

### 4. Dreamscape — mostly · `trend-proofs/04-dreamscape.png`
Look `petri-bloom`, mode flow, palette `persona-anadol` overridden to pink/violet/teal/gold pastels on #160a33, pool = organic + radial + floral (62), alpha 30–70%, screen blend, ACCUM optics 0.65, CHIAROSCURO light on (soft sun), FX halo. Seed 240804, count 150. (First build also carried glass + haze; dropped for the render — see environment note.)
**Read:** soft luminous clouds of petals and orbit rings on violet — a dreamy album-cover atmosphere.
**Gap:** atmosphere only; no focal subject.

### 5. Halftone — covered · `trend-proofs/05-halftone.png`
Look `moire`, mode radial, pool = radial + dots marks (45), psychedelic overrides on `static-bloom` (magenta/cyan/yellow/violet on paper #f7f3ea), FX **stipple** at cell 9, amount 1. Seed 240805, count 200.
**Read:** the whole frame resolves into a halftone dot screen — dot size follows tone, exactly the trend's mechanism, in the psychedelic register.
**Gap:** none material. (Boldness is a dial: stipple `cell` is the dot pitch.)

### 6. Hyperbloom — mostly · `trend-proofs/06-hyperbloom.png`
Look `sottsass` (Memphis), mode random, palette `neon-brood` as-is, pool = memphis-style + organic marks (45), count 260, jitter 90, screen blend, FX halo. Seed 240806.
**Read:** a dense, vibrant abstract-shape bloom — stars, squiggles, blobs, confetti. Saturation washes pastel where screen blend stacks over black.
**Gap:** no high-chroma bloom composite beyond halo; blend behaviour caps saturation.

### 7. Neo-Brutalism — mostly (3rd build) · `trend-proofs/07-neo-brutalism.png`
Final build: Look `rail-yard` params on mode **grid**, palette `transit` with overrides forcing **only** red #e63946 / navy #1d3557 / black / paper slots, pool = geometric + stamps in techno/swiss/bauhaus styles (47), count 150, scale 1.0–2.2, alpha 100%, no FX. Seed 240827. World ground/ink set to paper/black, grain 0.12.
**History:** v1 (rails mode) dealt quiet totem columns — rails makes columns, not posters (`07-neo-brutalism.v1`). v2 (grid, transit as-is) filled the field but the palette's tan/teal/orange slots washed it pastel (`07-neo-brutalism.v2`). v3's forced 3-colour palette is the fix and it lands: bold flat red/navy/black geometry on paper.
**Gap:** the reference is type-led; no type can be dealt, and overlaps blend translucently instead of overprinting flat.

### 8. Neo-Swiss — mostly (2nd build) · `trend-proofs/08-neo-swiss.png`
Final build: Look `raster`, mode grid, palette `persona-reas` overridden to white/black/grays with **acid green #8aff00 at two swatch slots**, pool = swiss geometric + linework marks + the `org_blob` family with **asset weight overrides ×6** on the blobs so they deal often. Seed 240818, count 170.
**History:** v1 put green at one slot with `paletteShift: band` — the green never visibly dealt and the blobs rendered gray (`08-neo-swiss.v1`). v2 lands the green across the monochrome field.
**Gap:** colour deals per-mark, not per-asset-class, so green also lands on arrows/crosses — it can't be confined to the blobs alone. No dealt type for the typographic half.

### 9. Synthwave — partial (2nd build) · `trend-proofs/09-synthwave.png`
Final build: PATTERN ground = FIELD at density 2 with a scanned seed (seed 1: 2 of 4 tiles are `rayBurst`), content = sun/horizon pool (`mrk_sun_01`, half-circles, hatch/solid lines, scanline marks — narrowed to 13 assets), mode stratified, count 70, scale up to 3.4, palette `dystopia` overridden to pink/orange/purple on #0d0218, ACCUM optics, FX scanlines + rgbSplit + halo. Seed 240819.
**History:** v1 used FIELD density 4 with a broad pool — read as busy patterned wallpaper (`09-synthwave.v1`). v2's bigger tiles give real retro beams and a big sun.
**Gap:** the reference is a *scene* (archway, horizon, perspective). The one archway asset (`pxg_arch`) is undealt (pixel letter-anatomy class), no perspective/horizon scene assets exist in the dealable pool, and the FIELD ground deals tiles rather than composing a scene. Palette, sun, rays and scanline texture all land; the scene doesn't.

### 10. Vector-Surrealism — mostly · `trend-proofs/10-vector-surrealism.png`
Look `praystation`, mode fibonacci, palette `persona-davis` as-is (acid pop), pool = the broad cartoonish mix — stamps, organic, radial, fragments, floral, geometric (173 assets), count 300, alpha 45–90%, FX grade (chroma 1.2). Seed 240810.
**Read:** a dense, colourful flat-vector collage — the density and sticker energy land.
**Gap:** the reference is a cartoon *illustration*; the library holds abstract-geometric marks, no characters or figures.

## What this proves

- **Nine of ten foreign trends are buildable today to a "mostly" read or better, with zero new systems** — purely by composing Looks × palettes (with per-slot overrides) × curated pools from the 265-mark dealable library × the existing FX/strata stack, saved as ordinary kc-r/3 recipes. The shelf's orthogonality (Look ≠ palette ≠ pool ≠ FX) is what absorbs the list: each trend is mostly a new *combination*, not a new capability.
- **The binding constraint is the asset pool, not the machinery.** Every "mostly/partial" gap traces to one of three shelf facts: (1) type exclusivity keeps all letterforms undealt, so the three type-led trends (K-Design, Neo-Brutalism, Neo-Swiss) must be carried by marks alone; (2) the dealable pool has no scene/character assets (synthwave's archway, vector-surrealism's figures); (3) colour deals per-mark from palette slots — there is no per-asset-class colour targeting (neo-swiss's green blobs) and overlaps blend rather than overprint (neo-brutalism).
- **One trend was already a shipped feature wearing a trend's name:** halftone *is* the FX stipple screen. Worth remembering when the next trend list arrives — check the FX menu before filing loot.
- **Palette overrides are the highest-leverage existing tool** — two of the three re-rolls were fixed by palette surgery alone (forcing transit to 3 slots; doubling the green slots), no other change.

## Render environment notes (honesty)

- Renders are the production build under Playwright's bundled Chromium with SwiftShader (software GL) on a 1.5-CPU sandbox. The app's own adaptive budget dropped to its LEAN tier during several renders, and counts/scales were kept at or below ~300 marks so frames would present at all under software rendering; on Matt's hardware the same recipes run at full tier. Recipe data is identical either way.
- The headless dance, for the record: poll for the first-run gate to mount → Escape dismisses it (synthetic clicks on PLAY ME do not) → Space resumes the transport → Space again whenever the PERF watchdog folds. A screenshot taken before that sequence reads as a black or gated stage even though the scene is fine.
- Screenshots: `*.png` are stage crops (766×584 of the 1000×700 canvas); `*.png.full.png` are the full app frames they were cropped from.
