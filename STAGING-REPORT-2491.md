# STAGING REPORT — A13 scoped check (issue 2491, folding into the parked brief on issue 2156)

**Branch:** feat/2491-gputimer-scoped-check · **Base:** 738e10b2 (origin/main, incl. A3/A4)
**Scope as authorized:** ONLY the scoped check from the parked brief — (1) the u_texel
inconsistency, (2) disjoint-timer handling in gpuTimer. The brief's wider program stays
parked. The wider uniform-audit findings were verified and recorded, not fixed.
**Code changes: NONE.** Neither scoped item verifies as a functional defect, so per the
brief no fix was invented. This branch's only change is this report (which replaces the
A4 lane's report at this path, per the standing convention).

---

## Scoped item 1 — u_texel: NOT a functional defect (a documented design leftover)

The audit line is "effect: undeclared: u_texel". The evidence chain:

- **The shader truly doesn't declare it.** EFFECT_FS (`app/src/gl/shaders.mjs`, the
  `#version 300 es` block at line 1102) declares exactly u_src, u_effect, u_p, u_clip,
  u_clipOn. No branch samples by texel: rgbSplit's offset is `u_p.x` in canvas-uv units,
  grain is a `gl_FragCoord` hash, invert/posterize are pointwise. Nothing in the program
  needs a texel size, so nothing renders wrong for its absence.
- **It used to.** `git show 3de4562c` (the #308 glow rework that removed gaussian blur)
  deletes `uniform vec2 u_texel;` from EFFECT_FS together with the blur passes
  (u_effect 3/4) that consumed it (`vec2(u_texel.x, 0.0)` step vectors). The declaration
  left with its only consumer; the name stayed in the upload contract.
- **Uploads of undeclared names are a designed, counted skip.** The bridge's builtin
  contract (`app/src/gl/bridge/builtinEffects.mjs`) lists `u_texel: { kind: 'vec2' }`
  alongside `u_res`, and `u_res` carries the inline comment "not declared by EFFECT_FS
  (null location → skipped)". `uploadUniforms` (`app/src/gl/bridge/bridge.mjs:279-282`)
  skips null locations and counts them in `stats.uniformSkips`. `diagnostics.mjs`
  (the auditProgramChecked docstring) states the design outright: the bridge
  deliberately declares upload names a shader may not declare; null locations are
  skipped by design, and the typo class is still caught because a misspelled name
  leaves the real uniform in neverSet. The value is also supplied every pass
  (`bridge.mjs:366`, the legacy-pass value map) and by the sweep harness
  (`app/src/gl/debug/sweepEffects.mjs:249`); `bridge.selfcheck.mjs` pins the upload
  calls (incl. the resize re-upload at the new target size) against a mock GL — 21
  cases, green.
- **The "value on the strip" half of the original inconsistency does not verify.**
  The brief paired "undeclared" with a diagnostic strip reading u_texel.x ≈ 0.0025.
  That strip is the SHADER LAB panel's canned demo: `ShaderLabPanel.jsx:178-179`
  hard-codes labels `['u_amount', 'u_texel.x', 'iterations', 'seed']` and values
  `[0.75, 0.0025, 16, 0xc0ffee]`. It is not a live reading of any program, so the two
  halves were never measurements of the same thing.
- **Residual wart (recorded, not fixed):** `u_texel` lacks the "(null location →
  skipped)" comment that `u_res` has in builtinEffects.mjs, so the panel's
  "undeclared" label reads like an error instead of a known skip. One-line comment;
  left for the coordinator/Matt to disposition with the parked brief.

**Verdict:** the inconsistency resolves to "different systems + by-design skip". No
binding is mismatched in any way that affects a pixel.

## Scoped item 2 — gpuTimer disjoint handling: CORRECT as built, no defect

`app/src/gl/debug/gpuTimer.mjs`, read in full:

- `poll()` reads `gl.getParameter(ext.GPU_DISJOINT_EXT)` on **every** poll, before any
  query result is consumed — so a disjoint event that lands while queries are in
  flight is caught on the next poll, not missed.
- On disjoint it deletes every pending query, clears the batch, and returns
  `{ done: true, disjoint: true, timings: empty }` — no fabricated numbers, no leaked
  query objects, no stuck state; the next begin/poll cycle starts clean.
- Consumers honor the contract: the live loop reports a GPU frame time only when
  `r.done && !r.disjoint`; the SHADER LAB panel prints exactly "disjoint — clock
  unreliable, batch discarded". The stress session's GPU-timing line is this
  mechanism working as specified on a hosted (software-GL) build, not a malfunction.
- The disjoint-adjacent #480 hardening is also sound: GL errors are drained at the
  call site that caused them, a broken hardware path downgrades permanently to the
  CPU clock instead of leaking one query per frame, and POLL_STALL_LIMIT nets the
  silent variant. The `disjoint: true` return doubles as the "hardware path broken"
  signal — documented in poll()'s own docstring.
