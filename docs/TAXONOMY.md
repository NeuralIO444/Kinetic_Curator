# Taxonomy — LOOK / VOICE / SYSTEM / CAST

Standing vocabulary for KC-1. Amends the face language in [TEMPO_AND_CHIPS.md](TEMPO_AND_CHIPS.md) (`PRESET` on the deck → **LOOK**). Apply logic does not change here; names and homes do.

Iterate by appending the Changelog. Do not silently reuse a banned word on a new chip.

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
3. No Look `id` may equal a voice id (`swarm`, `hype`, `murm`) or the showcase collision `murmuration` (rename that Look).
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

## Changelog

- 2026-09-28 — initial. LOOK replaces PRESET on the face. Four nouns. Boot is not a noun. #735.
