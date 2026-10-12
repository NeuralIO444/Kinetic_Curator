# KC-1 Voice Records — Trio 16-state expansion

**Date:** 2026-10-12  
**Status:** Spec. No runtime changes.

## LOIS — 16 verdicts

Existing (4): NOD, VIBE, BURN, AWAY  
New (12): LEAN, CRIT, CALC, KILL, GOLD, HUNT, SPARK, EDGE, ECHO, TIDE, WANE

Conviction math:  
`intensity = ledger depth × verdict strength × recency`, clamped 0..1.  
Per-state scalar with half-life. NOD / GOLD / KILL decay 8s (moments); everything else 30s.  
Hysteresis: flip up at 0.55, flip down below 0.35.

Telemetry signals:
- HUNT — rolls-per-keep
- SPARK — first keep of session
- EDGE — undo burst + param tweak collision
- ECHO — seed older than a day recalled
- TIDE — steady 30-min cadence
- WANE — keeps dropping across consecutive windows

## DAVIS — 16 states

Existing (5): FLOW, SEEDLING, UGLY, STUCK, BLOOM  
New (11): SPROUT, WEED, GRAFT, MUTANT, CHURN, NEST, RIOT, DROWN, PEAK, ASH, EMBER

SIFT replaces UGLY as the Davis id (same signal, honest name).

Telemetry signals:
- SPROUT — first roll on fresh seed
- WEED — 3 consecutive passes on same seed region
- GRAFT — evolving from a kept seed
- MUTANT — Queen's temperature warming active
- RIOT — roll rate past 2× session mean
- DROWN — palette/asset cast change mid-roll
- PEAK — locked 60fps
- ASH — session-ending rolls without keeps
- EMBER — returning to a seed that previously bloomed

## THE QUEEN — 16 sways, zero verdicts

Built (5): M1–M5 (existing queenLean.mjs)  
Specced (11):
- M6 Libra equilibrium tilt (cap 5%, never forces a tie)
- M7 close-state persistence across sessions
- M8 recent-keeps ring buffer for palette warmth
- M9 silence-respect (missing signal = less, never different)
- M10 four transition lines per session
- M11 MIDI presence listening
- M12 dwell-at-keep weighting
- M13 time-of-night weighting
- M14 export-over-favorite weighting
- M15 shame relay (Director passed 3× in a row gets lean cooled)
- M16 Trio dampening when guest slot loaded

Sway table: 16×16 = 256 rooms. Each cell is a named room with its own copy line. Verdict strip reads top two convictions. NOD+BLOOM = AGREEMENT. NOD+SIFT = THE CLASH. The Queen never appears in any cell — she's the weather those rooms sit in.

Deniability: queenDeniability.selfcheck.mjs scans UI source for her identifiers. A hidden bias the user can find in the UI is a slider, not a seducer.

kc-voice/1 record shape: verdicts array of 16, conviction map with signal + half-life per state, sway table dimension. One versioned JSON per voice, validated fail-closed.
