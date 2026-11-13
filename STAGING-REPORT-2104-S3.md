# STAGING REPORT — #2104 step 3: the recording

Branch `kc-2104-recording` (worktree `~/workspace/kc-2104-step3`), based on `origin/main` @ `54b17fc2`
(step 2, PR #2170). One PR, not merged — the coordinator/Matt merge.

## What was built

**The project document** (`app/src/state/projectDocument.js`) — in the sun's shape, beside `light`:
- `serializeProject` writes `doc.world = sanitizeWorld(state.world)` only when a world stands.
  A world-less state (the stage after CHAOS or the launch opener cleared the world with the
  chapter) writes no key at all, so its document is byte-identical to one written before
  recording existed.
- `parseProject` reads it back through the same door in BOTH branches (v1 and legacy):
  `world: sanitizeWorld(raw.world)` — absent → null, a lawful state, never an error, never a
  refusal. A hostile world value in a document is repaired by the door like every other
  document field (bad colour → house fallback, boil clamped to the named band), pinned in
  world.selfcheck.
- Only the standing world is ever written — **no chapter-to-world map** (conflict-review
  ruling 3). The document gains exactly one field, pinned by a key-set assertion in
  world.selfcheck; the chapter pick still derives from the chapter alone (`worldForChapter`)
  when a new landing deals. Layer snapshots do not carry the world (the sun doesn't ride
  them either; `captureSnapshot`'s field list is untouched).

**The load** (`app/src/state/slices/globalSlice.js`, `applyProject` — the funnel every load
path runs through): `next.world = sanitizeWorld(doc.world)` beside the sun's restore line.
A document's recorded world stands back up; a document without one leaves the stage
world-less — never the session's leftover world, never the house default (the #1062 trap,
pinned in world.selfcheck against the real store).

**The take** (`app/src/gl/performanceFile.mjs`):
- `createPerformanceRecorder` takes a `world` option, read once at the take's start and run
  through the door at creation; `finish()` stamps it as an optional `world` section, in the
  `initialState` idiom — absent when no world stood, so those files are exactly what they
  always were. `performanceCapture.startPerformance` passes the option through untouched
  (its opts already flow to the recorder); `PerformanceButton` supplies the standing world
  beside the sections registry (the registry object itself is untouched — the take suites'
  source pins on its shape all pass).
- `checkPerformance` validates a present stamp with `checkWorld`, fail-closed in the
  `checkInitialState` style: the stored record must be a **fixed point of the door** (same
  shape, same values, no extra keys at either level) — anything else is not a world this
  instrument dealt, and the file is refused.
- The stamp is a note in the file, like the machine keys: verification does not consume it
  and the frame hash never sees it (the hash walks resolver outputs only). Pinned directly:
  two recorders fed identical frames, one stamped and one not, produce **identical
  checkpoints**.
- **The retro ring** (`app/src/gl/retroCapture.mjs`) stamps its takes too: an optional
  `worldProvider` is sampled exactly where the chain seed is sampled — at the ring's start
  and at every clear (the window's opening world, for from-launch takes) and at every
  snapshot boundary (that boundary's world, for mid-session takes) — so a retro take is
  stamped with the world its first frame stands in, never the save-time world. Without a
  provider the ring stamps nothing, exactly as before. `PerformanceButton` wires the
  provider to the store. All three cases are pinned in retroCapture.selfcheck, and the
  stamped takes verify.

**Autosave wakefulness** (`app/src/state/projectWatch.mjs`): `world` joins
`PROJECT_STATE_KEYS` beside `light`. Caught by that list's own coverage suite in the full
sweep (the one real failure — see below): without it, a landing that changed ONLY the world
would not have woken the autosave, and the recorded world could have been lost on close.

**Comments carried forward:** `data/world.js`'s header now states steps 1–3; the layoutSlice
`world` field comment no longer calls the field session-only and states the recording and
the load behaviour.

## How old documents and takes were proven unaffected

- **replayGate**: the committed 60-second fixture (`src/gl/fixtures/replayGate.kcperf`,
  recorded before worlds were stamped; it carries no stamp) replays green, every checkpoint.
- **creatureGate** green; **allEraGolden** byte-identical (985 assets, 24296 svg bytes —
  the same numbers as step 2's report).
- **projectDocument + fuzz**: the app's own document (which now carries the world) is a
  fixed point of its parser; hostile worlds are repaired, never fatal. Fuzz split note: the
  repaired/refused counts moved (282/118 on pristine main → 267/133 here) because the app's
  own document gained the `world` field, which reseeds the seeded mutation stream — the
  suite's invariants (fixed points, never throws, no prototype pollution, most documents
  repaired) all hold and it passes. Verified the base split on a fresh detached worktree at
  `origin/main`, not from memory.
- **world.selfcheck** pins the whole boundary: world-less ⇔ no key, in both directions;
  pre-recording documents parse world-less; the scene contract still carries **no** world
  key; a stamped take round-trips through the stored form (gzip of JSON) whole.

## Visible-change verdict

**Step 3 changes NOTHING the stage looks like.** Nothing new reads `state.world` to draw —
grep-verified: the record's only readers are the serializer, the parser, the apply action,
the recorder/ring stampers and the suites. Restoring a recorded world only sets the standing
record. The scene contract is untouched. All goldens byte-identical. This is backend-lane
plumbing, like steps 1 and 2.

## Not done (by design — step boundaries)

- **Style response (step 4)** — nothing consumes the recorded world yet: the stage's ground,
  boil and finish still come from where they always came from, and playback does not stand a
  take's recorded world back up. That is the same posture as steps 1–2 (nothing read the
  standing record either); ruling 6's "a take replays in its world" is served by the stamp
  being in the file, validated, for step 4 to stand up.
- **No dial or lock surface over world fields was added — recording only** — so spec §4
  precedence (locked / hand-set fields survive a landing) remains deferred exactly as
  post-merge QA recorded it after step 2: it comes due only if such a surface is ever built.
- No bus surface (ruling 9 — waits for the #1183 slice). No DISH LIFE rename (ruling 8 —
  its own slice). The export bundle / hits payload (`useProjectPayload`) does not carry the
  world — it does not carry the sun either; the document proper is the recording surface.

## Publish ritual (this tree, this run)

- Decisive suites individually, verdict lines observed: world OK · retroCapture ok ·
  projectDocument OK · projectDocument.fuzz ok · projectWatch 5 checks (after the fix) ·
  light OK · performanceFile ok · performanceCapture ok · replayGate ok · creatureGate ok ·
  allEraGolden ok (985 assets) · diceLanding OK · chapterWalk ok · startupChaos ok ·
  projectFolderLive / projectSession / projectFile / projectTauri all pass · take family
  (takeStrip, clockRecord, stressRecord, formation, gestureRecord, spectrumRecord,
  megamindRecap, playback, performanceCreatures, performanceDishLife, creatureMoods,
  spawnState, davisShift, treatmentBus, trioLive, mind, mindApple) all pass.
- Full manifest sweep: **673 pass / 4 fail** — three are exactly the documented
  sandbox-environmental set (swarmWasm, rollSafety, accum — accum's log shows the sandbox
  memory abort, the same signature as on main and in steps 1–2; CI's lint-build-selfcheck
  and selfcheck-browser jobs are authoritative for those three). The fourth, projectWatch,
  was a REAL catch by the sweep (the watch-list gap above): fixed, then re-verified
  standalone plus its whole neighborhood (projectFolderLive, projectSession, projectFile,
  projectTauri, and the three suites that import the watch list — audioRoutes,
  creatureAssembler, midi) all green. With the fix, the sweep profile matches step 2's:
  everything green except the environmental three.
- `npm run lint`: **0 errors** (11 warnings, all pre-existing in files this PR does not touch).
- `npm run format:check`: **clean** (prettier reformatted only the two extended selfcheck
  files; both still pass).
- `npm run build`: **green** (3.79s; no @resvg failure, so no A/B was needed).
- CI: checked with `gh pr checks` after opening; the verdicts are reported in the builder
  handoff (this report is committed with the code it describes, before CI runs).

## Git proof

In the builder handoff — the git log is only final once this commit exists.
