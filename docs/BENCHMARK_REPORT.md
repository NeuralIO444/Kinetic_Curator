# KC-1 benchmark — comparables, gaps, TE & Joshua Davis verdicts

*Research report, September 23 2026. KC-1 v0.9.0, main `125d8ef`. Web research only — no code, no repo inspection by the researcher; all KC-1 claims were supplied from the repo side, all external claims are cited. Companion: [`ROADMAP_V1.md`](ROADMAP_V1.md), which places this report on the release timeline.*

**Corrections carried in from the research** (do not repeat these): there is **no evidence of any Teenage Engineering × Joshua Davis collaboration** in any public source; "Readyound" / "Amazetype" are not verifiable Davis works (Machine-A is a London fashion retailer); no tool called "Milk.run" was found.

---

## A. Comparable tools

| Tool | Positioning | Browser-native? | KC-1 better | KC-1 worse |
|---|---|---|---|---|
| **[Hydra](https://hydra.ojack.xyz/docs/)** | Live-codeable video synth, free/open ([github](https://github.com/hydra-synth/hydra)) | **Yes** | No code required; layered asset/palette/seed model; capture suite; performance governor | **Shareable URLs** (`?sketch_id=`), live-coding flow, camera/stream inputs, community |
| **[TouchDesigner](https://derivative.ca/UserGuide/TouchDesigner_Products)** | Node-based visual programming; professional VJ/installation standard | No | Zero-install, minutes-to-playable vs weeks, free (NC edition caps output res; [ladder](https://derivative.ca/UserGuide/Licensing) $300→$600→$2200) | Depth (3D, GLSL, NDI, MIDI/OSC), tutorial ecosystem |
| **[Notch](https://www.notch.one/)** | Real-time graphics for live VJ/VR/video | No | Free-in-browser vs [~$70 entry, ~$2,600/yr pro](https://vjgalaxy.com/blogs/resources-digital-assets/best-software-to-create-real-time-vj-visuals) | GPU-authoring depth, media-server deployments ([CDM review](https://cdm.link/notch-tool-explained-and-reviewed-for-mere-mortals/)) |
| **[vvvv](https://vvvv.org/)** | Visual live-programming for installations; free non-commercial | No | Instant access, no install friction | Installation-scale output; a different ambition |
| **[p5.js](https://p5js.org/) / Processing** | Code-first creative coding; p5 has a web editor with sharing; the pedagogy backbone | p5 editor: **yes** | Performance-instrument framing: audio clock, governor, presets — p5 is a sketchbook, not a stage tool | Teaching material, shareable sketches, community, code as surface |
| **[Cavalry](https://cavalry.studio/)** | 2D procedural/motion design; now free (Canva acquisition) | No | Live performance + audio-reactive clock; Cavalry is timeline/authoring | Procedural scene depth, docs, industry usage |
| **[Rive](https://rive.app/)** | Interactive graphics editor + runtimes; state machines | Editor: yes | Different job — KC-1 is a live instrument, Rive authors interactive assets | Publishing model; not a true comparable |
| **Max/MSP + Jitter** | Audio+visual patching classic | No | Zero-install, no subscription, far lower learning floor | Full audio environment, MIDI/OSC, patching generality |
| **[Vuo](https://vuo.org/compare)** | Mac/Win node-based live visuals | No | Price, platform reach | Node depth, live-video compositing |
| **Algorave stack ([TidalCycles](https://tidalcycles.org/) + Hydra)** | Free/open live-coded music + visuals with an actual event scene | Hydra: **yes** | No-code accessibility; deterministic recipes | **The scene.** KC-1 has no community layer at all |
| **Free browser-VJ cohort** — [Vortexia](https://vortexia.live/visuals/free-vj-software-browser), Noise Deck, Screen Sampler, Nodlin, [VVavy](https://vvavy.io/); see the [2026 mega-list](https://limeartgroup.com/the-mega-list-of-vj-software-and-tools/) | Free, no-install, browser VJ/audio-reactive tools | **Yes** | **KC-1's real peer set — and KC-1's seeded determinism + sub-seed streams + governor + capture suite is more rigorous than most of them** | They ship shareables/galleries or one-glance UIs; several do NDI/stream output |

**Honest read:** KC-1 is not competing with TouchDesigner/Notch/vvvv — different weight class. Its genuine competitive set is Hydra + the free browser cohort, and against *that* set the combination **determinism + governor + capture suite, all client-side** is unusual. The moat, if there is one, is **determinism you can perform with** — but only if it's transferable (B.1).

## B. What KC-1 is missing — ranked, user's POV

1. **Shareable state. (Existential.)** Hydra's culture runs on `?sketch_id=` URLs; KC-1 has seeds, recipes, FAVORITE, project export — and single-machine autosave. A deterministic system that can't be beamed to someone else is deterministic for an audience of one.
2. **No onboarding.** Dense unlabeled micro-UI with no tour = first five minutes are archaeology. Hydra opens on a working sketch + a functions index; TE treats the manual as part of the product ("*we do our own … instruction manuals … and presets*", [Möllerstedt](https://notes.catalog.works/posts/teenage-engineering-field-series-interview)).
3. **No MIDI/OSC** (#228, reopened for scoping). Table stakes for every professional comparable; mic→beat doesn't replace a clock input or OSC from a DAW.
4. **No sharing/community/gallery layer.** No embeds, no gallery, no remix. Davis built his reputation on community (Dreamless → Threadless; [Wikipedia](https://en.wikipedia.org/wiki/Joshua_Davis_(designer))).
5. **No code/script/API surface.** EVOLVE is auto-mutation, not authorship. Power users hit a wall.
6. **No mobile/touch pass** (#270, hardware-blocked).
7. **No live-output path** (projector/second display/NDI/stream). SNAP/FINAL/BATCH/WebM is a *capture* suite, not an *output* suite.
8. **Depth ceiling.** Sprite-instance layers + layout modes is a rich but finite grammar; the constraint is also the cage.
9. **No pedagogy/docs layer.** Processing/p5 own this axis outright.
10. **No disaster recovery.** Browser-data clear = total loss.

## C. Teenage Engineering verdict

*Grounded in [Kouthoofd, SFMOMA 2024](https://www.sfmoma.org/read/stay-curious-stay-naive-an-interview-with-teenage-engineering-jesper-kouthoofd/) and [Möllerstedt, catalog.works](https://notes.catalog.works/posts/teenage-engineering-field-series-interview).*

**What they'd nod at:**

- **Constraint as real design engine.** The 4-tab cap, fixed P01–P07 numbering, "constraints are the aesthetic" — same move, honestly executed. **The governor is the best instance**: a stated constraint that shapes behavior under load, exactly "get the most out of hardware to feel snappy."
- **Systems over styling.** Kouthoofd assigns meaning to color/shape ("*a triangle is always yellow…*"). If each chip type (mode/behave/palette) carries a fixed identity, this lands.
- **Abstraction over numeric fussing.** The chip/morph/EVOLVE model is on-ethos (Möllerstedt on 500-vs-498 fiddling: "*These abstractions force you to listen in a different way.*").
- **Free, in every hand.** Zero-install, browser-native, free — deeply TE-compatible.

**What would make them wince:**

- **UPPERCASE micro-labels are anti-TE.** Kouthoofd is lowercase-only, publicly and repeatedly ("*We also don't use capital letters… It's democratic.*") — KC-1 borrows the density of instrument panels but inverts TE's most publicized typographic rule.
- **Constraint without legibility is opacity.** No tour + unlabeled glyphs means the constraint serves the designer, not the user. TE ships the manual *as the product*; KC-1 ships the panel *as the mystery*.
- **No tactility path.** Mouse-only dense panel, no MIDI/OSC/touch — the "flat keyboard" dressed as hardware.
- **Finish.** Dense micro-UI reads as obsessive finish *or* cramped, with no middle state.

**TE verdict:** the philosophy is genuinely TE-aligned — one of the more faithful TE-flavored software arguments in the field. The execution details are what TE would flag in the first thirty seconds.

## D. Joshua Davis verdict

*Grounded in [Wired 2006](https://www.wired.com/2006/03/joshdavis/), [The Great Discontent 2013](https://thegreatdiscontent.com/interview/joshua-davis/), [Wikipedia](https://en.wikipedia.org/wiki/Joshua_Davis_(designer)).*

**What he'd value:**

- **The core model is literally his architecture.** Wired: "*five different drawings of a tree trunk, 10 types of leaves… then his code morphs the image*" — layers of asset instances + palettes + seeds + morphing. KC-1 is his composition-machine ported to WebGL. More "Davis" than Hydra (signal-flow, not composition) or TouchDesigner (graph, not recipe).
- **EVOLVE is the single most aligned feature** — "*The painting is never the same from one second to the next.*" Independent sub-seed streams = authored randomness, not a dice roll.
- **Open, giving it away** — "*I love giving stuff away… we have more to gain by sharing.*" Compatible, *if* recipes are shareable.
- **Community as engine** — he built the forum before the fame.
- **Surprise over polish** — "*Everything has become so perfect, it's a bit boring… I want it to surprise me.*" He judges output, not chrome.

**What would make him wince:**

- **Freezing the work.** His prints "*freeze the visual representation of his software*" and he called the contradiction out; the work "*wants to live in the machine.*" Capture-first framing misses his point — live loop foregrounded, stills as residue.
- **Closed systems.** No code path, no exportable recipes, no link-sharing = walled garden, the opposite of the DIY ethos he credits as his foundation.
- **Determinism without an audience.** Great conceptually, useless if the recipe can't leave the machine.

**Davis verdict:** the engine is the most faithful thing in this benchmark; he'd reject everything *around* it — the closed loop, the export-first framing, the absence of a place where people see and break your work.

## E. Bottom line

**Not mediocre — genuinely novel, but currently half a product, and the missing half is what makes it matter.**

- **The moat, named:** *browser-native, zero-install, zero-account, seeded-deterministic generative performance with a frame-rate governor and a full capture suite on one page.* Nobody in the free browser-VJ cohort pairs determinism with a governor; Hydra is code-first and stateless-by-URL; TouchDesigner/Notch/vvvv are paid installs a non-professional won't attempt.
- **The honest weakness:** all of that rigor terminates in one machine's localStorage. KC-1 built the most transferable state model in the category and didn't ship the transfer. It has TE's density without TE's manual, and Davis's engine without Davis's publishing.

**Single highest-leverage fix: shareable recipe URLs** — encode seed + sub-seeds + params + palette in the URL hash (`…/#r=8f3a…`); loads the exact composition anywhere, forever, zero account, zero server. One change, four doors: determinism → distribution, a gallery layer, a reason for FAVORITE, and onboarding-by-link. Runner-up for credibility: tour/manual re-aim + a lowercase label pass — but a tour teaches people a tool they'll never show anyone; a link makes the tool show itself.

*Placed on the release timeline in [`ROADMAP_V1.md`](ROADMAP_V1.md) — v0.12 "Share" stage.*
