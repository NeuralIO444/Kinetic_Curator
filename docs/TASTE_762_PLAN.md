# #762 Taste Plan — MLX Curator Runbook → taste.json

**Status:** PLAN ONLY. Nothing built, nothing filed. All integration code already exists on main (verified 2026-10-03 against `origin/main` @ `88d819eb`).

**The bet in one line:** today Davis is a guess about Matt (hand-tuned weights). The runbook makes it a relationship — the probe learns from his actual keeps, the head distills it into something the browser can run, `inspect` reads it back in words. "The governor is the curator" becomes real: measured cost vs *learned* taste.

---

## 1. First-run plan (Matt, on the Mac Studio)

### Prerequisites checklist (do once, ~15 min + a 2 GB download)

- [ ] Mac with Apple Silicon (MLX is Apple-Silicon-only; the runbook does not run on Intel or Linux)
- [ ] Python 3.11+ with `pip`; a venv is fine — the repo root is `Kinetic_Curator/`
- [ ] `cd Kinetic_Curator/studio && pip install -e ".[curator]"` (installs mlx-embeddings + pillow + numpy + scikit-learn)
- [ ] First `embed` downloads ~2 GB of SigLIP weights from Hugging Face into `~/.cache/huggingface` — needs network + ~3 GB free disk
- [ ] A `base.project.json` exported from the app (↓ PROJECT from any project he likes — this seeds the Phase 2 pool)
- [ ] The app open in a browser, logged into nothing special — keeps happen with ★ / F as usual

**Assistant support:** I can prep the exact command block for his machine, verify `curator.py selfcheck` output he pastes back ("curator selfcheck OK"), and troubleshoot install errors from pasted tracebacks. I cannot run any of this for him — the Mac Studio is his.

### Phase 1 — prove the loop (~1–2 hrs, mostly labeling)

| Step | Command | Time | What good looks like |
|------|---------|------|----------------------|
| 1. Selfcheck | `python3 studio/curator.py selfcheck` | 1 min | prints "curator selfcheck OK" (no model needed, runs anywhere) |
| 2. Smoke embed | 3 images → `curator.py embed /tmp/curator-smoke/` | 5–10 min (first run downloads weights) | `curator-index.npz` (3×1152) appears |
| 3. Render pool | `python3 studio/studio.py batch -o pool/ --count 200` | ~10–20 min | 200 PNGs in `pool/` |
| 4. Embed pool | `python3 studio/curator.py embed pool/` | ~5–10 min | `pool/curator-index.npz` (200×1152) |
| 5. Label | `curator.py label` (y/n in Preview) **or** `sheet` + `apply-sheet` | 30–60 min | ≥20 likes, ≥20 passes. Shortcut: HITS exports convert via `hits_bridge.py build` |
| 6. Train | `curator.py train --index … --labels labels.json --out taste.npz` | ~1 min | **ROC-AUC > 0.6** printed |
| 7. Verdict | render fresh pool, `rank -k 20 --open`, look | ~15 min | **Decision point:** "did it find keepers?" — his eyes are the gate |

**Decision point at step 7:** if yes → Phase 1 done, taste graduates to real work. If no → more labels, or tell me and we dig (see contingency tree).

**Assistant support:** verify the AUC number he pastes (>0.6 = signal, ~0.5 = needs more/varied labels); help interpret `rank` output; sanity-check label balance (≥20/20).

### Phase 2 — taste.json → the app (~30–45 min)

One copy-paste block from the repo root:

```bash
# 1. VARIED pool, same dice CURATE uses
node studio/pool_recipes.mjs base.project.json --count 200 --seed 1 --out pool-recipes/
python3 studio/hits_bridge.py pool --recipes pool-recipes/ --pool pool/      # resumable

# 2. keeps: ★ / F in the app, then Pipeline → ↓ HITS (saves hits.json)
python3 studio/hits_bridge.py build --hits hits.json --pool pool/ --out labels.json
#    -> labels.json + features.json (renders kept seeds missing from the pool)

# 3. embed + train
python3 studio/curator.py embed pool/
python3 studio/curator.py train --index pool/curator-index.npz --labels labels.json \
    --features features.json --out taste.json

# 4. read it in words — DECISION POINT: "does this sound like you?"
python3 studio/curator.py inspect taste.json

# 5. app: Pipeline → IN → IMPORT TASTE → taste.json
#    curator bar reads "curated pick · mlx"
```

