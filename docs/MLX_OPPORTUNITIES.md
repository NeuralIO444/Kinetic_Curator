# MLX opportunities for Kinetic_Curator

Planning pass — September 17, 2026. Research only, no code.

## 0. Honest framing first

**The one architectural fact that shapes everything:** MLX is Python/Swift and
Apple-Silicon-only. Kinetic_Curator is a browser web app with a public Pages
demo. MLX can never run inside the app itself. Every MLX capability below is
therefore a **local superpower**: it runs on Matt's Mac Studio in the
`studio/` sidecar track (the "Tier 1+" local install from `docs/BACKEND_V2_PLAN.md`),
and its *outputs* — embedding indexes, taste weights, shortlists — are what
cross into the browser, mostly as plain data files. Anything that needs to work
in the public demo must work from precomputed data, or not at all.

**Where ML genuinely helps this instrument:**
- *Search over the generative space.* Matt can already generate infinite
  frames; his bottleneck is finding the good ones. That is an ML-shaped problem.
- *Learning his taste.* A personal like/pass model beats any generic "beauty
  score" — his eye, not the internet's average.
- *Zero-shot language queries over images.* CLIP-style models natively answer
  "find me the warm brutalist ones."

**Where it's gimmick (say no):**
- Generating the art itself with diffusion. The 137 hand-authored assets *are*
  the project's identity; the backend plan already ranks this last and gated.
- A generic aesthetic scorer. LAION-average taste is the opposite of a personal
  instrument.
- Real-time in-browser inference. Fights the architecture; the proxy/final
  split already says heavy compute leaves the browser.

**The head start nobody has to build from scratch:** `studio/curator.py`
already implements the taste-model pipeline (issue #75, `docs/BACKEND_V2_PLAN.md`
§B: *"The Curator — highest product value"*): batch-render PNGs → CLIP-embed →
label from HITS favorites → train a linear probe on his likes vs passes →
rank / "more like this". `studio/hits_bridge.py` already bridges app favorites
to labels. Today the embed step uses PyTorch `open_clip` — the plan literally
says "CLIP ViT-L/14 (MLX or Core ML, on GPU/ANE)". Porting that step to MLX is
the single most concrete opportunity on this list: same pipeline, no
multi-gigabyte torch dependency, faster on unified memory.

---

## Ranked opportunities

### 1. The Curator: personal taste model + recommendation engine ⭐ top pick

**In plain language:** The app watches which renders Matt favorites and keeps,
learns what his eye likes, then does three things: (a) scores a big overnight
batch of generated frames and hands him the 20 best, diversified so they're
not 20 near-identical frames; (b) "more like this" on any render — nearest
neighbors in embedding space; (c) recommends palettes/presets by predicted
taste score.

**Technical sketch:**
- MLX port of `curator.py cmd_embed`: replace `torch`/`open_clip` with
  `mlx-embeddings` (SigLIP, e.g. `mlx-community/siglip-so400m-patch14-384` —
  native Apple Silicon, no PyTorch). Benchmark embed throughput vs the current
  MPS path on the Mac Studio.
- Labels from `hits_bridge.py` unchanged: likes = favorited seeds (favorites
  already store `{seed, config.layout, config.palette}` and are re-renderable
  on demand); passes = other seeds in the same batch pool.
- Train: linear probe over frozen embeddings (dozens–hundreds of examples
  suffice — the plan's own estimate). Selection logic (`rank_indices`,
  `diversify`) is already written and selfchecked.
- Ship the taste weights + embedding index as data files (`.npz`). Cosine
  similarity in JS is trivial — "more like this" can work with zero ML
  dependency wherever the index ships.

**Data it needs:** His real favorites/HITS exports as positives (exists the
moment he exports them); batch pools as passes (`studio.py batch` already
renders these). Cold start: preset corpus + existing finals
(`docs/kiln-columns-final.png`, `docs/vortex-rwb-final.png`).

**Integration shape:** Sidecar only (Tier 1+). No browser changes in Phase 1;
the shortlist is an HTML page or a folder of PNGs he eyeballs. Later: an
optional "TASTE" affordance in Ghost Station fed by precomputed scores.

**Effort:** S–M (2–4 days). Half the pipeline exists; the work is the MLX port,
the benchmark, and running it on real data.

### 2. Smart EVOLVE guidance

**In plain language:** Today EVOLVE mutates parameters purely at random
(`generateLayoutTargets` in `paramUtils.js`). With a taste model, the machine
proposes mutations *biased toward what Matt actually keeps* — fewer dead
evolutions, more "ooh" moments per session.

**Technical sketch:** Two gears, both cheap at showtime because the model is a
linear probe (a dot product):
- *Offline gear:* overnight, score a large candidate pool; EVOLVE draws its
  mutation targets from the top of the pool instead of uniform random.
