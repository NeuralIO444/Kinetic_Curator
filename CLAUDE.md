# Claude — read this first

This repo's coding-agent contract is [`AGENTS.md`](AGENTS.md).
The engine connect-the-wires spec is [`docs/ENGINE_PLAN.md`](docs/ENGINE_PLAN.md).
What is actually wired vs only looks wired: [`docs/SURFACES.md`](docs/SURFACES.md).

**Right now the only implementable engine issue is [#387](https://github.com/NeuralIO444/Kinetic_Curator/issues/387) (spine A, dt clock).**
Do not implement #388–#392 until A is merged. Do not re-implement MOD (#382), MIX stepping (#381), preset MIX (#379), FIELD (#373), or FEED (#370).

If a chat prompt disagrees with ENGINE_PLAN §0, the plan wins.
