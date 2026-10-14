# MegaMind local model link — plan (2026-10-14) — RATIFIED, DEFERRED
# STATUS: RATIFIED + DEFERRED (Matt, 2026-10-14) — filed as #1525 (S1), #1526 (S2),
# #1527 (S3), #1528 (embeddings), #1529 (recaps), all labelled `deferred`;
# builds only on his un-defer, after the current queue clears.

Matt's ask: a Settings option where a KC-1 visitor points the app at their own
local Ollama (`http://127.0.0.1:11434`), picks one of their models, and MegaMind
(the trio persona features) runs on it. Research: goal library
`files/research/megamind-model-classes-2026-10-14.md` +
`files/research/local-model-link-megamind-2026-10-14.md`.

## 0a. The two power levels (Matt's framing, 2026-10-14)

- **Mind** = the persona layer as shipped/designed: Apple Intelligence
  (Swift helper) is the live backend in the native app; MLX is the
  OFFLINE taste trainer on Matt's Mac Studio whose taste.json every
  backend reads (not a runtime backend); rules are the silent fallback
  underneath. Mind is the active line (#1462–#1464, #1483).
- **MegaMind** = this plan: the same personas on a visitor-linked local
  model (Ollama + the House recommendation, §0), adding vision + full
  LLM features behind capability gates. DEFERRED.
- One system, two power levels — both speak kc-voice/1, both read the
  same taste.json. MegaMind is not a second product; it's Mind with a
  bigger engine the visitor brings.

## 0. The sweet spot doctrine (Matt, 2026-10-14)

KC-1 does NOT support "any model you have." It supports **one House
recommendation**, published identically in the Settings panel, the README,
the wiki, and the docs — and everything outside it is *may work,
unsupported*:

- **House model: Qwen3-VL 8B via Ollama** (`qwen3-vl:8b`, the instruct tag).
  One model covers both jobs: trio text verdicts/lines (8B class — the
  measured quality sweet spot) AND LOIS vision (renders judged occasionally
  at ~15 s/frame — a treat cadence, never per-bar). Apache-2.0, 256K
  context. Lighter-machine line in the same docs: Qwen3-VL 4B.
- **Ideal settings (the supported configuration):** `think: false` on every
  persona call · `num_ctx` pinned at connect (16,384) and never varied ·
  `keep_alive: "30m"` + preload at connect · temperature 0 for verdicts,
  low for lines · `num_predict` capped (~150 text; schema-bounded vision
  verdicts) · Ollama restarted with `OLLAMA_ORIGINS=` the exact KC-1 origin.
- Capability probe still runs at connect (§2) — the House recommendation
  is what's *supported*, the probe is how the app knows the machine in
  front of it actually delivers it.

## 0b. Architecture: one seam, no new lanes (Matt's question, 2026-10-14)

Does a stronger local model need new lanes / an event core / an API to
enable features beyond Apple Intelligence and MLX? **No.** Both seams
already exist in the trio design:

1. **The kc-voice/1 record contract** is the backend seam. Rules, the
   Apple Intelligence helper (#1463), and a linked local model all emit
   the same shape-validated records — the backend is interchangeable
   *because* the contract is fixed. MLX stays what it already is: the
   offline taste-training lane on Matt's Mac Studio (#1173), not a
   runtime backend; taste.json is its export and every backend reads it.
2. **The 60-event bus** is the event core. Governor and trio already
   publish on it; a model backend plugs in as a verdict *source* on the
   bus. No second event system, and no external API — nothing outside
   KC-1 needs to call in for this feature.

The one genuinely new piece is a **capability registry + feature gates**:
connect-time detection (§2) publishes capabilities (cadence tier, vision
badge, context) onto the bus, and features enable by **capability, never
by backend name**:

- LOIS vision judging enables when: vision badge + tier ≥ B. (Apple
  Intelligence doesn't expose render-judging to KC-1 today, so in
  practice the linked model lights this up — but the gate is the
  capability, so any backend that earns it, gets it.)
- Per-bar persona consultation enables at tier A; phrase-level at B;
  deep-verdict-only at C.
- A stronger local model therefore doesn't get *more machinery* — it
  gets *more gates open*. The instrument is identical; the weather is
  better.

## 0c. What MegaMind does for Left4Dead (#1145)

#1145 (triad as supervisory control — the 20 LOIS×Davis rooms as a
gain-scheduling table) stays **rules**: a pure scheduler mapping room →
temperature / KIN freedom / weight shift / Queen sway, per-roll,
deterministic, replayable. MegaMind expands it in three ways without
touching that purity:

1. **It gives the Director its missing half.** #1145's own review
   (2026-10-07) called it: gain scheduling is not the L4D Director —
   the Director keeps an *intensity accumulator* and forces peak/relax
   cycles over time, and a rules table doing that becomes "timers with
   opinions" (forbidden). A model reading the session's event-bus
   history CAN pace honestly: the room table is the reflexes, MegaMind
   is the pacing brain above it, consulted at phrase/section cadence
   (cadence tiers B/C suffice — this is why the Director does not need
   a fast model). It proposes pacing moves (widen, hold, push); the
   scheduler validates them against the table. The model never touches
   a dial directly.
2. **LOIS gets eyes.** Rooms are chosen from honest signals — today
   that's telemetry and verdicts, never the picture. LOIS vision lets
   room selection read the actual render: the stall detector (STUCK,
   no keep → widen room, bump temp, suggest re-roll) becomes a watched
   stage instead of a counted one.
3. **The tilt gets a session memory.** The Queen's shaping is bounded
   by lifetime taste (taste.json). MegaMind can weigh tonight's keep
   ledger against it — which rooms the Director steers toward can learn
   within a set. The bound does not move: tilt only toward demonstrated
   taste (the #1145 review's line, unchanged).

Sequencing honesty: #1145 is queued behind #1126/#1140/#1139/#1144 and
completes in Phase 4 with #1356; this expansion is deferred with the
rest of this plan. #1145's three open questions from its builder review
(rooms act? surfaced? what is the weight LOIS moves?) remain Matt's
calls and gate any build.

## 0d. E5 joins the family — and MegaMind expands it

E5 (filed as #1530)
adds Davis variants to the explorer lane: a seeded engine that
transforms and combines the SVG-path assets into unique marks
(recipes, not files; crown persists the recipe). The engine needs no
model. Under MegaMind it gains the expanded abilities: the model
**directs the breeding** (parent pairings + op choices aimed at the
keeps corpus), LOIS-vision pre-judges offspring stills, and the model
may request systematic **series** around a promising recipe. Same law
as everywhere: proposals are kc-voice/1 records; the engine's math is
deterministic; the library grows only by Matt promoting a kept recipe.

## 0e. The full-surface audit (companion doc)

`kc1-megamind-ollama-surface-audit-2026-10-14.md` walks every KC-1
area against a connected model. Its law: **a model changes everything
that reads, judges, names, or remembers — and nothing that renders,
counts, or keeps time.** Beyond the personas and #1145, the material
changes: loot ingest tagging (#1479), library auto-classification
(the metadata the dice scorer reads), replay recaps (#1461/#1367),
audio conducting (#1483), semantic search via an optional embeddings
slot, a docs-grounded guide, vision accessibility descriptions, and
dev-panel telemetry narration. Never touched: governor/telemetry,
the render path, selfchecks/CI, taste training, the Queen's surface,
the bake.

## 1. The Settings surface

One section, "MegaMind model", in Settings:

- Endpoint field, pre-filled `http://127.0.0.1:11434` (v1 is Ollama-only;
  LM Studio / llama.cpp / Jan speak the same OpenAI shape and are a later,
  cheap generalisation — not v1).
- **Connect** button → the detection handshake (§2). Nothing is ever probed
  on page load; connecting is a user act.
- Model picker fed **verbatim** from the visitor's `/api/tags` — never
  construct or guess model names (Ollama's cloud naming alone has three
  shapes: `gpt-oss:120b-cloud`, `glm-5.1:cloud`, `deepseek-v3.1:671b-cloud`).
- Status line: connected · model · **cadence tier badge** · context size ·
  badges for `vision` and `cloud` when they apply.
- **Disconnect** clears the stored endpoint/model (localStorage) and falls
  back silently (see §4).
- Error copy names which gate failed, in plain words: Ollama not running /
  origin not allowed (show the exact `OLLAMA_ORIGINS=<kc-1 origin>` line +
  restart step for their OS) / browser prompt denied / Safari unsupported
  for this feature.

## 2. Detection at connect — never assume, measure

Three steps, run on Connect and again on every model change:

1. `GET /api/tags` — the model list (names, sizes, families).
2. `POST /api/show` per chosen model — `capabilities[]` (completion / tools /
   vision / thinking), `context_length` (scan the model_info keys, don't
   hardcode a prefix), thinking metadata. Trap: a model whose show data has
   NO thinking metadata may still think by default (R1 distills).
3. **One timed warm probe** in MegaMind's real format: preload with
   `keep_alive: "30m"`, `think: false` where supported, `num_predict`
   capped (~150), one flat-schema verdict. Measure wall time and check the
   reply: parses? right fields? right language? no `<think>` leakage?

The probe — not the model name — assigns the **cadence tier**:

| Tier | Warm probe | What the trio may do |
|---|---|---|
| A — performance | ≤ ~3 s, schema-clean | Consulted every eligible bar (full Mind behaviour) |
| B — song | ~3–8 s | Consulted on phrase boundaries (every 4–8 bars); replies cached per state-room |
| C — ambient | > 8 s, or thinking can't be turned off | Section changes only; "deep verdict" moments, never the bar |
| vision badge | capabilities ∋ vision | LOIS may judge a render occasionally (6–15 s/frame) — never per-bar |
| cloud badge | `-cloud` pointer model | Format ladder (§3) + honest "runs on Ollama's cloud" label |

Also pinned at connect: send `num_ctx` explicitly and keep it constant
(changing it reloads the model; the silent default can truncate long
prompts — `done_reason: length` is the only tell).

## 3. What actually changes inside KC-1, by model class

**Small local (Qwen3 0.6–4B, ~1–3 s warm on GPU/Apple Silicon).**
The trio gets terse: flat schemas, few-shot pinned prompts, temperature low.
Syntax is safe (Ollama's `format` grammar constraint), *semantics* are the
risk — valid JSON with wrong-spirit values; measured strict-format adherence
climbs steeply with size (Qwen3-0.6B ~29% vs 4B ~56% on a strict-output task).
KC-1 leans on the existing shape-validation + one retry. Davis's lines get
formulaic at 0.6–1.7B; persona *consistency* is the first casualty as models
shrink. **Qwen3 is the recommended default family** — Apache-2.0 at every
size, tools+thinking badges, 40K context on most tags.

**Mid local (7–9B, ~3–7 s GPU; 10–25 s CPU-only).** The sweet spot: full
verdict vocabulary, reliable flat-schema JSON at temp 0. The same model is
Tier A on a GPU machine and Tier C on a CPU-only laptop — which is exactly
why the tier comes from the probe, never the name.

**Large local (14–32B, ~5–15 s).** Best judging nuance, phrase-level
cadence. keep_alive pinning and preload matter — a model that unloads after
Ollama's default 5 idle minutes reloads mid-set.

**Reasoning models (DeepSeek R1 distills, Qwen3 thinking-on).** The cadence
killers: hundreds–thousands of hidden think tokens before a one-line answer
(measured: ~740 thinking tokens for a trivial question at ~10 tok/s = >60 s;
the same question with `think:false` = 2.2 s). KC-1 sends `think:false`
where the model allows it; a model that can't stop thinking is Tier C,
full stop. Any leaked `<think>` is stripped before parsing, always.
R1 distills specifically: MIT weights, but reasoning-first, may ignore
system prompts — weakest fit for strict-schema short replies.

**Ollama Pro / cloud models (via the visitor's own `ollama signin`).**
The paradox tier: the *fastest* big brains (~1.5–3 s non-thinking; gpt-oss
120b-cloud first token ~0.4–0.6 s) — but **structured outputs are NOT
supported on Ollama Cloud**, so KC-1 drops to the format fallback ladder:
schema → json-object → plain prompt-JSON + validate/retry. Pricing changed
2026-08-31 to credit-metered: Free = starter credits + starter models, 1
concurrent; Pro $20/mo = $60 credits/mo, 3 concurrent; Max $100/mo = $300,
10 concurrent. Prompts leave the visitor's machine (Ollama claims no
logging/training, zero-retention partners), and cloud models get *retired*
(glm-4.6, minimax-m2.5 already gone) — another reason detection re-runs on
every connect and names are never assumed. The cost is the visitor's tab;
KC-1's job is only to label it honestly (cloud badge).

**Free Chinese models, specifically.** Qwen3 — best default (above).
DeepSeek: R1 distills are MIT but the reasoning trap; V3/V3.1 at 671B are
effectively cloud-only and carry DeepSeek's *custom* licence, not MIT.
GLM: glm-4.7-flash (30B-A3B, ~19 GB, 198K ctx, tools+thinking) is locally
pullable; the big GLMs are cloud-only. Kimi / MiniMax: cloud-only in
Ollama. **Language drift is real** — Chinese models can drift into Chinese,
thinking traces especially; no vendor guarantees a language lock. KC-1
mitigates: explicit language instruction in every persona prompt,
`think:false`, moderate temperature, and a client-side CJK check on replies
with one retry.

**Vision models (qwen3-vl, gemma3/4, llava — when the badge is present).**
LOIS judging *renders* becomes possible (the E4 shape): a coarse structured
scene verdict every N bars or on demand. Fine aesthetic judgement below
~8B is unreliable; per-bar judging is off the table at 6–15 s/frame.

## 4. What NEVER changes, whatever is connected

- **taste.json is the taste.** The model reads it; it never writes it.
  Training stays offline (#1173); the keep ledger stays the only teacher.
- **The kc-voice/1 record contract is the whole trick.** Backends are
  interchangeable *because* the record shape is fixed and shape-validated.
  A bad reply is a discarded reply, never a rendered one.
- **The governor's honesty is untouched** — telemetry and shed logic never
  route through the model.
- **The Queen stays unnamed and speaks only by effect.** No model changes
  her surface: there isn't one.
- **Rules fallback underneath everything.** No model / model died / model
  too slow → MegaMind relaxes to today's rules behaviour, silently. A
  performance never shows an AI error state.
- **No cloud of KC-1's own.** The app ships no key, no endpoint, no
  dependence. A visitor's own Ollama Pro sign-in is their machine and their
  account — the cloud badge keeps the distinction visible.

## 5. Doctrine fit

This is the **web tier** of #1463, not a reopening of it: Apple Intelligence
via the Swift helper remains the native app's default backend; the public
site has no helper, so its MegaMind tiers are: linked local model → (later)
in-browser model → rules. Same philosophy as the loot folder (#1479): the
visitor's machine holds the goods, KC-1 points at them. One reading for
Matt to confirm: the "no cloud AI" law = *KC-1 never requires or embeds
cloud* — a visitor pointing KC-1 at their own cloud models is their call,
made visible by the badge. If he reads the law stricter, cloud pointers can
be refused at the picker with one line of code.

## 6. Build shape (when queued — three small stages, one issue each)

- **S1 — connect + detect + Settings UI.** Endpoint, handshake, tier
  classification, status/badges, honest errors. No persona wiring: MegaMind
  still runs on rules; Settings just proves the link and reports the tier.
- **S2 — persona backend adapter.** kc-voice/1 over `/api/chat`: format
  ladder, think handling, CJK check, probe-driven cadence tiers, rules
  fallback. Davis + LOIS first; Queen's sway consumes the same verdicts.
- **S3 — vision judging hook.** When the vision badge is present, LOIS may
  judge renders occasionally — folds into E4 (#1508)'s judging design.

## 6b. Accommodation register — what the MegaMind build-out MUST update

Added on Matt's word (2026-10-14): when MegaMind builds out, the
surfaces below are part of its acceptance — not follow-ups, not
drift. A surface not in this register gets no model hooks without
Matt's word adding it. Source: the full-surface audit (§0e).

**With S1 (connect + detect + Settings):**
- The House recommendation published identically in **Settings,
  README, wiki, and docs** — the doc updates ship in S1's PR, not
  after it.
- Capability registry live on the event bus (tiers + badges exist as
  data every later stage reads).

**With S2 (persona adapter):**
- Trio verdicts/lines over the linked model, rules fallback intact
  (#1462–#1464 behaviour, incl. invented states recorded as such).
- #1483 conducting hooks: section-cadence proposals from spectral
  features, validated as records.
- #1145 pacing interface: Director proposals (widen / hold / push)
  as records the pure scheduler validates — the scheduler itself
  is not edited by the model work.
- Crown-time assistance: keep notes/captions drafted for editing,
  Look-name suggestions (deadpan; Matt's word lands a name).
- Dev-panel narration: telemetry + census summaries from real logs.
- Docs-grounded visitor guide (retrieval over the shipped wiki/docs
  corpus only).

**With S3 (vision):**
- E4 (#1508) render judging on mined candidates.
- E5 offspring pre-judging (rides E5's own issue when filed).
- Loot ingest interface (#1479): vision descriptions + tag proposals
  at ingest; library auto-classification proposals for new assets
  (the metadata the dice scorer reads).
- On-demand stage description (accessibility surface).

**Follow-on issues when un-deferred (not in S1–S3):**
- Embeddings slot + semantic search over keeps/library; the miner's
  semantic novelty axis.
- Replay recaps (#1461) + retro-capture summaries (#1367).
- E5 model-directed breeding (parent proposals + series requests).

**Unchanged by the build-out, register or not:** governor/telemetry,
render path, selfchecks/CI, taste training, the bake, the Queen's
surface, the 16-Look cap.

## 7. Open questions (Matt's calls)

1. ~~Cloud pointers: allowed or refused?~~ **Resolved by the sweet-spot
   doctrine (2026-10-14):** the House recommendation is a local model;
   cloud pointers are *may work, unsupported* — connectable, badged,
   never recommended. Revisit only if the doctrine changes.
2. v1 Ollama-only (recommended), or generic OpenAI-compatible endpoints
   (LM Studio / llama.cpp / Jan) from day one? *(Open — matters less
   under the doctrine: Ollama is the House serving layer.)*
3. Settings placement: user Settings (recommended — it's a visitor
   feature) vs dev panel first? *(Open.)*

## 8. Deferred filing

Parked with the deferred pile (tracked on #1465) until Matt un-defers
it. Filed 2026-10-14 on his word: #1525 (S1), #1526 (S2), #1527 (S3),
#1528 (embeddings follow-on), #1529 (recaps follow-on) — all labelled
`deferred`. Entry point when revived: S1, citing this plan + §0's House
recommendation as the supported configuration.

## Lois pass

- The model is not the feature. The *fallback* is the feature — the night
  the connection dies mid-set and nobody notices, that's the product.
- Never print "use a 7B model" in help text. Documentation is a confession
  that detection failed. Measure the machine in front of you.
- A Settings panel is a promise. Tier badges or it's astrology.
- The day MegaMind needs the cloud to be interesting, it stops being
  KC-1 and becomes a wrapper with a tip jar.
