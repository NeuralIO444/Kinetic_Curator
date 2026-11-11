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
- **Cancel (part 2, helper half):** the actor's `start(id:…)` dispatch creates the ask's Task and registers
  it in `tasks[id]` in the same actor job (a Task handle exists only where the Task is created — see the
  fix-round section below for why the first build's registration could not compile, and what replaced it);
  `run` unregisters in a `defer`, and a cancel that reaches the actor before dispatch is remembered in
  `earlyCancels` so `start` refuses that ask instead of generating for nobody. A new
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
- The Swift changes have likewise **not been compiled here** (no Swift toolchain exists in this sandbox —
  `swiftc --version` and a scan of the usual install paths both come up empty; build.sh on this Linux box
  would emit the shell stub). They were written against the file's existing patterns and re-read in full
  diff. Stronger honesty, stated once and plainly: **there is NO Swift compile gate anywhere before an
  on-device build** — not in this sandbox, not in CI — and a Swift compile failure does not fail loudly:
  build.sh falls back to the KC_NO_FM variant, producing a helper that compiles and reports unavailable
  forever. The first real Swift compile is Matt's Mac build (see the fix-round section for the bug this
  nearly shipped).
- `npm run format:check` — **could not run as-is: this worktree has no `node_modules`** (prettier not
  installed). The one touched JS file passes `npx prettier --check src/curator/mindApple.selfcheck.mjs`
  ("All matched files use Prettier code style!"). Swift/Rust/shell files are outside prettier's scope.

## Fix round (QA on `eae7368d`: NOT CLEAN — one blocker + notes; all addressed)

**B1 — the cancel registry could not compile.** The first build registered the running Task from inside
`Minds.run` via `withUnsafeCurrentTask { … tasks[id] = cur.task }`. No shipped Swift (5.5–6.x; build.sh
compiles `-swift-version 5`) has `UnsafeCurrentTask.task` — it existed only in pre-release documentation,
and a handle to the current task deliberately cannot be obtained that way (the unsafe reference exposes
`cancel()`/`isCancelled`/`priority` only and must not escape the closure). On a real Mac build the FM
variant would fail to compile and build.sh would silently fall back to KC_NO_FM: a helper that reports
unavailable forever, with no gate anywhere to catch it (see the compile-gate disclosure in Verification
above — added this round, per QA note N2).

**The redesign.** A Task handle is captured where the Task is created — on the actor itself. The new
`Minds.start(id:persona:context:seed:started:)` is the dispatch: called from `handle()`'s ask case in
place of the old inline `Task { send(await m.run(…)) }`, it creates the Task and stores it in `tasks[id]`
inside the same actor job, then `run` (unchanged reply shapes) removes the entry via its `defer`.
Registration stays actor-isolated; cleanup happens on every exit path of `run` (success, busy refusal,
generation error, cancellation surfacing as an error). Wire semantics are untouched: busy still replies
`{"reply":null,"error":"busy"}`, a cancel is still never answered, an unknown id still changes nothing
observable (see the ordering argument for the one internal difference), and the KC_NO_FM variant and the
build.sh stub are exactly as before (the actor does not exist in KC_NO_FM; `cancelAsk` stays a no-op
there).

**The ordering argument (QA note N1 — no "race-free" claim).** Two orderings matter, and both are closed
structurally, not by luck:
- *Registration vs the ask itself:* `start` stores `tasks[id]` in the same actor job that creates the
  Task, and `run` executes only inside that Task, so its cleanup `defer` cannot precede the store, and
  the entry cannot be left behind.
- *Cancel vs dispatch:* the bridge sends a cancel only after its `recv_timeout` fires — 300 ms for an
  ask, 3 s for status — while the helper's dispatch job is spawned the moment the ask line is handled,
  so in practice a cancel trails its ask's dispatch by ~300 ms of wall time and always finds the Task
  registered. Should the two actor jobs ever interleave the other way anyway (cancel processed first),
  `cancel(id:)` now records the id in `earlyCancels` and `start` refuses the ask outright — no
  generation, no reply. Either interleaving ends with the ask cancelled; the window is not merely
  narrow, it is closed. One internal difference from a plain no-op: a cancel for an id that never
  dispatches (a timed-out status request) leaves an inert entry in `earlyCancels`, as does a cancel
  that lands after its ask already finished and unregistered; bridge ids come from
  a monotonic `AtomicU64` and are never reused, so the entry can never match a later ask.

**N3 — selfcheck wording.** The #1747 block in `mindApple.selfcheck.mjs` pinned `case "cancel"` under
the message "the helper answers a cancel op" — the opposite of the design (a cancel is never answered).
The message now says what is actually pinned: the helper routes a "cancel" op, and a cancel is never
answered.

**Suites after the fix** (run directly by file in `app/`): mindApple **6**, mindConduct **24**,
mindConduct.apple **6**, mind **15**, directorRoom **7**, mindPresence **18** — all green, counts as
expected; `npx prettier --check` on the touched JS file passes. The Swift remains uncompiled here (no
toolchain in this sandbox, verified again this round), which is precisely the gate gap disclosed above:
the on-device build below is also the first Swift compile.

## Remaining gate (not claimed here)

On-device Mac session, same shape as the #2068 proof: with the real helper built (Foundation Models),
force an ask past the 300 ms cap (cold structured reply) and show (a) the timed-out generation actually
stops (no late session error, no session drop on the *next* ask beyond the deliberate discard), (b) a
second same-persona ask inside the window comes back `error:"busy"` with the rules answering that bar,
and (c) no stray kc-mind processes after helper restarts (part 3's behaviour, already on main, worth one
confirmation look while there).
