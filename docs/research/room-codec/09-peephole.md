# 09 — The Peephole

Status: design APPROVED in direction by Matt 2026-10-14 (mockups below). A companion surface to the codec Room (`03`) — smaller, sooner, and in the transport rather than the panel.

Approved references (frozen):
- `kc-peephole-onetenant-mockup-2026-10-14.png` — his turn / her turn (current law)
- `kc-peephole-mockup-2026-10-14.png` — usual state + the surprise
- `kc-peephole-slide-mockup-2026-10-14.png` — the slide storyboard (predates single tenancy; the mechanic stands, the both-faces frame does not)
- `kc-peephole-insitu-mockup-2026-10-14.png` — placement proof (predates single tenancy)

## Home
The wide thin strip in the transport row, beside LIVE / tape, above the HITS readout. No new real estate: the strip already alternates crops today; the peephole gives it tenants and a door. The old unicode kaomoji chip is replaced by this.

## The moment
- At rest the strip shows a **seam and a small handle** — a closed cover.
- On a check-in, **the cover slides open** (operated by the persona, not the UI) and **the readout to the right scoots over to make room**, settling back when the cover closes. The displacement is the charm: the interface physically accommodates them.
- The tenant's face is a **crop** of the same generative dither systems as `06` (Davis color Bayer, LOIS glyph) — partial, close, like someone at a letterbox.

## Single tenancy (Matt, 2026-10-14)
**Only one persona appears at a time.** Whose turn follows the room: the last voice on the bus looks in. He checks in to show a seed; she checks in to judge. The changeover (cover, swap) is the punctuation. The slot's tenant is itself a signal — who has the floor, before a word is read.

## The Queen beat
Rare, tier-gated like the suspicion arc (`02`): the cover opens and the slot is **lit amber and empty** — or the tenant glances off-frame at something the viewer can't see. Nothing named, nothing explained, a few seconds at most. If the suspicion meter (`02`) ever needed a face, this is it — and it has none.

## Rules
- Check-ins are beats chosen by the story machine (`04`) under the same cadence/cooldown law as transcript lines; silence (a closed cover for a whole session) is valid.
- Faces animate as in `06` (state parameters, ambient breath, tier = resolution); the slide is a real layout animation — neighbors move, nothing overlays.
- Reduced motion: the cover fades instead of sliding; neighbors do not translate.
- Perf: one small canvas, updates on beats only. The transport is not a second stage.

## Open for iteration
- Check-in cadence budget — how many per session before it becomes a screensaver with opinions?
- Can the artist knock (click the seam to summon whoever has the floor), or is the door only ever opened from their side?
- Does the scoot displace only the strip's row, or anything else ever?
