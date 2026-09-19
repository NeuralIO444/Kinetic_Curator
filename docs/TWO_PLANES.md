# Two planes — Studio and Perform

KC-1 is one engine, two jobs. Mixing them on one mosaic is why the board feels like a lab and a weak live tool at the same time.

```text
STUDIO     explore, breed, name, keep     → a SHOW (chip collection)
PERFORM    play that show                 → clock, tape, hands, wipes
```

Same WebGL loop. Same project JSON. Different chrome, different permissions.

Blocked on spine E for Perform wipes. Do not build a second renderer. Do not start this instead of #387.

## 1. Studio (preproduction)

Job: discovery. Manifesto: *breed variations in a terrarium.*

Allowed to be dense:

- Every system stub, every DLC pack, bio-drive names, personas, Curator rerolls
- LAYOUT / ASSETS / sliders / seed / Evolve-as-search
- Hits tray, SNAP, loop capture, project export
- Arm tracks, patch FIELD/FEED/MOD, tune costs
- Name a look: capture MY VOICE or drop onto a **show**

Clock may run (rehearsal) or sit stopped (programming). System chips may cut — you are editing DNA, not playing a phrase.

Curator lives here. It proposes. You keep.

Offline `studio/` farm is the batch twin of this plane (editions, CLIP rank). Not a third product.

## 2. Perform (the show)

Job: a collection of chips you already trust, played on one clock.

On the glass:

- The **show** — 8–16 voiced chips / house presets you packed
- SYSTEMS only if you packed a wrench (optional, small)
- Four tracks + tape counter
- Bar: BPM, run/stop, dots, NEXT
- STIMULI as shove (AUDIO + envelope). No Hz LIFE.
- Hits 1–9 = show slots if you want a hardware story

Forbidden on this plane (or behind a hold-to-edit):

- Showcase farm, persona pack, Curator auto-apply
- Authoring sliders that reshape identity mid-phrase (count as float is ok; new assets + mode stubs are not on the deck)
- Anything that resets `beatIndex` or placement identity

Voiced chip click: arm → next downbeat → quantized wipe. That is the whole language.

## 3. The show is the bridge

A show is data, not a mode flag:

```text
show = {
  bpm, running,
  slots: [{ kind: 'voice'|'preset', id, blendSeconds? }],
  tracks: [/* project layers snapshot */],
  stimuli: { /* envelope amounts, not the clock */ }
}
```

Studio **packs** a show (drag voices onto slots, snapshot tracks). Perform **loads** that show. Project JSON already carries layers + params — the show is the *playlist* plus the clock default.

Hits setlist today is a prototype show with no clock and no taxonomy. Promote it. Do not invent a second tray.

## 4. What this does to 01–06

| Layer | Studio | Perform |
|-------|--------|---------|
| 01 Body | Must be true in both or neither plane is honest | Same animal at 30 and 60 |
| 02 Picture | Cuts ok while programming | Wipes only |
| 03 Climate | Patch and tune | Play the cables you packed |
| 04 Set spine | Clock optional | Clock is the product |
| 05 Hands | Envelope tuning | Shove on breath |
| 06 Library | All packs open | Deck = this show only |

TE #248 (7 panels → 4) becomes: Studio uses BUILD/ASSETS/OUTPUT; Perform is PLAY + STIMULI + tape. Not seven tabs in both planes.

## 5. What this is not

- Not two binaries. Not two kernels.
- Not "Studio = low-res / Perform = high-res." One renderer.
- Not a permission bit that freezes the organism. You can still twist MIX and envelope live.
- Not an excuse to delay A–C. A broken body is broken on both planes.

## 6. Build when (after the spine)

```text
P0  Name the planes in chrome (PLAY vs STUDIO) without ripping features
P1  Show document + pack-from-studio (hits tray grows up)
P2  Perform deck hides non-show chips
P3  Perform clicks go through the T1 arm queue
```

P0 can be a tab label. P2 is T2. Do not hide chips before the wipe exists — you will strand people with no way to try looks.
