# Changelog

## Unreleased — Canon, RAY GUN, strata rebuilt, MegaMind complete, Motion Core begins (2026-11-11)

Everything merged to `main` since the 2026-11-04 entry (99 commits).

- **Strata rebuild (#2038)** — the fixed skeleton replaced: PATTERNS/GLYPHS pinned to the bottom and locked, exactly **one** CONTENT layer, then FX, then MATH; FX stipple built for real; per-stratum rotation 0/15/45/90; field-mod stays in the CHIAROSCURO editor. The Strata Q two-content shape below is superseded.
- **The Canon (#2044–#2049)** — one style record, declared once, plus a style dimension in taste (#2052); voices carry their own style (#2053); layouts, flocking and animation as Canon records (#2054); the Nash Book carries settings and gets read back (#2056); the first art-history baselines as native records — op art, Warhol, Joshua Davis (#2057) — plus The Designers Republic (#2060; PR #2066) and measured baselines for the seven Look-group styles (PR #2067); the trio sees the system — Canon records ride the core buses (#2058). Design docs published alongside: the Studio Assistant spec, the Canon audit, the top-bar legibility spec + UX map (#2051).
- **RAY GUN (#2010)** — headroom research first (#2017): treatment bus records + the treatments surface (slice 1, #2059); P1 **TORN & XEROXED** — baked worn letters, CARSON and SHOT wear their own (#2061); P2 **SWISS GRIT** — the Ashworth mode, Swiss type set against the drawn ink, then wronged by rule (#2063); P3 the **shared distortion channel** — per-instance shear/melt/tear, zero passes (#2065); P4 **POEM ↔ LIFE** — an armed poem is terrain, an unarmed one a bystander, a held one ground (#2084); P5 **DOCTRINES** — CARSON / ASHWORTH (#2087). Under it, the FIELD type work: stamps slices 1–3 — kana, the curated kanji set, Latin lowercase/punct + the Whittier serif face, all poem-only (PRs #1985, #1999, #2004); the RAY GUN poem-row treatment — CARSON / GREIMAN / SHOT (#2003); the clean plate (#2005); plate presence repaired (#2018); family wardrobes exclude poem-only stamps (#2000); and **the review loop** in four slices — shadow review, the voice, the hand, the QUIET rung (#2006; PRs #2019, #2021–#2023).
- **FIELD S5 — the whisper register (#1906; PR #1996)** — the same placed field, drawn quiet. FIELD is complete, S1–S5.
- **DISH LIFE (#1923) — complete** — the culture phase over the dish: field mode, a persistent invisible culture (PR #1995); tertiary specks in the gaps (PR #1989); the culture is log-accountable in a take (PR #1990); Phase 2's coupling consumers in four slices — SCALE, FIELD glyph breathing, the pattern modes, CONTENT backgrounds (PRs #2024–#2027); Phase 3 the closed loop — periodic re-seed from the stage (PR #2028); Phase 4 governor & controls — the seed-from-stage trigger and the re-seed interval (PR #2029).
- **Ferrofluid, reworked (#2039; PR #2040)** — the system itself is invisible: asset shapes attach to the field and *are* the fluid on stage, filling where it runs and gathering around magnets. The #1997 build's visible floor (PR #2036) is superseded in presentation; its sim, magnets, dials and coupling stand.
- **Riso (#2008; PR #2042)** — a generative icon grammar and the breathing field as a pickable Look, with the riso overprint finish; the PATTERNS layer at its finest scale reads as paper texture under the finish.
- **WetLab** — **Big Lab** (#2034; PR #2041): drawer window, icon rail, centered creature stage. **Genome Timeline** (#1870; PR #2031): inspect, mutate and replace genes in place, one node per gene. **Lineage Tree** (#2030; PR #2032): ancestry retained at birth, a tree surface in the WetLab. **Strand Bank** (#1871; PR #2033): the bank becomes how the assembler works. **Simulate / Cultivate** (#1872; PR #2035): a dry-run of the creature record before stage injection.
- **KINETIC births (#2037; PR #2043)** — a KINETIC press can breed: when 3+ parents are on stage (creatures + pool assemblies, never a whole stage), every press rolls at ~1 in 8; cultivate gates the birth, and the child banks only if the take it was born in is kept.
- **ACCUM rung 2 (#1838; PR #2064)** — the trail drive's fresh pole, ruled by Matt: fresh light **attracts** — creatures seek the new trail, Davis-signed per look.
- **Top bar (#2050; PR #2062)** — TASTE names the taster, KIN shows its next pass, armed chips wear a detent.
- **MegaMind, complete** — **S2** the persona backend adapter: kc-voice/1 over local Ollama, cadence tiers, register surfaces (#1526; PR #2079). **S3** LOIS vision: render judging, offspring pre-judging in the tray, stage description (#1527; PR #2080). **The embeddings slot**: semantic search + the miner's semantic novelty axis (#1528; PR #2085). **Replay recaps** + retro-capture summaries, every line told from the take's own log (#1529; PR #2088). The DEV panel graph can no longer reach @resvg (#2081; PR #2082). What remains is Matt's device acceptance on the Studio — #1525–#1527 stay open for that session.
- **Mind lane, closed on device proof** — kc-mind can say *route*: Apple Intelligence conducting, sessions refreshed every 4 answers against the 4,096-token window (#2068; PRs #2070, #2071); the macOS microphone prompt declared so the mic can ask (#2072; PR #2073); one in-flight ask per persona, cancel on bridge timeout (#1747; PR #2074). The STIMULI tuning pass (#2069) stays held on Matt's verdict — "the floor barely conducts" — behind the reach diagnosis (#2075).
- **Dev mode toggle (#2077; PR #2120)** — the DEV panel is reachable in release builds behind a Settings toggle: off by default, immediate, saved on this machine only, never in a saved project.
- **Motion Core begins (#2109)** — P0 the motion map (#2110; PR #2124); P1 the contract — pose deltas, motion sources, the registry, time bases (#2112; PR #2132); P3 table-driven kineme drivers with no per-frame channel allocation (#2115; PR #2134). P2, P4–P7 remain. Dead code out: `beastMotion.js`, imported by nothing, removed (#2111; PR #2129).
- **Trio + Director hardening (2026-11-11)** — the intensity latch's reset freed (#2090); beat confidence expires (#2091); ownership never lapses, with an owned-of-ownable readout (#2092, PR 1 of 3); a clock restart (REC) no longer strands the held proposal, the phrase ledger or the cooldown (#2093); one throw from the take recorder no longer nulls the conduct tap (#2096); `SET_LAYOUT_PARAMS` coalesces by key, not type (#2097); older wireEventBus handlers defended against bare payloads (#2098); eventBus `once()` keeps its meta envelope and can be cancelled (#2101); ACCUM resets on a new Look (#2102); stage strata in the world — diagnosis (#2103); the Director's beat input drops its whole-store subscription (#2089); kc-neighbor's `build_grid` gains a cell cap (#2099).
- **Also landed** — **PICTURE pattern mode**: an image sampled into a grid of shapes (PR #1992); **rift slice 1**: the tear shears the marks below it (PR #1991); beast roam/trace + Davis role-deal settings (PR #1988); ACCUM slit-scan band edges feathered (PR #1987).

## Unreleased — WET, ACCUM, strata, Book, FIELD, creatures, Beast (2026-11-04)

Everything merged to `main` since the 2026-10-15 entry (114 commits, ≥100 PRs).

- **WET engine, complete (#1809–#1815, #1841)** — the wet-frame service owns the field (#1842); a 128-grid sim with a measured cost gate (#1844); two-compartment pigment with Kubelka-Munk mixing (#1845); edge darkening on drying (#1873); the wet-look display pass (#1874); warm-up exports so stills carry the field (#1875); footprint stamps + suspended diffusion (#1877); strata soak — layers interact where the field is wet (#1879); the dish migrated onto the service (#1880). The WETNESS slider got a power-2 taper so the low end has the travel (#1882).
- **ACCUM, completed + repaired (#1800–#1808)** — spectral fade, trails age in hue (#1824); highlight soft-ceiling kills the bloom ratchet (#1825); palette-driven halation (#1827); a true age buffer (#1829); selective accumulation in three slices — renderer seam, recipe wiring, BUILD flag + project round-trip (#1835, #1843, #1847); slit-scan echoes (#1828); buffer statistics as a show signal (memory rung 1, #1831); the trail-grid read (rung 2 slice 1, #1839); gestures ride the take (#1826); the ember-following moth drive (#1878); TRAIL FADE hands off to ACCUM FADE in LEAVE (#1895, #1911). And the quiet one: **ACCUM never engaged at all** — `tick()` read a build-local variable out of scope and threw on every accum frame — fixed, with a scope guard (#1914, #1915).
- **Strata Q (#1606–#1610)** — Phase 0 paper (DS detent amendment, stop-table law, #1883); Phase 1 mode rows + stop table on the BUILD shelves (#1884); Phase 2 quantized block editors (#1885); Phase 3 the fixed skeleton — exactly 2 CONTENT strata, 1 MATH, 1 FX, four active picks per layer (#1886); Phase 4 the EF-4 dither kind (#1887). Plus **TIDES** — the threshold grid as a field readout (#1797, #1816).
- **Loot pattern modes** — streamlines sampler (#1794, #1889); BLOCKS pattern mode (#1798, #1890); REWRITE, MarkovJunior grid growth (#1823, #1891); the exposure model — stops at the resolve, performer control (#1830, #1892).
- **The Book (S1–S5: #1853–#1858)** — chapter registry, the spine opens at Marks (#1893); the Marks pool — 18 authored marks, ochre/bone palettes (#1896); cold flips land in a chapter (#1899); the round — LOIS judges, the kill redeals (#1908); CURATOR narrows inside its chapter (#1909); the book learns — chapter memory, the Queen's lean, LOIS's grudge (#1916).
- **FIELD — Poetic Type System (#1901; S1–S4)** — spec (#1900); the Director's poet choice with genre vector, slow debt and room graph (#1907); placement + stamp path — the form is dealt, held and drawn (#1912); the live Director's seeded deal stream (#1924); the poem row — KINETIC re-deals, identity chip, FORM / KEEP / HOLD (#1926); the poem as a clean type plate (#1930), then **the poem as stage material** — the stage's own letters form the poem, genre-gated arming, silence as the default below a stamp threshold, the plate retired (#1932, #1940); S4 — room bias measured (cool rooms deal Whittier/Teijo, hot rooms Rosselli/Gibson) and the stillborn gate that refuses illegible forms before they deal (#1905, #1958). S5 (whisper channel, #1906) is not built — it waits on Matt's feel check.
- **Creatures as assembled assets (#1848)** — the WetLab assembler builds creature records from a shape and its ATTACH points (#1929); assembled creatures enter stages as pool tiles (#1933); the rig — invisible bones, parts dealt from the stage, Lois's gait (#1937); WetLab breeding — three-source gene inheritance, discrete genes whole, ~1-in-8 mutation (#1939); the lineage shimmer — kin resemble and breathe together on stage (#1948); Lois's and Davis's live moods reach the rig (#1952).
- **Beast — Strandbeest creatures (#1863)** — S1+S2 linkage and solver (#1888); S3 the drawn beast, stamp-rendered, walking in place (#1913); the linkage becomes a creature rig (#1961) and ASSEMBLE A BEAST makes it a pool tile (#1963); S4 the travelling home — the beast roams by its own stance (#1964); S5a the signature curve as the family-resemblance readout (#1965); a bare-stage beast wears plain bars (#1966). S4's feel gate and S5's dish writing are still open (#1867, #1868).
- **Asset descriptors (#1941, all five slices)** — the descriptor record: measured traits, role fits, faceted tags (#1942); the pool inspector — tags by facet, filters, multi-select, solo, in-app confirm (#1954); kits — a seeded share dealt from each of three named kits (#1955); Davis deals parts by role fit (#1957); the WetLab reads descriptors — shape card, breed filters, kit source, part preview (#1959).
- **Governor + stress** — the watchdog waits for the shed ladder (ladder-first, frozen-frame carve-out, #1919, #1920); the stress-telemetry bench on main (#1922); the Tighten edge retuned 0.72 → 0.52 on session evidence, Relax kept at 0.28 — **#1635 closed** (#1934). **DRAG + bounded crawl** — a MIX dissolve runs on presented time, so a dragged engine crawls it, and no dissolve outlives 1.5× its authored duration (#1935, #1956).
- **Housekeeping** — MIT license declared in package.json (#1846, #1921); CI pins one bundled font for every Node asset raster (#1951); the traits bake emits prettier-clean output and asset-tag edits autosave (#1942).
- **Recorded late** — landed Oct 15–27, narrated in the README's 2026-10-27 release note but never changelogged: the skeleton creature system (#1634, #1657–#1662), the ROOM codec (#1560), KINETIC variety (#1766), Mind trio stages 1–2 (#1483), travel kinemes, the determinism audit, the repo-wide Prettier standard, Tauri shell hardening.

## Unreleased — Materials, explorer, loot, taste (2026-10-15)

Everything merged to `main` since the 2026-10-13 sync.

- **Materials (#1547–#1549)** — the vocabulary is complete in GL: glass renders translucent (M1, #1558), plate renders its radial ink body (M2, #1564; radius and centre tuned by eye), wash and stipple render (M3, #1572). Five bodies: flat, glass, plate, wash, stipple.
- **Look Explorer (E1a–E5: #1504–#1508, #1530)** — coverage census as a standing instrument, parameter census + render reachability (12 dead knobs found), the stratified miner, the mined tray in DIRECTORS + the CENSUS dev tab, persona prospecting corners with LOIS judging renders, the Davis variants offspring engine.
- **Dice + write path (#1545, #1546, #1550, #1551)** — the dead `scaleMid` axis fixed (recipe features v4), the dealer deals starved families their own casts (never-tray 86 → 31 of 294), one ranges source of truth with validated writes everywhere, census fixture honesty.
- **Loot folder (#1479, slices 1–9)** — a local folder as the library: the pure scan (classify, dedupe, rename, missing), the per-device index, native + web backends, the PIPELINE row (point at a folder, scan, log), SVGs into the asset pool, palette files into the palette library, audio checked by its bytes, missing files said out loud. `preferences.json` lives at the loot root.
- **XGBoost taste head (T1–T3: #1579–#1581)** — taste.json can carry a tree head (`xgboost-trees`): Studio-side distillation from the probe with a held-out ship rule, a small tree walk in the app (the library never ships). Dice ordered within strata by score — scores order, never gate — with score + taste version + head kind stamped on tray and crown records; census agreement readout; Davis cites clause reasons from the splits; dev-panel TASTE tree reader.
- **Governor cost head runtime (#1578, #1583)** — the evaluator and prime function are merged and inert: no trained model, no caller yet. The reactive ladder is untouched and remains the authority.
- **Spectral path (#1482 P1–P3) + trio direction (#1483, stage 1)** — pure analysis core, the live feed + STIMULI readout, marks that listen to spectral features; LOIS's keep-rate moves how soon she calls a show flat.
- **Design docs** — MegaMind local-model plan (#1531) and the ROOM codec spec set (#1561) committed under `docs/research/`; both deferred (issues #1525–#1529, #1560). Mind doctrine amended: Apple Intelligence is the default persona backend; rules are the silent fallback.

## Current — Petri dish, kernel, creatures (2026-10-13)

Everything merged to `main` since the 2026-10-07 sync (about 210 commits). Roadmap: [docs/ROADMAP_PETRI_DISH.md](docs/ROADMAP_PETRI_DISH.md).

- **Dish spine (#1358–#1361, #1369, #1370)** — determinism harness, resolver input tap + exact input log, performance file v2 with a replayer that proves it; REC restarts the scene and records a performance. Phase 1 exit.
- **Stress + bands (#1362, #1363, #1375)** — stress value with smoothing and hysteresis, live tracker from honest counts, `?debug=stress` readout, takes record their stress signals and band changes. Phase 2 exit.
- **The dish is one world (#1183, #1395–#1398, #1417, #1420, #1425, #1388)** — marks lean toward, ease off the edges of and take the colours of the pattern tile beneath them; soft contact shadow; one shared grid with cross-strata contacts; contact discs track live scale; DISH switch with bounce/repel; block-stacking strata BUILD panel.
- **Wet lab + creatures (#1377, #1379–#1381, #1400, #1418, #1421, #1423, #1424, #1429)** — hierarchy core, ATTACH points, pin tool, dish pressure, the formation rule (fertility field + crowd, held 30 frames), the moth (body, wings, scales, second wing pair in a crowd, hovers near its pin, takes the ground treatment), the pin says why it is waiting.
- **Influences (#1427, #1428, #1437, #1444, #1451)** — moth traits (spread, wing, body, swatch), Davis shifts them once at birth, the room (LOIS kin weight) tightens or loosens his band, a crowded dish reads as FLOW and a sparse one SEEDLING, and a hidden nudge leans births toward the last 3 kept moths.
- **Live canvas fix (#1419)** — the live canvas was upside-down against exports and the pointer; fixed with a present-time flip.
- **Curator (#1365, #1394, #1402, #1404, #1405, #1345, #1347, #1366)** — refine keeps the chosen palette and varies colour gently, three palettes per voice, explore keeps an artist-chosen palette, tilt gate open.
- **Telemetry (#1390–#1393, #1349)** — epoch timestamps, activity heartbeat, keep-side and Director-side gap closure, session log export from the footer.
- **Kernel (#1320–#1346)** — SoA columns (5/5), replay event log + headless replayer, worker entry + versioned protocol, iPad worker probe, GPU field runner, Rust/wasm crates (kc-fields, kc-neighbor) default when loaded, reproducible builds, cost tiers declared, purity lint gate.
- **Layouts + growth (#1196, #1197, #1198, #1199, #1200, #1350, #1351)** — Voronoi cells, space colonization, ORGANIC + CADENCE rhythm patterns, field→channel mapping, dish-level attractor field + hero marks, Gaussian cluster, circle packing.
- **Housekeeping (#1445–#1448)** — event registry + audit (73 events, 8 dead removed), palette and run controls ride the bus, the opt-in render worker retired, three dead modules deleted, advisory-audit CI job.
- **Docs** — Petri-dish roadmap and Phase 3/4 plans, dish strata sketch, characters (LOIS, Davis, Queen), VOICES.md, DLC preset types + Pipeline loader spec, telemetry gap and DLC discovery research.

## Current — Directors, patterns, keeps (2026-10-07)

Everything merged to `main` since the 2026-10-01 sync.

- **DIRECTORS (#1126)** — the Director panel now hosts the argument: LOIS reads NOD / VIBE / BURN / AWAY and Davis reads FLOW / SEEDLING / UGLY / STUCK / BLOOM, both driven by the honest feed. LOIS voice (heuristic rank + blunt verdict, #948), terminal companion (#956), boldness line (#997). Personae triad codified (`docs/PERSONAE_TRIAD.md`).
- **PATTERN system (#1039–#1042, #1097–#1100, #1110, #1137)** — PATTERN tracks join the layer model and BUILD (add / edit / shuffle). Three modes: FIELD (ten torus-proven micro-patterns), QUILT (ten motifs, hero lattice, grout overlay), GLYPH (13 constructed marks on a 5:4 board, baked + derived swatch weights). Motion: DRIFT per mode, DROP gate, bar-quantized shuffle, MOD routing, per-element KINEMEs; KIN and CURATOR rolls deal element motion too.
- **Sliders (#1027, #1127)** — one slider everywhere in the panel's thumb color; tap a slider's name for its dialog (range expansion, mode switch); ROTATE defaults to continuous SPIN in rev/s, every mark with its own speed and direction.
- **Keeps + recipes (#996, kc-r/2)** — K keeps without starring; clicking a keep recalls its tracks (recall + morph, one undo); share links, recipe text and keeps carry the whole layer stack.
- **Top bar (#1103, #950, #964)** — cold open, CUR and BEAT beside it; one expanding label (KIN / LOOKS / VOICE); tap pulse, sheen, letter-by-letter cooldown; BEAT is the BPM master clock with MODE/MOTION roll-scope chips and hero-first beat-quantized transitions (#951).
- **Rolls (#1107, #1108)** — the roller looks at the frame after a roll and silently re-deals if it's dead; chaos roll never deals a dead frame (bottom blend, INVERT, HAZE).
- **MIDI (#617)** — Web MIDI engine merged (mappings saved in the project, connection status, 9-pad test project). Learn/bind remainder still open; BLE-MIDI path needed for iPad.
- **Palette lab (#952, #953)** — generate / edit / save / import / export wing; 37 palettes hooked into KIN click + strip.
- **WET engine (#970, #1078)** — WETNESS slider, vortex-particle core, ambient eddies, wet pigment mix; WET is now a standalone service and ACCUM is one consumer.
- **MATH (#1010, #724)** — MATH track type with 12 tone ops on the FX fold; assignable math-macro knobs over fine-grain sliders.
- **Pipeline (#1051, #1059, #607)** — export-everything bundle (one file out, one file in); STAGE Phase B fullscreen live output window.
- **FX (#1022)** — SHARPEN and HAZE fill the Blur / Focus slot.
- **Stimuli (#980)** — one-tap auto-setup and dead-route retune.
- **HITS (#966)** — queue transport: autoplay + tap-to-jump.
- **DLA / Eden (#720, #793)** — growth sampler, lifecycle policy for living forms, picker tiles + LIVING REEF look.
- **Design system M1–M8 (#1027–#1033)** — one slider, system glyphs (no retired emoji), casing in CSS, pink = live / green = paused / amber = fault, one density scale, one LOIS line per panel, zero radii + one dropdown style. Help modal (#1043).
- **Docs** — personae/affective research set (`docs/research/`), DIRECTORS copy matrix + interactive mockup, BUILD payline research, topbar mockups, palette-row mockup.
- **Tooling** — iteration gate (3 selfcheck / 3 playwright / 3 QA), clock inventory + selfcheck, swarm/accum/atlas inventories, e2e de-flakes.

## Current — Pipeline, audio routes, light (2026-10-01)

Everything merged to `main` since the 2026-09-28 sync.

- **Pipeline SETUP + STAGE (#606 #607 #608, #827)** — canvas presets, W×H lock/swap, capture fps; the live raster and scene units follow the authored size (a new aspect reveals canvas, never scales content; the 1000×700 instrument default is unchanged). Stage preview / fullscreen (Tauri stage window native) / Syphon status (honest not-linked).
- **Audio as data (#790 PR1–4, #613, #615, #618)** — route table engine with default parity; `audioRoutes` is saved, undoable project state; METER hero with seven named bands; editable MATRIX (band, target, depth; ≤16 routes); FEEL presets; FILE source + `kc-audio-envelope/1` sidecar.
- **Director (#830, #616, #717, #734)** — DAVIS renamed Director; regrouped VOICES / GENERATE / PERFORM with live EVOLVE progress; flagship voices moved here, load-only, with ✎ fork dish into MY VOICES.
- **Light and mass (#594 1–3/5, #704, #741, #740, #532)** — the one CHIAROSCURO sun, bevel normals + tight spec, squash-and-stretch, DARK GLASS voice, gate weave, FXAA as governor cut 0, ACES + Bayer resolve.
- **Motion (#781, #558, #796, #807–#821, #763, #711, #710)** — kinemes (Build A, Build C UV window), per-node uniqueness at instantiation, diorama parallax, remainder clocks, ACCUM feedback guard, seek/flee in swarm mode, lorenz re-entry.
- **Colour + shapes (#632, #733, #735, #716)** — FADE per-node transition, 4-state shape mixer, taxonomy LOOK/VOICE/SYSTEM/CAST, Curator cluster in the top bar. An FX slot reads as a TX-6 tile: abbreviation, ✕, glyph, one mode word. Wind, breath, flap and life wear a live-glyph tile: the pictogram tracks the slider, with a big number and a lowercase label. Track rows head with a numeral tile (KC I–IV, FX 1–4); the edited track inverts.
- **Curator (#762, #719, #793)** — Taste v1 + `taste.json` import, named recipe features on keeps, biology lifecycle policy, taste validator.
- **FX (#732, #744, #745, #520)** — one family per FX stack slot, signed grain, RGB split keeps source alpha, FX rack UI.
- **Samplers (#586–#592)** — truchet, voronoi scatter, l-system, OKLCH grade, displace domain-warp, Markov weights, euclidean phrase clock.
- **Reverted:** asset sub-animation frame strips (#699, #782).
- **Pixel glyph stamp pack (#702)** — 32 modular 7×7 lattice stamps (emblems, stem-left letterforms, sibling variations, speck fields). Fill-only token paint. Contact sheet: `docs/pxg-contact.svg`.
- **Tooling** — CI parallel jobs + Playwright cache (#747); e2e de-flakes (#769, #788, #798, #805); hardware research (#785), KINEME handoff (#783).

## Current — KC-1 review queue (2026-09-28)

One-PR-at-a-time review lane. Builders build, Matt looks and merges.

- **Phyllotaxis sampler + DIVERGENCE slider (#673)** — fibonacci's sibling: the golden-angle family with the divergence exposed. At 0° it's bit-identical to the phi tile; the DIVERGENCE slider (−20°…+20°, BUILD panel, mode-gated) re-counts the visible spiral arms live.
- **Lorenz-ride behave row (#671)** — seventh BEHAVE mode: each agent rides an independent Lorenz trajectory (`lorenzRho` 28, `lorenzGain` 0.05). Below rho ~25 it settles; ~40 goes wild.
- **Asset Studio merge (#698)** — merge with chamfer + live blend preview.
- **INJECT color mode (#689)** — the field dyes first, agents catch up. Joins FADE and WASH (#682, soak from the middle outward) on the palette bar.
- **Halo / chiaroscuro (#715)** — soft wide bloom + vignette tuned for dark grounds; CHIAROSCURO palette (#709) and sparse-facet preset (#714).
- **Living boot (#713)** — First Light starters: the instrument wakes up playing.
- **Joiner/leaver (#694)** — obvious face / invisible face pairing.
- **TE-limited gradients, per-asset opt-in (#708)**; Rendah style pack: 5 palettes + 6 presets + 3 Plenum recipes (#696); Micro-HUD ornament pack (#697); Letterform asset pack A–Z 0–9 (#700).
- **Tooling** — DEV panel merges Shader Lab + X-Ray + Gov Tune (#692); before/after visual diff for PR review (#693); build board (#684); PR review cockpit (#686).
- **Closed unmerged: #690** — dirty-range uploads measured ~0.3% savings; not worth the 311-line complexity. The #685 byte meter stays.
- Fixes: shape transitions play a per-node move vocabulary (#679), palette-import fallback ids (#683), upload-byte meter (#685), e2e cache-verify independent of wall clock (#687), audio envelope contract docs (#688), teamLab people-detective research report (#718).

## Stage 0/1 (2026-09-23)

Night Migration 30/60 sign-off recorded — embargo lifted for Stage 1 (`docs/EMBARGO.md`).

- **Engine spines A–G** — dt clock, atlas-cell skip, heading spring + ballistics + life, live mask tint, mode-chip dissolve + slider springs, shared noise + curl wind, bufferSubData.
- **Governor R1–R4** — one tape readout, instrument-named shed stages, FULL/SHOW/LEAN budget knob, registry-driven FX-stack weight.
- **Tracks** — PATCH strength sliders + inline live readout, stable-id targets, patch round-trip + 4-track cap on load, MOD steering (source motion retunes weights), one shared scent field, patch matrix overview.
- **Gate cuts** — `materials.js`, `glyphAtlas.mjs`, null `QualityRow` mount removed; shimmer prototype accepted, sidecar still deferred.
- **Roadmap + research** — `docs/ROADMAP_V1.md` (staged to v1.0), `docs/BENCHMARK_REPORT.md`, render/biology 1–8 opportunities placed.
- Open and ordered: evolve jitter (#471), BEHAVE weights (#479), ballistics shaping (#503), motion factors (#515–#519), EF rack (#520).

## Unreleased — one WebGL instrument (2026-09-17)

The SVG split is gone: the live canvas renders through the same WebGL2 GPU
pipeline as the exported stills — one instrument, no preview/final mismatch.
The old SVG emitter survives in-repo only as the dev-only parity reference,
excluded from the shipped bundle (enforced by `gl/phase6.selfcheck.mjs`).
Parity is still proven by a headless selfcheck on fixed seeds (Matt's bar:
under 10% pixel difference is a pass — this is art, not rocket science).

- **Live WebGL loop (#224)** — the visible canvas renders through the same GPU pipeline as stills (`app/src/gl/liveLoop.mjs`): real GPU pixels for PNG captures, same scene contract the export path consumes.

- **Phase 0** — GL scene contract (`docs/GL_CONTRACT.md`) + parity harness, wired into `npm run selfcheck`.
- **Phase 1** — texture-atlas asset rendering on WebGL2.
- **JS↔GL bridge** — `app/src/gl/bridge/` ships JS state into GL textures.
- **Shader debug harness** — dev-only GLSL tooling (compile diagnostics, flag pass, tap points, printf strip, GPU timer); Shader Lab panel lazy-loads behind `import.meta.env.DEV`.
- **Effect-authoring template** + shared GLSL chunk library — one effect = one fragment shader + one param descriptor.
- **Phase 2** — GPU FX library: rgbSplit, displace, tear, grain, blur, scanlines, posterize, invert, solarize, edge as GLSL passes.
- **Phase 3** — layer compositing + mattes on the GPU.
- **Phase 4** — GPU accumulation (ping-pong textures) + bloom / halation / blur-over-time optics.
- **Glow system, no gaussian blur (#308)** — the instrument's gaussian blur is gone: ACCUM optics now run mip-chain bloom + stipple diffusion + a slight chromatic RGB offset. The FX roster's Blur entry is dead on the GPU path until #310 cuts it from the UI.
- **TE removal cuts (#310)** — the heaviest taste call in the batch: controls leave, capabilities stay. Cut from performer sight: the FX roster's Blur entry (dead since #308), the QUALITY tier switcher (one ceiling; the governor sheds — tier data stays for #296's budget ceiling), the dead VIDEO (soon) button, the duplicate CLEAR ACCUM (GHOST STATION's gesture row is canonical), all per-parameter dice, and the global blendMode select (state kept; the engine contract falls back to 'normal'). Demoted to voice properties (settable via presets, not live knobs): Z-TIERS, NOISE FREQ, DISPLACE, ACCUM GLOW, paletteShift (MATERIAL/SHADING were already voice-only). Demoted to hidden defaults: SHIMMER (whisper stays on), AUTO-SNAP (off), SMOOTHING (already inert). BG cycle moved to OUTPUT; GRID/LIST is a remembered preference; audio source row collapses into setup; the DavisPanel favorites list leaves (bottom tray is canonical). Earn-back rule: nothing returns unless a performer reaches for it mid-set and it's not there, or Matt's eyes miss it on the demo.
- **Phase 5** — finals via GPU readback (`app/src/gl/exportStill.mjs`): 1×–8K PNG + JSON sidecar, off-store — the old flip-then-restore mechanism is deleted. resvg retired from finals; the SVG emitter is now a dev-only parity reference.
- **Phase 6** — SVG renderer removed from the shipped bundle; governor retuned (resolution sheds before effects — see `docs/SHOWRUNNER.md`); `maxFxLayers` budgets retired; shed states are always reported, never silent.
- **Quality pillars (#168)** — one kernel, one seed; finals off-store; caps hold; substitutions recorded in the sidecar.
- **Moth bodies remainder (#109)** — second blend ladder + u-driven paint.
- **Organism contacts (#167)** — radius, repel, bounce, swap, breed through one integrator (no second physics engine).
- **Overlay QA (#134)** — ingest/overlay selfchecks wired into the normal selfcheck command.
- **VORTEX RWB preset (#178)** — kaleidoscopic red/white/blue ribbons (fibonacci + soft blobs + displacement; see `docs/VORTEX_RWB.md`).
- **KILN COLUMNS preset (#179)** — lathe-like organic stacks on a dusty matte palette (see `docs/KILN_COLUMNS.md`).

## 0.9.0 — 2026-09-15

### Kernel v1 (sleeper math backend)

**Seed-driven looks change.** Project JSON still loads; re-favorite hits if a seed no longer matches your eye. There is **no** dual legacy RNG path.

- **K0** — Channel RNG (`dens` / `geo` / `attr` / `asset` / `color` / `noise` / `dyn`). Index-stable density skips and attributes; per-index geo streams; index-stable asset + color picks (#58).
- **K1** — Instanced Simplex/fBm via `createNoise(seed)` (no shared global perm table). Placement displacement + particle wind use isolated instances (#59).
- **K2** — Sampler registry (`getSampler` / `registerSampler`). All layout modes migrated; power sampler **`stratified`** (jittered stratum, seed-stable) (#60).
- Golden placement fixture retargeted to **`kernel.v1`** hash `e892d112…a9a2` (#58 / #61).

Plan: [docs/KERNEL_V1_PLAN.md](docs/KERNEL_V1_PLAN.md). Post-MVP: fields (#62), bake particles (#63), color channel (#64).

### Docs / CI
- README reproducibility updated for index-stable channels.
- Architecture documents kernel modules under `engine/kernel/`.
- `npm run selfcheck` includes rng + noise + sample checks.

## 0.8.0 — 2026-09-15

### Engine / export
- Pure **`buildPlacements`** shared by live preview and final render (#32).
- **RENDER FINAL** with optional **UNCAPPED** density lift (#24).
- **Project document** v1 (seed, palette, layout, assets, weights, quality) + localStorage autosave (#33).
- Runtime **asset weight overrides** + category bulk mix UI (#34).
- **Batch edition** — N sequential seeds → PNG + JSON sidecar (max 48) (#29).
- **Accumulation buffer** — HYPE-style trails; SNAP/RENDER capture the pixel buffer when ACCUM is on (#28).

### UX / performance
- **Hits setlist** — ordered tray, Enter advances, reorder, morph-to-favorite (#35).
- **Perf LOD** — stable placement keys, enabled-only SVG symbols, gloss skip under PERF / high node count (#36).

### CI / quality
- **`npm run selfcheck`** — determinism + **golden placement SHA** fixture (#37).
- **Playwright smoke** — load app, switch tabs, toggle layout param (#37).
- CI: lint → selfcheck → build → e2e smoke.

### Chore
- Removed legacy `KineticCuratorUI/`, `KineticCuratorSketch/` content targets, `design_handoff*` (#38).
- Reproducibility contract documented in README + architecture.
- Known limitations: [docs/BUGLIST.md](docs/BUGLIST.md).

## 0.7.0 — 2026-09-13

### UX
- **Right-column tabs** — Layout / Assets / Stimulus / Davis / Output; last tab persisted (#13).
- **First-run “Play Me” overlay** (#12).
- **Floating Favorites / Hits tray** — 1–9 recall when focused (#8).

### Chore
- Architecture docs aligned with Zustand slices + composition root + event bus.
- Package version bumped; basic CI (lint + build).

## 0.6.0 — 2026-09-13

- Event-bus panel communication; Layout / Davis / Stimulus emit-only subcomponents.
- Composition root (PanelRegistry + Shell + dispatchPipe).
- Placement modes split; Canvas hooks extracted.
- Morph evolve, phrase loop, tooltips on RangeRow.
