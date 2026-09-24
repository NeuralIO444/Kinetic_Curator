# Roadmap to v1

*Plan, not tickets. September 23 2026 — KC-1 v0.9.0. Matt orders every stage; nothing here is assigned. Research input: [`BENCHMARK_REPORT.md`](BENCHMARK_REPORT.md) (direction document feeding Stages 1–4). Track work in open issues; this doc is the map, not the ledger.*

**Version answer:** we are at **0.9.0** (`app/package.json`) — pre-1.0, one selfcheck-verified engine (spines A–G merged), panel consolidation ~70% (Phase-1 reversed, DAVIS/STIMULI kept as homage), **embargo lifted 2026-09-23** (Night Migration 30/60 sign-off recorded in `EMBARGO.md`; Stage 1 unfrozen, deferred pile still waits).

---

## Stage 0 — v0.9.x · NOW *(where this research lives)*

- Engine spines A–G shipped; KINETICS bug queue cleared (#450–#458 fixed, #422 → #480 residue, #478 flake margined).
- Governor R1–R4 landed (#482–#485): merged readout, named stages, budget knob, FX-weight tape.
- Tracks lanes landed: PATCH sliders (#506), inline diagnostic (#507), MOD steering + shared scent (#509 phases 1–2), gate dead-list cuts, cohesion dim reason.
- **Render/biology audit (2026-09-23, wired-vs-dead bar):** all six bio-drives mechanisms LIVE (call chains traced); render inventoried (single core, CPU integration, 16F accum → 8-bit clamp, divisors in use, full-frame uploads). WebGL2 capability research feeds Stages 1–4 + Beyond.
- Open and ordered: #471-A (jitter), #479-B (BEHAVE weights), #503 (ballistics shaping), #484 (R3 close word), #480 (env), Matt-only feel/hardware.
- Filed, unstarted: motion factors #515–#519, EF rack #520, MIDI/OSC #228 (scope first).

## Stage 1 — v0.10 · PLAY *(feel + board clean)*

- #471 (jitter glide) + #479 B (editable BEHAVE weights, per-layer, persisted).
- #503 ballistics shaping decision (single-vs-double) + lookup already cleaned.
- **Motion factors #515–#519** (retune → flagship values → stub MIX road → persona biases → curated assets).
- **EF rack #520** (EF-4 exclusivity → post-accum seam → families → rack UI).
- Matt-only feel set: #346 icons, #298 M3 calibration.
- **Render fidelity (zero sim risk):** half-float accum path audit → ACES-approx + dither final pass (`RESOLVE_FS` bare clamp today); instanced sub-range uploads (remainder after spine G).
- *Exit:* you play it and nothing feels wrong.

## Stage 2 — v0.11 · SHARE *(the benchmark's #1 + #2 — the highest-leverage stage)*

- **Shareable recipe URLs** — seed + sub-seeds + params + palette in the hash; `…/#r=…` loads anywhere, zero account. **The single highest-leverage fix** (BENCHMARK E): turns determinism into distribution.
- **Tour/manual re-aim + helpCopy sweep** to the four-tab world; first-five-minutes fix (gap B.2).
- **Lowercase/label consistency pass** — TE credibility item; chips keep fixed color+shape identities.
- FAVORITE/preset becomes a link you can send; gallery-lite = links in the wild (no server).
- *Exit:* a stranger opens your link and lands in your composition.

## Stage 3 — v0.12 · PERFORM *(the instrument leaves the laptop)*

- **MIDI/OSC build** — #228 scope doc first (WebMIDI vs `localhost:9001` OSC relay), then implement; the benchmark's gap B.3, table stakes everywhere.
- **Live-output path** — projector/second display at minimum (gap B.7).
- **Mobile touch pass** — #270 device pass on Matt's iPhone, then touch work (gap B.6).
- **GPU fields for the Oxman/Haeckel world (ordered 2026-09-23, WebGL2 fragment ping-pong — the gpu-io shape, not a dependency):** trail field first (scent grid goes GPU: deposit + diffuse/decay texture, mold steers off taps), shared curl-wind texture second (spine F's weather as one field all tracks sample). Agents stay CPU until both fields are proven. Pattern reference: gpu-io (Amanda Ghassaei) kernels as templates; transform feedback waits until fields are proven.
- **Vertex-shader ambient animation** — hash(seed,id)+time wobble for background layers, zero upload.
- Tape lane + TEMPO_AND_CHIPS parked set, if Matt un-parks it post-sign-off.
- *Exit:* KC-1 survives contact with a real set — controller, projector, phone.

## Stage 4 — v1.0 · RELEASE

- **#248 completion** — four-tab end-state (BUILD · PLAY · ASSETS · OUTPUT), DAVIS/STIMULI homage sections landed per the hybrid pick, helpCopy/tour text final, DECISIONS.md ticks.
- Community surface: share links + examples page; embed/remix only if Stage 2 proved demand.
- Disaster recovery story (export everything / import everything round-trip honest).
- Docs/examples layer (gap B.9) at the level a release implies.
- Version bump `0.9.0 → 1.0.0`; release notes name the moat: *browser-native, deterministic, governor-honest performance visuals.*

---

## Principles carried through every stage

- One fix per PR, CI green, feel sign-off is Matt's; docs PRs self-merge on green.
- 4-tab cap holds; nothing deleted, controls move; no labs until the embargo note says so.
- **Phase gate (Matt, 2026-09-23): no phase advances with carryover.** Each phase ends harden → refactor → optimize → verify. A phase is done when everything in it is in, not when the interesting parts are.
- **LIVE-or-cut (Matt, 2026-09-23): "present in code" means nothing.** At every phase gate, each mechanism is audited: LIVE = a proven call chain from the running instrument, anything else is wired or cut. No present-but-dead rides forward.
- Coding lanes belong to the active coding agent; this roadmap is ordering surface for Matt only.

---

## Beyond v1 — research (placed, not ordered)

- **Gray-Scott reaction-diffusion as modulation source** — needs its own design note first: the "technique matrix" `BIO_DRIVES_PLAN.md` cites does not exist. Write the matrix, then the sim.
- **Transform-feedback particles** — needs a determinism/parity design note first (CPU composition deterministic, GPU LSBs vendor-variable; ~10 CPU readers — neighbors, contacts, scent, leak, spine, morph-adopt, MOD, smear, FIELD/FEED, breed — must stay on GPU or read back).
- **Explicitly out:** pressure-solve fluids, raymarched SDF, WBOIT/MRT (each duplicates something cheaper at 10–50× cost — revisit only if art direction demands it).
- **WebGPU:** stay WebGL2 until transform-feedback/ping-pong is exceeded. No second pipeline before then.
- **Audio ballistics (#503):** single shaping point + wire-or-delete the read-never lookup.

## Phase-gate dead-list (wire-or-cut — Matt's call per item, none rides forward)

From the 2026-09-23 wired-vs-dead audit; each gate clears its own dead before advancing:
- `engine/materials.js` (no live importer) · `gl/glyphAtlas.mjs` (baker, no callers; renderer throws on textRuns) · `QualityRow` null-mount with dead props · contact-system UI (engine live, performer-unreachable) · `voiceState.ballistics`/`s.ballistics` read-never (see #503) · `shimmer/` prototype mounted while embargo defers shimmer.

*Open questions stay open questions — flagged, not silently resolved.*
