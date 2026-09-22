# Claude — read this first

This repo's coding-agent contract is [`AGENTS.md`](AGENTS.md).
The engine connect-the-wires spec is [`docs/ENGINE_PLAN.md`](docs/ENGINE_PLAN.md) — **closed**, all §6 acceptance boxes checked, issue #386 closed. Do not reopen or re-implement spines A–F (#387–#392), MOD (#382), MIX stepping (#381), preset MIX (#379), FIELD (#373), or FEED (#370).
What is actually wired vs only looks wired: [`docs/SURFACES.md`](docs/SURFACES.md).

**Current work: [#248](https://github.com/NeuralIO444/Kinetic_Curator/issues/248), the 7→4 panel consolidation.** Phased implementation plan: [`docs/PANEL_CONSOLIDATION_PLAN.md`](docs/PANEL_CONSOLIDATION_PLAN.md) — read it before opening a branch. Land phases strictly in its §4 order (Phase 0 docs rules first); do not start phase N+1 until phase N is merged. The plan flags several open questions (§2) that need Matt's nod, not an agent's guess — most importantly: **get his go-ahead before starting Phase 1** (the embargo's status re: panel-moving code is genuinely ambiguous, see plan §2.2).

`docs/EMBARGO.md`'s feature embargo is **still in effect** — Matt's Night Migration 30/60fps sign-off is not yet recorded in that file. Panel consolidation is relocation, not a new feature, but confirm with Matt rather than assuming that distinction clears it.

If a chat prompt disagrees with ENGINE_PLAN §0 or PANEL_CONSOLIDATION_PLAN §0, the plan wins.
