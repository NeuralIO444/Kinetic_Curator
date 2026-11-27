# STAGING REPORT — #2077 Dev mode toggle (DEV panel in release builds)

Issue: #2077 — "Settings: a Dev mode toggle — make the DEV panel reachable in release builds."
Filed on Matt's ruling 2026-11-10. This is MegaMind's release home (placement ruled DEV PANEL FIRST, #1525).

Provenance, stated plainly: the build was written by a builder agent in this
worktree; the agent stalled (silent ~1h, work uncommitted) and was closed by
the coordinator, who audited every file, committed the work, rebased it onto
current main, resolved the one conflict, and ran the full verification below
with his own eyes. The tree, not the handoff, is the evidence.

## 1. What shipped

- `app/src/composition/devMode.mjs` (new) — the Dev mode preference. One
  boolean, OFF by default, persisted in localStorage under `kc:dev-mode:v1`
  with the app's other small preferences (the tasteGate pattern — no second
  prefs store), never part of a saved project. A listener set lets the Shell
  re-render the tab strip the moment the toggle flips: **no reload anywhere
  in this change** (the issue allowed a reload if the module shape forced
  one; it did not). When storage refuses a write, the value still holds for
  the session and `noteSessionOnly()` says so (#1641), like the taste switch.
- `app/src/composition/PanelRegistry.js` — the gate reversal. The panel is
  registered unconditionally as an unconditional `lazy()` chunk; reachability
  is decided at read time in `panelsByZone` via
  `devPanelAvailable() = import.meta.env.DEV || devModeOn()`. The registry
  comment records the reversal on record: the #691 dev-only decision, why it
  fell (MegaMind's ruled home was unreachable in the shipped app), the
  mitigations Matt chose (off by default, honestly named, one deliberate
  toggle), and the accepted cost (the panel's sharp tools mutate real state).
- `app/src/components/HotkeyOverlay.jsx` — the Settings tab gains the one
  toggle: "Dev mode: on/off", `aria-pressed`, bound through
  `useSyncExternalStore` to the same devMode module the registry reads. The
  copy names all eleven tabs, says it takes effect right away with no
  restart, says the panel loads only when its tab opens, says the tools
  change real state (why it is off by default), and says it is saved on this
  machine only. The pre-existing "no second prefs store" prose is kept.
- `app/src/composition/Shell.jsx` — subscribes to Dev mode flips so the tab
  strip updates live; the shown panel is derived, so switching Dev mode off
  while the DEV tab is open falls back to the first tab, and switching it
  back on re-selects DEV (the stored tab was never rewritten).
- `app/src/state/bundle.js` — `kc:dev-mode:v1` added to BUNDLE_LEFT_OUT: a
  per-machine opt-in; a bundle opened elsewhere must never switch the DEV
  panel on by itself.
- `app/src/state/sessionOnly.mjs` — comment: the Dev mode switch reports
  storage refusal through the same latch.
- Panel header comments (DevPanel, GovernorTune, GovernorXray, ShaderLab,
  devTabs) — "registered only when import.meta.env.DEV / prod never
  includes it" updated to the runtime gate.
- QA fix rounds (independent QA, two blocking finds, both rendered text):
  the DEV panel's own subtitle still read "dev-only — not in prod builds" —
  false the moment a release user opens the panel this PR creates; it now
  reads "behind the Dev mode toggle in release builds". The delta QA then
  caught the same defect inside the Shader Lab tab: its header subtitle
  "GLSL debug harness · dev only" dropped the "· dev only", matching the
  file's own no-GL branch text. The first round also swept comment-level
  "dev-only" shorthand in the touched files (the four panels' line-1
  headers, DevPanel's "three dev-only tools", and Shell's backtick-import
  comment claiming no dev chunk reaches the prod bundle — the chunks now
  ship lazily by design; the comment now says what the pattern actually
  guarantees). A few untouched files still carry "dev-only" in comments
  (devTabs, BiologyPanel, KernelPanel, MindPanel headers among them) —
  none is rendered, and devTabs' own header states the true runtime gate.
  No suite or spec pinned any of the old strings.
- `app/src/composition/devPanel.selfcheck.mjs` — the pin reversal, on
  record in the suite header (mirroring the S1 CSP-pin pattern, PR #2076):
  section A now pins the runtime gate (dev build OR Dev mode on),
  panelsByZone withholding, and an unconditional lazy chunk; section C's
  stale header comment (it said seven tabs; the eleven-tab assertion itself
  already existed on base) corrected; new section D pins
  the preference itself (key name, OFF by default, flips notify listeners
  exactly once, the Settings toggle writes through the same module the
  registry reads, the Shell subscribes).

## 2. The rebase

The branch was cut at `a26d5a0e`; main has since taken #2085 (embeddings)
and #2088 (recaps), landing at `2a1c7ba7`. One conflict, in
`app/src/state/bundle.js`: both lines added BUNDLE_LEFT_OUT entries in the
same place. Resolved by keeping all three entries (the two #1528 keys and
the #2077 key). The bundle family suites pass on the resolution (§3).

## 3. Verification (coordinator's own runs, on the rebased tree)

- devPanel selfcheck — pass, new wording: one DEV registry entry (runtime
  gate #2077), 11 lazy tabs, Dev mode defaults off and notifies.
- panelGraph selfcheck — 640 modules walked from 3 panel roots (639 on
  current main; +1 is devMode.mjs entering via the registry import). No
  @resvg/resvg-js, censusReport, assetTraitsBake, or regionBake reachable;
  extractor self-tests pass.
- MegaMind family: megamindLink 21, megamindVoice 17, megamindVision 16,
  megamindEmbed 163/163, megamindRecap 12/12. Director pin 14/14.
- Bundle family: bundle 19, bundleKeys 5, bundleParts 18.
- helpCopy and labelCase selfchecks pass (the Settings copy change trips
  neither).
- Production build (identical node_modules A/B): this tree 785 modules
  transformed vs current main's 755 — **+30, the DEV panel graph** (DevPanel
  + eleven tab chunks + devMode). On main the compile-time ternary let the
  bundler drop the panel from release builds entirely; the runtime gate
  means the code now ships as lazy chunks and loads only when the panel is
  first opened. Entry graph unchanged in kind: panelGraph proves the panel
  roots still reach no Node-only chain.
- Lint: 0 errors (11 warnings, identical to the count on the #2088 tree —
  pre-existing). format:check clean.
- Full manifest sweep (662 suites on this tree): 658 pass, 4 fail — all
  four environmental. swarmWasm, rollSafety, and accum are the known
  sandbox trio, base-identical on the #1529 sweep (browser sections dying
  under sandbox memory limits). livingMotion failed inside the sweep while
  two sweeps ran concurrently and the sweep process itself was OOM-killed;
  re-run standalone on this tree it passes 15/15.

## 4. Acceptance, mapped to the issue

- Production build, fresh profile → no DEV panel: gate is
  `devModeOn()`-false by default and `import.meta.env.DEV` false in release;
  panelsByZone withholds the entry. Pinned by devPanel sections A + D.
- Enable Dev mode in Settings → the panel appears incl. MEGAMIND: the strip
  re-renders on the flip (Shell subscription), all eleven tabs as they
  stand. No reload — the toggle copy does not need the reload caveat.
- Disable → panel gone: same path in reverse; an open DEV tab falls back
  cleanly (Shell derived panel).
- Preference persists across restarts both ways: localStorage key, read at
  module load; session-only fallback is announced when storage refuses.
- Dev builds behave exactly as today: `import.meta.env.DEV` still
  short-circuits the gate to available.

## 5. Matt's on-device check

In the shipped (release) build: open Settings (footer ≡) → Dev mode on →
the DEV tab appears in the strip; open it, MEGAMIND tab included. Flip it
off → tab gone. Restart the app → the setting holds. That session is also
the device acceptance for #1525/#1526/#1527 waiting on the same build.
