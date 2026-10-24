#!/usr/bin/env python3
"""curate-lore.py — the offline curation pass for the KC-1 lore bank (#1560 S4,
design docs/research/room-codec/05-lore-api.md).

The live instrument NEVER calls the network (05's ruling): this pass runs
offline, reads RIGHTS-CLEAN structured sources, and exports the versioned
artifact `app/src/curator/lore.json` (kind kc-lore) that the app validates and
reads. Same shape as the MLX taste pass (studio/curator.py -> taste.json).

Rights discipline (05 + the research's homage boundary):
- Wikidata (CC0): FACTS ONLY — dates and places from structured claims. No
  Wikipedia prose is fetched or shipped, anywhere.
- The Met (CC0 object data): object fields only.
- Art Institute of Chicago: its API refused this client (403) in the
  2026-10-22 pass — nothing ships from it. Rijksmuseum's collection endpoint
  answered 410 (retired) — nothing ships from it. Smithsonian needs a key the
  pass does not hold — nothing ships from it. Europeana is discovery-only by
  ruling — never shipped.
- Maxims are ORIGINAL KC-1 wording paraphrasing a philosophy, marked as
  paraphrase in the text itself; no verbatim source text anywhere.

Verification: every birth/death date used below is re-fetched and must carry
EXACTLY ONE distinct day-precision (precision 11) value in the source, or the
pass refuses to ship it. Dates the record contests are dropped by the curator
BEFORE they reach the table — the drop list, with reasons, is in the comments
of the EVENTS table and in the S4 staging report.

Usage: python3 studio/curate-lore.py [--out app/src/curator/lore.json]
"""
import json, sys, time, urllib.request, urllib.parse, datetime

UA = {"User-Agent": "KC1-lore-curation/1.0 (offline art-history bank; NeuralIO444/Kinetic_Curator)"}
WD = "https://www.wikidata.org/w/api.php"
TODAY = datetime.date.today().isoformat()
BANK_VERSION = TODAY + ".1"
MONTHS = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"]
WD_RIGHTS = "CC0 — Wikidata structured facts (no Wikipedia text)"
MET_RIGHTS = "CC0 — The Met Open Access (object data)"
PARAPHRASE_RIGHTS = "Original KC-1 wording paraphrasing the philosophy (05 homage boundary); no source text reproduced"


def get(url, params=None):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.load(r)


_cache = {}

def entity(qid):
    if qid not in _cache:
        d = get(WD, {"action": "wbgetentities", "ids": qid, "props": "claims|labels",
                     "languages": "en", "format": "json"})
        _cache[qid] = d["entities"][qid]
        time.sleep(0.1)
    return _cache[qid]


def label_of(qid):
    return entity(qid).get("labels", {}).get("en", {}).get("value")


def day_values(qid, prop):
    """All DISTINCT day-precision (11) values of a date claim, as (y, m, d)."""
    out = set()
    for c in entity(qid).get("claims", {}).get(prop, []):
        try:
            v = c["mainsnak"]["datavalue"]["value"]
            if v.get("precision") == 11:
                t = v["time"]  # +YYYY-MM-DDT00:00:00Z
                out.add((int(t[1:5]), int(t[6:8]), int(t[9:11])))
        except Exception:
            pass
    return out


def the_day(qid, prop, who):
    days = day_values(qid, prop)
    if len(days) != 1:
        raise SystemExit(f"REFUSED: {who} {prop} has {len(days)} day-precision values {sorted(days)} — contested or imprecise; the curator must rule before it ships")
    return next(iter(days))


def place_label(qid, prop):
    for c in entity(qid).get("claims", {}).get(prop, []):
        try:
            return label_of(c["mainsnak"]["datavalue"]["value"]["id"])
        except Exception:
            continue
    return None


