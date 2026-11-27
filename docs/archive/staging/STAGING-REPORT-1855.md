# STAGING-REPORT — #1855 Book S2: landing in a chapter

**Branch:** `feat/1855-book-s2-landing`, stacked on `origin/feat/1854-book-s1b-marks` @ f14f9cc4 (publishes only after S1b merges; coordinator rebases).
**Lane:** review — Matt judges and merges. Not pushed, no PR opened.
**Filename note:** this report is `STAGING-REPORT-1855.md`, not `STAGING-REPORT.md`, because the worktree root's `STAGING-REPORT.md` is the S1b slice's own report, inherited from the base branch — it was left untouched.

## What shipped (issue #1855, all five scope items)

1. **Cold KINETIC tap = a landing.** The flip deals a landing chapter by a weighted walk over the spine, then the look pass deals inside that chapter. The walk is visible: a chapter card per passed chapter, ~110 ms a beat, resting on the landed card. Warm taps keep the existing cadence *inside* the standing chapter (look → voice → curator, unchanged router).
2. **Deals resolve in landed chapter ∩ scope deck.** Look and voice passes take the chapter-scoped decks. Where the intersection is empty at the performer's scope, the chapter re-deals at the nearest wider scope where it has a deck, and says so (landing record + pill readout + tooltip). No silent cross-chapter borrowing, ever — pinned by seeded test.
3. **Chapter card at landing + chapter name in the START pill readout.** The card is the S1 card data (`{paletteId, marks}`) rendered: name, three glyph marks in the chapter palette's ink on its ground, swatch strip. The pill's deck digits become the chapter's own deck counts with the chapter name beside them.
4. **Leaving a chapter:** a fresh cold flip re-walks (as before), and CHAOS still leaves the book — the chaos roll and the launch opener now clear the standing chapter, because the piece after them was dealt from no chapter and the readout must not lie.
5. **Novelty term:** walk weights are `UNVISITED_WEIGHT = 3` for a chapter unvisited this session, `1/visits` after. The session coverage ledger (`kineticChapterVisits`) is store state, inspectable backstage like the other kinetic session fields. No taste/Queen weighting — that is S5's, untouched.

**Acceptance, as tested** (`chapterWalk.selfcheck.mjs`, in the manifest): over seeded cold flips (240 per scope × 4 scopes, composed exactly as the slice composes them, plus store-level passes) every deal's look/voice/pool ∈ landed chapter ∩ scope deck; no cross-chapter asset; pool coherence holds on the library axis and set-wholeness on the sets axis; pigment-freeze holds (a voice that does not declare accumulation never moves the ACCUM keys — #1778 untouched); the OFF honest-empty path fires in test (Marks at OFF has no deck; non-Now landings at OFF record `redealt: true, dealtScope: 'med'`); walk is neighbours-only and starts where the book stands.

**Skippable by construction:** the deal commits in the store the instant the tap lands; the card walk is presentational. A warm tap during the walk snaps the display to the landed card (and deals immediately, as always). There is no animation the performer can be forced to wait out, because the animation owns nothing.

## Files touched

- `app/src/state/chapterWalk.mjs` — **new.** The walk (novelty weights, spine path), the chapter∩scope deck builder, the effective-scope (re-deal) rule, the deck readout. Pure, seeded-testable.
- `app/src/state/slices/layoutSlice.js` — session fields (`kineticChapterId`, `kineticChapterVisits`, `kineticLanding`); `scopedChapterLook` / `scopedChapterVoices`; look pass lands, voice pass stays in-chapter; chaos roll + launch opener clear the standing chapter. Chapter state rides in the same `set()` as the deal — a tap is still exactly one undo step.
- `app/src/panels/layout/ChapterCard.jsx` — **new.** The landing card (walk, rest, fade; tap snaps to the landed card).
- `app/src/panels/layout/CuratorBar.jsx` — pill readout swaps to the chapter deck when a chapter stands (name, chapter counts, dotted-underline re-deal marker, honest tooltip/aria); renders the card. No chapter standing → byte-identical to before.
- `app/src/styles/controls.css` — chapter-name + card styles. `app/src/styles/layout.css` — chapter name joins the compact-bar hide list next to the deck digits.
- `app/src/state/chapterWalk.selfcheck.mjs` — **new** suite; `app/selfcheck.manifest` — one line added after `kineticScope`.
- `app/src/state/kineticScope.selfcheck.mjs` — §4 re-pinned (cause below).
- `app/src/data/taxonomy.js` + `taxonomy.selfcheck.mjs` — the `constructor` fix (cause below).

## What was NOT done

- `kineticSweep.mjs` — untouched; the passes already took decks as options. **kineticSweep keeps all its existing cases, unmodified.**
- CURATOR pass and button — untouched (S4). Turns / veto / settle — not built (S3). Taste, keeps, Queen weighting — not built (S5); the walk's only memory is the session visit count. No deal-time cost gate. No nudge caps, no scope-table changes.
- One-writer files (`liveLoop.mjs`, `liveResolve.mjs`, `particles.js`) — untouched, never needed.
- Chapter state is session-only: it is not in the project file or watch key lists (the `kineticVoiceId` precedent), and it is not part of undo snapshots (undoing a look pass does not resurrect the previous chapter — session fields never did).

