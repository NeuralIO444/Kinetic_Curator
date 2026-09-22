# Kinetic_Curator — Testing & Polish Roadmap

> **Superseded in part (2026-09-22).** Two things here no longer govern. (1) The feature freeze this announces was replaced by [`EMBARGO.md`](EMBARGO.md) (2026-09-19) — same intent, newer text wins. (2) The "existing auto-merge grant" named in Stage 0 is **retired**: merges now happen only on Matt's explicit word, per [`AGENTS.md`](../AGENTS.md). Stage contents are kept as the dated record.

*September 17, 2026. Feature freeze is in effect: no new features. This roadmap covers testing, polishing, and refining only. New ideas go to a parking lot, not the build.*

## Stage 0 — Land the fixes (in flight, no Matt needed)

The fix coordinator is working through the QA phases. PR #285 (governor #264/#265) is already open; #262, #266, #269 are closed and merged. Remaining: #263 (context loss), #267 (capture honesty), #268 (dead controls), #270 code-safe mobile, #272–274 (sliders/tapers).

- Each PR gets CI verified personally, merged only when fully green, under the existing auto-merge grant.
- Matt does nothing here.

## Stage 1 — Stabilization pass (mostly me, on the live demo)

Once the fixes land, a full regression sweep on https://neuralio444.github.io/Kinetic_Curator/:

- HUE ROTATE full sweep — renders, no freeze.
- Context-loss simulation — canvas recovers, textures rebuild.
- Console check — no `[gl-live] ACCUM fault` lines, no unhandled errors.
- Governor stress — force a shed, confirm honest PERF PAUSED / MOTION HELD status, confirm recovery above the threshold (no permanent-shed trap).
- Capture honesty — exports match what's on screen; no fake 2×, no silent failures.
- Slider spot-checks — every slider visibly responds with a sane curve.

Any new fault becomes a new issue and goes back through the fix queue. Still no new features.

## Stage 2 — Polish gates (Matt's eyes)

These need his taste, in this order:

1. **VJ MIX / palette transitions** — changes flow like mixing tracks, no abrupt jumps.
2. **Print-window polish (#277)** — human-readable settings, honest capture wording, GRAIN/VIGNETTE/GRADE sizing.
3. **Flagship personas** — Night Migration, Chrome Parade, Deep Water, as full voices.
4. **iPhone check (#270)** — real device: Retina sharpness, touch gaps, export memory.

## Stage 3 — Locked-scope builds (queued, each ships with voices)

Already-planned work, each reviewed by Matt as voices:

1. **#284 Smoke Study + Loop Capture** — proves the instrument against a real reference; loop export rides the existing recorder.
2. **#281 Asset authoring Phase A** — ~48 canon assets for the empty shelves; Matt reviews the authored assets visually.
3. **#287 Bio-drives + Haeckel pinch** — the living layer lands last, on a stable substrate.

## Stage 4 — Release readiness

- **Docs PRs #283, #286, #288** — merge only on Matt's explicit word.
- **README/CHANGELOG honesty pass** — both still describe the obsolete SVG split. Needs Matt's authorization to revise.
- **MLX runbooks on his Mac Studio** — taste training, cost-model weights. His call on timing; the checks loud-skip until then.
- **Version call** — when Stages 0–2 are done and the queued builds land, decide together whether this is v1.0.

## Standing rules

- Separate branch + clean PR per change. Never push to main. Never touch `.github/workflows/`.
- CI verified personally before any merge claim.
- Matt's eyes only where taste lives: transitions, print, personas, assets, mobile.
- The freeze holds: polish and refine, nothing new.
