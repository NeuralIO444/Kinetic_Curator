# KC-1 — Layering & Branding: Tracks, Tape, and Patching

*Design doc — no code. September 18, 2026. Parked under the feature freeze;
builds only on Matt's word, phase by phase.*

How tracks share a *field* (shared Simplex/fBm, curl wind, live displacement,
FEED-as-weather) is [NOISE_AND_LAYERS.md](NOISE_AND_LAYERS.md). This note is
the tape, the caps, and the patch language. That note is the weather.

## 1. The concept

**KC-1**: one layer is one complete configuration of the Kinetic Curator system.
The name is a Teenage Engineering homage (OP-1, OP-Z); the full product name
stays Kinetic Curator.

This maps cleanly onto what already exists: every content layer already *is* a
full KC configuration — `layersSlice.js` stores per-layer seed, seed offsets,
palette, layout params, locked params, CA grid, and enabled assets. The design
below renames, caps, and patches that system. It invents no new architecture.

## 2. Where tracks live

The existing **LAYERS panel** (`app/src/panels/LayersPanel.jsx`, tag P08, ▦,
secondary zone) becomes the track bay. **No new panel** — the 4-surface
consolidation (PLAY / BUILD / ASSETS / OUTPUT) is untouched, and the TE rule
("remove controls, keep capabilities") holds: tracks and patching are rows
inside a panel that already exists.

## 3. KC-1 branding (Phase 1a)

Start small and reversible: the track slots in the LAYERS panel are labeled
**KC-1 … KC-4** instead of "Layer 1…". If the name feels right in the hand, it
spreads to the header later. Branding is a label change, not a refactor —
layer ids, snapshots, and undo history keep their existing shapes.

## 4. The 4+4 structure (Phase 1b/1c)

- **4 system tracks** (KC-1 … KC-4). Track 1 is live; tracks 2–4 render as
  **dimmed empty slots** — present but unreached-for. This is the earn-back
  rule made visible: a track earns its place when a performer reaches for it
  mid-set, not before.
- **Dimmed slots are virtual, not simulated.** An unreached-for track costs
  nothing — no snapshot, no sim, no render pass — until the performer taps it.
  The governor never pays for a track nobody is using.
- **+ ADD LAYER becomes reaching for a slot.** Tapping a dimmed slot arms that
  track (fresh snapshot, same as today's add). When all 4 tracks are live, the
  control disables with an honest reason ("4 tracks — the tape is full"),
  never a dead click.
- **4 FX slots.** FX layers (adjustment layers over everything below) get the
  same cap: 4, dimmed-until-reached-for, same honesty when full.
- 4×4 = 16 slots: the step-sequencer grid. Pocket Operators are 16 steps; the
  homage math works out on its own.

What this removes: today's unbounded `addLayer`/`addFxLayer`. What it keeps:
every capability — duplicate, solo, blend, opacity, reorder, FX stacks.

## 5. The tape is the limit (Phase 2)

No hard architectural cap is needed because the **governor is already the
tape** (OP-1 homage, per the manifesto and `docs/GOVERNOR_TE_ROADMAP.md`).
Each live track declares its cost through the existing measured cost tiers;
the tape counter (#295), budget ceiling (#296), and headroom needle (#297)
already show the budget honestly.

The new behavior this phase adds is small and specific:

- Arming a track (or FX slot) **pre-flights the budget**: the governor
  estimates the new track's cost against the chosen ceiling (FULL / SHOW /
  LEAN).
- If the tape can't afford it, the instrument says **TAPE FULL** — honestly,
  in the PLAY readout — instead of silently degrading the render. The
  performer can then choose: a leaner ceiling, fewer tracks, or shed
  something else.
- The governor never rewrites performer work (render-only overlays, per the
  existing contract). A full tape blocks new tracks; it never mutes live ones
  without the established shed ladder.

## 6. Cross-layer coupling (Phase 3) — patching, not stacking

All layers live in one engine, one coordinate space, one clock — so layers can
be *patched*, not just stacked with blend modes. Three coupling flavors, each
a per-track **PATCH** row inside the existing LAYERS panel (a small segmented
control: OFF / MOD / FIELD / FEED, plus a target-track selector). No new
panel, no new surface — two small controls per track, TE-minimal.

1. **MOD** — the source track's motion metrics (centroid velocity, agitation,
   density — already computed per frame) drive the target track's knobs
   (glow, fade, displace). AE parallel: expressions linking comps. Audio
   parallel: sidechain compression. The swarm gets agitated, the glow track
   blooms in response.
2. **FIELD** — the source track's particle field becomes attraction/repulsion
   for the target track's agents. Two systems hunting or avoiding each other
   in the same space. Same-coordinate-space physics the engine already runs.
3. **FEED** — the source track's composite becomes a texture the target track
   samples as its flow/displacement field. AE parallel: using a comp as a
   displacement-map source.

Each flavor is its own build issue and its own PR, and each needs Matt's eyes
before merge — coupling is felt, not unit-tested.

How FIELD / FEED should share one Simplex field, and why swarm wind should
use `curl2`, is [NOISE_AND_LAYERS.md](NOISE_AND_LAYERS.md) §2.

## 7. Icon inventory (throughout — Matt draws)

Smallest set covering the model. Every icon earns its place:

- Track select + on/off (the 4 slots)
- **MOD** — motion-to-knob routing across tracks
- **FIELD** — cross-layer particle force coupling
- **FEED** — render-to-flow-field feedback

Each phase's PR reserves its icon slots; Matt draws the actual icons. No
placeholder icon ships without his eye on it.

## 8. Build phasing

| Phase | Work | Issues |
|---|---|---|
| 1a | KC-1 track-slot branding in the LAYERS panel | branding |
| 1b | 4-track cap, dimmed unreached slots, honest full-state | tracks |
| 1c | 4 FX slot cap, same dimmed/honest treatment | fx cap |
| 2 | Governor TAPE FULL pre-flight for new tracks | tape honesty |
| 3a | MOD coupling (per-track PATCH row: OFF/MOD + target) | mod |
| 3b | FIELD coupling | field |
| 3c | FEED coupling | feed |
| — | Icon set production (Matt draws, per phase) | icons |

Phase 1 before Phase 2 (the tape needs countable tracks); Phase 2 before
Phase 3 (coupling multiplies cost — the budget must be honest first). Icons
ride along with each phase.

## 9. Non-goals (freeze holds)

- No new panels or surfaces. No 5th track. No node-graph patch bay.
- No product code in this doc. Each phase lands as its own scoped PR, CI-green,
  with Matt's merge word — visual phases additionally need his eyes.
