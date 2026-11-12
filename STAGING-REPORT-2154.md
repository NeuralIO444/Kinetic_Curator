# STAGING REPORT — #2154 Mind/MegaMind hardening

Branch: `hardening/2154-mind-megamind`, based on origin/main `1b316393` (#2149).
Lane: backend, zero behaviour change. Source: sweep report `kc-mind-sweep-2026-11-12/SWEEP.md`.
Scope held: #2069's conducting table/tuning untouched, #2086's export keeps semantics untouched,
CSP untouched, no persona deck content touched, no golden weakened or re-pinned.

## H1 — Apple ask can hang forever (`app/src/curator/mindApple.js`)

- Added `ASK_JS_TIMEOUT_MS = 3000` (10× the helper's own 300 ms cap — the status path's budget
  shape) and race the Tauri `mind_ask` invoke against it inside `createAppleModel().ask()`.
  The budget is injectable (`jsTimeoutMs`) so the selfcheck can drive it; the timer is always
  cleared. On timeout the race rejects as `timeout`, which the thinker already treats as a
  failed ask: the flight closes and the rules answer. Nothing surfaces; no stuck flight.
  The race can only fire when the native side wedges without answering at all — the helper
  enforces its own 300 ms cap whenever it answers.
- Pin (`mindApple.selfcheck.mjs`): a never-settling invoke rejects as a miss inside the budget
  (40 ms test budget), and the next ask on the same model answers normally.
- Suite: mindApple.selfcheck 6 → 7 checks, green.

## H2 — Embedding search can publish stale results (`app/src/curator/megamindEmbedLive.js`)

- `searchText` and `moreLikeKeep` now capture `generation` at press time — the same guard the
  probe path already had — pass it into `embedTexts`, and drop the publish (`return null`)
  when the generation has moved by the time the vectors land. The failure note inside
  `embedTexts` is likewise gated on the captured generation. Cache writes are unchanged
  (still model-keyed, still persisted mid-flight): only the publish is dropped.
- Pin (`megamindEmbed.selfcheck.mjs`): a gated fixture parks both presses under model
  `embed-a`, the slot is moved to `embed-b` mid-flight, the gate opens — both presses return
  null, the new model's view carries no search results and no busy flag.
- Suite: megamindEmbed.selfcheck 163 → 169 checks, green.

## H3 — Conductor phrase ledger grows unbounded (`app/src/curator/mindConduct.js`)

- Named cap `PHRASE_LEDGER_MAX = 16384` phrases (65,536 bars — days of continuous
  conducting, far beyond any real performance). `commit()` evicts oldest-first past the cap.
  `consider` only ever looks up phrases at or after the current one, so eviction of ancient
  phrases cannot change behaviour inside a performance.
- Pin (`mindConduct.selfcheck.mjs`): after committing past the cap, phrase 1 reads as free
  again (evicted) while the newest committed phrase still blocks its second edit.
- Suite: mindConduct.selfcheck 24 → 25 checks, green.

## N1 — Seed getter outside the try (`app/src/curator/mindLive.js`)

- The `getSeed()` call in the bar handler now sits in the same try/catch shape as the
  snapshot read above it: a throwing seed getter skips that bar quietly instead of
  escaping onto the event bus.
- Pin (`mind.selfcheck.mjs`): a seed getter that throws on its first call produces no
  decision for that bar, no `[eventBus]` error for CLOCK_BAR, and the next bar thinks
  as usual (3 decisions).
- Suite: mind.selfcheck 15 → 16 checks, green.

## Verification

- Touched suites (after): mindApple 7/7 · megamindEmbed 169/169 · mindConduct 25/25 · mind 16/16.
  Baselines measured on a pristine detached worktree at the same base commit.
- `npm run lint`: 0 errors, 11 warnings — none in any touched file (pre-existing warnings).
- `npm run format:check`: all files pass.
- `npm run build`: green (chunk-size and ineffective-dynamic-import warnings are pre-existing;
  the latter is sweep item O2, explicitly out of scope).
- Full manifest sweep (continue-on-error, all 674 manifest lines): **671 pass / 3 fail**.
  The 3 fails are the known sandbox environmental trio, proven base-identical on a pristine
  detached worktree at the same base commit (same exit codes): `swarmWasm` (exit 1 — the
  checked-in kernel wasm does not reproduce bit-for-bit under the sandbox rust toolchain),
  `rollSafety` (exit 1 — Playwright target crash), `accum` (exit 134 — node heap OOM at the
  sandbox's ~2 GB limit). CI's selfcheck-browser job is authoritative for these.
