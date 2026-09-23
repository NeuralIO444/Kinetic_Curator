# Roadmap to v1

*Plan, not tickets. September 23 2026 — KC-1 v0.9.0, main `125d8ef`. Matt orders every stage; nothing here is assigned. Research input: [`BENCHMARK_REPORT.md`](BENCHMARK_REPORT.md) (this landed on the timeline at **v0.9.x — Stage 0**, as the direction document feeding Stages 1–4).*

**Version answer:** we are at **0.9.0** (`app/package.json`) — pre-1.0, one selfcheck-verified engine (spines A–G merged), panel consolidation ~70% (Phase-1 reversed, DAVIS/STIMULI kept as homage), embargo standing pending the Night Migration 30/60 play.

---

## Stage 0 — v0.9.x · NOW *(where this research lives)*

- Engine spines A–G shipped; board triaged (KINETICS batch commented, #422 → #480, stale refs swept).
- **This benchmark** — comparables, gap ranking, TE + Davis verdicts → direction input for every stage below.
- In flight: #486 (#456 track patches), warp-phase leftovers (#474), MIX churn (#455), z-fight (#451).
- Ordered but un-built: #471 mechanism A (evolve jitter), #479 shape B (BEHAVE weights).

## Stage 1 — v0.10 · PLAY *(feel + board clean — the instrument earns its own embargo lift)*

**Gate first:** *Matt plays Night Migration 30/60 → recorded in `EMBARGO.md` → new-feature work unfrozen.*

- #471 (jitter glide) + #479 B (editable BEHAVE weights, per-layer, persisted) + the swarmCohesion dim-fix.
- Bug queue to zero: #474, #455, #451, #478 (e2e flake tolerance).
- Governor R1–R4 (#482–#485): one budget readout, named stages, honest knob, tape-running-out.
- Matt-only feel set: #346 icons, #298 M3 calibration.
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
- Coding lanes belong to the active coding agent; this roadmap is ordering surface for Matt only.

*Open questions stay open questions — flagged, not silently resolved.*
