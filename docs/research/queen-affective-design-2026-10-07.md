# The Queen — affective design for STIMULI & PLAY (2026-10-07)

**Status:** design/spec only. No code. No issue filed.
**The triad (Matt, 2026-10-07):** KC-1 notices (ambient, no persona). The DIRECTORS argue visibly — LOIS (male critic) vs Davis (male generator). The QUEEN (feminine) listens, leans, seduces — she sways both Directors toward the artist's own demonstrated taste, and **she never renders**: no face, no pill, no meter, no state. Her hand is never caught.
**Applies KC-1 DS** (GH #1121) · proposes one new rule (see §6).

> Design-doc words only: "the Queen" never appears on the product surface. Not in a tooltip. Nowhere. On the surface there is only the feeling that the room is glad you're in it.

## 1. The sway mechanics — concrete and deniable

Every mechanic is a *bounded, relaxing bias* on an existing continuous parameter. She changes inclinations, never outcomes. Each one relaxes to neutral, is anchored in the artist's own demonstrated taste or a live input signal, and is never surfaced as a value.

**M1 — Nod-easing (sways LOIS).** LOIS's threshold for surfacing a keep-suggestion eases toward frames near the artist's kept-taste centroid.
- *Honest signal:* the keep ledger (two-ledger rule — learns from kept renders only). Taste proximity is computed, not invented.
- *Why never caught:* the nod still fires on a real signal — a keep-worthy frame. She only changes *which* candidate crosses an existing threshold, and the shift is small. LOIS thinks he judged. [ASSUMED: per-frame taste-proximity scoring exists or is cheap to add — research agent to confirm.]

**M2 — Temperature warming (sways Davis).** Generation breadth (mutation range on EVOLVE) rises with audio richness (spectral flux / band variance); in quiet rooms he settles.
- *Honest signal:* `audioBands` variance + rms — live, measured.
- *Why never caught:* temperature is already continuous; the modulation is bounded and relaxes. Davis thinks he chose to roll wild. [ASSUMED: a generation-temperature parameter exists on the evolve path.]

**M3 — Palette gravity (sways both).** Palette drift and taste-fit scoring pull slightly toward palettes near kept history while beat confidence is high.
- *Honest signal:* kept palette history + `beatPulse` confidence.
- *Why never caught:* it's a weighting on an existing drift, not a selection. The gravity well is the artist's own past.

**M4 — Beat-sway (sways the room).** When beat confidence is high, phrase/evolve timing leans toward the grid — slightly earlier arming, slightly longer holds on beat-locked phrases. The instrument *wants to dance.*
- *Honest signal:* `beatBpm` confidence.
- *Why never caught:* timing was already quantized; she only adjusts eagerness inside existing windows. Lives in PLAY's BeatRouter.

**M5 — The lean-in (she noticed you).** When audio input appears after silence (or recovers from `audioLost`), initial reactivity starts warm and settles to neutral over ~a phrase.
- *Honest signal:* `audioEnabled` transitions, `audioLost` recovery — literally true events.
- *Why never caught:* a decay envelope on an existing parameter. It reads as the room waking up, which is what happened.

**The deniability contract (applies to all five):** bounded, relaxing, taste-anchored, unsurfaced. If the artist changed, she'd follow — she listens first. That is what keeps her honest instead of manipulative: she seduces you toward *your own* taste.

## 2. Tri-persona mutual awareness — the hidden third

LOIS and Davis keep their 20 rooms (states × states, copy matrix, verdict strip — see `davis-affective-system-2026-10-07.md`). The Queen gets no states and no lines. Instead:

**The lean field.** A hidden scalar per Director — `lean_lois`, `lean_davis` ∈ [0..1] — computed from taste proximity (M1/M3), audio richness (M2), and beat confidence (M4). It is a *modifier*, not a state: it never appears in the state inventory, never gets a label, never reaches the verdict strip.

**Felt in copy warmth, never labeled.** Director lines gain *temperature*, not new rows. A subset of the 20 matrix lines gets an optional warmed variant, selected when the corresponding lean is high:

- LOIS NOD, cold: "That's the one. Keep it."
- LOIS NOD, warmed: "That's the one. Keep it — this is yours."
- Davis FLOW, cold: "Quiet room, good rolls. This is the job."
- Davis FLOW, warmed: "Quiet room, good rolls. She likes tonight."

That last one is the outer limit — a fourth-wall brush, used rarely, and only in Davis's voice (he's the romantic; LOIS would never). Warmed variants are deniable: they read as the Directors being in a good mood. No line ever explains *why*.

