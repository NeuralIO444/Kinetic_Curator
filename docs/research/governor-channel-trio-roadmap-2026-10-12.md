# KC-1 Governor Channel + Trio Roadmap

**Date:** 2026-10-12
**Status:** Spec only. Nothing pushes to gh until the gate lifts.
**From:** NeuralCanvasIO / Grok session

---

## 1. Governor Channel — the trio can see the governor

The governor currently acts and the trio only sees the result. The fix is a **governor channel** on the existing 60-event bus. One new publisher, no new architecture.

### Events the governor publishes

| Event | Payload | Who reads it |
|---|---|---|
| `governor.shed` | `{ cut: string, severity: 0..1, layerId?: string }` | LOIS |
| `governor.budget` | `{ headroom: 0..1 }` | Davis |
| `governor.floor` | `{ layerId: string, reason: 'editedByLois' }` | Queen |

### New verdicts / states

- **LOIS gains CUT** — fires when `governor.shed` hits a layer the user has kept. The pill says the governor cut something the user valued. Half-life 8s (a moment, not a mood).
- **Davis gains TIGHT** — fires when `governor.budget.headroom` drops below 0.3. The kaleidoscope cools. Half-life 30s.
- **Queen reads `governor.floor`** — when the governor is defending a LOIS-edited layer, her lean field tilts toward LOIS. She doesn't name it. The room just leans.

### Reverse direction: the trio publishes to the governor

- `userDialing` (already specced in producer-director-editor) cools the governor's shed aggressiveness. The governor defends the user's work instead of trimming it.
- The Queen's lean field biases which layers the governor protects first. If the Queen is leaning LOIS, the governor sheds Davis's layers before LOIS's.

### Sharp edge

The publisher must be the same code path that executes the cut. No separate observer that can drift out of sync. A shed event firing on a frame that didn't actually shed breaks the trust. The governor is the one system that can't afford to be wrong.

---

## 2. Taste-guided shedding

The shed ladder is currently a fixed contract — same order every time, regardless of what's on screen. The taste layer makes it contextual.

### How the keep ledger feeds the shed order

The governor reads the keep ledger (existing, from the curator) and computes a per-layer **value score**:

```
value = (keepsOnLayer / totalKeeps) × recencyDecay
```

Layers with high value shed later. Layers the user keeps passing shed earlier. The fixed ladder still exists as the fallback — when the ledger is empty or the signal is weak, the governor falls back to the existing order (pixels before visible things, FX never culled).

### Framing

This is refinement of the existing contract, not new behavior. The manifesto killed the predictive AI governor as out-of-freeze. The taste layer doesn't predict — it reads. It doesn't say "the next frame will be expensive," it says "this frame is worth less than that one." The freeze stays intact.

---

## 3. Technology headroom and gaps

### Gaps to close

1. **MLX cost model not trained.** The runbook exists (`docs/MLX_HARNESS_RUNBOOK.md`). The artifacts don't. The governor still reasons from harness measurements (headless Chromium, wall clock), not learned weights. The Mac Studio is the machine that matters and the numbers haven't been blessed on it.
2. **Worker thread not deployed.** The design exists (`docs/design/worker-thread-kernel.md`). The iPad probe passed on Playwright WebKit but not on a physical iPad. The kernel still runs on the main thread. The governor's main-thread budget is competing with the sim budget.
3. **GPU field eval deferred.** Transform-feedback path designed but not built. Fields are the most parallelizable part of the kernel and the governor has no GPU field path to shed.
4. **No governor events on the bus.** The trio can't see the governor. This doc closes that.
5. **No taste input to the shed order.** The keep ledger exists. The governor doesn't read it. This doc closes that.

### Headroom

- **Blur is gone.** #308 removed gaussian blur. No effect dominates on real hardware (max ratio ~1.56x). The ladder's "shed first" assumption is still correct — the ACCUM chain is the second cost center, and the registry already covers it.
- **FX compositing has 10–50x headroom.** Correctly never shed. Don't resurrect the FX-cull ladder.
- **Audio modulation is free.** Tier 0, scalar math per frame. The governor never touches it.

### Opportunities

1. **The governor publishes and the trio reacts.** Covered above. The room changes when the governor sheds. The room holds when it doesn't. That's the ghost.
2. **The governor reads the Queen's lean.** If the Queen is pushing a lean and the governor is shedding the layers that lean depends on, they're fighting. The governor reading the lean field means the shed order respects the room's direction, not just the frame budget.
3. **Budget depletion readout.** The performer sees the tape running out before the cut fires, not after. The cost registry + event log + measured costs contain everything needed. Nothing reads them that way in production. This is R4 from the September roadmap, still unbuilt.
4. **The governor as the thing that makes the trio feel alive.** Not the pill, not the kaleidoscope — the governor. When it sheds, the room changes. When it doesn't, the room holds. The machinery is already running. The trio just can't see it yet.

---

## 4. Sequencing

1. **Governor channel** — one publisher, three events, two new verdicts. Smallest lift, biggest visibility gain.
2. **Taste-guided shedding** — the keep ledger already exists. The governor reads it. Fallback to the fixed ladder when the signal is weak.
3. **MLX cost model** — run the harness on the Mac Studio, train the ridge regression, commit the artifact. The governor reasons from learned weights instead of harness measurements.
4. **Budget depletion readout** — the performer sees the tape running out. Refinement of the existing PLAY meter, not a new panel.
5. **Worker thread** — after the iPad probe on real hardware. The governor's main-thread budget stops competing with the sim budget.

---

## 5. Open questions for Matt

1. Does the governor channel fire on every shed, or only when the shed hits a kept layer? (CUT only makes sense if the layer was valued.)
2. Should the Queen's lean bias the shed order directly, or only through temperature/threshold?
3. Is the taste-guided shedding a refinement of the existing contract, or does it need a freeze exception?
4. When does the MLX cost model run? It's the long pole under everything the governor reasons from.

---

## Ratifications — 2026-10-12 (Matt)

Four decisions settled by Matt on 2026-10-12, recorded here without altering the spec above:

1. **CUT and TIGHT are canonical kc-voice/1 states.** LOIS CUT and Davis TIGHT (§1) are ratified into the voice records — see the Ratification addendum in `kc-voice-1-trio-records-2026-10-12.md`.
2. **The Queen's lean biases thresholds/temperature only — never the shed order.** This supersedes the §1 reverse-direction note ("biases which layers the governor protects first") and answers open question 2: her lean may cool or warm shed aggressiveness through temperature/threshold, but the shed order itself derives from measured cost + keep ledger only.
3. **governor.shed publishes on every shed; CUT renders only on kept-layer hits.** The event log stays complete and honest; the verdict renders only when the shed hits a layer the user has kept. This answers open question 1: publish every shed, render selectively — silence stays default.
4. **Cull priority is ratified:** (1) editedByLois hard floor first, (2) keep-ledger value score next, (3) fixed ladder as fallback.

Editorial note (2026-10-12): issue #762 closed COMPLETED on 2026-10-09 — the MLX runbook ran on the Mac Studio and taste.json was produced. The §3 framing "MLX cost model not trained" is therefore partly stale; CRIT-dependent work must first verify what the #762 run proved before building on it.
