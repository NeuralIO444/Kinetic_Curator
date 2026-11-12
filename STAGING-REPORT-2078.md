# STAGING REPORT — #2078 Footer backend indicator (O / A / R)

Issue: #2078 — "Footer: backend indicator (llama / apple / rules) — click opens the MEGAMIND tab."
Built as ruled in the body + both comments (Matt, 2026-11-10): glyphs are simple letters
**O / A / R** (the body's emoji scheme was offered and set aside), and the hover tooltips use the
ruled formats, naming the Settings Dev mode toggle when the click routes there instead.
Stacked on the local #2077 branch (base `2a1c7ba7` + the Dev mode toggle commit `9e095f26`) —
the click's panel-availability decision is the #2077 gate itself.

## 1. What shipped

- `app/src/curator/backendIndicator.mjs` (new, pure) — the derivation. `indicatorFor(status,
  panelAvailable)` → `{ backend, glyph, title }`; `backendRoute(panelAvailable)` →
  `'megamind' | 'settings'`. Holds no state, reads nothing. A missing model/tier segment is
  omitted from the tooltip, never rendered as a placeholder.
- `app/src/components/BackendIndicator.jsx` (new) — the footer button: `micro-btn`, opacity
  0.45, exactly the ≡ / ? dress. It subscribes to `mind:status`, seeds its first read from
  `getMindStatus()`, and re-renders on Dev mode flips (the gate decides its title's
  destination). Footer layout otherwise unchanged — App.jsx gains the one element, placed
  immediately before the ≡ button in the right cluster.
- The ruled strings, verbatim:
  - O → `Ollama · <model> · tier <A/B/C> — click to open the MEGAMIND tab`
  - A → `Apple Intelligence — click to open the MEGAMIND tab`
  - R → `Rules — no model linked — click to open the MEGAMIND tab`
  - Panel unavailable: the destination clause becomes `— click to open the Settings Dev mode toggle`.

## 2. How the indicator reads the adapter's selection (the exact signal)

The indicator renders **`mind:status`** — the payload `startMind` (mindLive.js) publishes from
the backend chain's own `info()`, the same selection logic that picks who answers. There is no
parallel flag anywhere: the component holds only the last published payload.

Two adapter-side additions were needed, both inside the adapter's own surfaces:

- `megamindVoiceLive.js` — the Ollama model's `info()` now also carries the record's `tier`
  (`{ backend:'ollama', model, tier }`); the chain's `info()` passes it through. The take's
  system record (`getMindSystem()`) is unchanged.
- `mindLive.js` — `publishStatus` includes `tier` in the payload when the answering info
  carries it, and the change-dedup now compares backend + model + tier, so a tier re-grade
  republishes instead of leaving a stale tooltip. A module-level mirror of the last payload
  backs the new `getMindStatus()` export (the `getMindSystem()` pattern), so a component
  mounting after the mind boots reads the current state instead of waiting for a change.
  The status republishes on the thinker's per-bar publish, exactly as the dev panel has
  always read it — the indicator can never disagree with the thinker's own status record.

Registry honesty: `eventRegistry.js` now names `components/BackendIndicator.jsx` as
MIND_STATUS's handler (it was "no handler" before — the registry suite verifies the claim
against the source), and its note records the ruled exception to "no UI announces it": the
glyph is standing state, like the seed readout; nothing pops, flashes, or announces a switch.
The eventBus comment says the same.

One re-pin, at full strength: `megamindVoice.selfcheck` asserted the first published status
by exact deepEqual; the payload legitimately gained `tier`, so the expectation now asserts
the fuller exact shape (`tier: 'A'`). Cause recorded in a comment at the assertion. No other
pin moved — the rules and Apple payloads are byte-identical to before.

## 3. The click wiring

One channel, completed — not a second path. `devTabs.mjs` already held the pending-tab
mechanism (`requestDevTab` / `consumeDevTabRequest`) that the Shell's backtick uses; #2078
adds `requestDevPanel(tabId)` + `onDevPanelRequest(fn)` to the same module: the request sets
the same pending tab AND notifies listeners.

- Panel available (the component reads `devPanelAvailable()` from PanelRegistry — the #2077
  gate itself): the click dynamically imports devTabs (the Shell's own idiom for reaching
  into dev-land) and calls `requestDevPanel('megamind')`. The Shell's new subscription
  selects the DEV panel — the Shell still owns the selection, and honours the request only
  when the panel is actually in the strip. DevPanel consumes the pending tab on mount, and
  a DevPanel already mounted switches to MEGAMIND in place (new subscription there).
