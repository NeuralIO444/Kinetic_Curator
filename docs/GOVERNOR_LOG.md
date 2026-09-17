# Governor event log + X-ray guide view

**Plain language.** Two observability features for the Showrunner governor. They record and display only — the shed ladder, its order, and its timing are untouched.

## The event log

The governor protects your frame rate by shedding load (lowering resolution, dropping ACCUM/gloss/mirror, thinning assets, clamping counts, freezing motion, and as a last resort the watchdog hard stop). Before this change, it did all of that silently — after a set you had no record of what it cut or when.

Now every shed **and every restore** is recorded with:

- **timestamp** — when it happened
- **what the FPS window looked like** — the FPS at the moment, the threshold it crossed, and how long it had been low (e.g. "24fps, threshold 32, sustained 1.6s")
- **which cut was applied** — as its shed-order step (1 = resolution, 2 = quality, 3 = mirror/gloss/ACCUM, 4 = asset thinning, 5 = count clamp, 6 = motion freeze, 7 = watchdog) plus a human label
- **when it cleared** — a matching restore entry when the cut auto-clears on recovery

The point is the post-set review: *"it shed resolution twice during the dense section — that section needs a cheaper preset."* That's the governor teaching you, not just protecting you.

**Technical details:**

- The log lives in memory only (a module-level ring buffer, never serialized into project JSON).
- It is **bounded**: max 128 events, oldest dropped first — a long session can't grow it without limit.
- `exportGovernorLogJSON()` (`app/src/gl/governorEventLog.mjs`) dumps the whole log as JSON with a schema id (`kc-governor-event-log/1`), export timestamp, capacity, and the entries.
- You can download it from the X-ray panel (dev builds): **X-RAY → "export log (JSON)"**.

## The X-ray guide view (dev-only)

This is the **guide** leg of the loop: it teaches what each effect costs, so you make better art inside the limitations (the whole Teenage Engineering point).

- Only in dev builds: a new **X-RAY** tab in the secondary panel strip (registered like the Shader Lab — lazy-loaded, never in production bundles).
- **Governor cuts** — the seven shed-ladder steps with their live state: resolution scale %, whether tier-1 (mirror/gloss/ACCUM) is currently shed, asset thinning, count clamp, motion freeze, watchdog.
- **Pass chain** — every registered GPU pass with: name, declared cost tier (color-coded: 1 = shed-first, 2 = quality-scaler, 3 = cosmetic, 0 = structural), the declared time estimate, the **measured** GPU cost from the harness (hardening 3/6), the working-set size, and the **current shed state**.
- **Event log tail** — the last 12 events live, plus export and clear buttons.

**Honesty rule.** The silent-cull trap stays dead: the X-ray never shows a pass as active while the governor has it shed. When `perfTier1` is engaged, every tier-1 row reads SHED with the cut that did it. The production app keeps showing the ShedBadge (#192) — the X-ray is the dev microscope, not a replacement.

## For developers

- Code: `app/src/gl/governorEventLog.mjs` (pure event log), `app/src/gl/governorXray.mjs` (pure X-ray data builder), `app/src/panels/GovernorXrayPanel.jsx` (dev panel), `app/src/gl/governorEventLog.selfcheck.mjs` (CI gate — log records sheds/restores with cause, ring buffer bounds, export format, X-ray matches the registry, step mapping follows the ladder).
- Recording is wired into `app/src/hooks/usePerformanceGovernor.js` at the exact points cuts fire and clear — log calls only, no behavior change.
- `SHED_STEPS` in the log module maps cut kind → ladder step; it's asserted against the contract in the selfcheck.
