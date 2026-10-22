# #1725 staging report — MIDI setup as a popup modal

Branch `ember/1725-midi-modal`, staged locally (not pushed, no PR — the coordinator publishes). Everything below was run and verified in this worktree. This file replaces the previous stage's report at the worktree root; that report remains in git history.

**What this is:** the DAVIS → MIDI setup (ENABLE, device status, bank bar, LEARN rows) moved off the PERFORM performance surface into a floating editor, per Matt's 2026-10-21 ruling on PR #1724's review. The key legend stays in the panel. A surface move only — no store, sanitizer, target, binding, bank, or learn-behaviour change.

## What moved where (3 files)

- `app/src/panels/davis/MidiSection.jsx` — restructured, same component, same file (the LEARN rows' JSX still lives here, so the midi selfcheck's source invariants hold unmodified):
  - **Panel:** a slim row — `midi` label, the status read, and a **MIDI** button — plus the **key legend**, unchanged, under it.
  - **Floating editor (new):** everything else — the ENABLE/ON chip, the full device status line + note, the last-message line, the learn prompt, the bank bar (chooser / rename / add / delete), and the LEARN rows for all 69 targets.
- `app/src/styles/panels.css` — `.davis-midi-state` (the row's read, in the status tones) and `.midi-editor*` (the editor chrome).
- `app/e2e/midi.spec.js` — the spec follows the surface (below).
  `DavisPanel.jsx` is untouched: it still hosts `<MidiSection />`.

## How the floating editor was reused

The CHIAROSCURO editor (`ChiaroscuroSection.jsx`, #1629) is the precedent and the parts are the same, not a parallel system:

- `createPortal` to `document.body`, `position: fixed`, **no backdrop, no focus trap** — the canvas stays live and rendering underneath.
- Placement from the same `shelfAnchor` (panels/shelfView.mjs): top-left of the canvas wrap's rect shrunk by the 16px inset, that rect as the size caps; the CSS hugs the window to its content (`width: max-content`) and the body scrolls internally past the height cap.
- Same dismissal grammar: the row's button toggles (`aria-expanded` / `aria-haspopup="dialog"`), **Esc or click-away closes**, re-anchor on window resize and on pointer-up (the column divider resizes the canvas without a resize event).
- Same chrome: `te-dock-kicker` ("CONTROLLER SETUP") + title + the `te-dock-close` × button; flat per DS — border only.

**One divergence, forced by the room:** Chiaroscuro closes the TE value dock when it opens. The dock's provider wraps `BuildPanel` only — no DockProvider stands above the DAVIS panel, and no dock can be open while DAVIS is on screen — so there is nothing to close here and `useDock` is not called (it would throw). Recorded in the component header too.

**Learn-armed dismissal rule (new, deliberate):** while learn is armed the editor does not close — Esc still cancels learn exactly as before, and click-away / the row's button / the × are inert until it disarms. Learn's mode must never sit armed and invisible behind a closed editor. This changes dismissal only; learn's exits are unchanged (Esc, CANCEL, device loss, MIDI off), and no learn behaviour moved.

## The panel row, state by state

The read is one honest line next to the MIDI button (tone follows `midiStatusView` — dim when idle, ink when ok, accent-ruled when warn/bad):

| State | Read |
|---|---|
| MIDI off | `off` |
| On, connecting or ready | `on · MAIN` (the active bank's name) |
| On, access denied | `refused` |
| On, browser has no Web MIDI | `no midi` |
| On, no device found | `no device` |

The full sentence (device names, the unplugged note, what to do about a refusal) lives in the editor's status line, word for word as before.

**The legend** renders exactly as #1720 built it — same markup, same classes, fed by the same store fields — so it follows the active bank whoever switches it: the modal's chooser, the modal's + button, or a BANK NEXT key on a controller. Silent when the active bank has no bindings (DS: silence is default).

## Fit / reachability assertions

- `app/e2e/directors-duel.spec.js` (the #1714 reachability contract: the davis body is a scroller, its last section scrolls fully into view, quiet and talking) needed **no changes** — its assertions measure the body and its last section and never named the MIDI section; the panel only got slimmer. This is the one place the build came in under the brief's expectation, and it is a measurement, not an omission.
- `app/e2e/midi.spec.js` is where the surface assertions live, and it was updated: boot opens the editor after the panel row; the ENABLE / status / LEARN-row assertions now target the editor. New panel-side assertions cover the issue's acceptance directly: the row reads `off` → `on · MAIN` → `off` across the session; the legend sits **in the panel** with the seeded project's three bindings; a bank added inside the modal makes the legend fall silent and the row name `BANK 2`; choosing MAIN in the modal brings the legend back.

## Verification (all run in this worktree)

- `npm run build` — green.
- `src/midi/midi.selfcheck.mjs` and `src/midi/banks.selfcheck.mjs` — **unmodified** (not in the diff) and green.
- Gates: `replayGate` and `creatureGate` green; wingWarp probe REST `dfb2915f` / BENT `981bdefe` — main's pins, unmoved. No fixture or golden file is in the diff; no assertion was weakened anywhere.
- Full manifest sweep, run command-by-command: **489 pass of 494**; the non-zero set is exactly the standing adjudicated sandbox baseline — swarmWasm exit 1, rollSafety / composite / patternRender exit 124, accum exit 134 (tally kept at `~/workspace/tally-1725.txt`).
- **Browser smoke (the surface itself):** the repo's Playwright harness produced no output in ~25 minutes in this sandbox and was killed — the standing harness limitation; CI's e2e-smoke job remains the arbiter for the specs. In its place the new surface was driven in a real browser (route-interception pattern, dev build): **15/15 checks passed** — panel holds only the button + read (no status line, bank bar, or LEARN rows leak into it); the read says `off`; the legend is silent until a binding exists, then lists both test bindings under `keys · MAIN`; the MIDI button opens a dialog holding ENABLE, the status line, the bank bar, and all **69** LEARN rows; adding BANK 2 inside the modal silences the panel legend, choosing MAIN restores it; click-away and Esc both close. Screenshot: `~/workspace/kc-1725-smoke.png` (editor floating over the live canvas; the slim row + legend visible in PERFORM).

## Deviations

1. No `useDock` dock-close on open — impossible and unnecessary in the DAVIS room (above).
2. The editor refuses to close while learn is armed (above) — a dismissal rule, not a learn-behaviour change.
3. `directors-duel.spec.js` unchanged — its reachability assertions never touched this section (above).
4. The Playwright specs were updated but not executed locally (sandbox harness, above); the behaviour they assert was verified by the browser smoke instead, and CI arbitrates the specs themselves.