# ─── the curated table ────────────────────────────────────────────────────────
# clause: the curator's own short appositive (role nouns anchored to the
# person's Wikidata occupation record, fetched in the same pass). tags ride
# 05's axes: family (the room's craft kinship), movement, mood.
# opts: "no_place" (the record's place label is ambiguous bare — omit it),
#       "place" (display override, e.g. an arrondissement label -> its city).
#
# Curator drops from the candidate list (record contested / unverifiable):
# - Malevich BORN (three day-values in the record: 1878/1879, Julian/Gregorian)
# - Lange BORN (two day-values: 25 and 26 May 1895) — her death is single: ships
# - Taeuber-Arp DIED (two day-values: 13 and 14 Jan 1943) — her birth ships
# - Lissitzky BORN (the record's single value is the Julian date) — death ships
# - Cohen DIED (the record's 27 Apr 2016 conflicts with published obituaries)
# - Cézanne DIED (two day-values in the record: 22 and 23 Oct 1906) — birth ships
# - Rand BORN (two day-values in the record: 15 Aug and 15 Dec 1914)
# - Tschichold BORN (two day-values in the record: 2 Apr and 2 May 1902)
# - Ikko Tanaka (birth value conflicts with the commonly cited 1 Jan 1930)
EVENTS = [
    # qid, slug, [(event, clause, tags, opts)]
    ("Q48246", "haeckel", [
        ("born", "the biologist who drew organisms as ornament",
         {"family": "bioform", "movement": "naturalism", "mood": "surge"}, {}),
        ("died", "the biologist who drew organisms as ornament",
         {"family": "bioform", "movement": "naturalism", "mood": "surge"}, {}),
    ]),
    ("Q35548", "cezanne", [
        ("born", "the painter who rebuilt seeing as geometry",
         {"family": "paint", "movement": "post-impressionism", "mood": "calm"}, {}),
    ]),
    ("Q164358", "rauschenberg", [
        ("born", "artist of the combines — painting with the world stuck to it",
         {"family": "collage", "movement": "pop", "mood": "surge"}, {}),
    ]),
    ("Q182589", "morris", [
        ("born", "designer and poet who made craft a politics",
         {"family": "pattern", "movement": "arts-and-crafts", "mood": "bright"}, {}),
    ]),
    ("Q61071", "gropius", [
        ("born", "architect and founder of the Bauhaus",
         {"family": "design", "movement": "bauhaus", "mood": "dry"}, {}),
    ]),
    ("Q170071", "josef-albers", [
        ("born", "painter and teacher of colour's relativity",
         {"family": "colour", "movement": "bauhaus", "mood": "calm"}, {}),
        ("died", "painter and teacher of colour's relativity",
         {"family": "colour", "movement": "bauhaus", "mood": "calm"}, {}),
    ]),
    ("Q86078", "anni-albers", [
        ("born", "weaver and printmaker, the Bauhaus's textile mind",
         {"family": "weaving", "movement": "bauhaus", "mood": "calm"}, {}),
        ("died", "weaver and printmaker, the Bauhaus's textile mind",
         {"family": "weaving", "movement": "bauhaus", "mood": "calm"}, {"no_place": True}),
    ]),
    ("Q151803", "mondrian", [
        ("died", "the painter who reduced the world to line and primary colour",
         {"family": "grid", "movement": "de stijl", "mood": "calm"}, {}),
    ]),
    ("Q130777", "malevich", [
        ("died", "the painter of the Black Square, founder of Suprematism",
         {"family": "paint", "movement": "suprematism", "mood": "sombre"}, {}),
    ]),
    ("Q5912", "duchamp", [
        ("born", "the artist who sent a urinal to do a painting's job",
         {"family": "idea", "movement": "dada", "mood": "wry"}, {}),
    ]),
    ("Q46139", "man-ray", [
        ("born", "the Dada photographer who printed pictures without a camera",
         {"family": "photo", "movement": "dada", "mood": "wry"}, {}),
    ]),
    ("Q230673", "lange", [
        ("died", "the photojournalist of the Migrant Mother",
         {"family": "photo", "movement": "documentary", "mood": "sombre"}, {}),
    ]),
    ("Q536884", "bass", [
        ("born", "the designer who made film titles into cinema",
         {"family": "film", "movement": "modernism", "mood": "wry"}, {}),
    ]),
    ("Q123409", "muller-brockmann", [
        ("born", "graphic designer, the grid system's grammarian",
         {"family": "grid", "movement": "swiss", "mood": "dry"}, {}),
    ]),
    ("Q2317903", "vignelli", [
        ("born", "graphic designer of grids, systems and signs",
         {"family": "grid", "movement": "modernism", "mood": "dry"}, {}),
    ]),
    ("Q5586", "hokusai", [
        ("born", "the ukiyo-e master who signed himself the old man mad about art",
         {"family": "print", "movement": "ukiyo-e", "mood": "surge"}, {}),
    ]),
    ("Q146691", "mucha", [
        ("died", "the poster artist whose line became Art Nouveau's signature",
         {"family": "poster", "movement": "art nouveau", "mood": "bright"}, {}),
    ]),
    ("Q254395", "taeuber-arp", [
        ("born", "painter, weaver and dancer of the Dada circle",
         {"family": "weaving", "movement": "dada", "mood": "bright"}, {}),
    ]),
    ("Q463411", "hoch", [
        ("born", "the Dada collagist who cut with the kitchen knife",
         {"family": "collage", "movement": "dada", "mood": "wry"}, {}),
    ]),
    ("Q160448", "moholy-nagy", [
        ("born", "painter, photographer and Bauhaus teacher of light",
         {"family": "experiment", "movement": "bauhaus", "mood": "surge"}, {}),
    ]),
    ("Q272566", "beardsley", [
        ("died", "the illustrator of the black line, dead at twenty-five",
         {"family": "print", "movement": "art nouveau", "mood": "sombre"}, {}),
    ]),
    ("Q346988", "weston", [
        ("born", "the photographer of peppers, shells and straight seeing",
         {"family": "photo", "movement": "modernism", "mood": "calm"}, {}),
        ("died", "the photographer of peppers, shells and straight seeing",
         {"family": "photo", "movement": "modernism", "mood": "calm"}, {}),
    ]),
    ("Q7154764", "scher", [
        ("born", "graphic designer, painter of maps made of type",
         {"family": "type", "movement": "postmodernism", "mood": "bright"}, {}),
    ]),
    ("Q5541814", "lois", [
        ("born", "the advertising art director of the Big Idea",
         {"family": "advertising", "movement": "advertising", "mood": "surge"}, {}),
    ]),
    ("Q739438", "thompson", [
        ("born", "the mathematician-biologist of On Growth and Form",
         {"family": "bioform", "movement": "science", "mood": "calm"}, {}),
    ]),
    ("Q123138", "itten", [
        ("born", "painter and the Bauhaus's first teacher of colour",
         {"family": "colour", "movement": "bauhaus", "mood": "bright"}, {}),
    ]),
    ("Q152233", "lissitzky", [
        ("died", "painter, typographer and maker of the Proun room",
         {"family": "type", "movement": "suprematism", "mood": "dry"}, {}),
    ]),
    ("Q61191", "aicher", [
        ("born", "designer of pictograms that need no language",
         {"family": "grid", "movement": "modernism", "mood": "dry"}, {}),
        ("died", "designer of pictograms that need no language",
         {"family": "grid", "movement": "modernism", "mood": "dry"}, {}),
    ]),
    ("Q834449", "kamekura", [
        ("born", "graphic designer, a voice of postwar Japanese design",
         {"family": "poster", "movement": "modernism", "mood": "bright"}, {}),
    ]),
    ("Q3335167", "hofmann", [
        ("born", "graphic designer and teacher of the Basel school",
         {"family": "type", "movement": "swiss", "mood": "calm"}, {}),
    ]),
    ("Q234449", "riley", [
        ("born", "the painter of op art's vibrating fields",
         {"family": "field", "movement": "op art", "mood": "surge"}, {}),
    ]),
    ("Q1658002", "molnar", [
        ("born", "pioneer of algorithm art — pictures from programs, drawn by plotter",
         {"family": "algorithm", "movement": "computer art", "mood": "calm"}, {}),
        ("died", "pioneer of algorithm art — pictures from programs, drawn by plotter",
         {"family": "algorithm", "movement": "computer art", "mood": "calm"}, {"place": "Paris"}),
    ]),
    ("Q872832", "mohr", [
        ("born", "algorithm artist of the plotted line",
         {"family": "algorithm", "movement": "computer art", "mood": "dry"}, {}),
    ]),
    ("Q92703", "nake", [
        ("born", "mathematician and pioneer of computer art",
         {"family": "algorithm", "movement": "computer art", "mood": "dry"}, {}),
    ]),
    ("Q92723", "cohen", [
        ("born", "painter and programmer whose AARON drew on its own",
         {"family": "algorithm", "movement": "computer art", "mood": "wry"}, {}),
    ]),
    ("Q15503703", "schwartz", [
        ("born", "artist who made the computer a drawing instrument",
         {"family": "algorithm", "movement": "computer art", "mood": "bright"}, {}),
    ]),
    ("Q116848", "ruder", [
        ("born", "typographer of the Swiss school, function first",
         {"family": "type", "movement": "swiss", "mood": "dry"}, {}),
    ]),
    ("Q981942", "fukuda", [
        ("born", "the poster artist whose visual puns never needed a caption",
         {"family": "poster", "movement": "japanese poster", "mood": "wry"}, {}),
        ("died", "the poster artist whose visual puns never needed a caption",
         {"family": "poster", "movement": "japanese poster", "mood": "wry"}, {}),
    ]),
    ("Q84085", "bayer", [
        ("born", "physicist and inventor of the Bayer filter",
         {"family": "dither", "movement": "imaging", "mood": "dry"}, {"no_place": True}),
    ]),
]

