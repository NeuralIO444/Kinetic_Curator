# Staging report — #1479 Look phase, types PR: the `kc-look/1` preset type

Branch `feat/1479-kc-look-types` on origin/main `d65ab709`. Not pushed; the coordinator publishes.

## What was built

One pure module, `app/src/data/lookPreset.mjs`, implementing the `kc-look/1` preset type from
`docs/DLC_PRESET_TYPES.md` §1 — the first PR of the Look phase Matt pulled forward (2026-10-14 decision 3).
No UI, no loader, no slots, no loot wiring.

- `sniffLookFormat(value)` — the cheap first pass for a future loader: which kc-look version a value claims,
  or null when it does not claim to be a Look preset.
- `parseLookPreset(textOrValue)` — never throws. Sniffs `format`, validates, normalises:
  - unknown `format` refused with a named error (`unknown file format "kc-style/1"`), never half-applied;
    `kc-look/2` refused plainly with `newer: true`; a missing format is `not a look preset`.
  - `mode` must be one of the live `MODE_IDS` (`app/src/data/layout-modes.js`); an unknown mode refuses.
  - `layoutParams` runs through the layout module's own `validateLayoutParams`: structurally unreadable
    values (NaN, a non-numeric count, a `__proto__` key) refuse the whole preset naming the keys;
    out-of-range values come back clamped by the live specs (PARAM_SPEC / RANGE_HARD).
  - the normalised `layoutParams` carries only the keys the author supplied — defaults are never invented,
    and foreign keys never survive (see scope, below).
  - `paletteId` must be a non-empty string. Existence is deliberately NOT checked against the built-in
    palette table: user palettes live outside it, and a missing palette has its own honest message at apply
    time. The type requires the name to be a name.
  - `seed` is optional: absent = seedless (applies to the live scene); present = a frozen composition under
    the #642 seed rule (uint32; hex strings coerce; negative/oversized/fractional/non-numeric refuse with
    `Invalid seed: …`).
- `writeLookPreset(look)` — always writes `kc-look/1`, only Look-scope fields, and throws on input the module
  could not read back (the `writeSessionFile` rule). Write → parse is a byte-stable fixed point.
- `app/src/data/lookPreset.selfcheck.mjs` — 14 checks covering the acceptance behaviours above, registered in
  `app/selfcheck.manifest` (one line, after `styleLooks.selfcheck`). `package.json` untouched.

## Precedent followed

The task brief asked for the live `kc-style/1` precedent. **There is none in code**: `kc-style` appears only in
docs (`docs/DLC_PRESET_TYPES.md`, `docs/ROADMAP_PETRI_DISH.md`); nothing under `app/src` sniffs, validates or
writes a `kc-style/1` payload, despite §1's "exists (2026-09-28)" status line. The module therefore mirrors the
codebase's live versioned-format precedent, `app/src/state/projectFile.mjs` (`kcproject/1`, #1709): pure
module, `format` tag + version constant, never-throws reader returning `{ ok, … } | { ok: false, error }`,
unknown format refused by name, newer version refused plainly, writer that throws rather than write a file it
could not read back. Validation/clamping reuses the live layout machinery (`validateLayoutParams`,
`MODE_IDS`, `PARAM_SPEC`, `RANGE_HARD` in `app/src/data/layout-modes.js`) instead of restating the vocabulary,
and the seed rule restates #642 (`projectDocument.js` keeps its `coerceSeed` private, so the six-line rule is
mirrored with its citation, not imported).

Hostile-input handling follows the same split as project files: the pure module refuses plainly; quarantining
the bytes is the caller's store concern (the project-document pattern), not the type's.

Scope discipline follows the whitelist precedent (`sanitizeOverlay` / project sanitizers strip unknown fields):
cross-scope fields — `fx`, a `palette` object, `voice`, `assets`, `geometry`, a `paletteId` smuggled inside
`layoutParams` — are stripped, never carried into the normalised Look. The normalised Look carries exactly
`{ format, mode, layoutParams, paletteId, seed? }`.

