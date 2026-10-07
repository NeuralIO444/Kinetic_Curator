# KC-1 Personae Triad — unified report (2026-10-07)

**Status:** design/spec codification. Build halt lifted 2026-10-07; iPad release is the roadmap (web v1 first, then port).
**Applies KC-1 DS** (GH #1121) · Extends #1126 (DIRECTORS)

## 1. The triad

Three personae, one instrument. Each has a nature, a gendered register, and a visibility contract:

| | KC-1 | The Directors | The Queen |
|---|---|---|---|
| Role | Notices | Argue | Listens, leans, seduces |
| Register | Ambient, no persona | Male-coded, visible | Feminine, invisible |
| Surface | Honest signals (top bar) | Faces, states, verdict strip, copy | Nothing. Never renders. |
| Wants | To be played | To be right / to roll | The room to feel glad you're in it |

**KC-1 notices.** The instrument itself pays attention — the top bar's honest signals, the header subtitle reading 'evolving'/'paused'. No character, no voice. The substrate the others stand on.

**The Directors argue.** LOIS (George Lois — the critic: NOD / VIBE / BURN / AWAY, fixed kaomoji face) vs Davis (Joshua Davis — the generator: FLOW / SEEDLING / UGLY / STUCK / BLOOM, generative kaleidoscope face drawn from the seed, rotating at state tempo). Same honest feed (rolls, keeps, passes, seeds, dwells), opposite philosophies: LOIS judges the product, Davis loves the process. 4×5 = 20 rooms with a full mutual-awareness copy matrix; the verdict strip names the room (THE CLASH / AGREEMENT / FULL BURN / DAVIS ALONE). Strong disagreement, always respectful — "the gardener" / "George". Panel renamed DIRECTOR → DIRECTORS.

**The Queen listens.** Feminine, behind the scenes, pulling the STIMULI strings. She sways both Directors toward the artist's own demonstrated taste — and she never renders: no face, no pill, no meter, no state, no name on the surface ("the Queen" is design-doc-only). Her hand is never caught. Five deniable sway mechanics, all bounded/relaxing/taste-anchored/unsurfaced: M1 nod-easing (sways LOIS), M2 temperature warming (sways Davis), M3 palette gravity, M4 beat-sway, M5 the lean-in. Tri-awareness = a hidden lean field (`lean_lois`, `lean_davis` ∈ [0..1]) over the 20-room matrix — copy warmth and behavior, never a label. She is the weather the rooms are in. She seduces you toward *your own* taste; if you changed, she'd follow.

## 2. MLX — three heads, one artifact

One training run on the Mac Studio, three training targets from the same keep events (never split the data — #926's sparsity warning stands). The live instrument stays dumb and fast; it reads the exported artifact.

- **LOIS's head — judgment:** keep vs pass. "Would he nod?" Binary, most data-efficient. Prove first (#762 runbook, #926 fidelity bar).
- **Davis's head — fertility:** which seed regions and roll trajectories produced keeps. Not "is this good" but "is this ground fertile?"
- **Queen's head — inclination:** session context at keep time — audio energy, palette warmth, dwell, time of night. What was in the air when you loved something. Her sway, learned. Last — a seducer trained on noise is a liar.

Export: one versioned `taste.json` with three sections. This extends the existing governor thesis (Mac Studio thinks, instrument enforces from cheap artifacts).

## 3. Design-system rules (new, from this work)

- **Frozen history renders TE** (from #1124): captures, keeps, and history are discrete → TE.
- **The seducer is never caught** (from the Queen): invisible personae act, never render — and no surface value, label, or readout may expose the sway. A hidden bias the user can find in the UI is a slider, not a seducer.
- **Visibility contracts:** Directors = visible affective (faces/states/copy). Queen = invisible affective (behavior/voice-at-transitions only). KC-1 = ambient (signals only).

## 4. Unified issue map (label: `personas`)

| Issue | Piece |
|---|---|
| #1121 | KC-1 DS contract (cite rules by number) |
| #1126 | DIRECTORS: Davis affective system, kaleidoscope, 20-room matrix, DIRECTORS rename |
| #1127 | Slider tap-name dialog + ROTATE spin default |
| #1128 | KINEME drivers default-on (four-layer control) |
| #1129 | Glass-body translucency material |
| #762 | MLX runbook → taste.json (blocked on hardware; now: three-head format) |
| #926 | Richer recipe features if fidelity < 0.3 (gates the heads) |
| DRAFT | The Queen: invisible affective persona (STIMULI & PLAY sway) |
| DRAFT | taste.json three-head MLX architecture |

## 5. Artifacts

- Research: `files/research/davis-affective-system-2026-10-07.md`, `files/research/queen-affective-design-2026-10-07.md`, `files/research/lois-affective-system-2026-10-07.md`, `files/research/slider-dialog-2026-10-07.md`, `files/research/kineme-default-on-design-2026-10-07.md`, `files/research/build-payline-system-2026-10-07.md`
- Mockups: `~/workspace/kc-topbar-mockups/director-davis.html` (interactive 20-room matrix, regenerating kaleidoscope, verdict strip)
- Repo: `docs/PERSONAE_TRIAD.md` (this report, via docs PR)

## 6. Open questions for Matt

1. Queen: truly never named on the surface — not even tooltip/manual? (Design: nowhere.)
2. Copy sign-off: the 20-line Directors matrix + her 5 STIMULI lines + "dance."
3. DAVIS vs alias on the surface (OVERLAP precedent vs LOIS precedent)?
4. Any user-facing sway amount, or is exposure betrayal? (Design: none.)
5. Her listening: MIDI too, or audio-only v1?
6. taste.json three-head format: spec now (before #762 runs) or after first single-head proof?
