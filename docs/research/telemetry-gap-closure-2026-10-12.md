# Telemetry Gap Closure

**Date:** 2026-10-12  
**Status:** Spec. ~100 lines of instrumentation on the existing 60-event bus.

## 15 gaps (G1–G15)

Build order: G1 and G8 first, then keep-side plumbing, then Director-side signals.

| ID | Gap | Unblocks |
|----|-----|----------|
| G1 | Epoch timestamps on favorites (currently time-of-day only) | ECHO, WANE, cross-day recency |
| G2 | ms-since-seed on favorites | — |
| G3 | recallFavorite logging | — |
| G4 | export hook with seed and palette | — |
| G5 | dwell windows | — |
| G6 | rolls-per-keep counter | HUNT |
| G7 | undo-burst detection | EDGE |
| G8 | activity heartbeat | — |
| G9 | MIDI presence | M11 |
| G10 | session length and cadence | TIDE |
| G11 | consecutive-window keep trend | WANE |
| G12 | seed-region pass clustering | WEED |
| G13 | evolve-from-kept-seed flag | GRAFT |
| G14 | palette/asset cast change mid-roll | DROWN |
| G15 | return-to-bloomed-seed | EMBER |

Sequencing: telemetry gaps first, then #762, then 16-state surfaces and folder watch. Docs are ahead of runtime — correct order, but next build phase closes timestamp, pass-logging, and selfcheck edges before anything renders.
