# Persona nightly retrain — runbook (A3, #2396)

The band's persona heads retrain themselves once a night on the Mac Studio. A `launchd`
job runs the A0 → A2 chain (label extractor → row builder → trainer → verifier) at
**03:30**; the trainer's watermark decides what actually retrains, so a night with no new
labels is a no-op. The job trains a **file** — heads reach the app by a manual import
(step 6 below) until the boot-bridge slice lands.

Key paths (all under your home):

| What | Where |
|---|---|
| Data home | `~/Library/Application Support/com.neuralio.kineticcurator/adapters/` |
| Canonical taste (the file the job owns) | `<data home>/taste.json` |
| Head store + history | `<data home>/persona-heads/` (`history.jsonl` inside) |
| Nightly log | `<data home>/nightly.log` |
| Last train report | `<data home>/last-report.json` |
| Takes / ledgers (read in place, never written) | `~/Library/Application Support/com.neuralio.kineticcurator/takes/` and `…/ledgers/` |
| The agent | `~/Library/LaunchAgents/com.neuralio.kineticcurator.persona-retrain.plist` |

## Before you start

- **Perform in the desktop app.** The job reads takes and ledgers from the desktop app's
  data dir. In the browser build, takes land in `~/Downloads` and ledgers live in
  localStorage until exported — the nightly cannot see them there.
- **Export your current taste once**: in the app, Pipeline → EXPORT TASTE, and note where
  the file lands. That export is the seed. Seeding matters: the job's canonical taste must
  start from the taste the app already holds (its taste head is at 0.595, plus the lois /
  chapters sections). A file grown from empty would lack those sections, and importing it
  later would wipe them.

## Install — one step at a time

1. In your working clone, pull `main` (the job runs from this clone as-is and never pulls
   itself; it picks up new trainer code only when you pull).
2. Check the fit's dependency — this exact check is what install runs first, and it is
   the one that bites (the older `mlx_setup.sh` dep list does **not** include xgboost):

   ```sh
   python3 -c "import xgboost" && echo ok
   ```

   If it errors: `python3 -m pip install 'xgboost>=3'` — using the python3 you actually
   perform with, then re-check.
3. Run install, pointing at the taste export from "Before you start":

   ```sh
   studio/personaNightlyInstall.sh --taste <path-to-your-taste-export>
   ```

   Install checks the interpreters and the xgboost import **before writing anything**,
   seeds the canonical taste (it never overwrites an existing one on re-install),
   renders the plist with your real paths, then runs a full **dry-run** — the whole chain
   against scratch copies — and only loads the agent if the dry-run passes.
4. Read the dry-run's section in `<data home>/nightly.log`. You want to see the chain's
   four steps and the trainer's per-entry verdicts (`shipped`, `skipped-watermark`,
   `no-corpus`, …). On today's corpus the likely verdict is `no-corpus` or a watermark
   skip — the band's tuning numbers are still unruled, so there may be nothing to learn
   from yet. Boring is correct.
5. Confirm the agent is loaded:

   ```sh
   launchctl list | grep persona-retrain
   ```

## The nightly shape

- 03:30 local. If the Studio is asleep or off, launchd runs the job once at next wake —
  nothing is lost; the watermark makes a coalesced run equivalent to the missed one.
- Each night appends one dated section to `nightly.log`: the four steps, the trainer's
  verdict per persona × kind, and a verify line.
- **Verify is an alarm, not a gate** (Q4): `VERIFY: PASS` is the healthy line. A
  `VERIFY: FAIL` means the trainer and the app's own validators disagree about a shipped
  head — the heads stay shipped; the remedy is the trainer's rollback command, run by
  hand (below), and A4 will surface last-run status in the DEV panel.
- A failed night (missing file, a crash) is a `FAILED` section in the same log and a
  nonzero exit — never a notification (Q3). Nothing about a failed night corrupts the
  taste or the store: the trainer writes taste once, at the end, only when something
  shipped, and its shape gate keeps a malformed entry from crashing a run mid-loop.

## Getting heads into the app (until the bridge slice)

After a night whose log shows a `shipped` verdict: in the app, **Pipeline → IMPORT
TASTE**, pointed at `<data home>/taste.json`. Heads load at that import (and therefore at
the next launch after it), never mid-session. If a night shipped nothing, there is
nothing to import.

## Rollback (by hand, until A4's button)

One persona × kind at a time, restoring the previous shipped version (past v1, the entry
is removed and that persona plays on rules again):

```sh
python3 studio/train_persona_heads.py rollback --id davis --kind solo --taste "<data home>/taste.json"
```

Then re-import the taste file in the app. Every rollback is recorded in
`<data home>/persona-heads/history.jsonl`.

## Reading the record

- `nightly.log` — one section per night; the first place to look.
- `last-report.json` — the most recent train report (per-entry verdicts, held-out
  scores, labeled-turn counts).
- `persona-heads/history.jsonl` — every judged train attempt and every rollback, in
  order. Verdicts: `shipped` (beat the old head, or a first head ≥ 0.3 held-out),
  `rejected` (did not beat the incumbent), `below-bar` (a first head under 0.3 — never
  enters the file). Watermark skips are **not** attempts and do not appear here.
- `launchd.log` (in the data home) should stay **empty** — launchd's own capture. Text
  there means the wrapper died before it could open its log.

## When a night looks wrong

1. Read the night's section in `nightly.log` — the failing step names itself.
2. `train_persona_heads.py` missing → the clone moved, or KC paths went stale after a
   re-install: re-run install from the clone's current home.
3. `import xgboost` fails after a python upgrade → reinstall it into the python3 the
   plist names (`KC_PYTHON3` inside the plist is the interpreter the job uses).
4. A leftover `.nightly.lock` in the data home → a hard-killed night. If no run is
   alive, the next night breaks it automatically (it checks the owner pid first).
5. A `.section.*` file left in `<data home>/scratch/` → the same hard kill, mid-write;
   the log simply has no section for that night.

## Uninstall

```sh
studio/personaNightlyUninstall.sh
```

Boots the agent out and removes the plist — **only** that. The data home (canonical
taste, the whole store, the logs) is left untouched on purpose: removing a schedule
must never destroy rollback history. Delete the data home by hand if you ever truly
mean to.