**What good looks like:** AUC > 0.6 AND head fidelity ≥ 0.3; `inspect` reads like him ("leans sparse, large marks, trails on; avoids screen blend"). Import refuses loudly if `featuresVersion` doesn't match the app's — that's the expiry mechanism, not a bug.

**Decision points:** (a) at step 4 — "does this sound like you?" If the words are wrong, the head is wrong; see contingency tree. (b) at step 5 — the curator bar either reads "curated pick · mlx" (live) or the Pipeline summary line says "fidelity too low — persona curator stays on" (parked gracefully).

---

## 2. The fidelity < 0.3 contingency — decision tree

This is the one real risk: the probe sees *images* (SigLIP catches texture/vibe); the app runs the *head* (ridge over named recipe features). If Matt's taste is parametric (sparse crowds, trails on, screen-blend avoided), fidelity clears 0.3 easily. If it's textural/subtle, the head can't reproduce it and the app silently keeps the persona curator — the only alarm is the Pipeline summary line.

```
fidelity >= 0.3
└── ✅ Done. Import, curate live, schedule retraining (see §3).

fidelity < 0.3 — work the tree IN ORDER, re-train after each:
│
├── 1. MORE KEEPS (cheapest, ~30 min)
│   The head is starved. Push past 20/20 — aim 40+ likes, 40+ passes.
│   Cost: one more labeling session. Re-train, re-check fidelity.
│
├── 2. MORE VARIED KEEPS (same cost, different axis)
│   If the keeps all look alike (similar palettes, similar density),
│   CV collapses to ~0.5 and the head has nothing to fit.
│   Deliberately keep a few "interesting failures" — borderline renders
│   he almost kept. Label the edges of his taste, not just the center.
│
├── 3. WIDER POOL (one command, ~20 min render)
│   If his live curation varies things the pool doesn't, the head learns
│   the wrong distribution. Re-roll the pool from a different base project
│   or a different --seed; check the pool actually spans his range.
│
├── 4. RICHER RECIPE FEATURES (code change — see slice TASTE-762-B below)
│   The head can only see what #759's recipe features name. If his taste
│   lives in something unnamed (e.g. edge density, symmetry, mark-size
│   variance), the features need extending. This is real build work —
│   scoped as a slice, Matt's call to greenlight.
│
└── 5. ACCEPT PERSONA, PARK #762 (graceful, not a failure)
    The app already handles this: fidelity < 0.3 → persona stays on,
    Pipeline says so. Park the issue, keep the taste.json archived
    (old files stay reproducible), revisit after more keeps accumulate
    or after the feature set grows. The heuristic is honest; the
    trained path waits for him, not the other way around.
```

**Rule:** never lower the 0.3 bar to "make it work." A low-fidelity head curating live is worse than the honest heuristic — it would curate with false confidence.

---

## 3. Retraining cadence

**When taste expires (hard):** `featuresVersion` coupling. Every recipe-feature change bumps `FEATURES_VERSION` in `tasteHead.js`; `validateTaste()` refuses imports whose version doesn't match. Expiry is a loud refusal at import, never silent drift. Migration = retrain, full stop.

**When taste goes stale (soft):** his taste evolves. Concrete triggers:
- Pipeline summary line shows keeps/pass counts growing — after ~50 new keeps since training, a re-run is worth it (~30 min: re-render pool deltas, re-embed, re-train, re-inspect).
- He notices CURATE picks feeling "off" vs his recent keeps — trust the eye over the schedule.

**Should the app nudge him?** Recommendation: yes, a light one — when keeps since `trainedAt` cross ~50, the Pipeline taste summary line appends "· 50+ new keeps since training — re-run the runbook?". One line, no modal, no nag. (Scoped as slice TASTE-762-C.)

**What a re-run costs him:** ~30–45 min, mostly labeling the new keeps. Embed/train are minutes. The pool rarely needs re-rendering from scratch — `hits_bridge.py build` renders only kept seeds missing from the pool.

---

## 4. Code changes needed — verified against origin/main

**Verdict: the integration is fully implemented. No build is required to ship #762.** Verified file-by-file on `origin/main` @ `88d819eb`:

