# STAGING REPORT — #617 MIDI learn (Phase 5)

Branch: `feat/617-midi-learn`
Base: main `34b1bff` (#1627, #1717)
(This file replaces the #1627 staging report at the repo root; that one remains in git history — the stack convention.)

## What was built

Learn mode for MIDI, the Ableton pattern: press LEARN on a row in the DAVIS MIDI section, touch a pad or knob, and that control is bound to that row. Esc or CANCEL backs out. This un-defers the `midi/learnDeferred.mjs` stub into `midi/learn.mjs`.

- **`midi/learn.mjs`** — pure arm / cancel / claim logic plus `routeLearnMessage`, the engine's `onMessage` handler (the same code the hook runs and the selfcheck runs). Transport-agnostic: a message is a message whether Web MIDI or BLE-MIDI delivered it, so the open iPad scoping question (#617, 2026-10-07 review) does not block this build.
- **Gesture rules.** A note-ON or a CC is a gesture. A note-OFF is never claimed, so a pad held down before learn was armed still releases a FREEZE hold. A pad aimed at a knob target is claimed but refused loudly (`wrong-kind`); learn stays armed and the UI says why.
- **`midiSlice`** — `midiLearn` and `midiLearnRefused` (session state, never saved), `armMidiLearn`, `cancelMidiLearn`, `completeMidiLearn` (binds, moving any earlier binding of either side, and disarms).
- **`useMidi`** — routes engine messages through learn; MIDI off disarms.
- **`MidiSection`** — every target is a row with its bound key, LEARN/CANCEL, and ×. LEARN is disabled with no connected device (nothing to wiggle), and learn disarms if the last device goes away.
- **Docs** — `BUGLIST.md` deferred-seam row; `deferredStubs.selfcheck.mjs` no longer asserts the learn stub's inertness.

## What was NOT done

- **Not verified on hardware.** No MIDI controller was available. The FM-1 arrives Fri Oct 23. The #617 acceptance lines (a knob and a pad mapped end-to-end on a real device, reload persistence, unplug mid-set) still need a real controller.
- No BLE-MIDI / iPad path — still awaiting Matt's ruling (BLE-MIDI vs "desktop-only v1, iPad follows").
- No e2e spec added for the new UI: the e2e suite cannot run in the sandbox (app boot under software GL never completes), so an unrun spec would be a guess. Behaviour is covered at the store + engine level.
- Picker targets, banks and legend are #1720; #608 Syphon is not part of this branch.

## Evidence

- `node src/midi/midi.selfcheck.mjs` — OK, including the new learn blocks (pure learn logic, and the real store + real engine against a fake MIDIAccess: knob, pad, refusal, re-learn move, pre-held FREEZE release, cancel, not-saved).
- Mutation check: removing the note-OFF guard makes the selfcheck fail on "a note-OFF is never the gesture".
- `npm run lint` — 0 errors (the same 11 existing hook-dependency warnings as main).
- `npm run build` — green.