## Premise verification (all checked against the tree before building)

- Tap cadence, scope decks, and pass composition as the issue describes — confirmed in `kineticHeat.mjs`, `kineticScope.mjs`, `layoutSlice.js`, `kineticSweep.mjs`.
- All 9 chapters meet the S1 deck floor — confirmed in `data/chapters.js` (marks 5/8/18 … now 69/72/312, looks/voices/assets).
- Intersections measured, not assumed: **only Now has a deck below MED.** Every other chapter's looks are style looks, which enter at MED — so at OFF/WEAK every non-Now chapter takes the honest re-deal path. The issue's "(possible at OFF's 49-asset ceiling)" is, measured, "certain at OFF for 8 of 9 chapters" — the mechanism the issue specifies handles it, and the readout confesses it. The issue's "64/64" deck numbers are stale spec text (the decks are 69/72 since S1b); the mechanism is what the issue pins, so no stop.
- At OFF, a chapter deals sets only via curated sets **fully contained** in its deck (sets stay whole — a set is a composition, not a bag). Only Now qualifies today; a chapter with a partially-contained set deals no set at OFF.
- Coherence proven before building: every chapter look has ≥4 category matches inside its own chapter's records, so the pool deal never falls to its mixed fallback under chapter scoping.

## Design decisions (mine — named, per orders)

- **The walk is a weighted choice + a spine-path display**, not a step-by-step random walk: weights pick the landing; the path is the contiguous spine slice from the standing chapter (or Marks, D1's opener, when none stands) to the landing. A literal step-walk would need a step distribution the spec doesn't give and would make long crossings tedious; the visible result — passing neighbour cards, landing on one chapter — is the spec's.
- **Deck gate = all three axes non-empty**, judged per axis from the actual intersection, so a future chapter with OFF voices but no OFF looks still re-deals honestly instead of half-dealing.
- **Re-deal walks forward only** (OFF→WEAK→MED→KOZ): decks grow monotonically along the cycle and KOZ is total (every chapter deals there — proven in test), so forward search always terminates at a real deck.
- **The START pill never moves.** The performer's scope is theirs; the chapter borrows a wider deck, not a wider pill. The landing record keeps both scopes (`scope` = the pill's, `dealtScope` = where deals were made) so the confession is data, not copy.

## D2–D6 clearance (no decision stop required)

- **D2 (LOIS cut)** — S3's, not built. **D3 (CURATOR two jobs)** — S4's; `curatorPass` and the button are untouched. **D4 (settle)** — S3's; a standing chapter is *not* a settle or a lock — a fresh cold flip re-walks freely, nothing persists a chapter against the performer. **D5 (Queen's memory)** — S5's; weights carry session-visits novelty only — no keeps histogram, no taste signal. **D6 (deal-time cost gate)** — excluded from v1 by the spec; none added.

## Re-pins and found defects (every one, with cause)

