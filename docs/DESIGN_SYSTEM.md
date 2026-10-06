# KC-1 Design System — "The Machine"

**Version 1.0 · 2026-10-05.** One system for one instrument. Built for a dark room,
a touchscreen, and hands that should never have to look down.

## 0. What the system is

KC-1 looks like **machined hardware, not software**: black, mono, square, pink-means-live.
Every control earns its surface; every color means exactly one thing; the slider you
touch in STIMULI feels identical to the one in BUILD. If a change doesn't serve
*perform, capture, learn,* or *guide*, it doesn't ship — and neither does a component
that duplicates one already in this document.

---

## 1. Design tokens

### 1.1 Color

| Token | Hex | Role — and the ONLY thing it's for |
|---|---|---|
| `--kc-bg` | `#0a0a0c` | App background. Nothing sits on anything darker. |
| `--kc-panel` | `#111114` | Panel surfaces. |
| `--kc-panel-2` | `#16161b` | Raised panel surfaces (drawers, wells, matrix rows). |
| `--kc-line` | `rgba(255,255,255,.08)` | Hairlines. |
| `--kc-line-2` | `rgba(255,255,255,.14)` | Stronger hairlines (active rows, selected tiles). |
| `--kc-ink` | `#e8e8e0` | Primary text. Warm off-white, never pure white. |
| `--kc-dim` | `rgba(232,232,224,.50)` | Secondary text. |
| `--kc-dimmer` | `rgba(232,232,224,.32)` | Tertiary text / ghost text. |
| `--kc-live` | `#ff2d6f` | **LIVE / ARMED / GO.** Active tab, RUN, RENDER FINAL, armed states. Pink is a promise: if it's pink, it's happening *now*. Never pink for paused, borders of paused things, or decoration. |
| `--kc-build` | `#ffd400` | **BUILD's working color.** BUILD sliders, active symmetry, BLEED/OVERLAP, MATH track badges. The color of making. |
| `--kc-stim` | `#00d9ff` | **STIMULI + generate.** STIMULI selections, GENERATE, palette wing generate. The color of input. |
| `--kc-ok` | `#00ff88` | **OK / paused-safe.** PAUSED chips, meter fills, TAPE. Green means "safe to look away." |
| `--kc-warn` | `#ffb000` | **Warnings / armed outlines.** Drift badges, caution. Never for "go". |
| `--kc-fx` | `#8a6cff` | **FX track identity.** Violet borders/badges; `#b49aff` when selected. |
| `--kc-kc` | `var(--kc-ink)` | **Content track identity.** KC tracks are neutral — the content *is* the color. The `KC` badge carries identity. |

Palettes (the 37 artist palettes) own the canvas; the chrome never competes with them.

**LOIS reserve** — locked to the LOIS pill, never used elsewhere:
`#1A1A1A` bg · `#F2EAD8` cream · `#D9A441` gold · `#6b655c` warm gray.
The pill is the only warm print-ad object in a cold machine. That's the point.

### 1.2 Type

- **One typeface:** `ui-monospace, "JetBrains Mono", "IBM Plex Mono", Menlo, Consolas, monospace`.
- **One exception:** the LOIS pill — `"Arial Narrow", "Helvetica Neue", Impact, sans-serif`, 10px/700. It stays the only non-mono in the app, forever. That's what makes it a face instead of a label.

| Role | Size | Weight | Notes |
|---|---|---|---|
| UI body / control text | 11px | 400 | Line-height 1.35. |
| Labels | 8–9px | 500 | `letter-spacing: .08–.16em`. Casing per §5, always via CSS. |
| Panel section headers | 11px | 700 | e.g. BUILD `① LAYOUT`. Circled numeral + letterspaced caps. |
| Readouts / numerals | 11px | 400 | `font-variant-numeric: tabular-nums`. Numbers never jitter. |
| LOIS pill | 10px | 700 | The exception. |

### 1.3 Spacing & density

Scale: `2 / 4 / 6 / 8 / 12 / 16 / 24` px. No other gaps.

| Surface | Rule |
|---|---|
| Panel section gap | 6px — BUILD density is the house density. |
| Control gap (inline) | 4px. |
| Live touch row | **44px minimum** hit area. Non-negotiable on anything a finger hits mid-set. |
| Panel header | 28px, tag chip + title + dim subtitle. |
| Layer track row | 44px collapsed; params expand below the row, never beside it. |

