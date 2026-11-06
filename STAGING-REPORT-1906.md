# STAGING REPORT — #1906 FIELD S5: quiet overlay / whisper channel (gated)

Branch `feat/field-s5-whisper`, based on origin/main 6b565233. Local commit only — not pushed, no PR (the coordinator publishes).

## What was built (plain language)

A poem standing on the dish can now be flipped into a **whisper register**: the exact same poem — same poet, same words, same letter positions, sizes, turns and colours — drawn quieter, at 35% of the alpha it normally gets. A new `whisper` chip sits beside `keep` and `hold` in the poem group on the mode strip; tapping it flips the register on the poem that's already standing (nothing re-deals, nothing moves), tapping again restores the full voice. With no poem standing there is no chip and no action — silence is unchanged. The Director never deals a whispered poem; the register is the performer's toggle only, so the whole slice lifts out cleanly if the feel check kills it (and a document saved with the register on would simply load at full voice under the old code, because the document door only ever copies fields it knows).

## The build, file by file

- `app/src/poets/fieldForm.js` — `sanitizeFieldForm` now carries an optional `register: 'whisper'` marker on the form payload, beside the existing `script` marker. Absent = full voice; every pre-S5 document sanitizes byte-identically (the known-fields copy is unchanged when the marker is absent).
- `app/src/engine/buildPlacements.js` — `WHISPER_ALPHA = 0.35`, a named export beside `FIELD_EM_SCALE` (line ~97). In the #1904 FIELD block, a form whose sanitized register is `'whisper'` draws its stamps at `fullAlpha * WHISPER_ALPHA`; with no register, `fieldAlpha` is the full alpha itself — the item list is byte-identical to the pre-S5 pipeline (proven, below). One property read per armed build; no new per-frame cost, so no costRegistry entry.
- `app/src/state/slices/layoutSlice.js` — new store action `togglePoemWhisper`, written beside `togglePoemHold`: flips the register on the standing form only (spread copy, marker set or deleted — flipping back restores the form exactly, register absent rather than nulled). No poem standing → no-op. Independent of HOLD and KEEP.
- `app/src/components/PoemRow.jsx` — a third action chip, `whisper`, same `poem-act` TE styling as keep, `aria-pressed`, `active` state while the register is on. The group still renders only when a poem stands. No new panel, no new readout, no CSS changes (the existing `.poem-act.active` style carries it).
- Suites extended (no new suite file, no manifest change): `fieldStampPath.selfcheck.mjs`, `poemRow.selfcheck.mjs`, `fieldKana.selfcheck.mjs`.

## Flagged choices

