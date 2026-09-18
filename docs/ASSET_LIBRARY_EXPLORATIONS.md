# Asset Library Explorations — future directions

Ranked by artistic leverage, not ease. Context: 137 canon assets / 7 categories, 4 experimental shelves being filled (Phase A), SVG→WebGL texture bake, per-asset cost scores feeding the governor, 32-cap user overlay, motif-kit Studio, issue #221 (community preset sharing, parked), issue #280 (mode personas, each voice gets a curated asset subset).

**The thesis underneath all of these:** the library is not a sticker book. It's a cast of performers, and the curator's job is casting.

---

## 1. Voice shelves — a curated asset subset per mode persona

**What it is.** Each of the three flagship voices — Swarm, Hype, Murmuration — gets its own shelf: a curator's cut of 20–40 assets that *are* that voice. Switching from Swarm to Hype doesn't just change the geometry and palette; the entire cast of marks changes. Swarm's shelf is all ink-fleck dots and wobble strokes on deep indigo; Hype's is hard-edged graphic shards in acid color. The mode chip becomes a complete artwork state, and the MIX crossfade blends the casts.

**Why it fits.** This is the curator dynamic made structural. The Davis side says "what's worth keeping" — a voice shelf is a kept set. The TE side says "deliberate limitations" — 30 assets per voice is a constraint that forces taste. It also makes the empty-shelves complaint impossible to recur: a shelf is either voiced or it doesn't ship.

**What it takes.** Mostly data: subset definitions per persona (lists of asset IDs, not copies — they must stay in sync with canon). A "SHELF" view in the Assets tab showing the current voice's cast. Phase E of the plan already names this; it wants Phase A done first.

**What could go wrong.** Subsets drift from canon (an asset gets retired, the shelf references a ghost) — mitigate with ID lists validated at load, never copies. The deeper risk is voicing-by-committee: eleven stubbed modes each get a shelf and nobody curates them, so they all converge on "everything on." Gate it: a shelf ships only when someone (Matt) signs the cast.

---

## 2. Living assets — marks that evolve during a performance

**What it is.** Assets with a second parameter: time. A wobble stroke whose wobble deepens over minutes; a hatch cluster that slowly rotates; a "weathered" mark that accumulates grain the longer the set runs. The artwork visibly ages under your hands — start a set with clean geometry, end it with something worn and alive. Not animation (the loop already moves things); *change*. The cast matures.

**Why it fits.** "Controlled chaos" is the Davis creed, and this is chaos with a direction. The TE lens loves it too: one authored mark, infinite performances, zero new UI surface — the evolution is a property of the asset, not a knob. It also gives long sets a narrative arc, which is what separates a VJ tool from a screensaver.

**What it takes.** Bake-time variant generation: each living asset carries a seed and an evolution curve, and the pick logic advances the phase slowly (minutes, not frames). A per-asset "LIVING" badge and maybe one global "EVOLVE" amount. Pipeline work, but bounded — it's a variant axis, not a new system.

**What could go wrong.** It becomes visual noise if the ranges are loose — a hatch that rotates 360° in a minute is a gimmick; one that drifts 15° over a set is weather. Tight ranges, curated per asset, and an off switch that is actually off. Also: living assets must compose with ACCUM trails and the governor without per-frame cost blowups — evolve the *pick*, not the shader.

---

## 3. Taste cross-pollination — kept renders promote assets

**What it is.** The taste system already learns from kept renders. Close the loop into the library: when Matt hits F to save a frame, the assets visible in that frame get a "kept" ledger entry. Assets that show up in kept renders earn weight (their H/M/L pick bias nudges up); assets that never appear in anything kept get flagged in a quiet "NEGLECTED" review list. The library learns what the curator actually keeps. Over months, the cast self-prunes toward his taste — and the neglected list is a curation prompt, not an auto-delete.

**Why it fits.** This is the two-adversarial-dynamics thesis with the loop closed: the Davis dynamic (taste, "what's worth keeping") now acts on the asset pool itself, while the TE dynamic (governor cost, "what can we afford") keeps acting on performance. Neither side wins outright — the tension *is* the product. It's also the only idea on this list that makes the library better without anyone authoring anything.

**What it takes.** Logging (which assets were live at keep-time), a small ledger, weight-nudge logic with bounds, a "loved"/"neglected" badge in the Assets tab. No pipeline change; it's bookkeeping plus one UI affordance.

**What could go wrong.** Popularity feedback loops homogenize everything — the five assets in every kept render get heavier and heavier until the library is a monoculture. Mitigate with a diversity guard: the nudge caps out, and the governor's thinning already removes expensive variety first, so watch that the two systems don't conspire to delete the weird stuff. Taste needs its eccentrics.