### 1.4 Radii, glow, shadow

- **Radii = 0.** Square corners everywhere. (Any 2–4px leftovers get zeroed in migration.)
- **No glow, no drop shadows.** Depth comes from `--kc-panel` → `--kc-panel-2` → `--kc-line` layering, not blur.
- The single permitted glow: `--kc-live` fill on the active tab / RUN — flat fill, not a shadow.

---

## 2. Components — the one of each

**The rule:** there is exactly one slider, one button, one chip, one toggle, one dropdown,
one track row. New work converges variants onto these. A new component must replace
at least two existing variants to earn its place (the "earn your surface" gate, §8).

### 2.1 The slider — `RangeRow`

- 44px tall hit area (the 44px touch target *is* the default).
- Square thumb, 14×18px. 3px track.
- Thumb color = panel accent: BUILD `--kc-build`, STIMULI `--kc-stim`, everything else `--kc-ink`. Form never changes; only the color speaks the room.
- Label + click-to-type readout + double-click reset + lock, per the existing `RangeRow` behavior (lock glyphs become `▪`/`▫` per §6 — the lock emoji dies).
- Every `input[type=range]` in the app goes through this. No bare ranges, no browser-blue thumbs. (Migration item M1.)

### 2.2 The button

- Square, 1px `--kc-line` border, 9–10px mono, `--kc-ink` text.
- Live-path buttons: 44px min height. Utility buttons (copy link, dice): 28–32px.
- **Direct-action buttons** do the thing (RUN, EVOLVE, RENDER FINAL). **Chooser buttons** carry a disclosure mark (`▸` / `≡`) and open the menu — the VJ rule: one tap = last-used default, long-press/chevron = choose. Buttons never fake a choice with a silent default.

### 2.3 The chip

- Bordered, dim text → hover `--kc-ink` → **active = inverted** (`--kc-ink` bg, black text).
- One chip. MODE/MOTION chips, symmetry chips, shape chips, FEEL chips all converge here.
- Active-by-color chips (BLEED/OVERLAP in BUILD yellow) are retired — active is always the inversion. Color carries meaning (§1.1), never "selected".

### 2.4 Toggles

- Glyph pair `○` / `◉` + label. Off is dim, on is ink. (MIRROR / OVERLAP / SHOW pattern.)
- No iOS-style switches. This is a machine; machines have toggle lamps.

### 2.5 Dropdowns

- Styled native `<select>`: square, `--kc-panel-2` bg, `--kc-line` border, 9px mono. The STIMULI route matrix's bare selects get the house style. (Migration item M9.)

### 2.6 Track rows (P08 LAYERS — the refined row-stack)

