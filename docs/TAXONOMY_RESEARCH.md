# Taxonomy research — LOOK / VOICE / SYSTEM / CAST

Research trail that produced `#735` and PR `#736`. Spec lives in [`TAXONOMY.md`](TAXONOMY.md). This file is the *why* and the rejected alternatives, not the standing contract.

Date: 2026-09-28. Branch: `docs/taxonomy`. Ticket: #735. PR: #736 (draft).

---

## Question

KC-1 already split three objects in [`TEMPO_AND_CHIPS.md`](TEMPO_AND_CHIPS.md): engine mode, finished voice, layout costume. The face still said **PRESET / VIBE / HYPE** for all three. Operators could not tell which click would paint, which would change the cast, and which would only change placement.

The question was not "how do we apply a preset." Apply is already decided (#555: layout-only). The question was: **what are the nouns, where do they live, and how do we rename without breaking old project JSON.**

---

## Method

Read the live apply path and the data tables, then named collisions instead of inventing a fourth mapper.

| Source | What it showed |
|--------|----------------|
| `app/src/state/layoutSlice` | Look click already ignores `paletteId` / `assetIds` / `categories`. Comment: presets are layout-only. |
| `app/src/data/presets.js` `COMPOSITION_PRESETS` | Costume briefs. Some rows still carried `paletteId` / `assetIds` (First Light + Smoke Study). Showcase Look id `murmuration` collided with the Deep Water voice id. |
| `app/src/data/voices.js` `FLAGSHIP_VOICES` | Finished genomes. Ids frozen: `swarm`, `hype`, `murmuration`. Face titles still SWARM / HYPE / MURM. |
| `app/src/data/layout-modes.js` `LAYOUT_MODES` | Systems. `mode: 'murmuration'` is a swarm-sampler alias (#280), not a Look. `mode: 'hype'` is the moth engine, not the Chrome Parade voice. |
| `app/src/data/voices.js` `SHAPE_SETS` | `Object.keys(v.assets)` for flagships. Four-id maps used as both voice shelves and shape-chip sources. |
| `app/src/data/palettes.js` | Paint ids twin Look ids (`murmuration`, `chiaroscuro`, Rendah same-id pairs). Paint is not Look apply. |
| Issues #519, #555, #614, #615, #716, #717, #733, #734 | Cast lists, layout-only apply, bar placement, audio feels, Voices onto DAVIS, system pips, fork-only edit. |
| Screenshot of the top bar (operator correction) | Curator belongs **right of the KC-1 logo**, not on DAVIS. #614 body was the wrong home. |

External references used only as vibe, not as a port:

- [HYPE_Processing](https://github.com/hype/HYPE_Processing) — Joshua Davis / HYPE library. Homage, not a runtime dependency.
- [Tropism](https://joshuadavis.com/Tropism) — botanical-mechanical plates. HYPE Cast draft target (#519 keep-4), not a Look.

---

## Finding 1 — three objects, one skin

The board was already three types. The dirt was the labels.

| Object in data | Face said | What a click actually does |
|----------------|-----------|----------------------------|
| `layoutParams.mode` | HYPE / SWARM / grid / phi | Writes system only. Incomplete look. No MIX. |
| `FLAGSHIP_VOICES` | VIBE / HYPE / MURM | MIX genome: params + palette + cast + FX + `blendSeconds`. |
| `COMPOSITION_PRESETS` | PRESET | MIX `params` only. Paint and cast stay put (#555). |

Rejected: merge Voices into `COMPOSITION_PRESETS`. That would make a Look click a Voice click and break #555.

Rejected: give stubs `blendSeconds` so they feel like Voices. Stubs are Systems. Promotion is a fork (CHIP_LAB / #734), not a silent upgrade.

---

## Finding 2 — the `murmuration` pile-up

One string was four addresses:

| Layer | Id | Role | Action in #736 |
|-------|----|------|----------------|
| Look | was `murmuration`, now `dusk-flock` | Showcase costume on `mode: 'swarm'` | Renamed. Alias keeps old JSON loading. |
| Voice | `murmuration` | Deep Water flagship | Frozen. Face title later becomes Deep Water (#717). |
| System | `murmuration` | Swarm-sampler alias (#280) | Frozen. Engine, not a Look. |
| Palette | `murmuration` | Dusk-flock paint twin | Untouched. Paint may share a *name*; it must not be treated as Look apply. |

`resolveLookId` is Look-only. Running it on a voice load would rewrite Deep Water into Dusk Flock.

---

## Finding 3 — SHAPE_SETS is Cast, not a shelf

`SHAPE_SETS` is derived from flagship `assets` maps (and `slice(0, 4)` on stubs). `isShapeSetActive` is an exact-length match: the chip lights only when those four ids, and no extras, are on.

#519 asked for 20–40 shelves per flagship. That collides with the four-mark costume swap. Decision: **Keep 4** for chips. Shelves stay a later Cast list (#519 Tropism four for HYPE). Do not grow `SHAPE_SETS` to 20.

---

## Finding 4 — Look click is already clean

`layoutSlice` ignores `paletteId` / `assetIds` / `categories` on menu click. First Light rows may carry those fields; only `rollLivingBoot` consumes them so the plate is not empty. After boot the menu is Looks again.

So the "preset mapping" confusion was naming, not a broken apply path. A new apply path would have been a bandage.

`categories[]` is not Cast. Tags or delete. Do not enable assets from it.

---

## Finding 5 — homes

Operator correction vs #614:

```
◈ KC-1 → [LOOKS ▾] [VOICE ▾] [Curator] → paint strip
```

- Curator is a verb on the top bar (#716). Not a chip type. Not a DAVIS resident.
- Flagship Voices move to DAVIS (#717). Edit badge is fork-only (#734 / CHIP_LAB).
- Systems stay on the PLAY / BUILD row. #733 pips live there.

#614 (Curator onto DAVIS) was the wrong home and was closed `not_planned`.

---

## Finding 6 — versioning is its own clock

`project.format` bumps when a persisted key appears (e.g. #733 levels). Taxonomy bumps when nouns, homes, or click semantics change.

| Bump | When |
|------|------|
| PATCH | Face string / comment / extra example |
| MINOR | New noun, new home, or new alias capability |
| MAJOR | Look or Voice click semantics change (e.g. Look starts writing paint) |

Iterate by appending [`TAXONOMY.md`](TAXONOMY.md) Changelog **and** bumping `TAXONOMY_VERSION` in the same PR. Do not silently reuse a banned word on a new chip.

---

## Alternatives rejected

| Idea | Why not |
|------|---------|
| New apply mapper for Looks | #555 already correct. Names were the dirt. |
| Keep Look id `murmuration` | Selfcheck forbids Look id == frozen voice id. Collision is the bug. |
| Rename the voice instead | Voice ids are the genome key. Frozen. Face title can change; the string cannot. |
| Rename the engine mode | `#280` sampler + `isLiveSwarmMode` + curl-wind defaults all key on `mode === 'murmuration'`. Out of scope. |
| Port HYPE_Processing | Vibe / homage. Not a dependency. |
| Treat Tropism as a Look | Tropism is a Cast brief for the HYPE voice (#519). |
| Face copy in the same PR as the alias | PATCH belongs on #716 with the bar move. One honesty concern per PR. |
| Edit PERF / POLISH / session roadmaps | Frozen or historical. Soon queue in TAXONOMY.md is the board. |

---

## What #736 implements

Runtime contract, version **1.1.0**, compat `look-apply=layout-only`.

| File | Change |
|------|--------|
| `docs/TAXONOMY.md` | Standing nouns, bump rules, Soon queue, changelog |
| `docs/DECISIONS.md` | Pointer |
| `app/src/data/taxonomy.js` | `TAXONOMY_VERSION`, semver helpers, `LOOK_ALIASES`, `resolveLookId`, `FROZEN_VOICE_IDS` |
| `app/src/data/taxonomy.selfcheck.mjs` | Semver, no Look/voice id collision, alias rewrite |
| `app/selfcheck.manifest` | Manifest line |
| `app/src/data/presets.js` | Look id `dusk-flock`; `getPreset` resolves aliases |
| `app/src/data/layout-modes.js` | `normalizeLayoutParams` / `pickEnumOk` resolve aliases before the enum check |

Checked locally on the branch:

```
taxonomy.selfcheck: ok 1.1.0
normalize.selfcheck: OK (#106 — project sanitize)
```

Old project JSON with `composition: 'murmuration'` validates and rewrites to `dusk-flock`. Voice load of `murmuration` is unchanged.

---

## Soon — same vocabulary, later tickets

Do not start a new word list. These are the same class of bug as PRESET.

1. ~~Wire the alias~~ — landed in #736.
2. Face copy PATCH — PRESETS ▾ → LOOKS ▾. Tour, CuratorBar, helpCopy. #716.
3. Voice titles — Night Migration / Chrome Parade / Deep Water. Ids stay frozen. #717.
4. `FLAGSHIP_VOICES[].vibe` is liner notes. Face must not say Vibe. #615 feels stay audio-only.
5. `mode: 'hype'` (system) vs voice `hype` (Chrome Parade). Dirty Signal / Neon Brood stay Looks.
6. Palette twins — `murmuration`, `chiaroscuro`, Rendah same-id pairs. Paint ≠ Look apply.
7. SHAPE_SETS vs Cast — four-id maps are Cast, not shelves. #519 / keep-4.
8. `categories[]` — dead or tags. Do not enable assets from it.
9. `project.format` vs `TAXONOMY_VERSION` — two clocks. Bump project format only for new persisted keys.

---

## Related tickets

| Ticket | Role |
|--------|------|
| #735 | This system |
| #736 | Honesty + runtime (this PR) |
| #555 | Look apply = layout-only (already shipped) |
| #716 | Top bar: LOOKS + Curator right of KC-1 |
| #717 | Voices onto DAVIS |
| #519 | Cast lists (HYPE Tropism four) |
| #733 | System pips + weight mix |
| #734 | Voice dish, fork only |
| #615 | Feels (audio), not Voices |
| #614 | Closed `not_planned` — Curator is not a DAVIS chip |

---

## How to iterate

1. Change the standing contract in `docs/TAXONOMY.md`.
2. Append the Changelog.
3. Bump `TAXONOMY_VERSION` with the matching MAJOR / MINOR / PATCH.
4. If a Look id moves, add a `LOOK_ALIASES` entry and keep `resolveLookId` Look-only.
5. Keep `taxonomy.selfcheck.mjs` red until the alias target exists and no Look id equals a frozen voice id.
