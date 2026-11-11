# STAGING REPORT — MegaMind S2 (#1526)

**Branch:** `megamind-s2`, based on S1 head `13111c1c` (PR #2076 branch tip).
**Status:** LOCAL STAGING ONLY — nothing pushed, no PR opened, nothing posted to GitHub.
The coordinator rebases onto new main and publishes after S1 lands.

Issue (verbatim title): "MegaMind S2 (DEFERRED): persona backend adapter — kc-voice/1 over
Ollama, cadence tiers, register hooks". The DEFERRED header is lifted by Matt's 2026-11-10
un-parking (lane: S1 → S2 → S3 → #1528 → #1529). Design: `docs/research/megamind-local-model-plan-2026-10-14.md`
§6b accommodation register, plus the 2026-10-15 comment amendment.

---

## 1. What shipped, in one paragraph

A `/api/chat` adapter (`megamindVoice.mjs`, pure core + `megamindVoiceLive.js`, live driver)
that answers persona asks from the visitor's **local** Ollama when S1's link record says a
model is connected and measured, emitting kc-voice/1 replies through the existing thinker
contract. The chain is Matt's ruled order: **a connected Ollama answers; on death it falls
silently to Apple Intelligence where present, else to rules** — cadence skips are not failures
and never fall through, and no surface anywhere shows an AI error state. The §6b register
surfaces land in `megamindSurfaces.mjs` (pure) + `megamindSurfacesLive.js` (driver), consumed
from the DEV panel's MEGAMIND tab (placement ruling: DEV panel first). Every surface validates
the model's reply against the real record it was grounded in; a bad reply is a discarded
reply, never a rendered one.

## 2. Surface-by-surface ledger

| # | Surface | Verdict | Evidence | Pin |
|---|---------|---------|----------|-----|
| 1 | Persona backend adapter (kc-voice/1 over Ollama) | **LIVE** | `app/src/curator/megamindVoice.mjs` (437 lines: `personaSystem` :65, `buildChatBody` :160, `gradePersonaReply` :221, `askPersonaReply` :278); `megamindVoiceLive.js` (`createOllamaModel` :33, `createMindChain` :105); wired at `app/src/App.jsx:200` (`createMindChain(appleModel)` → `startMind`) | megamindVoice checks 1–11 (chat bodies, grading, ladder, drift, chain) |
| 2 | #1483 conducting hooks | **LIVE** | The Davis persona prompt carries the conducting block verbatim in kind from the helper's (spectral features — centroid/flux/flatness inside the show block — never raw audio; one route edit per reply). Route proposals ride the reply's `route` field and are validated by the standing machinery: `mindContract.validateReply` → `MIND_REQUEST` → `trioLive` → `mindConduct.validateRouteOp` / the conductor gate. The adapter changes nothing in that path; tier C's section-change gate (`sectionKey`, `megamindVoice.mjs:355`) is the section-cadence hook: deep consultation re-opens only when the section changes. | megamindVoice check "cadence: tier A asks every bar; B phrases + state-room cache; C section changes only"; mindConduct 24/24 unchanged |
| 3 | #1145 pacing interface | **LIVE as proposals; actuation NOT built (see §6)** | `megamindSurfaces.mjs`: `buildPacingRequest` :33, `validatePacingProposal` :52, `judgePacingProposal` :70 (push invalid while relaxing or at peak; widen invalid at peak; hold always ok; no room → invalid). Records are produced and judged against the live room state read from `DIRECTOR_ROOM` history in `megamindSurfacesLive.js`; the pure scheduler in `director.js` is untouched and never model-edited. | megamindVoice checks "surfaces, pure…" + "surfaces, live…" |
| 4 | Crown-time assistance | **LIVE** | `buildCrownRequest` :85 / `validateCrownDraft` :108 (note ≤140 chars, caption ≤80, Look names uppercase ≤24 chars, no `!`, no CJK — the deadpan copy law of `hitName.js`). Suggestions only: the panel shows the draft for editing; nothing is written to the crown record. | megamindVoice surfaces checks |
| 5 | Dev-panel narration (telemetry + census) | **LIVE** | `buildNarrationRequest` :149 / `validateNarration` :166 — a line survives only if it quotes ≥1 supplied fact verbatim (or as a whole percent). Driver tallies real `MIND_DECISION` / `MIND_REPLY` traffic (`megamindSurfacesLive.js`); census narration reads the live ledger via `liveAgreement()` :56 (tasteLedger keeps/passes + `censusReport.tasteAgreement`). | megamindVoice surfaces checks; census suite green |
| 6 | Docs-grounded visitor guide | **LIVE, corpus scoped to what the app ships** | `buildGuideCorpus` :271 (137 chunks from the shipped in-app corpus: `src/data/helpCopy.js` HELP_TOPICS, `src/curator/lore.json`, `src/data/aboutCopy.mjs`), `retrieveGuide` :327, `validateGuideReply` :366 (every cited source must be one of the shown chunk ids — no invented features), honest `GUIDE_DECLINE` :342 when retrieval finds nothing. Repo `docs/` are not bundled into the app, so they cannot be retrieval sources at runtime; the corpus is the shipped wiki-equivalent (the ? overlay's own source of truth). | megamindVoice surfaces checks incl. "its honest decline" |
| 7 | Davis reason prose (2026-10-15 amendment) | **LIVE** | `buildReasonRequest` :189 / `validateReasonLine` :203 — the line survives only if it contains ≥1 head-word of the actual `explainTreeScore` clause. Slot: `tasteHead.js` `setDavisReasonProse` :448 / `getDavisReasonProse` :453, keyed by the exact clause; `curate.js:160` prefers the prose only while that clause stands, else the template clause — the tree path stays the evidence. The driver also auto-writes prose on `DICE_CAST` when a new citation stands. | megamindVoice check "Davis prose grounded in the clause"; tasteHead + curate suites green |
| 8 | Drift narration + retrain proposals (2026-10-15 amendment) | **LIVE** | `agreementDiverged` :216 (AUC < `DRIFT_AUC` 0.65, or keeps-mean ≤ passes-mean) gates everything: on agreement the surface says so and proposes nothing. `buildDriftRequest` :242 / `validateDriftReply` :258 — a retrain proposal survives only on real divergence. The model proposes; it never retrains, ships, or swaps a head. `taste.json` is never written by any S2 code path. | megamindVoice check "drift honoured only on real divergence" |

No surface is silently missing. Two scope notes are in §6 (rulings needed), not cuts:
#1145 actuation and the review voice's backend.

## 3. The adapter's contract points

**Where kc-voice/1 records are produced and validated.** Produced in
`megamindVoice.askPersonaReply` (one `/api/chat` POST per attempt, House pins below);
graded in `gradePersonaReply` (think-strip → JSON extraction → shape check against
`REPLY_SHAPES`, the JS twin of the helper's contract); then validated a second time by the
standing `mindContract.validateReply` inside the thinker — the adapter's grading never
replaces the contract, it only decides whether an attempt counts as an answer, a format
failure, or drift. The record shape itself is unchanged (out of scope, untouched).

**Format fallback ladder** (`createFormatLadder`, `FORMAT_RUNGS` :78): `schema` → `json` →
`prompt`. Monotonic down only, per persona, per session: a format failure steps down one
rung and retries once; the rung sticks. Garbage at every rung = a discarded reply
(kind `bad-reply`). Persona ceilings live in `PERSONA_FORMATS` :81, measured-support style:
a model that cannot do schema starts lower — asserted by the ladder, never by the registry.

**House pins on every chat body** (`buildChatBody` :160): `num_ctx` 16384, `num_predict` 150,
`keep_alive` "30m", temperature 0, and `think: false` **only where the model allows it**
(qwen-family tags); for other tags no think field is sent and leaked `<think>…</think>` is
stripped client-side before parsing (`stripThink` :194). Persona prompts are JS twins of the
Swift helper's voices (`PERSONA_VOICES` :54) with the language pinned in every prompt;
a CJK-bearing reply (`CJK_RE` :190) gets exactly one retry with the stern language line,
then is discarded as drift.

**Local only.** `localRecord` :333 refuses a registry record wholesale if it is cloud-badged,
and refuses any record whose tier contradicts its probe measurement (S1's registry law).
The House model text is S1's `HOUSE_TEXT`, reused, never forked.

**Tier → consultation mapping** (`createCadencePolicy` :380; timeouts `CHAT_TIMEOUT_MS` :269 —
A 8000 · B 20000 · C 45000; surfaces `SURFACE_TIMEOUT_MS` 60000):

- **A** — network ask on every eligible bar (`persona.perBar`).
- **B** — network ask only at phrase boundaries; inside a phrase, a cached reply for the
  same state-room (`stateRoomKey` :340) may serve at most `CACHE_MAX_SERVES` (2) times and
  only inside the section it was earned in; otherwise the bar is a cadence skip.
- **C** — network ask only when the section (`sectionKey` :355) changed since the last
  consultation; deep verdicts ride `DEEP_MAX_LATE_BARS` (128) in `startMind`, because a
  tier-C answer may legitimately take the tier's whole timeout, while Apple (300 ms cap)
  and rules (synchronous) can never be late in practice.

**Kill-mid-session degradation path.** S1's disconnect (or a registry record going stale)
makes `localRecord` return null → the Ollama model reports unavailable → the thinker never
asks it → rules answer, silently. A model that dies mid-session rejects; the chain
(`createMindChain`, `megamindVoiceLive.js:105`) falls to Apple **in the same ask**; after
`FAILURES_TO_LATCH` (2) consecutive real failures the model latches dead until a fresh
registry record arrives. Cadence skips rethrow as `kind: 'cadence'` and never fall through —
a skip is the design working, not a failure. In-flight replies that land after a disconnect
are judged by the thinker's standing late bar (`MAX_LATE_BARS`, or the model's
`maxLateBars`) and discarded if stale. No path renders an AI error state.

**Degradation pin:** megamindVoice checks "the chain: Ollama answers, its death falls to
Apple, its cadence never does", "the model object: availability is the registry + the
latch", and "tier C through the model: a same-section ask is a cadence skip, not a failure"
— including the mid-session kill case (in-flight replies drained first, then silence).

## 4. Invariant discipline (who-acts change)

The adapter changes who acts inside the persona path, so per standing orders: all selfchecks
and e2e were grepped for invariants over the mutated state (reply persistence, decision
counters, byte-identity). Findings: `mindRecord` validates recorded decisions against
`BACKENDS`, which therefore gained `'ollama'` (`mindThinker.js:18`) — a recorded Ollama
decision is now a lawful record, stamped from the ask envelope only when the backend is in
`BACKENDS` (a rogue stamp is ignored). `mind:status` now follows `info().backend` when the
model reports one (Ollama live vs Apple fallback is real movement, not a new UI state; the
registry note on `MIND_STATUS` already reads "no UI announces it" for the main UI — the DEV
panel is the backstage exception S1 established). The bus registry was updated honestly for
the surfaces driver's new handlers (`eventRegistry.js`: MIND_DECISION + DIRECTOR_ROOM lists,
MIND_REPLY null→handler with note, DICE_CAST note) — caught by `eventRegistry.selfcheck`
in the full sweep and fixed on this branch. Dice-driven suites (dice, curate, mind,
trioLive, megamindVoice) were run 15× each in rotation: **0 failures / 75 runs**.

## 5. Verification

- **New suite:** `app/src/curator/megamindVoice.selfcheck.mjs` — verdict line:
  `megamindVoice.selfcheck: 17 checks passed`. Registered in `app/selfcheck.manifest`
  (after megamindLink).
- **Blast-radius family, all green:** mind 15, mindApple 6, mindConduct 24,
  mindConduct.apple 6, megamindLink 21, trioLive 23, trioAcceptance ok, census ok,
  tasteHead ok, fieldReviewVoice 34, curate ok, dice ok (15 layouts), mindFace 7,
  mindPresence 18, devPanel ok, eventRegistry ok (175 events, 4 reserved or telemetry).
- **Full manifest sweep (656 suites, continue-on-error, Playwright chromium installed
  first): 652 pass / 4 fail.** The 4th failure was `eventRegistry` (my new handlers,
  fixed above and re-verified green). The remaining 3 — `swarmWasm`, `rollSafety`,
  `accum` — are the standing sandbox-environmental set in code this branch does not touch.
  **Base-check: PROVEN** — all three were run on the untouched S1 base worktree
  (`kc-1525-build`, clean at `13111c1c`) and all three FAIL there identically, so they
  pre-date this branch; CI is authoritative for them.
- **`npm run format:check`:** green ("All matched files use Prettier code style!") —
  re-run after the final registry edit.
- **`npm run build`:** clean — re-run on the final tree after the registry fix ("✓ built in 10.22s").

## 6. Needs Matt's ruling (nothing here blocks the build)

1. **#1145 actuation.** The plan's §0c leaves three questions open (do rooms act? are
   proposals surfaced? what weight does LOIS move?). S2 therefore ships proposals +
   pure validation only; no proposal moves a gain. Actuation is a separate ruling/build.
2. **Review voice stays on Apple.** `startReviewVoice` deliberately keeps `appleModel`:
   the field review voice runs under its own 300 ms discipline, which a network model
   cannot meet. If Matt wants review verdicts from the House model, that is a separate
   design (async verdicts), not a chain swap.
3. **On-device acceptance (post-publish).** Same pattern as S1: with Ollama running the
   House model (`qwen3-vl:8b-instruct`, already the only model on the Studio), connect in
   the DEV panel, and the personas answer from Ollama; the panel's Surfaces section
   exercises pacing / crown / narration / drift / guide on demand. No sandbox Ollama
   exists, so fixture fetches mirroring real Ollama replies are the staging evidence —
   the suite is built on them end-to-end (chain, thinker, surfaces driver).

## 7. Files

New: `app/src/curator/megamindVoice.mjs`, `app/src/curator/megamindVoiceLive.js`,
`app/src/curator/megamindSurfaces.mjs`, `app/src/curator/megamindSurfacesLive.js`,
`app/src/curator/megamindVoice.selfcheck.mjs`, this report.
Modified: `app/src/App.jsx`, `app/src/curator/mindLive.js`, `app/src/curator/mindThinker.js`,
`app/src/curator/tasteHead.js`, `app/src/curator/curate.js`,
`app/src/composition/eventRegistry.js`, `app/src/panels/MegaMindPanel.jsx`,
`app/selfcheck.manifest`. (An `npm install` license-field churn in `app/package-lock.json`
was reverted — not part of this change.)
