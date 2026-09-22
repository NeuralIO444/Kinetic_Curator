# Claude — read this first

This repo's coding-agent contract is [`AGENTS.md`](AGENTS.md).
The engine connect-the-wires spec is [`docs/ENGINE_PLAN.md`](docs/ENGINE_PLAN.md).
What is actually wired vs only looks wired: [`docs/SURFACES.md`](docs/SURFACES.md).

**Spines A–F (#387–#392) are merged and closed.** Do not re-implement any of them. Do not re-implement MOD (#382), MIX stepping (#381), preset MIX (#379), FIELD (#373), or FEED (#370).

Next open, unblocked engine-adjacent work: **#341** (4 FX slot cap) — the tape pre-flight (#342/#383) that gated it is merged.

Spines C–F landed as direct pushes to `main`, not individual reviewed PRs like A and B — see `docs/SPINE_REVIEW_C_F.md` (a post-hoc batch review) and verify the acceptance boxes in `docs/ENGINE_PLAN.md` §6 before building on top of them.

`docs/EMBARGO.md` and `docs/SURFACES.md` are dated 2026-09-19 and predate this merge — treat their "not live yet" tables as stale until someone updates them.

If a chat prompt disagrees with ENGINE_PLAN §0, the plan wins.
