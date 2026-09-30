# Taxonomy — LOOK / VOICE / SYSTEM / CAST

Standing vocabulary for KC-1. Amends the face language in [TEMPO_AND_CHIPS.md](TEMPO_AND_CHIPS.md) (`PRESET` on the deck → **LOOK**). Apply logic does not change here; names and homes do.

Research trail (why, collisions, rejected alternatives): [`TAXONOMY_RESEARCH.md`](TAXONOMY_RESEARCH.md).

```
Version: 1.1.0
Compat: look-apply = layout-only (#555)
Frozen voice ids: swarm, hype, murmuration
```

Runtime: `app/src/data/taxonomy.js` (`resolveLookId`, semver helpers). Iterate by appending the Changelog **and** bumping `TAXONOMY_VERSION` in the same PR.

- PATCH — face string
- MINOR — new noun, home, or alias
- MAJOR — Look/Voice click semantics

Do not silently reuse a banned word on a new chip.

Decided 2026-09-28. Ticket: #735.

## Four nouns

| Noun | Meaning | Click | Source |
|------|---------|-------|--------|
| **System** | How bodies are placed | Writes `layoutParams.mode`. No full look. No downbeat wait. | stub chips; `params.mode` on a Look |
| **Voice** | A finished piece | MIX genome: params + palette + cast + FX + `blendSeconds` | `FLAGSHIP_VOICES`, MY VOICES |
| **Look** | Layout costume on a system | MIX `params` only. Paint and cast stay put. | `COMPOSITION_PRESETS` |
| **Cast** | Which marks are in the pool | Enables asset ids | voice `assets` maps; shape chips; later #733 weights |

**Palette** is paint. It already has a strip. Not a fifth board noun.

**Curator** is a verb (propose). Not a chip type.

**Boot** (`rollLivingBoot`) is a factory roll, not a noun: pick one First Light Look, pack palette + 2–3 cast ids so the plate is not empty. After boot, the menu is Looks again.

## Banned on the face

| Don't say | Say |
|-----------|-----|
| Preset (menu, chip, tour) | Look |
| Vibe (for flagships or Looks) | Voice or Look. #615 audio macros are **feels**. |
| HYPE / SWARM / MURM as system labels | Voice titles: Night Migration, Chrome Parade, Deep Water. Chassis stays `mode: 'hype'` in data only. |
| One-click voice (for a Look) | Look. Promote with a fork (CHIP_LAB). |

Internal code may keep `COMPOSITION_PRESETS`, `getPreset`, event names until a rename PR. Face copy must not.

## Homes

```text
TOP BAR
  ◈ KC-1
  [LOOKS ▾]     COMPOSITION_PRESETS, layout-only apply (#555)
  [VOICE ▾]     curator persona / overlap (existing)
  [Curator]     verb
  paint strip   palette (unchanged)

DAVIS
  Night Migration / Chrome Parade / Deep Water     Voices
  Evolve / phrase / beat                           machine
  edit badge (#734)                                fork a Voice, never overwrite factory

SYSTEMS row (PLAY / BUILD)
  grid phi flow ca orbit …                         Systems (#733 pips live here)
```

One home per Voice. After #717 the three titles leave PLAY.

## Data rules

1. Look click is layout-only. `layoutSlice` ignores `paletteId` / `assetIds` / `categories`. Selfcheck stays.
2. `paletteId` / `assetIds` on a Look are legal only on `group: 'firstlight'` and only consumed by boot.
3. No Look `id` may equal a frozen voice id (`swarm`, `hype`, `murmuration`). Enforced by `taxonomy.selfcheck.mjs`.
4. `categories[]` is not a Cast. Tags or delete. Do not enable shelves from it.
5. Stubs do not gain `blendSeconds`.
6. Promotion path: fork Look → Voice (CHIP_LAB C1 / #734). No silent promotion on click.

## First rename (honesty PR)

| Today | Face / id |
|-------|-----------|
| PRESETS ▾ | LOOKS ▾ |
| showcase `murmuration` | `dusk-flock` (was: murmuration) |
| Voice chips SWARM / HYPE / MURM | Night Migration / Chrome Parade / Deep Water |

## Related tickets

- #716 bar — `[LOOKS ▾]` in the gap next to KC-1
- #717 Voices onto DAVIS
- #519 Cast lists (HYPE Tropism four)
- #733 System pips + weight mix
- #734 Voice dish, fork only
- #615 Feels (audio), not Voices

## Soon — finish 1.1.0 then audit the other overloaded nouns

Do not start a new vocabulary. These are the same class of bug as PRESET.

1. **Wire the alias** — landed on `docs/taxonomy`. Look id `dusk-flock`; `getPreset` + `normalizeLayoutParams` call `resolveLookId`. Old `composition: 'murmuration'` rewrites to `dusk-flock`. Voice id `murmuration` untouched.
2. **Face copy PATCH** — PRESETS ▾ → LOOKS ▾ (tour, CuratorBar, helpCopy). Same mapper. #716. Not this PR.
3. **Voice titles** — SWARM/HYPE/MURM chips print Night Migration / Chrome Parade / Deep Water. Ids stay frozen. #717.
4. **`vibe` field** — `FLAGSHIP_VOICES[].vibe` is liner notes. Face must not say Vibe. #615 feels stay audio-only.
5. **`mode: 'hype'` vs voice `hype`** — system chip lowercase; voice title Chrome Parade. Dirty Signal / Neon Brood Looks that set `mode: 'hype'` stay Looks.
6. **Palette ids that twin Looks** — `murmuration`, `chiaroscuro`, Rendah same-id pairs. Paint ids may match a *name*; they must not be treated as Look apply.
7. **SHAPE_SETS vs Cast** — four-id maps are Cast, not shelves. #519 / keep-4.
8. **categories[]** — dead or tags. Do not enable assets from it.
9. **project.format vs TAXONOMY_VERSION** — keep two clocks. Bump project format only when a new persisted key appears (#733 levels).

Do not edit PERF/POLISH/session roadmaps for this. Those docs are frozen or historical. This section is the board.

## Changelog

- 2026-09-28 — initial. LOOK replaces PRESET on the face. Four nouns. Boot is not a noun. #735. (1.0.0)
- 2026-09-28 — 1.1.0 runtime: `taxonomy.js` semver + `LOOK_ALIASES`. Showcase Look `murmuration` → `dusk-flock`. Old composition id still loads. Voice id `murmuration` frozen.
- 2026-09-28 — Soon queue: finish alias wiring, then audit vibe/mode/palette-twin/SHAPE_SETS/categories/project.format.
- 2026-09-28 — alias wired in `presets.js` + `layout-modes.js`. `taxonomy.selfcheck` can go green. Face copy still PATCH (#716).
- 2026-09-29 — 1.2.0: fourth Voice `dark-glass` (face: DARK GLASS / Chiaroscuro), id frozen. Look `chiaroscuro` and palette `chiaroscuro` unchanged. #704.
- 2026-09-28 — research report: [`TAXONOMY_RESEARCH.md`](TAXONOMY_RESEARCH.md). No version bump (companion doc).
