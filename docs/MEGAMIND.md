# MegaMind — a model of your own

MegaMind is KC-1's Mind trio (LOIS, Davis, and the third) running on a local
model **you** bring: your own Ollama, on your own machine. It is the same
personas and the same kc-voice/1 record contract — a bigger engine, not a
second product. Design: [`docs/research/megamind-local-model-plan-2026-10-14.md`](research/megamind-local-model-plan-2026-10-14.md).

**Status (S1, #1525): the link is built; the personas are not wired yet.**
What exists today is connect + detect in the DEV panel (DEV → MEGAMIND):
point KC-1 at your Ollama, connect, and KC-1 measures what you connected —
cadence tier, badges, context — and publishes it to a capability registry
that every later stage reads. Until S2 lands, MegaMind still runs on the
rules backend, exactly as before. Disconnect returns it to rules silently.

## The House configuration

KC-1 supports ONE configuration. Everything outside it is _may work,
unsupported_.

```
MegaMind — the House configuration (the one supported setup)
Model: qwen3-vl:8b-instruct, served by Ollama on your own machine (lighter machines: qwen3-vl:4b-instruct)
Endpoint: http://127.0.0.1:11434
Persona calls: think off · temperature 0 for verdicts · num_predict capped at 150
Context: num_ctx pinned at 16,384 at connect and never varied · keep_alive "30m", the model preloaded at connect
Ollama must trust this origin: restart it with OLLAMA_ORIGINS set to the exact origin KC-1 is served from
Everything else you connect may work, but it is unsupported — Ollama cloud models included: they are badged cloud and never recommended.
```

This text is published identically in the DEV → MEGAMIND panel, the README,
the wiki home, and this page — one canonical source in the code
(`app/src/curator/megamindLink.mjs`) and a selfcheck that fails if any copy
drifts.

## How detection works — never assume, measure

Connecting is a user act; nothing is probed on page load. On Connect, and
again on every model change, KC-1 runs a three-step handshake against your
Ollama:

1. `GET /api/tags` — your model list. Names are used **verbatim**; KC-1
   never constructs or guesses a model name.
2. `POST /api/show` for the chosen model — its capabilities (completion /
   tools / vision / thinking), its context length, its thinking metadata.
3. **One timed warm probe** in MegaMind's real verdict format: the model is
   preloaded with the House pins (`keep_alive "30m"`, `num_ctx` 16,384),
   then asked for one flat-schema verdict with `think: false` where the
   model supports it and `num_predict` capped. The reply must parse as a
   verdict, carry the right fields, stay in the right language, and leak
   no `<think>` block.

The probe — never the model name — assigns the **cadence tier**:

| Tier            | Warm probe                             | What it will enable (S2+)               |
| --------------- | -------------------------------------- | --------------------------------------- |
| A — performance | ≤ ~3 s, schema-clean                   | personas consulted every eligible bar   |
| B — song        | ~3–8 s, schema-clean                   | personas consulted on phrase boundaries |
| C — ambient     | > 8 s, or thinking can't be turned off | section changes and deep verdicts only  |

Badges: **vision** when the model's show data lists the vision capability
(LOIS may judge renders occasionally in S3 — never per-bar), and **cloud**
when the model is an Ollama cloud pointer (connectable, badged, never
recommended — it runs on Ollama's cloud, not your machine).

Features in later stages enable by **capability** (tier + badges), never by
backend or model name. A stronger model doesn't get more machinery; it gets
more gates open.

## When a connect fails, the copy names the gate

- **Ollama not running** — nothing answered at the endpoint (or the browser
  refused the local-network prompt).
- **Origin not allowed** — Ollama answered but won't talk to this page. The
  panel shows the exact `OLLAMA_ORIGINS=` line for the origin KC-1 is
  served from, plus the restart step for your OS.
- **Safari** — Safari blocks a page from reaching a model server on your
  own machine; use the desktop app.
- **A model that is gone** — a saved model that has been renamed, retired
  or removed fails with that said out loud, never a silent hang.

## What never changes, whatever is connected

- **Rules fallback underneath everything.** No model, a dead model, a slow
  model → MegaMind relaxes to the rules behaviour, silently. A performance
  never shows an AI error state.
- **taste.json is the taste.** A linked model reads it; it never writes it.
- **No cloud of KC-1's own.** The app ships no key, no endpoint, no
  dependence. A visitor's own Ollama sign-in is their machine and their
  account — the cloud badge keeps the distinction visible.
- **The governor, the render path, the bake** — untouched, by design.
