# PERSONA ADAPTERS — the band learns from Matt (spec draft)

**Status:** SPEC COMPLETE for review — 6 questions ruled with Matt, 2026-11-18. No code.
**Depends on:** Persona Kernel (epic #2379) — P1 records, P2 tuning table, P7 band (the take's turn records are the training data).
**Lives at:** `docs/design/persona-adapters-spec.md`, labels `personas` + `ml`. Epic #2392; phase issues in §4.

## 0. Rulings so far

| # | Ruling |
|---|---|
| A2 (#2395) | **Decisions first (Q1, 2026-11-18).** Each persona's adapter learns its *decisions* (cut / go bold / agree / disagree / lay out / which move) as a small per-persona head shipped in `taste.json` (the tree-head path). For voice it only **chooses among Matt-signed lines** and when to say one — it never writes new lines. |
| A3 (#2396) | **Training signal (Q2, 2026-11-18)** — Matt's acts only, never persona opinions: a keep within the phrase after a turn = good; a pass / skip / re-roll within that phrase = bad; nothing = unlabeled (silence never counts against a persona); a kept take = weak positive on every turn in it; a lock or undo = strongest negative on the move it overrode. |
| A4 (#2397) | **Earn-in, no synthetic data (Q3, 2026-11-18).** No persona-grown labels for decision heads. Each persona plays on rules + the tuning table until it has ≥ 200 of Matt's labeled turns (tunable) **and** its head clears `HEAD_MIN_FIDELITY` 0.3 on held-out turns; then it switches over, one persona at a time. |
| A5 (#2398) | **Automatic retraining (Q4, 2026-11-18).** Nightly on the Mac Studio, only for personas with new labeled turns since their last train. A new head replaces the old only if it beats it on held-out turns; the old stays for one-tap rollback; every head version is stamped into the takes it played in (replay exact). A new head loads at the next launch, never mid-session. |
| A6 (#2399) | **Visibility (Q5, 2026-11-18).** No stage badge. DEV mode shows per persona: head version, labeled turns learned from, held-out score vs the 0.3 bar, and one-tap rollback. A one-line launch note when a head changes ("cover learned from 240 turns") — callsigns only; the Queen's learning is never shown. |
| A7 (#2400) | **Chemistry learns, within limits (Q6, 2026-11-18).** The relation biases (who agrees with whom) learn from Matt's keeps/passes as offsets that stay inside ranges set in `tuning.json`, so a persona's character never flips. |
| A1 (#2394) | Spec per-persona adapters next (Matt, 2026-11-18): each persona learns from Matt's own takes and keeps. |

## 1. What exists to build on

- `taste.json` is already a versioned artifact with heads, including an XGBoost tree head (`xgboost-trees`, T1–T3 #1579–#1581): Mac Studio distils, the app walks a small tree, the library never ships. Gate: `HEAD_MIN_FIDELITY` 0.3 (`curator/tasteGate.js`); the live taste head is at 0.595.
- The three-head plan (PERSONAE_TRIAD §2): LOIS judgment, DAVIS fertility, QUEEN inclination, one training run, one artifact.
- `docs/PERSONA_MLX_PIPELINE.md`: the two-ledger rule (learn from keeps, never clicks), user rows outrank persona-grown rows, the artifact records its mix.
- MegaMind S2 (`kc-voice/1` over local Ollama) and Mind (Apple Intelligence) are the language backends; the copy matrix rule: lines are Matt-signed, never invented.
- P7 (#2387) records every band turn: who played, who answered, agree/disagree/lay-out, inside a take that Matt keeps or passes.

## 2. Open questions (one at a time)

- ~~Q1~~ → decisions first; voice = choose among signed lines.
- ~~Q2~~ → Matt's acts only (A3).
- ~~Q3~~ → earn-in, no synthetic data (A4).
- ~~Q4~~ → automatic nightly, beat-the-old gate, rollback (A5).
- ~~Q5~~ → DEV readout + launch note (A6).
- ~~Q6~~ → chemistry learns within tuning-table ranges (A7).

No design questions remain open.

## 3. Technical decisions (Claude; Matt delegated plumbing in the Kernel session)

- **Model:** gradient-boosted trees per persona per decision kind (the existing `xgboost-trees` head format) — tiny, walked in-app, the library never ships. No neural net on the instrument.
- **Inputs per turn:** phrase context (bar, phase, bpm, energy, beat confidence), stage census (density, coverage, the TASTE principle scores), the call being answered (caller, move kind), the persona's heat and recent keep rate, recipe features v4. Nothing from the Wire or the Archive enters a decision head (they are context for words, not taste).
- **Labels:** extracted from take records (P7 #2387) + the keep ledger by A3's rules, on the Mac Studio (`studio/`), never in the app.
- **Artifact:** `taste.json` gains a `personas` section: `{ id: { version, kind, head, labeledTurns, heldOut, trainedAt } }` plus `relations: { "a→b": offset }` clamped to the tuning ranges. Missing section = today's rules, byte-identical.
- **The Queen's head:** learns the *size* of her timing sways inside their existing caps (inclination), never content. Never shown (A6).
- **Voice:** a per-persona line chooser ranks the Matt-signed lines that fit a moment; unsigned lines are never candidates.
- **Retrain:** a `launchd` nightly job on the Mac Studio (Matt's machine); versions kept in a local store with rollback; a new head loads at next launch.
- **Replay:** every take stamps the head versions it played with; replay loads those versions.

## 4. Build phases (after Kernel P1, P2, P7)

| Phase | Slice | Label |
|---|---|---|
| A0 (#2393) | Label extractor: takes + keep ledger → labeled turns (A3 rules), on the Mac Studio | `model:sonnet` |
| A1 | `taste.json` `personas` section + in-app per-persona tree walk + earn-in gate (≥200 turns, ≥0.3 held-out) + rules fallback; byte-identical with no section | `model:sonnet` |
| A2 | Trainer + held-out eval + beat-the-old + versioned store + rollback | `model:sonnet` |
| A3 | Nightly `launchd` retrain job on the Mac Studio | `model:haiku` |
| A4 | DEV readout + launch note + rollback button (A6) | `model:sonnet` |
| A5 | Chemistry: learned relation offsets clamped to tuning ranges (A7) | `model:sonnet` |
| A6 | The Queen's timing-inclination head (invisible) | `model:sonnet` |
| A7 | Voice: per-persona chooser over signed lines | `model:sonnet` |
