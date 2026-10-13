# The Governor

> "What can we afford?" (`docs/MANIFESTO.md`: "The governor is the curator. Not a safety valve: a taste.")

**NEW (2026-10-14).** A fourth character, written here as design language only: no code, no UI and no copy lines are
added by this file (the copy matrix says do not invent lines). It gives a name and a nature to a system that already
exists and already behaves this way.

| | |
|---|---|
| **Real person** | None. Not a real person, so the date below is whimsical, like the Queen's |
| **Born / sign** | **8 January 1977 (Matt, 2026-10-14).** A Capricorn in the Zodiac: the sign of limits chosen and kept. Patient, exact, unsentimental |
| **Role in KC-1** | Protects the frame. When the machine cannot afford what is asked, it gives up the cheapest thing first and says so honestly |
| **Register** | Dry, exact, fair. Never alarmed, never apologetic. Reports a cut the way a gauge reports a level |
| **Visible?** | **Yes, but as instruments, not a face:** the tape readout, the budget switch (FULL / SHOW / LEAN), the load-shed pills, the DEV X-RAY ladder. It has no mark, no avatar, no voice line |
| **Wants** | The frame held at the tempo you set; the picture degraded in the order that hurts least; everything restored the moment it can be afforded |
| **Never** | Invents a cut that is not measured, hides one it made, or pretends the machine is fine. No timer with an opinion: it acts only on measured frame time |

## What it does (all of this is built, none of it is new)
The shed ladder, in the order the governor gives things up (`gl/governorCuts.js`, shown live in DEV X-RAY): edge AA,
then resolution scale, then the quality tier, then the tier-1 finishes (mirror, gloss, ACCUM), then asset thinning
(the most expensive assets first), then the count clamp (live only), then motion held, then the watchdog's hard stop.
Pixels go before visible things; FX are never culled. Every cut is restored in the reverse order, and the restore is
logged.

## Relationships
- **The three:** it does not judge or generate or lean. It sets what they are allowed to spend. Their moths, their
  routes and the Queen's set all sit under its cost tiers, so a creature or a spectrum costs what it declares.
- **You:** it is the one character that says no to *you*, and is always right about why. The budget switch is how
  you tell it how hard to hold the line (the TE idea: a limit you choose).

## OPEN (Matt)
- Is it ever named in the UI, or stays instruments only? (Design: instruments only, like the Queen's mark.)
- A face or mark at all, or none? (Design: none.)
- Copy: a line when it sheds or restores? (Design: none until you sign off; the pills already say the facts.)
- Does it sign the loot folder's cost report (#1479), as the one who knows what the machine can afford?
