# K0 — Take semantics under GPU simulation (spec)

**Status:** SPEC for Matt's rulings. No build, no code. Issue #2185; program #2180 (the Full WebGL engine program); kernel slices K1 #2186, K2 #2187, K3 #2188.

**Basis.** The program's first ruling stands at its final state: Option 2 — the simulation kernels (dish fluid, DISH LIFE culture, recorded swarm) are in scope for GPU simulation and a take's sim outcomes are the recording device's (#2180, third comment; it reverses the 2026-11-08 JS-exactness ruling in `engine/dishFluid.mjs`). Also settled and carried here as given: the clean break on #2178 — `PERFORMANCE_VERSION` 2 → 3, old takes containing fluid retire, no legacy replay path (#2178, 2026-11-15; lands with PR #2190).

Each section ends in a numbered ruling with a recommendation. Matt rules section by section; K1 does not dispatch until R1–R6 are ruled.

---

## 0. What exists today (verified on main @ `92d7714`)

- A take is the resolver's **input log** plus a **hash chain** over every frame's resolver output, stored every `CHECKPOINT_EVERY = 60` frames (`gl/performanceFile.mjs`). `verifyPerformance` replays the inputs through a **fresh resolver, in Node or the browser,** and compares every checkpoint. The resolver is pure JS, so CI can verify a take with no GPU.
- The chain covers resolver output **including sim state** — culture, fluid, swarm, creatures. That is why a GPU kernel cannot simply replace a JS one: a Node verifier cannot run a fragment shader.
- The file already separates **intent from machine**: `MACHINE_KEYS` (quality, governor shed, canvas size, device class…) are recorded as a note, and `kernelVersion` (`kernel.v2`) is stamped. `verifyPerformance` already reports `kernelMismatch` without failing. The seams for a device stamp and a law stamp exist; K0 widens them, it does not invent them.
- The culture is **log-accountable** today (#1923): the loop stamps `input.dishLife` (wake, generation, strength, shed) on every frame's input; the field itself is recomputed by the resolver from those stamps. A forged wake is caught because the culture is in the take, not recomputed from the clock.
- Director output is **recorded data**, not re-derived (#2094 diagnosis of record, 2026-11-12): the dealt poem is `layoutParams.fieldForm`; playback mutes the personas and never calls `tick` / `dealPoet`.
- The swarm's "exact on every device" claim already carries an asterisk: `engine/particles.selfcheck.mjs` deliberately compares against the pre-SoA reference engine and **not** against recorded hashes, because V8's `Math.sin/cos/atan2` differ between x64 and arm64 (its header documents CI catching exactly this).

## 1. What a take guarantees — three tiers

| Tier | Content | Promise |
| --- | --- | --- |
| **D — decisions** | Inputs, deals, seeds, performer acts, stamped dish state (wake / generation / strength / shed), persona outputs (Director, spawn decisions, homes, formed, limbs, traits), placed magnets | **Exact on every device.** Verified by the decision chain (§2). |
| **S — sim outcomes** | Fluid field, culture field, swarm positions/velocities, any state a GPU kernel owns | **The recording device's.** Re-derived on playback; matches only on the same numeric class (below). |
| **P — presentation** | FX, ACCUM, GPU presentation sims (WS2), field-body seating, display-resolution fields (WS3) | Never verified; per-device image, as ACCUM is today. |

**Header additions** (format version stays the integer; new keys are additive and absent on older takes):

- `simLaw`: `'js-exact'` (every sim kernel ran in JS) or `'decisions-exact'` (at least one kernel ran on the GPU).
- `simBackends`: `{ fluid: 'js.gs.v1' | 'gpu.gs.v1', culture: …, swarm: … }` — which implementation produced each kernel, versioned like `kernelVersion` so a changed kernel is detectable.
- `device`: a **numeric-class probe**, not a renderer string — a small fixed shader run at record time, its output hashed, plus float-texture format support and highp range/precision. Browsers mask or coarsen `UNMASKED_RENDERER`, so a string cannot answer "will this device reproduce the sim"; a probe can.

**R1 (recommend: adopt).** The three-tier law and the three header keys above. Tier D is the take; Tier S is "same device or it is not a proof"; Tier P is not in the proof.

## 2. Checkpoints — two chains, one verdict rule

Options considered: (a) same-device integrity only; (b) a reduced chain of decisions plus non-sim state; (c) statistical bounds on sim state. **Recommendation: (b), plus a same-device sim chain, and no (c).**

- **Decision chain** — the existing chain with sim-derived fields excluded. Computed by the resolver, so it runs in Node and in the browser. Always verified; a mismatch is a failure. This is what CI's replay gate (`replayGate.kcperf`) keeps proving.
- **Sim chain** — a hash of each GPU-owned field at checkpoint frames, computed in the browser. Stored as `simCheckpoints` alongside the `device` probe. On playback it is compared **only when the playback device's probe equals the recorded one**; otherwise the verdict is *unverified on this device* — reported, never a failure.
- **Statistical bounds: rejected.** These systems are chaotic; there is no bound that distinguishes "different device, same character" from "broken kernel". Character is judged by eye on captures (K1–K3 acceptance already says so). Optional and cheap: a **character note** per checkpoint — a few coarse scalars (culture level, fluid mean density, swarm centroid and spread) — stored for display, never compared.
- **Readback cost.** The sim chain needs a field readback once per checkpoint (1 per second at 60 fps). That is ≤ one 192×108 RGBA32F texture (~330 KB); K1 must use a fenced asynchronous readback, not a blocking `readPixels`, and state the cost on the frame budgets (8.0 ms desktop / 5.0 ms iPad).
- **Seek.** Seeking re-simulates the GPU kernels from frame 0 without presenting (the same "a checkpoint is a hash, not a snapshot" rule `playback.mjs` states today). Optional later: device-bound GPU snapshots, Tier S only.

**R2 (recommend: adopt).** Two chains; sim verification advisory off-device; no statistical bounds; the character note is optional and K1 may skip it.

## 3. The decision seam — the rule that makes the tiers hold

A take stays a proof of its decisions only if **no recorded decision reads a Tier S value without recording the outcome.** The pattern already exists: spawn decisions are published by the resolver, stamped on the next frame's input, and replayed as recorded data (`performanceCreatures.selfcheck`).

**The rule.** (1) A Tier S field never writes into resolver-owned state. (2) Any *discrete* decision derived from a Tier S field — a spawn home, a formation, a persona pick — is stamped as a recorded input at the moment it is made. (3) *Continuous* sim-driven visuals (a force nudging a drawn position, a body seated on a field) are presentation-class: they act **downstream of the contract**, on the GPU, and are not in the resolver output.

Readers this touches (named from the open issues; K1/K2 each re-verify their own list):

- Ferro body seating (#2178 / PR #2190) — already presentation-class under the clean break.
- Culture ↔ fluid coupling — becomes shader-space (K2); both Tier S.
- DISH LIFE force on assets (#2152) — must be post-contract displacement, or stamped if it ever makes a discrete choice. This is the one most likely to be built wrong; K2 should resolve it before building.
- Finger painting into the dish (#2153) — the **act** is Tier D (a recorded performer input); its **effect** on the fields is Tier S.

**R3 (recommend: adopt).** The seam rule as stated. Corollary for K1–K3: each slice's PR lists every reader of its field and names its tier.

## 4. The hash-pinned selfchecks — every pin dispositioned

The structural fact driving all of these: Node cannot run a GPU kernel. So the **JS kernels stay as the reference backend** (Node verification, CI pins, stills/goldens, replay of old takes, and the no-float-texture fallback) until K3 lands; retiring them is a separate ruling then.

| Suite / fixture | What it pins today | Disposition |
| --- | --- | --- |
| `engine/dishLife.selfcheck.mjs` — `GOLDEN = 531502298` | Seed 4242, 48×36, 25 generations | **Keep** as the JS reference pin. K2 adds a property suite on the GPU kernel (the A–D groups — blinker, rim, bedrock, published level — are already property-shaped). Note for K2's costing: B3/S23 Generations is integer-state, so the **culture alone can likely be bit-exact on GPU** with integer textures; variance enters at the fluid coupling. K2 should try to keep the culture exact and give exactness up only at the coupling. |
| `engine/dishFluid.selfcheck.mjs` — A determinism (bit-identical after N steps) | Pure-JS exactness | **Keep** for the JS reference. For GPU: replace A with **same-device repeatability** plus a stability soak (Gray-Scott is stiff at coarse steps). Groups B, C, D, F (monotone magnet response, culture bias direction, dial clamps, density downsample) are property-shaped: **port** to the parity harness (`gl/parity/glDriver.mjs`). |
| `engine/dishFluidCouple.selfcheck.mjs` C — off parity (golden culture hash, biased vs unbiased) | Strength 0 leaves the culture byte-identical | **Convert** to same-device parity on GPU (strength 0 ⇒ culture identical to an uncoupled run on that device). Meaning preserved. |
| `engine/particles.selfcheck.mjs` + `particles.reference.mjs` | SoA swarm == verbatim pre-SoA engine, every field of every particle (no recorded hashes — see §0) | **Keep** while the JS swarm exists. For the GPU swarm: **property tests** — bounded speed, no NaN, flocking statistics (alignment / cohesion / separation) inside a band at matched seed and count. Reference-equality does not apply. |
| `engine/contacts.selfcheck.mjs` | Contact behaviours (momentum conservation, swap, breed caps…) | Already property-shaped: **keep**; K3 re-targets it at whichever integrator owns contacts. |
| `engine/particles.{lorenzReseed,seekFleeSwarm,uniqueness}.selfcheck.mjs` | Not audited in K0 | **K3's costing pass** dispositions these three; named here so none is dropped silently. |
| `gl/fixtures/replayGate.kcperf`, `creatureRepipe.kcperf` + the take-machinery suites (`performanceFile`, `performanceCapture`, `performanceCreatures`, `performanceDishLife`, `playback`, `replayGate`, `retroCapture`, and the curator record suites `clockRecord`, `spectrumRecord`, `stressRecord`, `gestureRecord`, `routeRecord`, `takeStrip`, plus `world`, `creatureMoods`, `creatureGate`, `glitch`) | Resolver-output checkpoint chains, replayed in Node | **Re-base, do not retire.** They keep verifying in Node: for `simLaw: 'js-exact'` takes the chain is unchanged; once a kernel migrates its state leaves the resolver output and these become **decision-chain** fixtures. Fixtures re-record once per bump, as #2190 does for v3. |
| `performanceDishLife.selfcheck` — forged wake/strength caught | The culture is in the take, not recomputed from the clock | **Keep.** The wake and strength are Tier D stamps and stay covered by the decision chain; only the field itself stops being recomputed in Node. |
| `liveResolve.dishFluid.selfcheck`, `liveLoop.dishFluid.selfcheck` | Fluid wiring | Being rewritten by PR #2190; **K1's costing pass dispositions them** once it merges. |
| `goldenPlacement.selfcheck` (`KERNEL_VERSION`) | Stills baker placement hash | **Untouched** — stills are outside the live sim. |

Correction for K3: #2188 places the swarm in `gl/particles.js`; the swarm engine is `engine/particles.js` (with `particlesSnapshot.mjs`), and it holds no recorded hash pins — its lock is the reference-equality suite above.

**R4 (recommend: adopt).** JS kernels stay as the reference backend until K3 lands; dispositions as tabled.

## 5. Old takes

- **v2 takes:** retired by the #2178 clean break (already ruled). Nothing further here.
- **v3 takes recorded before K1 lands:** carry `simLaw: 'js-exact'` and `simBackends` all `js.*`. After migration the player **honors the recorded backend** — it runs the retained JS reference kernel — so these takes keep their full proof. This is the main argument for R4.
- **Takes recorded with a GPU kernel:** `simLaw: 'decisions-exact'`. Played on a device with a matching probe, the sim chain verifies; elsewhere the decisions replay exactly and the sim re-derives locally, marked *unverified on this device*.
- **Take strip badge** (`curator/takeStrip`): **EXACT** (js-exact, verified) / **DECISIONS EXACT** (gpu, off-device) / **SAME DEVICE** (gpu, probe matched and sim chain verified).
- **A kernel version bump** (`js.gs.v1` → `js.gs.v2`) reports as *unverified (sim kernel changed)*, the same way `kernelMismatch` reports today — never a hard failure.

**R5 (recommend: adopt).**

## 6. The wall clock (#2094)

The diagnosis of record stands: `Date.now` reaches the Director (`curator/taste.js:217`, `state/slices/layoutSlice.js` press path), but the Director's outputs are stored in the take and playback never re-runs it, so replay cannot diverge.

**The law.** Nothing on the replay path reads a wall clock; anything wall-clock-derived is recorded as a decision (Tier D) at the moment it is made. The Director satisfies this. GPU sims satisfy it too — they run on the loop clock like every kernel (`dishFluid` "stamp" group E).

**What stays open.** The "(seed, press #) replays the same pick" comment in `layoutSlice` (#518) is untrue across machines. That only bites if a "replay the conversation" mode re-derives presses instead of reading the stored result.

**R6 (recommend: adopt).** State the law above; fix the #518 comment in a docs-only PR; **defer** passing loop ms as `nowTs` until a replay-the-conversation mode is ordered. #2094 closes on this ruling.

## 7. Rulings requested

| # | Ruling | Recommendation |
| --- | --- | --- |
| R1 | Three tiers; `simLaw` / `simBackends` / probe `device` header keys | Adopt |
| R2 | Two chains; sim verification advisory off-device; no statistical bounds | Adopt |
| R3 | Decision-seam rule (Tier S never writes resolver state; discrete decisions stamped; continuous sim visuals post-contract) | Adopt |
| R4 | JS kernels stay as the reference backend until K3 lands; dispositions per §4 | Adopt |
| R5 | Old-take handling and take-strip badges per §5 | Adopt |
| R6 | Wall-clock law; docs-only fix to the #518 comment; #2094 closes | Adopt |

## 8. What K1–K3 inherit, and what K0 does not do

**Inherited by every kernel slice:** the tier law; the decision-seam reader list (named in the PR); a parity-harness property suite in place of any pin it retires; same-device repeatability as the replacement for bit-exactness; the readback cost stated against the frame budgets; the take's `simBackends` entry for its kernel.

**Prerequisite probes (cheap, before K1 costing):** float render-target support (`EXT_color_buffer_float`) on the iPad Safari / Tauri WebView target — the WebGL2 ping-pong pattern depends on it, and it is the same ground the WebGPU spike (#2184) covers.

**Not in K0:** any code, any selfcheck change, any fixture re-record, any kernel resolution or substepping choice (K1 costing), the culture's generation cadence under GPU residency (K2), the swarm integration scheme and cap (K3), and the retirement of the JS kernels (a ruling after K3).
