# Run manifests + structured logging + verify

*Plain-language guide to the studio backend's paper trail. Serves the loop's
**capture** (every render is traceable) and **learn** (every failure teaches).*

## The idea in one paragraph

Every time `studio.py` renders something, it now leaves a receipt. Not a
scroll of terminal text you squint at the next morning, but two
machine-readable files: a **run manifest** describing exactly what ran, on
what code, with what inputs, and what each edition produced — and a
**JSON-lines log** of everything that happened during the run. Hand a
manifest to `studio.py verify` and it re-renders everything and tells you
whether the outputs are byte-identical. If a render fails, the manifest says
*which kind* of failure it was and, when the fix is known, how to fix it.

## Where the files live

| Run | Manifest | Event log |
|---|---|---|
| `batch … -o editions/` | `editions/manifest.json` | `editions/run-<run-id>.jsonl` |
| `render … -o still.png` | `still.manifest.json` (next to the PNG) | `still.run.jsonl` |
| `video … -o clip.mp4` | `manifest.json` (in the frames dir) | `run-<run-id>.jsonl` (frames dir) |
| `verify manifest.json` | `manifest.verify.json` (next to the manifest) | `verify-<run-id>.jsonl` |

## What's in a manifest

A manifest is JSON, versioned (`"manifest_version": 2`). In plain terms it
records:

- **run id** — `20260917-170033-4775a5`: date, time, and a random tag. Unique
  per run.
- **start/end time** — when the run began and finished.
- **git sha of the code** — which commit rendered this, plus whether the
  working tree was dirty. If you re-render six months later and wonder why
  it looks different, this is the first place to look.
- **exact command + flags** — the full command line, copy-pasteable, and the
  parsed flags as data.
- **content hashes of every input** — the project JSON and the audio sidecar
  are pinned by SHA-256. If the file changes by one byte, the hash changes,
  and `verify` will refuse to pretend it's the same input.
- **per-edition results** — for each edition: the seed, how long it took,
  which GPU rendered it, the SHA-256 of the output PNG, and where its
  sidecar lives.
- **failures, classified** — every failure gets an entry with one of four
  classes (below), the error message, and a tail of stderr.

The manifest is written even when the run fails — a failed batch still tells
you exactly what happened to each edition.

## The failure classes

Every studio failure belongs to exactly one class, and the class decides
what happens next:

| Class | Meaning | What studio does |
|---|---|---|
| **user-error** | Bad input or environment: missing project file, missing Chromium, a changed input at verify time. | Fails **fast**, before wasting GPU time. The message always says how to fix it. In a batch, the first edition runs first precisely so a bad environment aborts before the other 499 start. |
| **degradable** | The render can continue without the feature. The precedent: a malformed audio sidecar (Phase B) — it warns loudly, renders without audio, and records the degradation in the manifest. | Warns on stderr, renders anyway, records it. |
| **transient** | A hiccup that may pass on its own — a render that times out mid-batch. | **Retries once**, then records the failure and continues the batch. |
| **bug** | Anything else: an unclassified renderer exit, an invariant violated. | Fails **loud**, with the manifest entry and diagnostics attached. Never swallowed, never retried into silence. |

## `studio.py verify` — deterministic replay

```sh
python3 studio/studio.py verify editions/manifest.json
```

Verify re-renders every successful edition from the manifest — same project
(hash-checked), same seed, same size, same flags, same audio sidecar
(hash-checked) — and compares the new PNGs' hashes against the recorded
ones. Output:

```
  00-00000000.png: match
  01-00000001.png: match
[studio] verify …: 2/2 editions byte-identical (report: manifest.verify.json)
```

It refuses to replay when the inputs changed ("content hash differs from
the manifest") and tells you how to fix it: restore the original file or
pass `--project` with a copy whose hash matches.

### The honest limitations

Two things can make a replay differ without anything being broken, and
verify says so out loud when they apply:

1. **Different GPU/driver.** Byte-identity is proven on *this* machine
   against *this* GPU. A different GPU or driver can legitimately differ by
   a pixel or two — that's exactly what the parity tolerance (8/255 per
   channel) is for. If the manifest's recorded GPU differs from the replay
   machine, verify warns and the pixel diff — not the hash — is the right
   comparison.
2. **Audio-reactive renders.** These are only deterministic *given the
   recorded envelope*, which is why the manifest pins the audio sidecar's
   hash. If the sidecar changed, verify fails fast instead of comparing
   apples to oranges. If the original run degraded (rendered without
   audio), verify replays the degradation.

Verify also warns when the replay runs on different code than the original
(the manifest records the git sha): byte-identity is then proven against
current code, not the original.

## The event log

The terminal output looks the same as it always did — progress lines like
`  25/100 (2 failed)` are unchanged. Underneath, every one of those lines
is also a JSON event in the `.jsonl` file: `{"ts": …, "run_id": …,
"event": "progress", "done": 25, "total": 100, "failed": 0}`. Events:

- `run_start` / `run_end` — the run's boundaries, with kind, size, counts.
- `edition_done` / `edition_failed` — per edition: seed, status,
  duration, error class.
- `progress` — the human progress lines, as data.
- `retry` — a transient failure being retried once.
- `audio_degraded` — a bad sidecar, with the reason.
- `jobs_clamped` — `--jobs` reduced for RAM.
- `run_aborted` — a user-error that stopped a batch, with the fix.
- `verify_start` / `verify_edition` / `verify_end`, `input_pinned`, `warn`.

A failed 2am batch becomes a log you can query (`grep '"event": "edition_failed"'`)
instead of a scrollback you squint at.

## Checks

```sh
python3 studio/run_manifest_selfcheck.py   # schema, hashing, classification, log format,
                                           # plus a real 2-edition batch → verify round trip
                                           # on GPU when headless Chromium is present
```

## Not covered (yet)

- `verify` supports `batch` and `render` manifests. `video` manifests are
  written but verify refuses them with a clear message — the PNG frames
  (kept with `--frames`) can be hashed by hand in the meantime.
- The JSONL log is local-only by design. There is no server, no dashboard,
  no phoning home — that matches the project's local-first standing
  decision.
