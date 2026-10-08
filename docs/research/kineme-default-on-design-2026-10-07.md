# KINEME default-on — research + design (2026-10-07)

**Status:** research/spec only — KC-1 build halt in force since 2026-10-05
**Mockup:** `~/workspace/kc-topbar-mockups/director-motion.html` (v2: corrected per this doc)
**Applies KC-1 DS** · connects to #721 (Always-Alive law)

## 1. Research findings (verified in code)

### 1a. There are TWO kineme systems — the concept must name which it means
- **KINEME drivers** (`app/src/engine/kineme.js`): per-*instance* attribute
  modulation — breath (±9% scale, ~9s), drift (±2% canvas, decorrelated
  axes), pulse (16% scale thump, 2s), brush-wobble (boil-clocked edge
  wobble). Amounts 0..1, applied in `buildPlacements` stage C via
  `applyKinemeDrivers`. Amount 0 = hard gate (bit-identical to no kineme,
  math skipped). Shed tier ≥3 → identity. **Built, tested, but NOT wired:
  neither live path (`liveResolve.mjs:501`, `evalContext.js`) passes the
  `kineme` param — the default `null` means it never runs in production.**
- **Build A library** (`app/src/data/kinemes.js`): per-*asset* GPU motion in
  QUAD_VS — spin, rock, pulse, blink, bob. `assetKineme` store map
  (asset id → kineme id), 16-slot uniform table (`KINEME_TABLE_MAX`),
  per-instance phase from seed hash. **Wired and live**, but default map
  covers only 6 micro-HUD ornaments (`DEFAULT_ASSET_KINEME`). `kinemeRate`
  (0..4, default 1, audio-routable) and `kinemeTime` ride the scene contract.