# ─── hand-composed entries (ancestors, facts, maxims) ─────────────────────────
# Every factual claim below traces to a record fetched in this pass; the fetch
# is named in each entry's comment. Lineage framing ("the room's ancestor") is
# KC-1's own design canon (05), not a sourced claim.
SPECIALS = [
    {  # person record Q48246 (dates fetched above); the book is his defining work
        "id": "anc-haeckel", "kind": "ancestor",
        "fact": "Ernst Haeckel (1834–1919), biologist and artist, filled Kunstformen der Natur with organisms drawn as ornament. In the room's canon he is Davis's ancestor: the creatures are built the way he drew — many layered marks, symmetry as construction.",
        "tags": {"family": "bioform", "movement": "naturalism", "mood": "surge"},
        "source_id": "wikidata:Q48246",
    },
    {  # person record Q739438; the book's year rides fact-growth-and-form (Q19902738, P577=1917)
        "id": "anc-thompson", "kind": "ancestor",
        "fact": "D'Arcy Wentworth Thompson (1860–1948), mathematician and biologist: On Growth and Form argued that a living shape is a diagram of the forces that made it. The room keeps it as its oldest book.",
        "tags": {"family": "bioform", "movement": "science", "mood": "calm"},
        "source_id": "wikidata:Q739438",
    },
    {  # person record Q268869 — years only: his day dates are Julian/Gregorian pairs in the record
        "id": "anc-voronoy", "kind": "ancestor",
        "fact": "Georgy Voronoy (1868–1908), mathematician. His diagram gives every seed the territory nearest to it; the room's fields, dishes and weathers are drawn inside that idea.",
        "tags": {"family": "field", "movement": "mathematics", "mood": "dry"},
        "source_id": "wikidata:Q268869",
    },
    {  # person record Q5541814; the entry also states the bank's maxim policy in the open
        "id": "anc-lois", "kind": "ancestor",
        "fact": "George Lois (1931–2022), the advertising art director of the Big Idea. The room's judge works in his register; the maxims in this bank are paraphrases of his philosophy in KC-1's own words — the homage is the thinking, never a quotation.",
        "tags": {"family": "advertising", "movement": "advertising", "mood": "surge"},
        "source_id": "wikidata:Q5541814",
    },
    {  # Met object 45434, fetched in this pass: title/artist/date/medium/isPublicDomain
        "id": "fact-great-wave", "kind": "fact",
        "fact": "The Met's impression of Hokusai's Great Wave — Under the Wave off Kanagawa, from the series Thirty-six Views of Mount Fuji — is a woodblock print in ink and colour on paper, dated about 1830–32.",
        "tags": {"family": "print", "movement": "ukiyo-e", "mood": "surge"},
        "source_id": "met:45434",
        "source_url": "https://www.metmuseum.org/art/collection/search/45434",
        "rights": MET_RIGHTS,
    },
    {  # the diagram's entity Q757267 ("type of plane partition"); the definition is the fact
        "id": "fact-voronoi-diagram", "kind": "fact",
        "fact": "A Voronoi diagram partitions a plane into cells, one around each seed, every point in a cell nearer its seed than any other. It is geometry the room computes with constantly.",
        "tags": {"family": "field", "movement": "geometry", "mood": "calm"},
        "source_id": "wikidata:Q757267",
    },
    {  # the algorithm's entity Q7100708; S2 ground the room's faces through the Bayer matrix
        "id": "fact-ordered-dithering", "kind": "fact",
        "fact": "Ordered dithering tests each pixel against a repeating threshold pattern; Bayer's matrix is the pattern the room's faces are ground through — tone from almost nothing.",
        "tags": {"family": "dither", "movement": "imaging", "mood": "dry"},
        "source_id": "wikidata:Q7100708",
    },
    {  # the algorithm's entity Q1324107; definitional mechanism, no date claimed (the record carries none)
        "id": "fact-floyd-steinberg", "kind": "fact",
        "fact": "Floyd–Steinberg dithering diffuses each pixel's quantising error to its neighbours, so a coarse grid keeps a picture's tone. The room's faces take the other road — Bayer's — but the argument is the same.",
        "tags": {"family": "dither", "movement": "imaging", "mood": "calm"},
        "source_id": "wikidata:Q1324107",
    },
    {  # the book's entity Q19902738 carries P577 = 1917 (fetched)
        "id": "fact-growth-and-form", "kind": "fact",
        "fact": "On Growth and Form, D'Arcy Thompson's study of shape in living things, was published in 1917 — biology written as mathematics, a century before the room's creatures.",
        "tags": {"family": "bioform", "movement": "science", "mood": "calm"},
        "source_id": "wikidata:Q19902738",
    },
    {  # maxims: original KC-1 wording, paraphrase marked in the text; provenance = the philosopher's record
        "id": "maxim-lois-1", "kind": "maxim",
        "fact": "Lois's first rule, in paraphrase: the big idea comes first — execution is only its delivery, and decoration standing where an idea should be is an apology.",
        "tags": {"family": "advertising", "movement": "advertising", "mood": "dry"},
        "source_id": "wikidata:Q5541814", "rights": PARAPHRASE_RIGHTS,
    },
    {
        "id": "maxim-lois-2", "kind": "maxim",
        "fact": "Lois's method, in paraphrase: creativity is not decoration but problem-solving — find the one true thing about the work and say it so plainly it cannot be unheard.",
        "tags": {"family": "advertising", "movement": "advertising", "mood": "wry"},
        "source_id": "wikidata:Q5541814", "rights": PARAPHRASE_RIGHTS,
    },
    {
        "id": "maxim-lois-3", "kind": "maxim",
        "fact": "Lois's test of the work, in paraphrase: if it makes nobody nervous, it is wallpaper — the room would rather be argued with than upholstered.",
        "tags": {"family": "advertising", "movement": "advertising", "mood": "surge"},
        "source_id": "wikidata:Q5541814", "rights": PARAPHRASE_RIGHTS,
    },
]