- **List order (#1037):** the list reads like the fold. Sections run **MATH / FX / CONTENT** top to bottom, and inside each section the **frontmost track is on top** (KC-1, the bottom of the picture, is the last KC row). What you see on top is applied last. ▲ means later in the chain, more foreground; ▼ the reverse. FX never crosses MATH (#1048), and KC tracks never cross the effects line.

- 44px collapsed row: type badge (`KC` / violet `FX` / yellow `M`) + Arabic numeral + name + reorder `▲▼` + hide `●` + solo `S` + `DUP` + `×`.
- Track-type identity: KC = neutral ink badge; FX = violet; MATH = BUILD yellow. Arabic numerals everywhere (Matt's #1016 ruling — Roman is retired).
- Opacity/wet slider inline (the ONE slider, §2.1).
- **Params collapsed by default; tap the row to expand.** Density through disclosure, not relocation. The tracks you're playing stay open; the rest stay one line.
- Dead rows are forbidden: no `blend —` on MATH/FX (removed), no ghost slots (one-tap `+` per section with long-press chooser instead).
- Whole-row tap targets, 44px. Reorder gives haptic-scale feedback; DUP-at-cap signals instead of silently failing.

### 2.7 Panel chrome

- **Tabs:** geometric glyph + ALL-CAPS label (`◆ CANVAS ◇ ASSETS ■ BUILD ◎ DIRECTOR ▸ STIMULI ▶ PLAY ⇌ PIPELINE ⬢ DEV`). Active = `--kc-live` flat fill.
- **Panel header:** 28px, tag chip (`P01`…) + title + dim subtitle. Uniform across panels.
- **Section headers (BUILD):** circled Arabic numeral + uppercase + 2.4px letter-spacing (`① LAYOUT`).
- **Tiles:** two-line — bold name + dim lowercase subtitle; selected = inverted.

### 2.8 The LOIS pill

- Fixed 168px, warm print tones (§1.1 reserve), Arial Narrow 10/700, kaomoji face.
- **Do not restyle it. Do not translate it into mono.** It's the one human thing in the machine.
- Its bluntness is a voice, not a theme: exactly **one LOIS line per panel**, reserved for empty states and naming moments (§7). Everything else stays instrumental.

---

## 3. Layout rules

- Canvas left, panels right. The picture is the hero; chrome never outgrows it.
- Top bar: one dense row — transport, voice selectors, palette strip, palette lab. All business, no second row.
- Master bar: LOIS pill → status (`● PAUSED` green, never pink-bordered) → meters → budget → transport (`▶ RUN` pink) → footer build hash.
- Drawers (palette wing, ASSETS) overlay the secondary zone; they never resize the canvas.

---

## 4. Motion & feedback

- **Subtle motion and vibe always, never static** (standing principle): when a driver drops out, the piece relaxes to its remaining drivers rather than freezing.
- Behave changes ease steering weights old→new over ~1s — no canvas jumps on pill switches.
- Reorder = visible slide; DUP-at-cap = shake/deny signal; solo = grey-out others, never a cut.
- NOD flashes ~2.6s, never latches; AWAY never latches. (LOIS pill behavior is spec, not style.)

---

## 5. Casing rule

**All casing lives in CSS. JSX strings are written lowercase; components decide.**

| Element | CSS | Example |
|---|---|---|
| Labels / descriptors | `text-transform: lowercase` | `route`, `depth`, `live`, `click a band to route it` |
| Actions / commands | `text-transform: uppercase` | `RUN`, `EVOLVE`, `RENDER FINAL`, `START: K.O.Z.` |
| Panel + section titles | `uppercase` + letterspacing | `P03 BUILD`, `① LAYOUT` |
| Proper names (palettes, voices) | `none` — as authored | `Vortex RWB`, `Night Migration` |

Rationale: labels are instrumental (quiet, STIMULI/PLAY voice); actions are commands (loud, DIRECTOR voice). JSX can never drift because it carries no casing.

## 6. Icon / glyph rule

**Geometric glyphs only. No emoji.** The dictionary:

`◆ ◇ ■ ◎ ▸ ▶ ⇌ ⬢ ◈ ↶ ↷ ↓ ↑ ⎙ ◉ ○ ● ▲ ▼ ▪ ▫ ⚄ ≡ ⟳`

| Retired | Replacement |
|---|---|
| 🎤 `AUDIO` | `◉ AUDIO` |
| ⚙ `SETUP` / settings | `≡` |
| 🔊/🔈 `MON ON/OFF` | `((·)) MON ON` / `((·)) MON OFF` |
| 🎲 `GENERATE` | `⚄ GENERATE` |
| 🔒/🔓 locks | `▪` locked / `▫` unlocked |

Kaomoji `(・_・)` appears exactly once: the LOIS pill. It is the only face in the machine.

## 7. Microcopy voice rule

Three voices, three rooms — never mixed in one label:

1. **LOIS-blunt** (Heller-adjacent): *"NAME IT — VOID didn't become real from hex values."* Reserved for empty states and naming moments. Exactly one line per panel. This is the voice leaking deliberately, not a sticker.
2. **Neutral-instrumental**: *"click a band to route it"*, *"not routed: MID · TREBL"*. Labels, hints, help. The default voice.
3. **Blunt-technical**: *"Syphon still does not send a frame from the browser."* Errors and honest limits only. Never softened, never LOIS-ified.

Rule of thumb: if the user is mid-gesture, voice 2. If the room is empty, voice 1. If something broke, voice 3.

## 8. Earn-your-surface gate (components)

Restated for components, from the feature gate: **no new component ships unless it replaces
at least two existing variants and names the loop part it serves** (perform / capture /
learn / guide). A variant that "just looks a bit different in this panel" gets converged
onto §2, not added.

---

## 9. What "done" looks like

A stranger opens KC-1 in a dark room and: every slider feels identical under the finger;
pink always means it's live; no label ever changes case between rooms; the only face
in the machine is LOIS; and nothing on screen can't be reached, read, and hit at 44px
without looking twice. That's the system.