1. **`kineticScope.selfcheck` §4 — re-pinned to S2 semantics.** Cause: issue #1855 scope item 2 redefines what a cold flip deals (chapter ∩ scope, with re-deal). §4's flat OFF/WEAK membership pins (pool = one curated set, look ∈ 33, voice ∈ 19 for *every* deal) pin the pre-S2 behaviour the issue replaces. The re-pin asserts the S2 invariant through the store — every deal inside the standing chapter's effective deck — and keeps the old readings as conditionals exactly where they still hold (a Now landing at OFF/WEAK: whole set, 33 looks, 19 voices, no re-deal). Nothing was deleted; the new assertions check strictly more (chapter membership + scope membership + confession flags). The cause is also commented in the suite, in the house style of the #1854 re-pins.
2. **Found defect, fixed at root: `resolveLookId('constructor')` returned `Object.prototype.constructor`.** `LOOK_ALIASES` is a plain object; the bare `LOOK_ALIASES[id]` read inherits prototype members, so the Bauhaus look named `constructor` resolved to a *function*, failed the composition enum in `validateLayoutParams`, and dealing it silently stored the default look (`praystation`) with the dealt look's other params merged. This bug is **pre-existing on the base branch** (any MED/KOZ whole-book deal of Constructor hits it); S2's 4-look Bauhaus deck just made it frequent enough for the new membership pins to catch. Fix: own-property lookup in `resolveLookId` (`taxonomy.js`), one line, plus a regression pin in `taxonomy.selfcheck` (`resolveLookId('constructor') === 'constructor'`, `getPreset('constructor').id === 'constructor'`). Blast radius checked: `resolveLookId`'s only callers are composition-address resolution (`layout-modes.js`, `presets.js`).
3. **My own new suite, §5, corrected during development** (not a shipped-suite change): the first draft asserted look-category coherence on the OFF sets axis; the sets deal was never look-coherent (it is the pre-#1767 curated deal, labelled `coherent: false` in kineticSweep itself). The assertion now checks wholeness on the sets axis (pool = exactly one whole contained set) and coherence on the library axis. Membership (no cross-chapter asset) was and is asserted on both.
4. **Design-law catch:** my card's first draft had `border-radius: 3px`; `radii.selfcheck` (§1.4, square corners everywhere) rejected it. The card is square now — which suits the print language better anyway. Code fixed, no pin touched.

## Verification

- **Full manifest sweep** (`npm run selfcheck`, 556 entries, after `npx playwright install chromium`): every entry green **except two proven-environmental suites** —
  - `swarmWasm`: fails identically on pristine base f14f9cc4 (`build-wasm: cargo not found on PATH`; no cargo in this sandbox). CI has the toolchain and is authoritative.
  - `fx/rollSafety` browser section: node side fully green in my tree; the browser side dies in the shared candidate harness (`page.evaluate: Target page, context or browser has been closed`, `gl/candidate.mjs`/`glDriver.mjs`) — reproduced identically on pristine base f14f9cc4. CI is authoritative.
  (The runner stops at first failure, so the sweep was run in segments with `SELFCHECK_MANIFEST` overrides; every segment's log was read. KineticSweep's known ~1.5% flake (#1822) did not appear; the suite passed in the sweep and standalone.)
- **`npm run format:check`** — clean on the final tree. **ESLint** on all touched files — clean.
- **Source-shape sweep:** grepped all selfchecks for every touched file's name and ran the hits (they are inside the full sweep above). **e2e sweep:** grepped `e2e/` for the converted surface (START pill / readout): `topbar-expand` keys off button classes and row order only — the card is a non-button fixed element and the chapter name is a span inside the existing button; no spec asserts pill text; no e2e re-pin needed. CI's e2e-smoke remains the authority.
- **Screenshots** (`~/workspace/kc-1855-shots/`, headless preview + route interception, store driven through the real actions): before (no chapter), Marks landed at 1440 + 1920 (pill: `START: KOZ 18·5·8 MARKS`), Swiss landed at 1440 + 1920 (`61·5·11 SWISS`), and the OFF honest path (Bauhaus at OFF: `START: OFF 16·4·8 BAUHAUS`, name underlined as re-dealt; tooltip confesses "deals are made at MED (the pill stays where you put it)"). Note: below 1760 px wide the bar is compact by existing design law (#1122) and the deck digits + chapter name hide together — the 1440 shots show the card only, the 1920 shots show both. The preview build footer reads f14f9cc4 because the hash is baked from git and this staging work was uncommitted at shot time — the shots are of this branch's code on the base's hash stamp.

## QA for the reviewer (live canvas)

Cold-tap KINETIC from a stale state: watch the chapter cards walk the spine and rest on the landed chapter; the stage deals that chapter's shapes; the START pill names the chapter with its own counts. Tap again warm: voice changes, chapter holds. Set START to OFF and cold-tap until a non-Now chapter lands: the pill keeps OFF, the chapter name is underlined, the tooltip confesses the MED deal. Hammer to CHAOS at KOZ: the chapter name leaves the pill — the book is closed until the next cold tap lands somewhere new.

## Lois pass

1. **Creativity solves problems** — The machine deals; the artist's eye still judges the wall. The walk doesn't curate *for* Matt, it tells him whose room he's in. Pass.
2. **Defeat habit** — The habit was the whole library shuffled blind, 312 shapes pretending to be one instrument. Now a flip *lands somewhere* and the somewhere has a face. That's the break.
3. **The nanosecond** — One card. Name, three marks, a strip of colour. A child could call the era before the fade. If it needed a paragraph it would be dead; the paragraph lives in the tooltip, where paragraphs belong.
4. **Assume smart** — The readout confesses the re-deal instead of laundering it. It trusts the performer to handle the truth: *your chapter has no small deck, so it dealt bigger.* Smart people smell a silent borrow. This never borrows silently.
5. **Cautious or creative** — Creative. The cautious version hides the chapter system backstage and lets the pill lie about OFF. This one prints the chapter's name on the pill and underlines it when the deal moved. It takes the punch.
6. **Work is worship** — The novelty term rewards showing up: chapters you haven't visited tonight pull harder. The book notices you've been somewhere already. Practice changes what the instrument offers. Good.
7. **No trends** — No skeuomorphic book, no page-curl animation, no "chapter" confetti. A flat card in the chapter's own colours, square corners, gone in three seconds. It speaks KC-1, not bookstore.
8. **Discovered, not created** — The landing is *found* by walking the spine, not assembled from a menu. You don't pick a chapter; you arrive in one. Discovery is the whole instrument's religion and this obeys it.
9. **True to self** — Marks first, ochre and bone, the hand on the wall before the grid. The book opens where Matt's eye opens. His instrument, his order.

**Kill list:** kill any future "chapter picker" dropdown (arrival is the point; a menu is a surrender). Kill any urge to animate the card longer than a breath (the deal already happened; theatre that delays nothing still taxes attention). Kill the dotted underline if Matt hates it — but keep the confession somewhere on the pill; honesty is not the negotiable part.