## Spec-vs-live-shape disagreements (live shape followed, per the brief)

1. **Mode placement.** The DLC payload names `mode` at the top level; the live Look shape keeps `mode` inside
   the params object (`data/styleLooks.js`, `data/presets.js`, `DEFAULT_LAYOUT_PARAMS`). The module treats the
   top level as the one truth: a `layoutParams.mode` that disagrees refuses the preset as contradictory, and
   the normalised `layoutParams` never repeats the mode.
2. **Spec says `kc-style/1` "exists".** No live code implements it (above). The DLC doc's status column is
   ahead of the tree for styles as well as looks.
3. **`layoutParams` breadth.** The spec's name suggests a small layout subset; the live param vocabulary is
   the full layout-params table (composition, blend, motion, dish, field-map…). The module accepts the whole
   live vocabulary — anything narrower would refuse params that shipped Looks legitimately carry. FX/voice/
   geometry remain outside it: no such keys exist in the layout table, and the projection strips anything else.
4. **Identity fields.** The loot-folder spec gives every look a stable UUID inside its JSON; the DLC §1
   payload has no `id`/`name`. This module follows §1 — `id`/`name`/`author` are unknown fields and are
   ignored. If the pack/Library phase wants identity inside the file, that is a §1 amendment, not a types-PR
   invention.

## Verification (this worktree, app/)

- `node src/data/lookPreset.selfcheck.mjs` — **14 checks passed**.
- Loot family (the suites over `lootClassify.mjs` and its neighbours): lootScan 15, lootIngest 9,
  lootIndex 14, lootRun 9, lootStarter 6, lootAudio 4, lootCopy 6, lootNative 8, lootPalettes 6,
  lootSession 7, lootWeb 13, lootWrite PASS (2 groups), shelfDiskPort 3, shelfDiskRun PASS — all green.
- Neighbours of the touched files: `normalize.selfcheck` OK (34 poison cases, 104 specced),
  `styleLooks.selfcheck` ok (70 looks, 16 groups), `projectFile.selfcheck` 6 passed,
  `scripts/runSelfcheck.selfcheck` OK.
- `npm run lint` — exit 0 (11 warnings, all pre-existing in other files; none in the new files).
- `npm run format:check` — clean (prettier `--write` applied to the new selfcheck before the final run).
- `npm run build` — exit 0, built in 3.80s (the devTabs dynamic-import warning is pre-existing on main).
- Full manifest sweep (continue-on-error over all 674 manifest commands): **671 passed, 3 failed** —
  `swarmWasm.selfcheck`, `rollSafety.selfcheck`, `accum.selfcheck`. All three are the known sandbox-environment
  trio (browser-section suites), and all three fail **identically on a clean detached worktree at origin/main
  `d65ab709`**: swarmWasm exit 1, rollSafety exit 1, accum aborted (exit 134) in both trees. Pre-existing
  environmental failures, not this change; CI's browser job is authoritative for them.

## Deliberately NOT done (out of scope, per the brief)

- The pipeline pack loader (DLC §2), any Library UI, Look slots, slice 10 `looks/` loot wiring, the
  `.kclook` extension story (`lootClassify` still logs it "looks not supported yet" — untouched), Trio
  affect (§3). No `.jsx` file touched; no panel touched.
- `kc-voice/1` and `kc-pack/1` types — DLC phase 1 names them too, but this PR is the kc-look/1 module only,
  as dispatched.
- No change to `docs/DLC_PRESET_TYPES.md` (the disagreements above are recorded here for the coordinator;
  amending the spec doc is a separate call).

## Note for the PR body (coordinator)

The parent issue stays open after this PR — the rest of the Look phase and slice 10 follow — so the body must
reference it in prose without any closing verb adjacent to its number; only a non-closing reference.
