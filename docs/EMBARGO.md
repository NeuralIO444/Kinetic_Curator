# Embargo — no new features until the body is tuned

Matt, 2026-09-19. Coding agents: this file plus [AGENTS.md](../AGENTS.md) plus [ENGINE_PLAN.md](ENGINE_PLAN.md).

**2026-09-22 update:** spines A–F (#387–#392) are all merged and closed — the "in flight" table below is stale, kept for history. The code-side condition this embargo names ("C is merged") has been met, and D/E/F landed on top of it since. What has **not** been recorded anywhere: Matt playing Night Migration at 30/60 and signing off on feel. Until that sign-off shows up in this file, treat the embargo as still standing — do not read the merged code as an implicit go-ahead.

**2026-09-23 (Matt): Night Migration sign-off given — embargo lifted.** Matt confirmed the 30/60 feel is good; this is the sign-off this file has been waiting on since 2026-09-19. `docs/ROADMAP_V1.md` Stage 1 ("v0.10 · PLAY") work is unfrozen from this point: #471 (evolve seed-jitter fix, mechanism A) and #479 Option B (editable BEHAVE weights, per-layer, persisted) plus the swarmCohesion dim-fix proceed as real Stage 1 work, not one-off scoped exceptions like #465 needed. The deferred pile below stays deferred — this sign-off unfreezes Stage 1's own scope, not everything in `docs/` marked deferred; Studio labs, chip editors, species genomes, UV scroll, HarfBuzz, DLC packs, shimmer, TYPE chips, and new showcase rows still wait for a later stage or Matt's own re-ordering of this pile.

## In flight (historical — all closed)

```text
#387 spine A  dt clock            — closed, merged #405
#388 spine B  skip missing atlas cell  — closed, merged #406
#389 spine C  heading + ballistics + life  — closed (landed as direct push, not a merged PR)
#390 spine D  live mask tint       — closed (direct push)
#391 spine E  mode-chip dissolve + slider springs  — closed (direct push)
#392 spine F  shared noise + curl wind + organism vx  — closed (direct push)
```

**2026-09-23 (Matt):** the `shimmer/` prototype readout mounted in `EvolveControls.jsx` is **accepted as-is** — it stays. This line amends the deferred pile below: what stays deferred is the shimmer *sidecar/stage*, not the mounted prototype.

Planning docs in `docs/` marked **deferred** are allowed. They are not tickets.

## Deferred pile (do not file implement issues)

| Doc | What it is |
|-----|------------|
| [TEMPO_AND_CHIPS](TEMPO_AND_CHIPS.md) | Clock + slaves, after E |
| [TWO_PLANES](TWO_PLANES.md) | Studio / Perform |
| [ASSET_CHANNELS](ASSET_CHANNELS.md) | Face, UV, R/G |
| [ASSET_LAB](ASSET_LAB.md) | Species dish |
| [CHIP_LAB](CHIP_LAB.md) | Voice / system editor |
| [SYNTHETIC_BIOLOGY](SYNTHETIC_BIOLOGY.md) | Parts / chassis / burden vocabulary |
| [HARFBUZZ](HARFBUZZ.md) | Letter pack |
| [SHELL_BRAND](SHELL_BRAND.md) | Chrome constraints |
| [path/…](path/README.md) | Iconic layers 01–06 |

## Allowed now

Spine letters are all closed — do not reopen. #341 (FX 4-cap) landed as PR #412 (2026-09-22), issue closed. Matt-only feel (#374, #346, #298). Docs that *narrow* scope.

**2026-09-22 (Matt-approved):** #411 (item-level morph for chip clicks) and #413 (mode/behave quick strip + presets popup) landed during the embargo and are **covered** — accepted as in-scope engine/UI mechanics, not embargoed features. This coverage is not the Night Migration sign-off: the embargo above otherwise stands until that is recorded here.

**2026-09-23 (Matt, "465 go"):** #465 (morph arrival ease — `morphEase`, expoOut, swapped in at the single item-morph call site in `liveResolve.mjs`; palette dissolve untouched) is **covered** — a scoped feel-tuning exception, ordered only after #466 landed so the curve swap could not mask the two-clock jitter, per the issue's own sequencing gate. Not the Night Migration sign-off; the embargo above otherwise stands.