1. **Dishonest register → the form is refused whole.** `sanitizeFieldForm` returns null for any register value other than absent or `'whisper'` (`'loud'`, `true`, …). This follows the file's own convention for the `script` marker in the same function (a dishonest marker value refuses the form at the document door) rather than dropping just the marker — dropping would silently render a form its document says should be quiet, and silently keeping the junk value was never an option. It never crashes: the door returns null and the dish is byte-identical to silence, as with every other dishonest form.
2. **The toggle is one undo step.** `togglePoemHold` creates no undo entry because it writes `lockedParams` (locks ride entries other writes capture). `togglePoemWhisper` writes `layoutParams`, and the house rule on that object — stated on `keepPoem` — is one undo step per write, so the toggle pushes one. A suite case pins that undo restores the register state the entry captured.
3. **The register is not part of a keeper's identity.** `poemRow.mjs`'s keep key (poet + piece + placement) is unchanged: bank a poem while it's whispering and the same poem at full voice still reads as kept. The register is presentation, not materialization — the same reasoning that keeps it out of placement.
4. **Namesake, not a relative:** `curator/whisper.js` (#1139, the personas' deniable transition lines) is a different "whisper" that predates this slice. No code is shared; the register's vocabulary is the issue's own ("whisper channel").

## Verification (all counts re-measured on this tree)

Field family, run individually:

- `poets/fieldStampPath.selfcheck` — all assertions passed. New: sanitizer register cases (honest `'whisper'` round-trips; `'loud'`/non-string refuse whole; a dealt form provably carries no register) and the render proof — a whispered build's items equal the full-voice items in every field except the stamps' alpha, each exactly `full × WHISPER_ALPHA`; the layer's own marks byte-identical; whisper replays identically.
- `poets/poemRow.selfcheck` — **16 checks passed** (13 before; +3 WHISPER blocks: the flip moves nothing but the form and draws nothing from the poem stream; refused in silence with no undo entry; HOLD carries the register untouched through KINETIC voice passes, and a keeper is the same poem at either register).
- `poets/fieldKana.selfcheck` — all assertions passed. New: script and register compose — a whispered kana form round-trips with both markers; a dishonest register refuses a kana form whole.
- `poets/placement.selfcheck` — 560,366 passed, 0 failed.
- `state/fieldDeal.selfcheck` — 5 checks passed (the deal path untouched and still register-free).

Full manifest sweep (continue-on-error over `app/selfcheck.manifest`, 607 commands): **604 passed, 3 failed** — and all three failures are **proven base-identical** on a clean origin/main (6b565233) worktree (created for the proof, removed after):

- `engine/kernel/bake/swarmWasm` — identical AssertionError on base: `build-wasm.sh --verify` fails (the checked-in kernel wasm does not reproduce from the rust sources in this sandbox), same `diff: 'simple'` line.
- `fx/rollSafety` — dies at the identical checkpoint on base (last passed check: the SCREEN/OVERLAY "why" line), inside the headless-Chromium GL parity harness: `[gl] framebuffer incomplete` thrown from `renderer.mjs` under SwiftShader. No fx or renderer code is touched by this slice.
- `gl/accum` — exit 134, heap OOM abort with the same native stack signature on base (sandbox memory ceiling; its browser section).

`npm run format:check` — clean ("All matched files use Prettier code style!").
`npm run lint` — 0 errors, 11 warnings, **all 11 in files this change does not touch** (`App.jsx`, `FavoritesTray.jsx`, `ShelfView.jsx`, `DataExportRow.jsx`, `LootRow.jsx` — pre-existing react-hooks warnings); the touched files add none, so lint is no worse than base.

## Re-pins

**None.** No existing assertion, golden or census was changed; every test edit is additive. Sweeps behind that claim:

- All of `app/e2e/` grepped for poem-row selectors and chip counts: no spec references `.poem-row` / `.poem-act` or counts mode-strip chips. The only generic `.chip-btn` locators are scoped to `.pattern-editor` (pattern-controls target sizes — the poem group never renders there) and `.fx-add-row`; roll-scope selects strip chips by title/text. No e2e re-pin needed.
- Selfchecks grepped for assertions naming every touched file: the source-shape pins on `layoutSlice.js` (sway publication, the refine-spread constant, the director-identifier census) are narrow and unaffected — the new action references no Director identifier and adds no store-state key matching the sway pin. No suite reads `PoemRow.jsx` source or enumerates store actions.

## Not done (by design)

- No screenshots — per the slice plan those are the coordinator's feel-check evidence, taken on the running build.
- The Director/deal path (`fieldDirector.js`, `fieldFormForDeal`, dice) is untouched: nothing upstream can arm the register.
- No Queen surface, no new dealing/bias/placement behaviour, no persistence-schema change beyond the one optional marker the sanitizer already had the shape for.

## How to QA on the live canvas

Deal a poem (a type-native room — swiss/bauhaus/japanese family — and a CURATOR or poem re-deal until one stands). The poem group gains a `whisper` chip beside `keep`/`hold`. Tap it: the poem stays in exactly the same places with the same words, visibly quieter (about a third of its former presence); the chip shows pressed. Tap again: full voice restored. HOLD the poem, tap whisper, roll KINETIC: the held poem keeps its register. Turn whisper on, then re-deal the poem from the identity chip: the new poem arrives at full voice — the register belongs to the standing form, not the room.
