# Audit — what a connected local model (MegaMind) changes across KC-1
2026-10-14 · DRAFT · companion to the MegaMind local-model plan

**The law the audit reveals: a local model changes everything that
reads, judges, names, or remembers — and nothing that renders, counts,
or keeps time.**

Method: walked the full app surface (curator, engine/kernel/organisms/
placement, fx, gl, panels — canvas/davis/layout/output/stimulus, state)
against the open-issue ledger (29 open). Each area: what a connected
Ollama model changes, gated by which capability (cadence tier, vision
badge, embeddings), or why it never changes.

## Changes materially (model-gated)

| Area | What changes | Gate |
|---|---|---|
| Trio personas (#1462–#1464) | The core: real verdicts, lines, invented states on every eligible bar instead of interim rules | tier A/B |
| Left4Dead Director (#1145) | Gains honest peak/relax pacing from session history — the half a rules table can't do (plan §0c) | tier B/C |
| LOIS judging renders (E4 #1508) | Personas judge actual stills, not metadata — prospecting + variant offspring pre-judging (E5) | vision |
| Explorer miner (E2) | Model-directed sampling: corner proposals, variant breeding direction, "why this finalist" notes grounded in measured features only | tier B+ |
| Loot folder ingest (#1479) | Vision model describes/tags dropped-in loot at ingest (category, palette, caption) — ingest is offline-cadence, ideal model work | vision |
| Library / DLC metadata | Auto-classification of new assets (category/role/tags — the exact metadata the dice scorer reads). A tagging model removes the hand-tagging bottleneck that helped starve the dice funnel | tier B |
| Keeps & taste surface | Narration only: dev-panel taste summary in words (from taste.json numbers, never altering them); crown-time keep notes/captions drafted for editing; Look-name suggestions (deadpan law — suggestions, Matt's word lands them) | any tier |
| Replay + retro capture (#1461, #1367) | Post-set recap: trio review the take after playback (personas stay muted DURING playback per #1461); "what just happened" summary on a retroactive capture, from the event log | any tier |
| Trio audio direction (#1483) | Model conducts at section cadence — reads spectral FEATURES (features conduct; never raw audio) and chooses route emphasis; may propose patterns for the Queen's library (#1475, silent-first per that issue) | tier B/C |
| Semantic search (new axis) | A local embedding model adds meaning-distance beside feature-distance: "more like this keep," "find the spiky ones," a semantic novelty axis for the miner. Settings gains an optional second model slot (embeddings) — deferred like the rest | embeddings |
| Onboarding / help | A guide answering from the wiki/README corpus, retrieval-grounded, no invented features — the visitor-facing payoff of docs the project already maintains | any tier |
| Accessibility | On-demand spoken/printed description of the current frame — a capability only a vision model adds | vision |
| Dev panel | Telemetry narration: "why did the governor shed at bar 64" answered from the event log; census readout summaries. Narration of real data only | any tier |

## Changes a little (offline suggestions; the machinery stays rules)

- **Dice / Q1 funnel** — judging trays moves to renders via E4; the
  dealer stays rules. Q1 itself stays parked: the funnel is a
  scorer-design question, model or not.
- **Petri dish ecology** — model may propose scenarios/presets offline;
  the simulation stays deterministic rules.
- **Per-region animation (#1431–#1435)** — model may draft region
  kineme assignments as a preset; playback unchanged.
- **Output / print / Syphon (#608)** — captions and show notes for
  exported sets; the render path unchanged.
- **Kinetic type / glyph work** — persona-voice copy lines for stamp
  text (short, tier-gated); the glyph engine unchanged.
- **MIDI learn (#617)** — essentially no: latency and it's a mapping
  task. Offline mapping suggestions at most; listed for completeness.

## Never changes

- **Governor, telemetry, shed logic** — honesty + determinism; the
  model narrates the log, it never writes it.
- **Render engine / GL / kernel / placement math** — models never touch
  pixels or anything per-frame.
- **Selfchecks, goldens, CI** — the gate stays model-free, forever.
- **Taste training** — MLX offline on Matt's Mac Studio (#1173);
  taste.json is read-only to every runtime backend.
- **The Queen's surface** — there isn't one. She stays effect-only
  under every backend.
- **Bake / stills** — stills = live; no model ever sits between a keep
  and its bake.
- **The 16-Look cap, the keep ledger, scarcity law** — a model can
  propose; only a person's crown disposes.

## Settings implication
One model slot covers the House recommendation (Qwen3-VL 8B = text +
vision in one). Embeddings are the only second slot the audit found
worth having, and they're optional — the audit's advice is to design
the slot interface for two, ship one.