### 1b. What's already alive by default
Layer-level life drift (`liveResolve.mjs` #425: per-layer drift offsets),
breath scale (#451, #287), noise-warp drift. Plus the standing
**ALWAYS_ALIVE mandate** (`docs/ALWAYS_ALIVE.md`): "Nothing on the canvas
is ever 100% frozen" — microscopic baseline drift even in rigid modes.
Default-on KINEME is this mandate made architectural, not a new philosophy.

### 1c. Taste signals are scene-level only — no per-instance taste exists
`getLoisVerdict()` / `scoreLoisHeuristic` score whole *scenes*.
`loisActivity.snapshot()` gives seed-level dwells and favorite/recall/
export logs. **Nothing scores an individual instance.** Per-instance
Curator amounts are not supportable by any existing signal.
- Partially existing but unwired: `kinemeBreath` layoutParam (default 0,
  range 0..1, audio route target) is declared in `layout-modes.js` and
  never consumed — the intended global amount knob, dead on arrival.

### 1d. No per-instance canvas picking exists
Zero picking/raycast machinery in the codebase. Per-*asset* override exists
as a mechanism (`setAssetKineme(id, null)` → static path) but has no UI.

### 1e. Perf constraints (real numbers)
- **Drivers:** CPU loop, n instances × active drivers, ~2–3 `sin()` per
  instance per driver per frame, inside stage C. At 800 instances × 3
  drivers this is real but bounded; the amount-0 hard gate and
  shed-tier-≥3 identity pin are the existing escapes. Must be measured
  against the 60fps budget before default amounts are locked.
- **Build A:** vertex-shader eval, a few ALU ops per instance — negligible.
  Cap is **16 distinct kinemes per frame** (uniform table); instances
  unlimited. Instance floats 18/19 are spent (KINEME.md).
- Governor already designs for this: "shed = freeze motion / pin to cell 0."

### 1f. Stale docs to not trust
`docs/archive/KINEME.md` "no build authorized" status predates the #784 merge;
§6 stepped-cell question still open; brush-wobble has no stage-C consumer
until brush mode (#894/#897).

## 2. The ironed-out concept

### Decision 1: "default on" applies to the DRIVERS, not the library
- **Drivers on by default** with small floor amounts (e.g. breath ~0.3,
  drift ~0.5 — feel call for Matt). The #721/Always-Alive floor made real:
  every placed instance breathes and drifts, phase-decorrelated by seed.
- **Build A library stays curated/opt-in per asset.** Defaulting spin to
  all 800 instances is visual chaos, not life. ROTATE's SPIN mode is the
  per-slider face of this same decision: spin is *chosen*, drift is *given*.

### Decision 2: four-way precedence with exact write contracts
| Layer | Writes | Honesty condition |
|---|---|---|
| SEED | phase only (already exists, deterministic) | always honest; writes nothing else |
| CURATOR | **global** amount scale 0..1 (one number, scene-level — the dead `kinemeBreath` param is its natural home) | needs taste.json or voice persona; without either → fixed neutral, never invents per-instance variation |
| DIRECTOR | driver *pattern* (which of breath/drift/pulse at what mix, named patterns) + `kinemeRate` | needs a real driver (voice/beat/audio); without one → DRIFT at floor. v1: DRIFT, SWELL (breath-forward), THUMP (pulse-forward, beat-driven). **BOIL cut from v1** — no consumer until #894/#897 |
| HUMAN | per-**asset** still toggle (mechanism exists, needs UI) + global `kinemeRate` (exists, 0..4, rate 0 = anchored freeze, no jump) | override beats everything |

Per-*instance* override ("tap instance on canvas") requires picking
machinery that doesn't exist — **phase 2**; v1 override is per-asset +
global rate.

### Decision 3: degradation ladder (KC-1 DS rule 3)
No taste signal → Curator amount = neutral constant. No beat/voice →
Director = DRIFT pattern. Shed tier ≥3 → identity (existing).
Pause/hold → anchored clock freezes (existing). Every fallback is a
*reduction*, never an invention.

### Decision 4: ROTATE connection (exact)
ROTATE's SPIN mode = assigning the Build A `spin` kineme to placed assets
via `assetKineme` (per-asset, human-chosen) — the opt-in library path, not
the driver floor. Dialog modes map cleanly: SPIN → Build A, RANGE → today's
static range, STEPPED → quantized static. No new engine work for any of them.

## 3. KC-1 DS mapping (per control)
- Director pattern selector: discrete named patterns → **TE**
- Curator amount (`kinemeBreath`): continuous 0..1 → **Davis**
- `kinemeRate`: continuous 0..4 → **Davis** (already slider + audio route)
- Per-asset still toggle: discrete → **TE**
- Phase: no UI (seed-derived; rendering it would be decoration)
- The motion itself: **Davis** by nature; shed-freeze is the TE exception

## 4. Open questions for Matt
1. Default driver amounts — breath 0.3 / drift 0.5 as floor? Feel call + 60fps budget check.
2. Build A default scope — keep the 6 micro-HUD ornaments only, or extend to more asset families?
3. Curator amount granularity — global scene-level v1 (supportable now) vs per-instance (needs new taste signals — a real project)?
4. Override v1 — per-asset still toggle + global rate now, canvas picking phase 2?
5. Panel placement — Living Motion in DIRECTOR ◎ (as mocked) or BUILD/MOTION?
6. THUMP pattern — which beat source is the honest driver (phrase clock? audio attack?)?

## 5. Suggested issue shape
One issue: "KINEME drivers on by default (four-layer control)". Wire `kineme`
ctx into both live paths with floor defaults; Director pattern section on
DIRECTOR ◎ (v1: DRIFT/SWELL/THUMP); connect `kinemeBreath` as Curator
amount with neutral degradation; per-asset still-toggle UI; perf acceptance
(fps at 800 instances, shed behavior). Phase 2 (separate issue): per-instance
canvas picking. Out of scope: brush-wobble consumer (#894/#897), Build A
default-map expansion.

**Key files:** `app/src/engine/kineme.js`, `app/src/engine/buildPlacements.js:84-184`,
`app/src/gl/liveResolve.mjs:501`, `app/src/engine/kernel/evalContext.js:39`,
`app/src/data/kinemes.js`, `app/src/gl/sceneContract.js:279-300`,
`app/src/panels/DavisPanel.jsx`, `app/src/curator/loisRank.js:16`,
`app/src/curator/loisActivity.js`, `app/src/data/layout-modes.js:123-127`,
`docs/ALWAYS_ALIVE.md`, `docs/archive/KINEME.md` (partially stale — see §1f).
