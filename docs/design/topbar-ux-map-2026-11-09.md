# Top-bar UX map — what the top buttons actually do (probed at main 6d37f9b0, 2026-11-09)

Matt's question: the KINETIC / LOOKS / VOICES / CURATOR buttons and the beats — clicking left to right, what is the UX, what actually happens, and how do they relate? Probed against current main only (fresh detached worktree). The unmerged #2037 births work is NOT on main and is not described here.

**The one-sentence version:** the top bar is a *dealing machine with a memory*. One master seed plus a press counter drives almost every roll, so the buttons are not independent randomizers — they're four different ways of asking the same seeded deck for a new scene, at four different widths: one axis (LOOK), one axis (VOICE), a taste-judged nudge (KINETIC's deep taps), or everything judged at once (CURATOR). Around them sit the ceiling (START), the pins (mode/motion chips + locks), and the clock (BEAT).

---

## Row 1, left to right

### 1. START pill — "START: KOZ · 312·69·72" (your photo's cropped "RT: KOZ")

- **What it is:** a four-state cycle — OFF → WEAK → MED → KOZ → OFF — one click advances it (`panels/layout/CuratorBar.jsx`, the START pill; `state/kineticScope.mjs:1-16`).
- **What a click does:** nothing to the current picture. It sets (a) what a *cold launch* opens on, and (b) the **ceiling over every KINETIC tap** — how wide the decks are that any roll may deal from.
- **The numbers are shapes · looks · voices a tap can reach** at that scope (`deckReadout`, `state/kineticScope.mjs`): OFF = 49 shapes / 33 looks / 19 voices (launch = the fixed factory opener); WEAK = whole library of shapes, same 33/19; MED = 312 / 69 / 72; **KOZ = 312 · 69 · 72 — exactly your photo** — plus one extra power the others don't have: only at KOZ can hammering KINETIC break into CHAOS (below).
- Inside a chapter (see LOOK pass), the pill also shows the chapter's name and *its* reachable counts, because inside the book a tap can only reach that chapter's deck.

### 2. KIN — KINETIC, the grey circle button

The storm generator, and the only button whose meaning changes with *how* you tap it (`panels/layout/KineticButton.jsx:86-107`; router in `panels/layout/kineticHeat.mjs`). It runs a left-to-right sweep governed by a heat model: taps within ~2 s of each other continue one run; rapid taps (<600 ms apart) add heat (+0.34 each, ~3 to full); idle heat halves every 2 s.

