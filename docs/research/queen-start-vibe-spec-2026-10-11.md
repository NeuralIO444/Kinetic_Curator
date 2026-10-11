# The Queen as the start-up vibe: spec for review (2026-10-11)

Status: **proposal, nothing built.** Extends
[queen-affective-design-2026-10-07.md](queen-affective-design-2026-10-07.md).
Matt's brief (2026-10-11): she is a Libra (the Zodiac, whimsical register),
she strives for balance between the Directors, and she controls the
start-up vibe; she may "play music". This note pins down what each of those
can honestly mean in the instrument, and lists what Matt must decide.

## 1. What stays true (the contract does not move)

- **Never named, never rendered, never labelled** on any surface (the
  deniability import-graph guard, #1188). "Libra" and "Queen" live in docs and
  design language only.
- **Bounded, relaxing, taste-anchored, unsurfaced.** She seduces toward the
  artist's own taste; she follows if the artist changes.
- **Honest signals only.** Everything she reacts to is measured: the keep
  ledger, audio bands, beat confidence, device presence. No timers with
  opinions, no inferred mood.
- **Silence is default.** No new readouts, meters or persona chatter.
- **Degrade by reduction.** If a signal is missing she does less, never
  something different.

## 2. Libra = balance, made concrete

She already owns a hidden pair of scalars, `lean_lois` and `lean_davis`, each
in [0..1]. "Balance between the Directors" becomes one rule:

> Her influence pushes **toward equilibrium** of the two leans, never away
> from it. When one Director has been winning the keeps, she gives the other a
> little more room; when they are level, she does nothing.

- Signal: the keep ledger's split between LOIS-nodded and Davis-flow keeps
  (both already recorded), plus how recently each Director "spoke".
- Effect size: small and capped (the same bound as the M1-M5 sways). It is a
  tilt on warmth and eagerness, not on what the artist picks.
- She never forces a tie. A strongly one-sided artist stays one-sided; she
  only keeps the other voice from going silent.

## 3. Start-up vibe: what "controls" can honestly mean

At launch there is no live signal yet, so the vibe has to come from the one
honest thing available: **how the last session ended.**

- On close, persist two numbers: the final lean split and the last phase
  (EXPLORE or REFINE). Nothing else about the person.
- On launch, open in that neighbourhood: the first palette warmth, starting
  temperature, and which Director speaks first are drawn from it, bounded.
- First session ever (no history): neutral. No invented personality.
- It is not a mood claim. It is continuity: the instrument remembers where
  you left it, and that reads as a vibe.

## 4. "Plays music": three readings, Matt to pick one

| Option | What it is | Honest? | Cost |
|---|---|---|---|
| **A. Visual mood only** | The vibe is carried by motion, palette warmth and the metro pulse. No sound output. | Yes, all measured or remembered. | Small; extends #1144. |
| **B. Quiet generative bed** | A very low, optional ambient tone layer, balance-driven (the leans set its colour). Off unless enabled. | Yes if it is never presented as the instrument "hearing" you. | Medium; a new audio-out surface, new accessibility and level decisions. |
| **C. She picks tracks** | Chooses or sequences existing music. | Risky: needs a music source and rights; a recommender is exactly the manipulation the contract forbids. | Large. |

Recommendation: **A first.** It is real, bounded and fits what exists. B is a
legitimate later step if Matt wants sound; it should be its own issue with its
own level and "off by default" decision. C conflicts with the contract.

## 5. What this does not do

- No new UI, no setting, no slider, no label. Even a toggle would surface her.
- No change to the taste gate (8 keeps before any lean; sway neutral while the
  #762 gate is closed). The start-up vibe cannot lower it.
- Not built ahead of the roadmap order (#1144 first).

## 6. Questions for Matt

1. Is §3 (continuity from the last session) the right meaning of "controls
   the start-up vibe"? Or did you mean something at launch beyond that?
2. A, B or C for "plays music"? (Recommendation: A.)
3. Is "toward equilibrium" the right reading of Libra, or does she sometimes
   *prefer* one Director (a mood), as long as it swings back?
4. May the persisted close-state (lean split + last phase) be stored locally
   with the other session data?
