# Persona → MLX training pipeline

Planning doc — not committed to the repo. The Curator button today tastes
candidates with a persona-weighted scorer (`app/src/curator/taste.js`):
honest, measurable, but not ML. This doc describes how the personas become
synthetic training data for the real MLX taste model, and what has to
happen before any of it is real.

## The honest constraint, first

True MLX-curated picks are impossible until Matt runs the Mac Studio
runbook (`docs/MLX_CURATOR_RUNBOOK.md`): install the curator env, embed a
batch of renders, label keep/pass, train, rank top-20. Until those steps
run there are no embeddings and no trained ranker — nothing in this doc
replaces that. The persona scorer exists precisely to make the button
interesting while the model doesn't exist yet.

## What the runbook's train step needs

Per `docs/MLX_CURATOR_RUNBOOK.md`, training consumes labeled pairs:

- **Input:** SigLIP embeddings (1152-dim, `mlx-community/siglip-so400m-patch14-384`) of rendered scenes, exported by `studio/curator.py` into `.npz`.
- **Labels:** keep / pass per render — the two-ledger rule: the model learns from **kept renders only, never clicks**.
- **Output:** a taste artifact the app's MLX curator loads to rank the 8 candidates at press time (plugs into `getActiveCurator()` in `app/src/curator/curate.js`, same engine contract as the persona scorer).

The bottleneck is labels: Matt has to look at renders and say keep/pass,
one by one. That's the cold-start problem this pipeline addresses.

## Turning personas into synthetic labels

Each persona file (`~/workspace/your_files/personas/<slug>.md`) already
reads like labeling criteria — that's deliberate. The Loves/Avoids
sections are keep/pass rules stated in prose. The pipeline:

1. **Render a batch.** Drive the instrument headlessly (or via the studio
   harness) to produce N scene renders spanning the param space — dense and
   sparse, calm and chaotic, the full range the Curator's 8 candidates draw
   from.
2. **Embed.** Run the runbook's embed step on the batch → `.npz` of
   1152-dim vectors. Same format as real data; the train step can't tell
   the difference, which is exactly why step 4 matters.
3. **Label synthetically, per persona.** For each render × each persona,
   produce a keep/pass label from that persona's Loves/Avoids. Two honest
   options, in order of preference:
   - **Feature-scored (cheap, available now):** reuse the 15-feature
     extractor in `app/src/curator/taste.js` on the render's params and
     threshold the persona dot-product → keep/pass. No new machinery.
   - **VLM-judged (better, later):** show the render to a vision model
     with the persona file as the rubric and take its keep/pass. Closer
     to real taste, costs inference per pair.
4. **Flag every synthetic pair as persona-grown.** This is non-negotiable:
   each training row carries `source: persona:<id>` vs `source: user`.
   Synthetic rows are second-class citizens by construction.
5. **Train with the priority rule.** Real user keep/pass labels **always
   outrank** synthetic ones:
   - User-labeled rows train at full weight; persona rows at a discount
     (e.g. 0.25×) and are dropped entirely once the user has labeled
     enough real rows (threshold TBD after the first real training run).
   - If a user label and a persona label disagree on the same render,
     the user label wins and the persona row is discarded.
   - The trained artifact records its mix: `synthetic_fraction`,
     `persona_ids`, `user_rows` — inspectable in the taste vector, per
     the "taste vector is a first-class citizen" rule.

## Why this is legitimate (and where it isn't)

- **Legitimate:** cold-start bootstrapping. Ten coherent aesthetic voices
  labeling a batch gives the model a shaped prior instead of noise, and
  Matt's real labels correct it from day one.
- **Not legitimate:** letting persona taste *become* the taste. The
  personas are curated voices, not Matt's voice. The discount + decay
  schedule in step 5 exists so the model converges to him, not to an
  average of ten dead artists.
- **The UI must stay honest:** while any synthetic fraction > 0, the
  Curator hint should reflect it (e.g. `curated pick · mlx (persona-grown
  data)`), the same way it says `persona pick: <name>` today.

## What Matt must do on the Mac Studio (in order)

1. Run `docs/MLX_CURATOR_RUNBOOK.md` end to end on a real batch:
   `pip install -e ".[curator]"`, embed, **label keep/pass himself**,
   train, rank top-20. This is the unskippable step — everything above
   is scaffolding around it.
2. Decide the synthetic discount + decay threshold after seeing the
   first real training run (how many of his own labels make the persona
   rows redundant).
3. Only then: wire the trained artifact into the app's MLX curator slot
   in `curate.js`.

## Open questions (for Matt, not blockers)

- VLM-judged vs feature-scored synthetic labels for v1? Feature-scored
  is free and consistent; VLM-judged is closer to taste but adds a model
  dependency to the pipeline.
- Should each persona train its own taste vector (10 voices, user blends)
  or one blended model? Per-persona vectors fit the "voice" UI better;
  one model is simpler to ship.