- **Tap 1 (cold) — LOOK pass:** a fresh Look + a shape pool that coheres with it. Structure moves; motion, palette and seed hold.
- **Tap 2 (warm) — VOICE pass:** a fresh voice over the standing look: motion + palette change (and the glow/accumulation settings, but only when that voice declares them). Structure and pool hold.
- **Tap 3+ (warm) — CURATOR pass:** a small nudge — at most 3 params, each moved at most 8% of its range — chosen by the taste engine from 6 candidates (the piece as-is + 5 nudges). It can also *pass*: keep the piece exactly as it stands (`state/kineticSweep.mjs:164`).
- **Hammering — CHAOS:** a 3rd-or-later tap at heat ≥ 0.6 breaks the ceiling into the full kitchen-sink re-roll — **and only at KOZ scope**; at OFF/WEAK/MED the same hammering just keeps nudging.
- The button's width/glow *is* the heat meter, and while warm it shows a tiny red label naming the pass the last tap ran (LOOK / VOICE / CURATOR / CHAOS). Keyboard: **K** is the same tap.
- Every KINETIC press also re-deals the FIELD poem (unless it's HELD) and passes the roll guard, which re-deals a dead frame by undoing the roll.

### 3. L — LOOKS (hollow square)

- **A click does not roll anything.** It opens the Looks menu: the full catalogue (70 Looks in named groups, RISO FIELD included) (`CuratorBar.jsx`, looks popup; groups from `getPresetsByGroup`).
- Picking one **applies that complete layout directly** — composition + the params the Look declares. Your palette and your marks stay put (the button's own tooltip: "layout only"). This is the deterministic counterpart to the LOOK pass: same axis, but *you* choose instead of the dice.
- The square is a status readout: hollow = no Look applied from this button yet; solid red = the applied Look is still what's standing; half-filled = you've since changed the composition ("dirty"). Beside it, the applied Look's name shows as micro text. The button rests as [L], opens to LOOKS, and after first use cools to [LOK] for the session.

### 4. VOI — VOICE (circle) + "REAS"

- **This button also doesn't roll anything.** It opens a menu that chooses **which persona tastes the CURATOR candidates** — LOIS, or one of the artist personas (Davis, Molnár, Mohr, Benjamin, Reas, Haeckel, Oxman, Stock, Anadol, Menkman…), or **off** (`CuratorBar.jsx`, voice popup; `curator/taste.js:34` `voiceOptions`, `curator/personaTastes.js`).
- **"REAS" in your photo is the active persona's id: Casey Reas** (alias "PROCESS FIELD" — simple elements + behaviours in continuous motion, full-surface field, no focal centre; `curator/personaTastes.js:118`). So right now, when CURATOR rolls candidates, Reas's taste ranks them.
- **Off = an honest dice roll**: no scorer, the pick falls back to uniform dice (`curator/curate.js` — the null curator declines every pick).
- The circle breathes at the persona's own drift rate after a roll, then decays to still over seconds — a Davis-side readout of "a voice recently judged". Don't confuse this VOICE (the *judge*) with the KINETIC **voice pass** (a *costume* — one of the 72 deck voices that sets motion + palette). Same word, two different jobs; see Surprises.

### 5. CUR — CURATOR (diamond) + "25/6"

- **The numbers are your keep ledger: 25 keeps / 6 favourites** (`CuratorBar.jsx:53-54, 376`) — not a press count. The ledger is silent at 0/0 and appears with the first keep.
- **A click is the full taste-guided re-roll** (`state/slices/layoutSlice.js`, `curateUnlocked` ~line 1349): it rolls a batch of candidate scenes over **every unlocked parameter** (normally 8 candidates, scaled between 2 and 16 by the Director's room read), then the active curator engine picks one. Discrete choices come off a Markov chain conditioned on what last landed, so presses relate to each other instead of being strangers.
- **Who decides:** the engine ladder is — an imported trained taste model (MLX) if one is on file and faithful → otherwise the persona chosen on the VOI button → otherwise nobody (honest dice) (`curator/curate.js:52` `getActiveCurator`). LOIS is a special persona: a hand-tuned heuristic rank (glance / distance from the pile / boldness) that *reorders* candidates; the menu says so honestly ("Not a trained eye").
- The phase matters: the app tracks **explore vs refine** from what you did (a keep or 3 small slider moves → refine; a new seed / voice / look / modifier change → explore; `curator/phase.js`). In refine, CURATOR stops rolling fresh dice and instead makes small local mutations (spread 0.10) around the piece you kept, and gently re-deals colour around the kept palette. In explore on a *settled* board, presses advance a narrowing funnel — chapter → genre → anchor artist (notches 0→1→2, `state/chapterNarrow.mjs`) — so repeated presses zoom into the book instead of re-rolling the world.
- The diamond's detent steps show LOIS's last verdict when she's the voice. A CURATOR press also re-deals pattern tracks and the poem, and (in explore) can bring the persona's own palette with it.

### 6. The square pill (□, sometimes with a number)

The **locks / roll-scope pill** (`CuratorBar.jsx`, lock pill). Quiet state: it just reports how many params you've locked (the number appears when > 0; empty square in your photo = no locks). When a roll scope is *armed* (a mode/motion chip below, or the Build panel's locks), it becomes a live button: **tap it to disarm everything** and return to full-freedom rolls.

### 7. B — BEAT

The master clock (`components/BeatButton.jsx`). Click opens tempo: presets, a tap-tempo pad (tap 4×), exact BPM, and a **pulse** toggle. BPM doesn't make sound by itself — it sets the morph clock: transitions last 2 beats (120 BPM = 1.00 s; 60 = slow luxury; past ~160 BPM transitions stop morphing and hard-cut — the "glitch ceiling"). Turn **pulse** on and the dialed tempo becomes a real beat the stage can feel when there's no audio (audio always wins). The dot on the button flashes only while a real beat is driving (pulse on or live audio) — a still dot honestly means "this dial is currently only setting morph times".

### 8. The crown 👑🏽 — the SwayMark

Not a button. It has no name, no tooltip, no label, by design (`components/SwayMark.jsx`; `curator/swayView.mjs`). It appears — breathing amber — only when the *sway magnitude* from the latest Director tick (published on CURATOR presses) clears a threshold, and is fully absent below it. In plain terms: it's a presence mark that says the system's background sw
...[truncated 4471 chars]