---

## 4. Mutations — one mark, twelve moods

**What it is.** Every canon asset gets parametric variations generated at bake: rotation/shear seeds, wobble depth, weight shifts, mirror states. One authored scribble becomes twelve moods — the same hand, different days. A shelf-level "VARIATION" amount controls how far the picker strays from the authored original. Scarcity of *authorship* with depth of *performance*: 137 authored marks, ~1,600 possible moods, zero additional curation burden.

**Why it fits.** Davis: the code is the artwork, and variation is the instrument's native language. TE: the limitation is "you get 137 marks" and the depth comes from the system, not the catalog. It's the opposite of a stock bin — a stock bin grows by adding files; this grows by multiplying meaning.

**What it takes.** Bake-time variant generation (seeded transforms at rasterization), variant-aware pick logic, one shelf-level dial. Pipeline work in the bake path; the atlas already handles per-combo rasterization, so variants ride the same machinery.

**What could go wrong.** Variants of a mediocre mark multiply mediocrity — twelve moods of a bad scribble is still a bad scribble. Curate the seeds: not every asset gets the full twelve; the curator signs off on which axes each mark is allowed to vary on. Also, variation must never break the token-paint contract — a mutated asset that stops responding to palettes is a bug, not a mood.

---

## 5. Community shelf — the #221 quarantine design

**What it is.** When community preset sharing (#221) lands, shared *assets* need a home that isn't canon. The COMMUNITY shelf: anyone's shared marks arrive here, sandboxed — sanitized through the existing ingest firewall, cost-budgeted, clearly badged as non-canon, one tap to preview in the pool, and a "promote" path that runs the same curation gate as Door 3 (Matt signs it into canon or it stays a guest). The shelf is a waiting room with taste, not a flea market.

**Why it fits.** The sanitization story #221 needs, expressed as library design. TE: the limitation is explicit — community content is *guested*, never merged silently. Davis: "share the code" is in the creed, and a quarantine shelf is how you share without diluting. It also gives the taste system something to do socially: community assets that get kept by many performers earn their promotion.

**What it takes.** The #221 pipeline first (sanitization + allow-list review, already scoped as parked work), then a shelf with distinct badging, preview-in-pool, and the promotion gate. Mostly UI + policy; the ingest firewall already exists.

**What could go wrong.** This is the highest stock-bin risk on the list, by design — it's an open door. The promotion gate is the entire idea; if promoting becomes one tap with no review, the shelf *is* the library within a year. Keep the gate human. Also: license hygiene on shared SVGs needs the same clean-room thinking as the glyph-fragments plan, or someone's font ends up in the canon.

---

## 6. Contact sheets — the print-desk bridge

**What it is.** The print desk already renders at size. Add one layout: the contact sheet — every asset in a shelf, rendered at print resolution in the shelf's voice palette, edition-numbered, on a single sheet. It's the catalog of the cast, the tour poster, the thing you pin above the desk. Each voice gets its sheet; each season gets its sheet. Perform → capture → print, closed.

**Why it fits.** TE products ship with beautiful documentation of their own constraints — the contact sheet is the library's spec sheet as art object. It also makes curation visible: a shelf you can hold is a shelf someone stands behind. And it's the natural artifact for the editions/seasons ideas below.

**What it takes.** Reuse the capture path at print size, one grid layout, edition numbering. The smallest build on this list after the shelf data exists.

**What could go wrong.** Scope creep on the print desk — one layout becomes six, then it's a publishing tool. Ship exactly one sheet layout and let the constraint be the aesthetic. Also, contact sheets of unvoiced shelves are just inventory; gate the sheet on the shelf being voiced (see idea 1's gate).

---

## 7. Duet assets — marks authored as pairs

**What it is.** Assets authored as call-and-response pairs: a bold stroke and its echo, a dot and its halo, a mark and the negative space it implies. The picker doesn't scatter them independently — when it picks one, the partner lands nearby (same shelf, spatial proximity, loose coupling, never lockstep). The swarm stops scattering confetti and starts scattering *relationships*. Compositional intelligence living in the library instead of the layout code.

**Why it fits.** Davis's work is full of paired marks — the conversation between two shapes is where the composition lives. TE: it's a limitation that creates style — "these two always travel together" is a rule a human curator would make. It also deepens the voice shelves: Hype's duets are hard graphic pairs; Murmuration's are a glow and its ghost.

**What it takes.** Pairing metadata on assets (partner ID + proximity rule), picker logic that places pairs with seeded looseness. Authoring: the curator authors or designates pairs. Small, contained, no pipeline change.