def main():
    out_path = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "app/src/curator/lore.json"
    entries = []
    for qid, slug, events in EVENTS:
        name = label_of(qid)
        for event, clause, tags, opts in events:
            prop = "P569" if event == "born" else "P570"
            y, m, d = the_day(qid, prop, f"{name} {event}")
            place = opts.get("place") or (None if opts.get("no_place") else place_label(qid, "P19" if event == "born" else "P20"))
            verb = "was born" if event == "born" else "died"
            where = f" in {place}" if place else ""
            fact = f"{name} — {clause} — {verb}{where} on {d} {MONTHS[m - 1]} {y}."
            entries.append({
                "id": f"otd-{slug}-{event}-{m:02d}{d:02d}", "kind": "onthisday", "fact": fact,
                "month": m, "day": d, "tags": tags,
                "source_id": f"wikidata:{qid}",
                "source_url": f"https://www.wikidata.org/wiki/{qid}",
                "rights": WD_RIGHTS, "retrieved_date": TODAY, "bank_version": BANK_VERSION,
            })
            print(f"otd  {m:02d}-{d:02d}  {name} {event} {y}  [{place}]")
    for s in SPECIALS:
        e = dict(s)
        e.setdefault("source_url", "https://www.wikidata.org/wiki/" + e["source_id"].split(":", 1)[1])
        e.setdefault("rights", WD_RIGHTS)
        e["retrieved_date"] = TODAY
        e["bank_version"] = BANK_VERSION
        entries.append(e)
        print(f"{e['kind']:9s} {e['id']}")
    entries.sort(key=lambda e: e["id"])
    bank = {"kind": "kc-lore", "version": 1, "bank_version": BANK_VERSION,
            "curated": TODAY, "entries": entries}
    with open(out_path, "w") as f:
        json.dump(bank, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"\nwrote {out_path}: {len(entries)} entries "
          f"({sum(1 for e in entries if e['kind'] == 'onthisday')} on-this-day), bank {BANK_VERSION}")


if __name__ == "__main__":
    main()
