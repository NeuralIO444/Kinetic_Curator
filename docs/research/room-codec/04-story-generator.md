# 04 — The Story Generator

Status: architecture APPROVED in direction 2026-10-14; mechanics RESEARCH LANDED 2026-10-14 (full report: `story-lore-research-2026-10-14.md` in this folder). The concrete mechanics below come from that research — L4D's Director/response-rules, Hades' dialogue queue, CiF social facts, Wildermyth, and story-sifting (Ryan/Sheldon County/Bad News).

## Shape
A **state machine + line banks**, not a script and not a free-writing LLM:
- **Beats:** the machine picks the next beat from (room state, persona states, rapport/grudge, recent bus events, arc flags, tier). Beats are small: a proposal, a verdict, a lore aside, a suspicion flicker, a truce.
- **Lines:** each beat draws from its bank (Mind) or is written in-schema (Apple Intelligence / MegaMind), then recorded as a normal kc-voice/1 utterance — the transcript (`03`) just renders what the bus carried.
- **Episodes:** a session accumulates beats into a loose shape — cold open, argument, bloom, truce — chosen by the machine from how the session is actually going, never forced.

## Relationship mechanics (research-derived)
- **Append-only verdict ledger:** every verdict/crown/shed is a permanent record; all story state derives from it (sifted per session for streaks, reversals, debts).
- **Two directed, asymmetric scalars per pair** (his regard for her ≠ hers for him), each with a **fast mood** (decays in-session) over a **slow standing** (α ≈ 0.05–0.15 per event; persists across sessions).
- **Grudges are records, not moods:** the same offence a third time promotes to a named grudge with its own line bank and a forgiveness condition.
- **Belief ≠ truth** (Bad News): each persona reasons only from the evidence subset they've "seen" — the root of every misunderstanding beat, and of the split Queen evidence in `02`.

## Episode shape (research-derived)
Five phases, L4D peaks-and-valleys pacing: **callback → working → build → ONE peak → release.** Peak quota enforced (director removes pressure at high intensity); phase transitions sifted from the ledger, not timed.

## Anti-repetition (research-derived, 8 rules)
1. Consume, don't recycle: shuffle-bag per bank with **persistent seen flags** (Hades — lines exhaust before they repeat).
2. Salience beats variety: the *right* line outranks a fresh wrong one.
3. Best lines are rare on purpose: the cleverest bank entries gated to ~10% (L4D response rules).
4. Cooldowns at four levels: line, topic, storylet, move.
5. Compose from ledger referents (names, dates, counts) — specificity fakes freshness honestly.
6. Functional "bed" lines are exempt — plain utility lines may repeat; they're the floor, not the show.
7. Generated lines (Apple Intelligence / MegaMind) pass through the SAME gates — no ungated firehose.
8. **Silence is a line.** The machine may choose no beat; a quiet room is a valid scene.

## Gamification (existing Mind law, applied)
- Engagement tiers gate: lore depth, suspicion beats, longer copy, face detail (`06`).
- Progress is ambient and hidden (dev-panel metrics only) — the story rewards attention, it never demands it. No quests, no notifications, no streaks shown to the artist.

## Open for iteration
- Beat cadence budget per session (how much story is too much story).
- Episode shapes catalogue — how many, how distinct.
