# Technology Upgrades — Trio + DLC

**Date:** 2026-10-12  
**Status:** Spec.

Eight upgrades:

1. **File-system watching** — folders watched natively, dropped files self-install.
2. **Schema validation at the door** — every Look/Voice checked against kc-voice/1 before load. Bad file rejected with clear error, never silently ignored.
3. **Feature cache** — each Look gets a feature vector computed once at install. Trio reads the cache instead of recomputing.
4. **Event-bus subscription** — trio listens to the existing 60-event bus. New telemetry signals just publish; voices pick up what they care about.
5. **Selfcheck extension** — deniability guard extends to the Library render path so a card can't accidentally reveal Queen sway.
6. **Reduced-motion collapse** — prefers-reduced-motion collapses all 16 states to a single calm readout.
7. **Local-first** — everything runs on the machine. No server, no account, no telemetry leaving the box.
8. **Versioned formats** — kc-voice/1, kc-look/1. Old files still load; new fields optional. Migration is additive, never breaking.
