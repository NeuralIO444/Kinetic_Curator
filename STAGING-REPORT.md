# STAGING REPORT — #2384 Persona Kernel P4: Persona Archive (text shelves + MegaMind retrieval + Mind context)

Branch `kc-2384-persona-archive`, based on origin/main `33bf4474` (P3 merged). One PR, not merged by
the builder (it wires a new path into Mind's model asks → Matt's review lane): **PR #2418 — https://github.com/NeuralIO444/Kinetic_Curator/pull/2418**

Spec: `docs/design/persona-kernel-spec.md` §3 (the Archive, Q7: text only) + §4b (the dossier).
Issue acceptance: a persona ask includes cited Archive snippets; rules fallback unchanged when no
model; selfcheck: no image files under `archive/`.

## What was built

### The shelves — `app/src/personas/archive/<id>/*.md` (90 files: 18 personas × 5)

Every persona in the registry carries the five shelves the issue names: `backstory.md` (sourced,
with a front-matter provenance block naming its sources and check date), `brief.md` (the creative
brief — objective, principle, what it never does, the one-line big idea — marked **UNSIGNED** in a
banner until Matt signs it), `inspiration.md` (works and methods in our own words; no quotation
beyond a short line), `canon.md` (Canon pointers: where its lexicon, taste vector, Canon style and
modes actually live), `rulings.md` (Matt's rulings touching the persona, plus the standing laws).

Content discipline: everything derives from the `kc-persona/1` records, `docs/characters/*.md` and
the spec — nothing invented. Where the record carries no data, the shelf says so instead of
filling the gap: the doctrines' dates are "not stated in the repo"; Greiman's shelf follows her
record and supplies no full name; the voices (Molnár, Mohr, Benjamin, Reas, Haeckel, Oxman, Stock,
Anadol, Menkman) carry their distillation (the record's taste rationale) as their method, and say
plainly that a voice is a measure, not a character. The Queen's inspiration shelf carries the
Art of Seduction ideas in our own words, as spec §4 (Q11 follow-up) directs. Her shelves are
Archive-internal text like all the others — nothing about her surfaces anywhere (Q2 stands).

### The pure core — `app/src/personas/personaArchive.mjs`

- `parseArchiveFile` / `parseFrontMatter`: front matter (provenance) + `## ` section chunking.
  The file's frame (title, the brief's UNSIGNED banner) never becomes a snippet. Chunks are
  truncated at the named snippet cap (600 chars, word boundary, marked with …).
- `buildArchiveCorpus`: the whole Archive as one flat chunk list, each chunk carrying its citation
  (`archive/<id>/<file>.md · <section>`), plus a problems list in the registry idiom (missing
  shelf, front matter disagreeing with its path, missing provenance, an UNSIGNED-less brief,
  an empty shelf) — data, asserted empty by the selfcheck, so drift fails CI.
- `archiveQueryText`: the ask's query, a deterministic composition over the buildContext summary
  (persona, palette, verdict, intensity, band, room states, tier, keeps) — the same room always
  asks the same question, so the embed cache can answer it.
- `rankPersonaChunks` / `fitArchiveSnippets` / `retrieveSnippets`: ranking reuses the embeddings
  slot's own `nearestNeighbours` over the persona's OWN chunks only; fitting spends the base
  context's estimated tokens first and admits whole snippets in rank order while the estimate
  stays inside Mind's 4,096-token window (named constants: `MIND_TOKEN_WINDOW`,
  `ARCHIVE_MAX_SNIPPETS` = 4, `ARCHIVE_SNIPPET_MAX_CHARS` = 600, `CHARS_PER_TOKEN` = 4).
- `withArchiveSnippets`: the seam of the fallback law — an empty snippet list returns the context
  object itself (same reference); otherwise a shallow copy carrying `archive: [{ cite, text }]`.

### The live driver — `app/src/personas/personaArchiveLive.js`

In the megamindEmbedLive idiom. Bundles the shelves via Vite's `import.meta.glob` raw imports
(verified in the production bundle), and:

- **Measured, never assumed:** retrieval runs only while the embed driver's own view carries a
  slot record that `semanticEnabled` grades clean. On a machine whose Ollama serves only the
  House model (qwen3-vl — chat/vision, no embeddings; the known house inventory), no record
  exists, `snippetsFor` returns [] forever, and no network call is ever made (pinned in the
  selfcheck, E1/E2).