**What could go wrong.** Pairs read as repetitive if the coupling is too tight — the same two marks holding hands in every render is a motif, then a tic, then a joke. Seed the looseness generously: proximity, not choreography. And pairs must survive the governor's assetThin independently — if the partner gets shed, the survivor has to stand alone. Author pairs where either half works solo.

---

## 8. Seasonal shelf — the instrument has seasons

**What it is.** One shelf rotates quarterly: 12–16 authored assets appear with the season, perform for three months, then retire to the vault. Winter is ice-crystal shards and long-exposure grain; summer is heat-haze marks and overexposed whites. The instrument has a calendar. Renders made during a season carry its marks like a timestamp — you can date a piece by its cast.

**Why it fits.** Scarcity as a feature, and the most TE idea on the list: the limitation is *time*. It gives Matt a curation rhythm — four small authored sets a year is a sustainable practice, not a content treadmill — and it makes the library feel alive without growing it. Davis would approve of work that expires; impermanence is part of the medium.

**What it takes.** An authoring cadence (the real cost — 4×/year, small sets), shelf plumbing (activate/retire dates), the vault (idea 10). Everything else exists.

**What could go wrong.** It becomes a content treadmill the moment a season ships late and the shelf sits empty — an empty seasonal shelf is worse than no seasonal shelf. Mitigate: seasons are allowed to repeat (a beloved winter returns), and the shelf gracefully falls back to the permanent collection. Never ship a season to fill a date; skip the season.

---

## 9. Editions — numbered scarcity, print-world logic

**What it is.** Certain asset sets ship as numbered editions: "HALFTONE GHOST, edition of 12" — twelve variants, each numbered, the set retires when the edition closes. Retired editions live in the vault, still loadable in old projects, never pickable in new ones. The contact sheet (idea 6) carries the edition number. It's the print world's edition logic applied to a live instrument's cast.

**Why it fits.** TE adores deliberate scarcity — numbered runs, limited colorways. It makes the library collectible in the way prints are collectible, which matters because this instrument's whole economy is perform → capture → print. An edition is a promise: this exact cast will never perform again.

**What it takes.** Edition metadata (number, size, status), vault plumbing shared with idea 8/10, contact-sheet numbering. Mostly data + policy.

**What could go wrong.** Gimmick territory, fast — scarcity has to *mean* something or it's marketing. The promise must hold: retired means retired, even when someone asks nicely. And editions of weak assets are just numbered weak assets; the curation bar for an edition should be higher than for canon, not lower. If in doubt, don't number it.

---

## 10. The vault — provenance for a live instrument

**What it is.** The archive underneath ideas 8 and 9: retired seasonal sets and closed editions, browsable but not pickable in new work, always loadable in old projects. Every render records the asset-set version it used, so a piece from winter '26 can be re-rendered exactly. Provenance — the thing the print world takes for granted and live tools never bother with.

**Why it fits.** It's infrastructure, not art — but it's the infrastructure that lets the art ideas (seasons, editions) be honest. A "retired" asset you can't actually revisit is a lie; the vault makes the promise real. TE: the constraint is visible and documented. It's also the quiet fulfillment of "taste is versioned" from the product philosophy.

**What it takes.** Version metadata on asset sets, render manifests recording the set version (the run-manifest work in #240 is the foundation), a read-only vault browser. Real engineering, no artistic risk.

**What could go wrong.** Complexity for its own sake — if seasons and editions never ship, the vault is a museum with no exhibits. Build it only when idea 8 or 9 is real. Until then, it's a paragraph in this doc, which is where it belongs.

---

## The ranking, in one breath

1. **Voice shelves** — makes the personas real; the mode switch becomes an artwork switch.
2. **Living assets** — the instrument breathes; pure Davis, zero new UI.
3. **Taste cross-pollination** — the curator engine curates the library itself; closes the loop.
4. **Mutations** — depth without bloat; 137 marks, ~1,600 moods.
5. **Community shelf** — the #221 quarantine design; the promotion gate is the whole idea.
6. **Contact sheets** — perform → print, closed; the catalog as art object.
7. **Duet assets** — compositional intelligence in the library; relationships, not confetti.
8. **Seasonal shelf** — the instrument has a calendar; watch the treadmill.
9. **Editions** — numbered scarcity; only if the promise holds.
10. **The vault** — provenance infrastructure; build it when 8 or 9 is real.

**Suggested sequencing:** 1 rides Phase E (already planned). 3 and 4 are the two highest-leverage builds after the fix phases — both are mostly bookkeeping/bake work, no new art direction needed. 2 is the one to prototype as an experiment first (three living assets, one set, see if it sings). 5 waits on #221. 6–10 are the print/season economy — real, but later.
