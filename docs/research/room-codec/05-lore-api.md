# 05 — Lore: the Art & Design Knowledge Bank + APIs

Status: architecture RULED (offline curation); API terms RESEARCH LANDED 2026-10-14 (full report: `story-lore-research-2026-10-14.md` in this folder).

## The ruling
- The live instrument **never calls the network** (roadmap law: no cloud AI; a stage tool cannot depend on venue wifi).
- APIs feed an **offline curation pass** on the Mac Studio — the same shape as MLX taste training — which exports a versioned **`lore.json`** the app reads. Heavy thinking offline, cheap artifact live.
- Every entry is vetted before it enters the bank (by Matt or by a curation run he approves): voice and accuracy are curated, not scraped.

## What lore is for
- LOIS drops design maxims and verdicts with ancestors attached.
- Davis name-checks lineage when a seed blooms (Haeckel is family).
- "On this day in art history" cold opens; movement/fact asides keyed to what's on the canvas (a Voronoi piece earns a Voronoi fact).

## Ranked sources (research, 2026-10-14)
1. **Wikidata** — CC0, no key, no attribution. Ship FACTS only (structured data); Wikipedia prose is CC BY-SA — never ship text.
2. **The Met** — CC0 dataset (470k+ works), no key. Note: v1 search retired 2026-10-01; use v1.1/bulk endpoints.
3. **Art Institute of Chicago** — CC0 data, no key (~60 req/min). EXCEPTION: `description` field is CC BY — strip it at curation (or carry attribution + web_url per record). Exclude audio-guide content.
4. **Rijksmuseum** — current API is keyless; mostly public-domain/CC0 incl. commercial use, some CC BY 4.0, some restricted — **per-object rights check at curation**. Credit requested, not required.
5. **Smithsonian** — needs a free api.data.gov key (~1,000 req/h); CC0 ONLY where a record is designated — hard per-record filter mandatory. Worth it for Cooper Hewitt design facts.
6. **Europeana — DISCOVERY ONLY, do not ship.** Metadata is CC0, but the terms include a cease-use-on-request clause — a tail risk for a frozen shipped JSON. Browse it for leads; source the shipped record elsewhere.
(A couple of the rate figures above come from secondary sources; re-check at curation time.)

## Bank shape (research-refined)
Each entry: `{ id, kind (maxim|ancestor|fact|onthisday), fact, tags (family, movement, mood), source_id, source_url, rights, retrieved_date, bank_version }` — rights and provenance ride every record (the research's schema recommendation), so any entry can be audited or pulled without touching the rest. The story generator (`04`) draws by tags matching the room's actual state — lore is seasoning keyed to the work, never a lecture schedule.

## Guardrails
- Facts only from the bank; a model may phrase a bank fact but never invent one (the honesty law applied to art history).
- Lois maxims: paraphrase his philosophy; verbatim quotation bounded by the research's findings.
