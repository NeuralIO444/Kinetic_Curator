# LOIS telemetry audit — can every state be honest?

*Audit date: 2026-10-04. Repo: `NeuralIO444/Kinetic_Curator` @ `01995db` (main, post-#957). Read-only audit; no changes made.*

## Context

LOIS is a George Lois-inspired curator entity with 9 states: AWAY, LEAN, VIBE,
CRIT, NOD, CALC, KILL, GOLD, BURN. Matt's hard rule: **LOIS must never be
fake** — every state needs a REAL signal behind it, never a random timer or a
pretend opinion. This audit inventories what the app already captures, grades
each state, and specifies the minimal instrumentation to make the honest ones
real.

**Decision (2026-10-04):** ship 8 states, park CRIT behind #954 (the LOIS MLX
vector). CRIT is an aesthetic judgment nothing in the app can make until the
model is trained on real favorites-vs-keeps.

## 1. Signal inventory (file → what it records)

### Persisted (localStorage)

- `app/src/state/slices/davisSlice.js` → `kc:favorites:v1` (max 200): seed,
  seedOffsets, layout params, palette id, enabled-asset cast, **timestamp as
  HH:MM:SS time-of-day only — no date**. Capture points: DAVIS ★ button,
  **F hotkey** (`App.jsx`), `davis:favorite` bus event. Add/remove/reorder/recall
  all real.
- `app/src/curator/tasteStore.js` → `kc:taste:v1`: imported MLX taste.json,
  per-machine. Only exists if the user imports one.
- `app/src/state/slices/voiceSlice.js` → `kc:user-voices:v1` (with real epoch
  `createdAt`); `paletteLibrarySlice.js` → `kc:user-palettes:v1`;
  `projectDocument.js` → `kc:project:v1` autosave + `kc:pipeline:v1` (document,
  not behavior).

### Ephemeral but real (in-memory)

- `app/src/state/history.js` — undo stack, 50 deep / 8 MiB cap. Entries carry
  seed, seedOffsets, paletteId. Discrete user actions only (800ms debounce);
  **not persisted, lost on reload**.
- `app/src/state/slices/exportSlice.js` — snapshots (max 24): seed, offsets,
  layout, palette, resolution, thumbnail, time-of-day timestamp. Via ↓ SNAP or
  hotkey. **Not persisted.**
- `app/src/state/slices/globalSlice.js` — **`renderFault` sticky flag +
  `renderFaultReason`**: set on real deterministic render/atlas failures,
  cleared only by explicit recovery or reload. A genuine error signal.
- `app/src/composition/eventBus.js` — **~60 named events, the honest gesture
  stream**: `LAYOUT_PARAM` (every param tweak), `LAYOUT_CURATE` (curator
  presses), `DAVIS_FAVORITE` add/remove, `EXPORT_SNAPSHOT`/`EXPORT_RECORD`,
  `EXPORT_CLEAR_SNAPSHOTS` (with confirm), `LAYER_REMOVE`, `ACCUM_GESTURE`
  (freeze/clear/swell), FX add/remove/param, palette ops. Nothing is logged —
  just dispatched — but every LOIS trigger already flows through here.
- `app/src/panels/layout/KineticButton.jsx` + `kineticWarm.mjs` — tap routing
  with a component-local `lastTapRef` (ephemeral; #945's heat model lands on
  top of this).
- `app/src/curator/curate.js` — `curated pick` / `curated pick · mlx` hints.
  The `· mlx` suffix renders **only** when a real imported taste file is
  loaded — honestly gated.

### Not captured (the gaps)

- No idle/activity tracking whatsoever: no `lastActivity`, no
  `visibilitychange`, no inactivity timer.
- No dwell time per render. No session concept. No tap/click cadence log.
- Favorite/snapshot timestamps lack dates → cross-day recency is not derivable.
- `recallFavorite` replays a favorite but isn't logged → no "revisit" signal.
- Undo history is ephemeral.

## 2. Per-state drivability