| Claim | Status |
|---|---|
| `tasteStore.js` — `getTaste()` reads `kc:taste:v1` localStorage, `importTaste()` validates + persists, `clearTaste()` | ✅ exists |
| `curate.js` — `getActiveCurator() = mlxCurator() ?? personaCurator() ?? nullCurator()` | ✅ exists |
| `tasteHead.js` — `validateTaste()`, `makeMlxCurator()`, `HEAD_MIN_FIDELITY = 0.3`, `FEATURES_VERSION`, `feature_terms` | ✅ exists |
| `makeMlxCurator()` returns null when no taste OR fidelity < 0.3 | ✅ exists (line 79) |
| `curatorHint()` → "curated pick · mlx"; `tasteSummary()` with the fidelity-too-low path | ✅ exists |
| IMPORT TASTE in `DataExportRow.jsx` (Pipeline → IN), validated before persist | ✅ exists |
| `studio/curator.py` — embed/label/sheet/apply-sheet/train/inspect/rank/similar/selfcheck | ✅ exists |
| `studio/pool_recipes.mjs` — varied pool, same dice as CURATE | ✅ exists |
| `studio/hits_bridge.py` — pool render + HITS→labels build | ✅ exists |
| Selfchecks: `tasteHead.selfcheck.mjs`, `curate.selfcheck.mjs`, `tasteTerms.fixture.json` (terms mirror asserted both sides) | ✅ exist |

**The only code-adjacent work is the doc fix (§5) and two optional slices below.** #762's remaining work is Matt's runbook run, not a build.

### Slice TASTE-762-A — doc drift fix (tiny, zero-review lane)

`docs/DECISIONS.md` line 42 says the interim scorer "measures 15 real visual features"; the code (`taste.js`, its own comments) and issue #762 both say **19**. One-line fix: 15 → 19. Acceptance: grep shows no "15" in the Taste section; docs selfcheck green.

### Slice TASTE-762-B — richer recipe features (ONLY if contingency step 4 triggers)

Scope only after a real low-fidelity run proves the features are the bottleneck. Shape: add named features to the #759 sidecar set (candidates: edge density, symmetry, mark-size variance — TBD from the failed `inspect` output), bump `FEATURES_VERSION`, extend `feature_terms` + `tasteTerms.fixture.json` both sides, retrain. **Do not pre-build this** — building features speculatively before knowing what the probe learned is exactly how you get 19 features that still miss.

### Slice TASTE-762-C — retraining nudge (optional, small)

Pipeline taste summary appends "· N new keeps since training — re-run the runbook?" when keeps since `trainedAt` ≥ 50. Acceptance: line appears only past the threshold; no modal; dismisses after re-import.

---

## 5. Open questions for Matt

1. **When do you want to run Phase 1?** It's ~1–2 hrs on the Mac Studio, mostly you flipping through renders saying yes/no. Recommendation: a weeknight session — the labeling is the fun part (it's literally "look at your art and judge it"). I can sit with you: you paste outputs, I verify and troubleshoot.
2. **Labeling style: rapid y/n or contact sheets?** Recommendation: contact sheets (`sheet` + `apply-sheet`) — faster for 200 images, and seeing them side-by-side surfaces the edges of your taste better than one-at-a-time.
3. **If fidelity comes back < 0.3, do you want to work the tree or park it?** Recommendation: work steps 1–3 (more/varied keeps, wider pool) — they're cheap and they're all *your* judgment, no code. Step 4 (richer features) only if the inspect words are clearly missing something you can name.
4. **Retraining nudge — want it?** Recommendation: yes, the one-line Pipeline hint. Silent staleness is the failure mode; a nagging modal is worse. The one-liner threads the needle.
5. **Should `inspect`'s words get saved anywhere?** Recommendation: yes — append the `describe_head()` line to the training log next to `taste.json` (e.g. `taste-notes.md`). Six months from now "leans warm, dense, high-chroma" is a better changelog than a weight dump.

---

## Next level

The trained loop compounds: every keep is future training data, and `curator.py similar` (semantic search over the index) already exists Studio-side. Once taste.json is live, the graduation path is Smart Evolve — CURATE not just picking from 8, but evolving toward the probe's high-score regions. That's the point where the Davis dynamic stops being a scorer and starts being a collaborator.