- Theoretical residue (noted, not a verified defect): poll() reads GPU_DISJOINT_EXT
  before any error drain within that call. It could leave a driver error flag behind
  only if poll() ran before any begin() on a stack that rejects that enum while
  accepting TIME_ELAPSED_EXT. No caller does this — the panel, the live loop, and
  measureCosts all begin first, and begin drains.
- Observation (panel behavior, outside the scoped item): the SHADER LAB panel times
  a single 'clear' batch at mount and never retries, so one disjoint batch leaves
  the panel showing the disjoint line for the whole session.

**Verdict:** disjoint handling does what the extension contract requires. No fix.

---

## Wider uniform-audit findings — verification status (recorded only, per scope)

The panel's audit compares each program's **linker-active** uniforms against the
`set` lists hard-coded in `ShaderLabPanel.jsx` (PROGRAMS table). Those lists are
small subsets — the table's comment claims they mirror renderer.mjs, but they do
not (quad lists 2 names; the renderer uploads dozens). The authoritative audits are
the checked ones (`auditProgramChecked` in the renderer/bridge/sweep paths), which
use the real upload sets and throw on a genuine never-set. Program by program:

- **quad (17 names: u_distHeat … u_spec): ALL REAL, ALL BY DESIGN.** Every name is
  declared in the quad program sources (QUAD_VS/QUAD_FS + common chunk in
  shaders.mjs) and every name has an upload site in `app/src/gl/renderer.mjs` in the
  real render path. They bind when their systems (sun, kineme, distortion, spec…)
  are live — the über-shader pattern the premise check on the parked brief already
  classified. The panel prints them only because its quad set list is
  `['u_canvas', 'u_atlas']`.
- **composite (15 names): 14 BY DESIGN, 1 DOES NOT EXIST.** u_maskMode, u_maskOn,
  u_maskInvert, u_hueOn, u_hueMat, u_soakOn, u_soakPigOn, u_soakAmt, u_soakGround,
  u_soakVelScale, u_mask, u_soakMask, u_soakVel, u_soakPig are all declared in
  COMPOSITE_FS and uploaded by renderer.mjs (the mask trio also by
  contactShadow.mjs). **u_soakPigMat appears nowhere in this tree and has no git
  history in this repo** (`git log -S u_soakPigMat` is empty) — that one audit entry
  is not reproducible against current source and was most likely inherited from the
  external brief's reference build, whose version labels match nothing in this repo.
- **resolve (u_present, u_shape, u_fake, u_light): ALL BY DESIGN.** All declared in
  `app/src/gl/resolveFs.mjs`, all uploaded via renderer.mjs / resolveBind.mjs. The
  panel's resolve set list is a 6-name subset.
- **copy: clean** — consistent (COPY_FS declares only u_src; the panel list matches).
- **effect: u_texel** — scoped item 1, above. It is the only "undeclared" entry, and
  it is a set-list name, not a shader need.

Net: the audit output that alarmed the stress session is produced by construction —
partial panel mirror lists vs über-shader active sets. No effect is silently running
on default uniforms in the real render path; the one name that matches nothing
(u_soakPigMat) matches nothing anywhere, including history.

## Overlap with the parallel A5 build (issue 2483)

None. This branch changes no code. gpuTimer is consumed by the live loop
(`app/src/gl/liveLoop.mjs`, a one-writer file) — read for evidence, not touched.
No governor/budget-ceiling file was read or modified.

## Verification (tree identical to base apart from this report)

- `npm run lint` — 0 errors (11 warnings, standing on main).
- `npm run format:check` — clean.
- Targeted suites, full counts: debug.selfcheck OK (115 cases), composite.selfcheck
  OK (15 cases), bridge.selfcheck OK (21 cases).
- `npm run build` — green.
- Full manifest sweep (continue-on-error, 826 suites; log `sweep.log` + per-suite
  exit codes `sweep-results.txt` in the worktree root): **819 pass, 7 nonzero** —
  - swarmWasm (exit 1), rollSafety (exit 1), accum (exit 134): the known
    sandbox-environmental set, A/B-identical on pristine main in the A3/A4 lanes.
  - accumFeed, retroCapture, vortex, resolverProbe (exit 1 inside the sweep): the
    sweep ran under repeated cell memory exhaustion (the runner was OOM-killed
    twice and resumed from its results file); **all four pass standalone (exit 0)**
    on this unchanged tree with memory free. Pressure casualties, not tree state.
- The sweep was interrupted once by a runtime restart and twice by OOM kills; it
  was resumed from `sweep-results.txt` each time and reconciles exactly:
  819 + 7 = 826 manifest commands, each with a recorded exit code.