| State | Verdict | Driving signal (honest) |
|---|---|---|
| AWAY | PARTIAL → buildable | Inactivity timer (pointer/key + `visibilitychange`) — ~20 lines, and "he's out of the room" is then literally true. |
| LEAN | REAL | Entering curation surfaces: `LAYOUT_CURATE` press, favorites tray opened, `recallFavorite`, palette strip browsing. All on the bus today. |
| VIBE | PARTIAL → buildable | Honest proxy = dwell: user lingers on a render without acting, or returns to the same seed. Needs new dwell tracking + revisit logging; neither exists yet. |
| CRIT | FAKE — parked | No honest "cautious/samey" signal exists. That's an aesthetic judgment about the work, and the app has no judge until the MLX taste model lands (#762/#954). Closest real signals (undo bursts, rolls-without-keeps) say "nothing's landing," not "this is samey." **Any CRIT today is theater.** Parks behind #954. |
| NOD | REAL | F key / ★ favorite: deliberate, persisted, full recipe. The strongest endorsement signal in the app. "That took courage" is earned. |
| CALC | REAL | `LAYOUT_PARAM` events — every slider drag is discrete and real. "Running the math on your last tweak" is literally true. |
| KILL | REAL | `renderFault` sticky flag (real errors), `EXPORT_CLEAR_SNAPSHOTS` (confirmed), `LAYER_REMOVE`, ACCUM clear gesture. All real, all wired. |
| GOLD | PARTIAL → buildable | Honest candidates, ranked: **(1)** favorite within seconds of a render/curate (speed of endorsement = conviction); **(2)** export/download — they took it with them, stronger than a favorite; **(3)** `recallFavorite` revisit — they came back to it later; **(4)** dwell + favorite combo. Needs: epoch timestamps (currently time-of-day), ms-since-render on favorites, recall + export logging. Real signals, missing plumbing. Must never be "the app decided this one is great." |
| BURN | PARTIAL → buildable | Same inactivity timer as AWAY at 15 min. "You've been gone 15 minutes" is a fact; the smoke is presentation. |

## 3. Minimal instrumentation (local-first, no cloud)

One new module, e.g. `app/src/curator/loisActivity.js` — **wall-clock lives
here, not in the store** (per the #806 must-loop law, same pattern as the
kinetic button's `useRef`). It subscribes to the existing event bus; almost no
new dispatch sites needed:

1. **Activity heartbeat** — `pointerdown`/`keydown` listener +
   `visibilitychange` → `lastActivityTs`. Feeds AWAY (>5 min) and BURN (>15 min).
2. **`favorite:add`** — extend `captureFavorite`'s timestamp to full epoch ISO
   (back-compat: keep parsing old HH:MM:SS) + record ms since current seed was
   set. Feeds NOD (the favorite) and GOLD (fast favorite = conviction).
3. **`favorite:recall`** — log when `recallFavorite` fires. Feeds GOLD
   (revisit = lasting value).
4. **Export hook** — tap existing `EXPORT_SNAPSHOT` / export-download events
   with seed+palette. Feeds GOLD (took it with them).
5. **Dwell windows** — on seed/composition change, close the previous window.
   Feeds VIBE (lingered >N sec, no action).
6. **Rolls-per-keep counter** — curate/KINETIC taps vs keeps in a window. Feeds
   a future honest "nothing's landing" nudge — but not CRIT's aesthetic judgment.
7. **Undo-burst detection** — N undos within M seconds (in-memory, from
   `history.js`). Honest "that wasn't it."

Roughly 100 lines. Everything else LOIS needs already exists.

## 4. Anti-patterns

**None found.** The codebase has an explicit anti-fake culture, stated in
comments:

- `personaTastes.js`: *"It is an interpretation, not a measurement… never
  faked."*
- `renderProfiles.js`: *"Nothing is faked… `gaps` lists what the persona file
  asks for that the current engine cannot express."*
- `tapeBudget.js`: *"an honest, defensible reading… not the full per-track
  estimate. Flagged for Matt's call."*
- `davisSlice.js`: *"Absent (legacy keeps) stays absent — never invent a
  cast."*

One caution: the persona taste weights are a human's hand-distilled reading of
persona files — honestly documented, but they're interpretation baked into
code, not measurement. Fine for curate; not a license to claim LOIS "knows"
Matt's taste.

## 5. Build order

1. Activity heartbeat + epoch timestamps (unlocks AWAY/BURN/GOLD-timing).
2. Dwell + recall/export logging (unlocks VIBE/GOLD).
3. The 8-state surfaces (#948 in-app pill, #956 TUI).
4. CRIT later, gated on the trained LOIS vector (#954).

## Key principle

The event bus is the gift: ~60 discrete gesture events already flow. **LOIS
subscribes, never polls.** And the help-overlay "field guide" (#956) quotes the
triggers verbatim — the creature explaining itself in true statements.