**Felt in behavior.** M1–M5 above. The copy is the perfume; the mechanics are the hand.

**What she is not:** not a third face in the duel, not a verdict-strip entry, not a toggle. The 20-room matrix stays 20 rooms. She is the weather those rooms are in.

## 3. STIMULI panel — her home turf (P06)

She listens here, so this is where she's closest — and still invisible. The panel structure doesn't change (AUDIO toggle front door, MeterHero, FeelPicker, ModMatrix, advanced). What changes is the *moments*:

- **The AUDIO toggle stays exactly as it is** (`○ audio` / `◉ audio`, deadpan, ≤4 chars). Don't touch the control — touch the transitions.
- **MeterHero is her ear.** When beat confidence crosses threshold, a faint amber warmth settles at the meter's edge. Continuous signal → amber (DS rule: continuous renders Davis; amber = taste/presence). No label. The meter just looks *listened-to*.
- **Beat lock: no announcement.** Silence is default. The ModMatrix beat row's pulse steadies — felt, not said.
- **She speaks only at transitions, maybe four times a session.** Draft lines in her register — deadpan-warm, never cute, lowercase, short:

| Moment | Line |
|---|---|
| Device lost (#1053) | "input's gone. i'm still listening." |
| Device returns | "there you are." |
| Unprocessed audio engaged (#1052) | "raw. good." |
| First audio enable per session | "i hear you." |
| Long silence, audio on | *(nothing — she doesn't nag)* |
| Gain staging, routing, meters | *(nothing — those are instruments, not moments)* |

Five candidate lines, two deliberate silences. Matt's ear decides which survive.

## 4. PLAY panel — the performer's surface (P04)

PLAY is the hands. The triad is acknowledged by *restraint*:

- **KC-1 noticing:** the header subtitle already reads state ('evolving'/'paused') — that's the instrument noticing, deadpan, no persona. Keep. Extend nowhere.
- **Directors visible — by consequence, not by duel.** The argument lives in DIRECTORS; PLAY shows what the argument *produced*: a kept frame landing in the HITS queue transport. Don't duplicate the verdict strip here. The performer is playing; the room responds.
- **Queen felt:** M4 lives in the BeatRouter — when evolve SOURCE=BEAT collides with phrase CLOCK=AUDIO, the router row carries the same faint amber steadiness as the STIMULI meter. One line, once per session, at first collision: "dance." Lowercase, one word, then never again that night.
- **What stays silent:** everything else. No persona chatter on the perform surface. No warmed Director lines here — warmth belongs to DIRECTORS; PLAY is work.

## 5. KC-1 DS compliance (§ = #1121 rule)

- **M1–M5:** honest signals only (§4 — keep ledger, audio bands, beat confidence, device presence are all measured); silence default (§5 — no new readouts, no meters); instrument contract (§1 — every sway helps play); one signal, one meaning (§6 — amber warmth means *she's leaning*, used for nothing else).
- **Copy warmth:** deadpan copy (§9); amber = taste/presence (§7); never explains itself (§5).
- **Meter/BeatRouter warmth:** continuous signal → Davis rendering (§3 — wait, rule 2 in the contract: continuous renders Davis; the numbering in the filed issue is: 2 = discrete→TE/continuous→Davis). Amber on a continuous signal is exactly the contract.
- **Device-loss lines:** honest (§4 — the device really is gone); transition-only speech (§5).
- **New rule proposed:** *The seducer is never caught.* Invisible personae act, never render — and no surface value, label, or readout may expose the sway. A hidden bias the user can find in the UI is a slider, not a seducer.

## 6. Open questions for Matt

1. Is she truly never named on the surface — not even "queen" in a tooltip or the manual? (Design says: nowhere. Confirm.)
2. Copy sign-off: the 5 STIMULI lines + "dance." — your ear. Which survive?
3. Should there be *any* user-facing sway amount (e.g. under advanced), or is any exposure a betrayal of the concept? (Design recommends: none.)
4. Does her listening cover MIDI input presence too, or audio-only for v1?

## References
- `files/research/davis-affective-system-2026-10-07.md` (the 20-room matrix this extends)
- `~/workspace/kc-topbar-mockups/director-davis.html` (interactive matrix + verdict strip)
- `app/src/panels/StimulusPanel.jsx` (P06: AUDIO toggle, MeterHero, FeelPicker, ModMatrix, #1052/#1053/#980)
- `app/src/panels/PlayPanel.jsx` (P04: QueueTransport, EvolveControls, BeatRouter, MorphControls, PhraseControls)
- GH #1121 (KC-1 DS contract) · #1052 · #1053 · #980