- Panel unavailable: the click calls App's `onOpenSettings`, which is the ≡ button's own
  handler shape (`setHelpTab('settings'); setShowHotkeys(true)`) — landing on the Settings
  tab where the Dev mode toggle lives. Never a dead click, in either world.

## 4. Verification (builder's own runs, on this tree)

- New suite `backendIndicator.selfcheck` — **7 checks** (added to `app/selfcheck.manifest`):
  (1) the three states × both destinations, exact ruled strings; (2) no-status-yet = rules,
  a bare Ollama status never prints "undefined", a debug `demo` backend reads as rules;
  (3) the route function + the devTabs channel (notify, consume-once, unsubscribe);
  (4) end-to-end over the REAL adapter — a real Ollama model object on the real capability
  registry + a real mind chain + the real startMind: connect publishes
  `{available, backend:'ollama', model, tier:'A'}`, the indicator reads O with the exact
  tooltip, a tier-B re-grade republishes and the tooltip follows, disconnect returns to
  rules/R; (5) the kill test — scripted fetch [good, dead, dead] through the chain: one
  failure leaves the status on Ollama, the second latches and the next published status is
  Apple/A; (6) the in-flight rule — while a connect has not landed the chain still names
  rules and the glyph stays R even after the record lands (nothing publishes until the
  thinker's next bar), and an ask still in flight counts no failure and moves nothing;
  (7) wiring pins — footer placement before the ≡ button, the component's real gate/status
  reads, no emoji anywhere in it, both tab owners honouring the request channel.
- Family suites: megamindLink 21 · megamindVoice 17 (incl. the re-pin) · megamindVision 16 ·
  megamindEmbed 163/163 · megamindRecap 12 · mind 15 · mindApple 6 · director 14 ·
  devPanel OK (runtime-gate pin intact) · panelGraph OK — **640 modules** walked (unchanged
  from the #2077 tree: devTabs was already in the walk) · eventBus 3 · eventRegistry OK
  (175 events, handler claim verified true).
- Source-shape sweep: every selfcheck naming App.jsx, the footer, Shell, DevPanel, or the
  megamindVoice files was grepped before editing (director's identifier allowlist, helpCopy's
  `title="Help"` pin, version's KERNEL_VERSION footer pin, the mind suites' status
  deepEquals) — all run green in the sweep below; e2e footer assertions are contains-style
  (seed/build text) and unaffected by an added letter button.
- Lint: 0 errors (11 warnings — identical to the #2077/#2088 trees, pre-existing).
  format:check clean (prettier applied to the two files that needed it; changes were
  line-wrap only).
- Production build: **787 modules** transformed vs the #2077 base tree's 785 — +2, exactly
  the two new modules (backendIndicator.mjs + BackendIndicator.jsx). CSP untouched; no new
  network surface; no new dependencies.
- Full manifest sweep: **658 pass / 5 fail** of 663 manifest entries (continue-on-error
  loop; the sweep process itself was OOM-killed by the sandbox after printing its final
  tally). The 5 failures: `swarmWasm`, `rollSafety`, `accum` — the known sandbox-environmental
  trio (browser/Wasm sections under sandbox memory pressure; none of the three touches or is
  touched by this change, and all three were previously proven base-identical) — plus
  `livingMotion` and `resolverProbe`, both re-run individually on this tree immediately
  after the sweep and **green** (livingMotion 15 checks passed; resolverProbe ok), i.e.
  victims of the same sweep-time memory pressure, not regressions.

## 5. Matt's on-device check

In the Tauri build, watch the footer's right cluster, beside ≡ and ?:

1. **Rules**: with no model linked, the letter is **R** (hover: "Rules — no model linked — …").
2. **Ollama**: connect the House model in the MEGAMIND tab → the letter becomes **O**; hover
   reads "Ollama · qwen3-vl:8b-instruct · tier <letter> — click to open the MEGAMIND tab".
3. **Kill the model mid-session** (quit Ollama or disconnect): the letter flips on its own to
   **A** (Apple helper present) — no announcement, the letter is simply different.
4. **Click it** with Dev mode on (or a dev build): lands on the DEV panel's MEGAMIND tab —
   including when the DEV panel is already open on another tab. In a release build with Dev
   mode **off**: the letter's hover names the Settings Dev mode toggle, and the click lands
   on Settings, on that toggle.