- **Embedded at build/idle, never per frame:** `scheduleArchiveIndexing` (requestIdleCallback,
  timer fallback) indexes the shelf after the mind boots; indexing is cache-first per chunk
  (the slot's own vector cache, keyed by model + SHA-256 of the chunk's embed text, so a model
  swap or an edited shelf can never serve a stale vector) with misses batched by `EMBED_BATCH`.
  The only per-ask embed is the single query text, itself cache-first — the slot's own search
  press idiom. Nothing embeds inside a frame, a bar, or a render.
- **Failure is []:** any gate, throw or timeout inside the retriever resolves to no snippets;
  the ask proceeds exactly as before.

### The Mind seam — `app/src/curator/mindLive.js`, `app/src/App.jsx`

`startMind` gains an optional `archive` parameter (absent = the pre-Archive instrument, exactly).
When present, the ask wrapper — after the `mind:req` telemetry emit, which still hashes the
ORIGINAL context — awaits `archive.snippetsFor(persona, context)` off the bar and hands
`model.ask` the enriched copy. The thinker and the rules never see the enrichment: they keep the
untouched context object on every bar, model-answered or not. App.jsx constructs the singleton
retriever, passes it in, and schedules idle indexing next to `startMind`.

## Not changed

- `mindRules.js`, `mindContext.js`, `mindThinker.js`, `mindContract.js` — untouched (the fallback
  proof below rests on this plus the startMind A/B).
- The embeddings slot (`megamindEmbed.mjs` / `megamindEmbedLive.js`) — reused as-is; no new
  endpoint, no CSP change, no cloud anything. Prompts (megamindVoice etc.) untouched: snippets
  ride the context object the existing prompt builders already serialize.
- No surface renders Archive text. Snippets enter the model's context only, through the same
  display policy the context already travels under (P3 callsign law is about surfaces; the shelf
  texts are lineage, like the records and lore).
- The Wire (§3a) is not part of this issue and was not built.

## Verification

- **New suite** `app/src/personas/personaArchive.selfcheck.mjs` (registered in
  `app/selfcheck.manifest`): **18 checks passed** — shelf structure + no-image law (A1–A3),
  parsing/citation/cap (B1–B3), query determinism (C1), retrieval against a stub embeddings
  model: batched idle indexing, own-shelf cited snippets inside the window, cache-served
  identical repeat (D1–D3), the no-model path making zero network calls (E1–E2), window fitting
  (F1–F3), and the fallback law (G1–G3).
- **Fallback proof (byte-identical):** a 54-case battery over `rulesReply` (3 personas × 3 room
  snapshots × 3 seeds × 2 bars) run against this branch and against a fresh detached worktree at
  origin/main `33bf4474` — outputs byte-identical (`cmp` clean). The battery is also pinned as a
  golden inside the new suite (G1). G2 drives `startMind` twice (no archive vs archive wired but
  returning []): the model is handed deep-equal contexts and the decisions are deep-equal. G3
  confirms snippets land only on the model-bound copy.
- **Targeted suites** (every selfcheck naming a touched file): mind, mindApple, mindConduct.apple,
  mindFace, mindPresence, backendIndicator, canonBus, directorRoom, trioAcceptance, megamindLink,
  megamindVoice, megamindEmbed, personaKernel, personaTuning, callsignSweep — **15/15 PASS**.
- **Full manifest sweep:** **760 pass / 3 fail of 763**. The 3 failures (swarmWasm, rollSafety,
  accum) were A/B-run standalone against a fresh detached worktree at origin/main `33bf4474`:
  swarmWasm exits 1 on both trees (the sandbox `build-wasm.sh --verify` toolchain), rollSafety
  crashes to the Node banner on both (exit 1, no verdict line on either tree), accum aborts on
  both with the identical V8 frame `0x19f0c41` (exit 134). Sandbox-environmental, not Archive-caused;
  CI is the authority for those three.
- `npm run lint`: 0 errors (11 warnings, pre-existing). `npm run format:check`: clean.
  `npm run build`: green; the shelf texts verified present in the production bundle.

## Open questions (not silently decided)

1. **The briefs are drafts.** All 18 `brief.md` files carry the UNSIGNED banner, per the issue.
   Signing them (or editing the drafts) is Matt's act; nothing in the code treats a brief as
   signed copy.
2. **DAVIS vs OVERLAP** stays marked OPEN in davis/rulings.md, as the spec leaves it — the P3
   sweep set the surfaces; the underlying question is Matt's to close.
3. **Greiman's identity:** her record states her full name and dates are not in the repo ("the
   Archive phase sources them"). This build did NOT source them from outside the repo — the shelf
   follows the record and says so. If Matt wants them sourced, that's a research act with
   provenance to record, separate from this PR.
