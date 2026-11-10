# STAGING REPORT — #1747 kc-mind ask lifecycle (busy / cancel / reaping)

Branch `feat/mind-ask-lifecycle-1747` on origin/main `01cbdde4`. Locally staged only: no push, no PR.
Issue title (verbatim): "kc-mind: timed-out asks keep generating, collide on the persona session, and dropped helpers aren't reaped"

## Premise re-verification (issue evidence was measured on old main `07c18e0`) — claim by claim

1. **"On timeout the id is forgotten; nothing is sent to the helper. There is no `cancel` op in main.swift."**
   STILL TRUE on current main. `MindHelper::request` (src-tauri/src/mind/mod.rs) timed out into
   `forget(id)` + `Err("timeout")` and nothing else; no `cancel`/`busy` string existed in either file.
2. **"Each ask runs in its own Task; `Minds.ask` awaits `session.respond` on the persona's shared session;
   a second concurrent respond can error and drop the session."** STILL TRUE in shape, with drift in detail:
   the dispatch is still a bare `Task { … m.ask … }` per ask with no in-flight tracking. Since the issue was
   filed, #2071 added the session-refresh cycle (`answersPerSession = 4`, `Minds.session(for:)` counts uses);
   the error path still does `sessions[persona] = nil` on any throw. There was no busy guard anywhere.
3. **"`*guard = None` drops the Child without kill()/wait() (mod.rs:88, :103) — orphans/zombies."**
   **ALREADY FIXED — do not rebuild.** PR #1752 ("…kc-mind reaping (…, part #1747)") landed `reap()`
   (close stdin → `kill()` → `wait()`) and wired it at all three drop sites on current main: dead-helper
   replacement (mod.rs:88), write failure (mod.rs:105), and `MindHelper`'s `Drop` (mod.rs:133). Verified via
   `git log -S reap` → commit `100232b2`. This staging build therefore implements parts 1 and 2 only, and
   pins part 3's presence in the new selfcheck block so it cannot silently regress.

## The fix as built (parts 1 + 2)

### Helper — `src-tauri/helpers/kc-mind/main.swift`
- `Minds` actor gains `inFlight: Set<String>` and `tasks: [Int: Task<Void, Never>]`, both actor-isolated.
- **Busy (part 1):** `Minds.ask` now opens with `guard inFlight.insert(persona).inserted else { throw
  MindAskError.busy }` and a `defer` removal. The newcomer's reply is `{"reply":null,"error":"busy"}` —
  produced by the new `Minds.run(id:…)` wrapper, which also builds every other ask reply (success/error
  shapes unchanged). The app side already falls back to rules on any error, so no app change was needed.
- **Cancel (part 2, helper half):** `run` registers the current Task in `tasks[id]` via
  `withUnsafeCurrentTask` before generating, and unregisters in a `defer` — registration, the busy guard and
  cancellation are all serialized on the actor, so there is no add-after-finish race. A new
  `{"op":"cancel","id":N}` line routes through `cancelAsk(_:)` (a no-op if Minds was never created, and
  compiled in both variants) to `Minds.cancel(id:)`, which cancels that Task. Cancel is never answered:
  the bridge has already forgotten the id, so any reply would be dropped by its reader thread.
- Protocol doc comment at the top of the file updated (cancel line + busy rule).
- `build.sh`'s shell stub (written when no Swift toolchain exists) now recognises the cancel op and, like
  the real helper, never answers it. The KC_NO_FM variant is likewise coherent: asks still answer
  "unavailable" immediately (nothing is ever in flight), and `cancelAsk` compiles to a no-op — routed
  through a function specifically so the switch case keeps an unconditional statement in that variant.

### Bridge — `src-tauri/src/mind/mod.rs`
- On `recv_timeout` failure, `request` now calls the new `cancel(id)` after `forget(id)`: it writes
  `{"op":"cancel","id":N}` to the helper's stdin under the existing `proc_` lock (not held while waiting,
  so no deadlock). Best-effort by design and commented as such: the helper ignores ids with nothing in
  flight (status requests, just-finished asks), and a failed write means a dead/dying helper, which the
  next request's existing liveness check reaps and respawns. Header comment updated to match.

## Cancel × session-refresh decision (the composition the brief asked for)

- **A busy ask never touches the session.** The guard runs before `session(for:)`, so a refused ask does
  not consume one of the session's 4 answers and cannot perturb the refresh counter.
- **A cancelled ask spends its session.** Cancellation makes `respond` throw; `ask()`'s pre-existing catch
  drops that persona's session (`sessions[persona] = nil`) on any error, and this build deliberately keeps
  that for cancellation too: whether a cancelled exchange reached the transcript is unknowable, so the
  session is treated as spent rather than trusted. The next ask builds a fresh prewarmed session with its
  counter reset — a discarded session only ever serves *fewer* than `answersPerSession` answers, never
  more, so the #2071 window guarantee is preserved exactly. A cancelled ask's late reply line (an error
  dict) is dropped by the bridge, which forgot the id before sending cancel.

## Verification (this sandbox: node only — no cargo, no swiftc)

Selfchecks, run directly by file in `app/` — all green:
- `mindApple.selfcheck` — **6 passed** (5 standing + 1 new block, below)
- `mindConduct.selfcheck` — **24 passed**
- `mindConduct.apple.selfcheck` — **6 passed**
- `mind.selfcheck` — **15 passed**
- `directorRoom.selfcheck` — **7 passed** and `mindPresence.selfcheck` — **18 passed** (both pin these
  same source files; run to prove the edits broke no standing source-shape pin)

New coverage — one block in `mindApple.selfcheck.mjs`: "timed-out asks are cancelled and a busy persona
refuses, in helper and bridge source (#1747)". In this rig's established style (it already source-pins the
helper and bridge), it asserts: the helper's `case "cancel"`, the `"busy"` refusal, the in-flight guard
running before the session, the task cancel by id, the bridge's cancel JSON on timeout, the stub's cancel
handling — and part 3's `child.kill()`/`child.wait()` presence. It is honest about its limit: it pins the
protocol contract in source; it cannot prove generation actually stops.

- `cargo check` — **could not run: no Rust toolchain in this sandbox** (`cargo: command not found`). The
  Rust change is small and uses only items already imported in the file (`json!`, `Write`), but it has not
  been compiler-checked here; CI's cargo-check is the first real compile gate.
- The Swift changes have likewise **not been compiled here** (no swiftc; build.sh on this Linux box would
  emit the shell stub). They were written against the file's existing patterns and re-read in full diff.
- `npm run format:check` — **could not run as-is: this worktree has no `node_modules`** (prettier not
  installed). The one touched JS file passes `npx prettier --check src/curator/mindApple.selfcheck.mjs`
  ("All matched files use Prettier code style!"). Swift/Rust/shell files are outside prettier's scope.

## Remaining gate (not claimed here)

On-device Mac session, same shape as the #2068 proof: with the real helper built (Foundation Models),
force an ask past the 300 ms cap (cold structured reply) and show (a) the timed-out generation actually
stops (no late session error, no session drop on the *next* ask beyond the deliberate discard), (b) a
second same-persona ask inside the window comes back `error:"busy"` with the rules answering that bar,
and (c) no stray kc-mind processes after helper restarts (part 3's behaviour, already on main, worth one
confirmation look while there).