- *Online gear (later):* sample K candidate mutations, render thumbnails
  headlessly, embed + score, morph toward the winner. Only viable once the
  headless render farm (issue #74) is fast — otherwise it stalls the live loop.

**Data:** Same taste model as #1. No new data collection.

**Integration shape:** Ghost Station PERFORM section; a "TASTE" toggle next to
EVOLVE so pure-random remains one tap away (performers distrust black boxes
mid-set).

**Effort:** M (3–5 days) after #1 lands; mostly plumbing, not ML.

### 3. Semantic search + auto-tagging over the render library

**In plain language:** "Find me the warm brutalist ones" typed into a search
box, over every still he's ever exported. Also: auto-suggested tags per render
and per preset.

**Technical sketch:** This is nearly free once #1 exists — it's the *same*
embedding index. Text queries embed with the text tower (SigLIP/CLIP are
natively text↔image); rank renders by cosine similarity. Auto-tagging = top-k
nearest label phrases from a fixed vocabulary, or cluster assignment.

**Data:** The embedding index from #1 plus his export folder.

**Integration shape:** Sidecar search CLI first; in-browser later via either a
shipped index (works in the public demo, no compute) or Transformers.js
SigLIP in-browser (WebGPU) for query-time text embedding without a sidecar.

**Effort:** S (1–2 days) given #1. The cheapest win on this list per unit effort.

### 4. Visual QA: anomaly / drift detection on renders

**In plain language:** A watchdog that notices "this render came out black /
corrupted / collapsed" without a human eyeballing every CI artifact — the exact
class of bug the QA sweep (#218) just fixed by hand.

**Technical sketch:** Two layers, honestly labeled:
- *Cheap layer (do it anyway, no ML):* per-render stats in CI — mean
  luminance, % pure-black pixels, edge energy. Catches black frames and total
  corruption for ~zero cost.
- *ML layer (studio track):* embedding drift — compare each CI corpus render's
  embedding against its reference; flag large distances as "composition changed
  unexpectedly." Also near-duplicate detection across the render library.

**Data:** The parity corpus (`app/src/gl/parity/corpus.mjs`) already renders
reference stills in CI — the fixture set exists.

**Integration shape:** Cheap layer in `.github/workflows`; ML layer in the
studio track. No browser changes.

**Effort:** S for the cheap layer (1 day); S–M for the embedding drift check.

### 5. Frame-cost prediction for the Showrunner governor

**In plain language:** Today the governor reacts — FPS drops, then it sheds
resolution/effects down a fixed ladder. A learned cost model predicts "this
combination of settings will cost ~24ms" *before* the frame drops, so it can
shed pre-emptively instead of stuttering first.

**Technical sketch — with a caveat:** this may not need ML at all.
`app/src/assets/cost.js` already does asset cost scoring, and the perf
selfchecks already measure timings. The honest first step is a fitted
parametric model: frame time ≈ f(count, mode, quality tier, FX layers, ACCUM
on/off) calibrated from measured sessions. Only if residuals are large does a
learned model earn its keep — and even then it's tiny regression, trainable in
MLX in minutes or in plain JS.

**Data:** Instrumented sessions logging (params → measured frame ms). Needs a
small logging addition; data accumulates with use.

**Integration shape:** In-app JS (no MLX at runtime — the *fitted weights*
ship, not the training). Governor consults predicted cost before applying cuts.

**Effort:** S–M (2–3 days), mostly instrumentation + fitting. Ranked below
#1–#4 because the reactive governor already works and the win is incremental.

### 6. ACCUM trail aesthetics: cluster + score trail stills

**In plain language:** Group his trail renders by visual family ("smoke",
"neon tunnels", "phosphor ghosts") and learn which families he keeps — taste
model applied to the ACCUM era (Phase A just landed: tunnels, prism fringes,
freeze/clear/swell).

**Technical sketch:** Same embedding index as #1 — ACCUM stills are just PNGs.
Cluster embeddings (k-means over the index), label clusters by nearest text
probes, score clusters by his keep rate. Feeds back into #2 (EVOLVE can bias
toward favorite trail families when ACCUM is on).

**Data:** ACCUM stills from export sessions. Accumulates naturally once #1 runs.

**Integration shape:** Sidecar analysis; surfaces as cluster names in search (#3).

**Effort:** S (1–2 days) given #1. A natural extension, not a separate project.

### 7. Learned audio→visual mapping for the Stimulus panel (speculative)

**In plain language:** Instead of hand-tuning which audio band drives which
parameter, learn the mappings from his actual performances.

**Why it's ranked last:** the data doesn't exist yet — it needs recorded sets
with timestamped param automation, which means building the recording
instrumentation first. Hand-tuned mappings (current state) are also genuinely
good enough for most performers. Revisit after #219 (REC / ACCUM trail
recording) ships and there's something to learn from.

**Effort:** M–L, mostly data plumbing. Not now.

---

### 8. Performative UI: ML-guided attention cues ("shimmer") — NEW, Matt's idea

**In plain language:** Buttons shimmer or pulse subtly when the taste model
scores the move behind them highly. Mid-performance, a VJ gets ambient nudges
— *this* palette, *that* Evolve direction — without breaking flow or reading a
dashboard. Hover help explains *why* ("your kept renders lean warm and dense —
this scores high on your taste vector"). Two modes: **suggest** (light up
high-scoring moves) and **remind** (nudge toward underused favorites — "you
haven't touched ORIGIN in 20 minutes and your taste vector loves it").

**Why it might be genuinely new:** not an "AI button that does the thing" —
*augmented intuition*. The performer stays in control; the machine lights up
paths. And Matt's instinct is right: performers *will* game it, developing a
feel for the shimmer and playing it like an instrument. That's a novel
interaction — UI as biofeedback — and it ties directly into the hover-help
work (#208, #222).

**Technical sketch — the clean version:** the taste model is a linear probe,
so scoring is a dot product. Ship the taste vector + candidate embeddings to
the browser as plain data (precomputed per session by the sidecar); scoring
happens in JS in microseconds. No MLX in the browser, no live sidecar needed,
no latency problem. Shimmer intensity ∝ score, with a calm default and a
"quiet mode" toggle.

**Risks, stated honestly:**
- *Feedback-loop collapse:* if the model trains on shimmer-chased clicks, it
  learns to predict its own nudges instead of his taste. Training must
  separate the "performed live" signal from the "kept afterward" signal —
  only keeps train the model; performance clicks are context, not labels.
- *Trust calibration:* a wrong model shimmering confidently is worse than no
  shimmer. Start subtle, earn intensity as the model proves itself against his
  keep rate.
- *Accessibility:* never shimmer-only — pair with hover-help text and respect
  reduced-motion settings.

**Data:** The taste model from #1. No new data collection.

**Integration shape:** Ghost Station panel toggle, fed by precomputed scores.
Prototype after #1 lands.

**Effort:** S–M (2–3 days) given #1. Exploratory — ranked here because the
idea came from Matt and the architecture happens to make it cheap.

## Recommended Phase 1

**MLX-ify the Curator's embed step and run it on his real favorites.**

Concretely:
1. Port `studio/curator.py cmd_embed` from `torch`/`open_clip` to MLX
   (`mlx-embeddings`, SigLIP). Keep the CLI contract identical so
   `hits_bridge.py` → `train` → `rank`/`similar` keep working untouched.
2. Benchmark: MLX vs current MPS on the Mac Studio, images/sec. (Expect a
   clean win on unified memory; if not, say so and keep torch.)
3. Build the label set from his *actual* HITS/favorites export — this is the
   step that needs Matt, not code.
4. Run the full loop on a real batch: `studio.py batch` → embed → train →
   rank → diversified top-20 shortlist as a contact sheet he eyeballs.
5. Success criterion, stated plainly: *he looks at the top 20 and says it
   found things he would have kept.* If yes, the taste model is real and #2,
   #3, #6 unlock. If no, we learned it for the price of a port.

No UI changes. No browser changes. No new dependencies in the app. 2–4 days.

## Explicitly NOT building

- **In-browser real-time ML.** MLX doesn't run in a browser; the architecture
  says heavy compute leaves the browser. Precomputed data crosses the boundary,
  models don't.
- **A generic aesthetic scorer.** His taste ≠ internet-average taste. The plan
  already rejected this; the probe trains on *his* likes vs passes or it
  doesn't ship.
- **Diffusion-generated assets as a firehose.** Ranked last in the backend
  plan for a reason — the 137 authored assets are the identity. Gated
  experiment at most, never a content pipeline.
- **Cloud ML APIs.** Against his local-first stance; everything here runs on
  the Mac Studio he already owns.
- **A neural net for frame-cost prediction** before the fitted parametric model
  (#5) proves insufficient.
- **A "Math Lab" UI.** Sleeper principle from the backend plan: power shows up
  as better output (shortlists, better EVOLVEs), not more chrome.

## Open questions for Matt

1. **Taste data:** will you export your real favorites/HITS library as the
   training set — and should it learn only from explicit favorites, or also
   from "exported and kept vs rendered and abandoned"?
2. **Where does the Curator live:** invisible batch tool that hands you a
   shortlist (power as better output, no new UI), or a visible "TASTE" control
   in Ghost Station next to EVOLVE?
3. **Mac Studio only, or also the public demo:** should "more like this" work
   on the Pages demo via a shipped embedding index (bigger download, works
   everywhere, no local compute), or stay a local-install superpower?

---

*Notes for the builder who picks this up: `studio/curator.py` selfcheck is
stdlib-only (`python3 studio/curator.py selfcheck`, no model/numpy needed) —
keep it that way and put the MLX code behind the model-loading boundary.
`mlx-embeddings` usage: `pip install mlx-embeddings`, then
`from mlx_embeddings import load_model; model = load_model("mlx-community/siglip-so400m-patch14-384")`.
Related issues: #75 (Curator), #74 (headless render farm), #35 (setlist),
#219 (REC — future video-embedding surface via vjepa2-mlx on trail clips).*
