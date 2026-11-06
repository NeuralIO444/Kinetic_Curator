# STAGING REPORT — #1998 FIELD stamps slice 2: curated kanji set, poem-only (Teijo native script)

**This is the FINISHER's record.** A previous builder did the slice's design and
implementation work in this worktree (branch `feat/stamps-slice2-kanji`, base
origin/main `3cb9b08d`) but ended without committing and without a staging
report. The finisher audited the entire uncommitted diff against issue #1998,
verified the bake, ran the suites, finished what was missing (five suites the
catalogue growth honestly moves — see "Finisher's fixes"), and committed the
result. **Audit outcome: the predecessor's design and core implementation were
sound and complete as designed; what was missing was the tail the catalogue
growth always has — five existing suites still read the library through
slice-1 eyes, and one of them (voiceDeck) exposed a real dealing surface the
pack leaked into. All five are finished below, each with its cause. No design
choice was overturned.**

## What the slice does (plain language)

Teijo's poems can now land in real Japanese writing. Slice 1 (PR #1985) gave
her kana; this slice adds a curated pack of kanji stamps — 125 hand-picked
characters plus the iteration mark 々, 126 stamps — baked from the same
pinned font (Zen Kaku Gothic New Bold) through the same pipeline, so in a
Japanese-context room a native Teijo deal lands as kanji and kana mixed the
way Japanese is actually written (夏の蝶, not なつのちょう alone). Everywhere
else nothing changes: the pack is poem-only, the ASSETS panel still shows 313
records, and no dice tray, chapter deck, KINETIC roll, live pool, stills pool,
or voice wardrobe can place a kanji mark.

## The curated list — 125 kanji + 々 = 126 stamps

Provenance: the list lives in `scripts/gen-kanji.mjs` as the curated set
(mirroring `scripts/gen-kana.mjs`); a regen of the committed pack file is
byte-identical (verified twice by the finisher, once with the font the
predecessor used and once with a fresh fetch of Zen Kaku Gothic New Bold;
pack md5 `874c88026625a7de8d7aaf53e3265980`). Curated-only per the FIELD FONT
RULING — never full jōyō; `鬱` has no stamp and a line in uncurated kanji does
not map (pinned in the suite).

- **Deck (25)** — every kanji Teijo's `nativeLines` are written in:
  夏 蝶 待 続 手 放 清 泉 水 紅 唇 忘 牡 丹 花 終 日 眺 長 秋 光 小 道 上 止
- **Sky & weather (21):** 空 天 雲 月 星 虹 雨 雪 霜 氷 露 霧 霞 風 嵐 晴 雷 朝 夜 夕 昼
- **Land & water (18):** 川 山 海 森 林 石 岩 砂 土 田 野 原 丘 島 波 浜 里 橋
- **Flora (16):** 草 木 竹 梅 桜 松 柳 藤 菊 蓮 苔 種 実 枝 根 葉
- **Creatures (5):** 鳥 魚 虫 鶴 蛍
- **Mind & word (19):** 心 声 歌 詩 字 書 墨 筆 紙 夢 影 闇 涙 恋 愛 思 知 見 聞
- **Time (5):** 時 年 昔 今 明
- **Quiet & domestic (16):** 静 寂 眠 休 窓 門 舟 灯 香 色 音 命 春 冬 火 金
- **Plus 々** (`typ_j_noma`, the iteration mark — the deck writes 長き日々; it
  rides on the kana pack's ー precedent: an orthographic mark the writing
  needs, baked on the same terms).

The rest after the deck group are the season / nature / quiet vocabulary the
poet decks live in (Greenleaf's snow, frost, river, stone, hill and field;
Teijo's peonies, lips, tears and longing). No filler to hit a round number.

## The script mechanism (the design choice, kept)

The native script is **one face**, judged whole. Slice 1's on-disk marker
(`script: 'kana'`) is unchanged — it now declares the whole native set:
`NATIVE_STAMP_IDS = KANA_STAMP_IDS ∪ KANJI_STAMP_IDS` in `poets/placement.js`,
with `nativeStampIdForChar` resolving kana first, then kanji. The form gate
(`gateFieldForm`, the `allowKana` affirmation) and the document door
(`sanitizeFieldForm`) both apply the slice-1 discipline to the union: every
stamp in a declared native form must be a native stamp whose glyph matches
its id; a Latin stamp inside a native form is refused; a native stamp outside
one is refused; a native form under any poet but Teijo is refused. A kanji
stamp whose glyph disagrees with its id is refused even in context (pinned).
The deal serves the face at two depths: `fieldDealReport` places a piece's
`nativeLines` when it carries them, falling back to slice 1's `kanaLines` —
one face, one marker, one gate, never two script calls. The S5 whisper
register composes with the native face (a whispered native form round-trips
the door with both markers — pinned in `fieldKanji`).

## File-by-file account

Predecessor's build (audited, kept as designed):

- `scripts/gen-kanji.mjs` (new) — the curated set + the bake; mirrors
  gen-kana.mjs (same あ reference height, so mixed forms sit at true relative
  size); writes path data only, one property per line (regen is
  format:check-clean).
- `app/src/data/assets/assets-kanji.js` (new) — the baked pack, 126 stamps.
- `app/src/data/assets/index.js` — the pack joins the catalogue after the
  kana pack, on the same terms (census/atlas members, never authored).
- `app/src/poets/teijo.js` — all four pieces gain `nativeLines` in real
  orthography, parallel to `kanaLines`. The suite proves every character of
  every native line maps to a stamp and the deck uses exactly the 25 deck
  kanji.
- `app/src/poets/placement.js` — `KANJI_STAMP_IDS`, `kanjiStampIdForChar`,
  the `NATIVE_STAMP_IDS` union + `nativeStampIdForChar`; `stampIdForGlyph`
  now resolves through the native union; kanji ink widths measured by the
  same ruler (Latin metrics untouched — GLYPH_MAX_W stays letters-only).
- `app/src/poets/fieldForm.js` — gate + deal + door moved from the kana set
  to the native union (above); comments carry the #1998 reasoning, including
  why the flag/marker keep their slice-1 names.
- `app/src/panels/assetPoolLogic.mjs`, `app/src/data/chapters.js`
  (CHAPTER_UNDEALT), `app/src/state/rollPool.mjs` (NEVER_DEALT),
  `app/src/curator/dice.js` (dealCast chokepoint), `app/src/gl/liveResolve.mjs`
  (live pool), `studio/render.mjs` (stills pool) — each surface's poem-only
  exclusion extended from the kana set to the native union, by id, on its
  existing pattern.
- `app/src/poets/fieldKana.selfcheck.mjs` — two honest re-pins with #1998
  causes in place (below).
- `app/src/poets/fieldKanji.selfcheck.mjs` (new) + `app/selfcheck.manifest`
  — the charset/contract suite for the set, registered in the manifest on
  the fieldKana pattern: the pack is exactly the curated list both
  directions; every stamp rasterizes with real ink under the bake's pinned
  font (the #1970 condition, verified green with `FONTCONFIG_FILE=/dev/null`
  too); the deal lands mixed for every Teijo piece and Latin without the
  script call; the gate/door law above; panel records 313; chapter/KINETIC
  never-dealt; the dice 600-cast seeded census identical with and without
  the pack present.

Finisher's fixes (what the audit found missing — all in the tail of the
catalogue growth, none in the slice's design):

1. **`app/src/data/assetStyle.js`** — the raw tag `kanji` had no canonical
   home, so `assetStyle.selfcheck` failed (`typ_j_natsu: raw tag "kanji" has
   a canonical home`). Fix follows slice 1's exact precedent: `'kanji'`
   joins the raw list of the canonical `letter` term, beside
   `'kana', 'hiragana', 'katakana'` (vocabulary stays 32 terms).
2. **`app/src/data/voiceDeck.js`** — the one real leak. A family voice's
   wardrobe is a seeded draw (`familyPool`) over style/category candidates;
   the kanji stamps (geometric, letter-tagged) entered the swiss family's
   candidate list and re-drew every wardrobe — zurich's draw landed on
   eight poem-only stamps and the voice resolved zero marks
   (`voiceDeck.selfcheck`: "zurich: renders marks"; the suite passes on
   clean base). Fix: the draw's candidates exclude the kanji pack by id, as
   on every other dealing surface, which also keeps every voice's seeded
   draw bit-identical to the pre-pack deck. The kana stamps' presence among
   the candidates is slice-1 status quo and is deliberately untouched —
   removing them would re-draw every wardrobe, a behaviour change of its
   own. Noted hazard for a future slice: zurich's base wardrobe is already
   7/8 poem-only kana filler and renders on a single letter stamp (typ_W);
   the family draw has carried this latent risk since slice 1.
3. **`app/src/data/chapters.selfcheck.mjs`** — re-pin: the library-size
   assertion 476 → 602, its message extended (313 + 163 kana + 126 kanji,
   CHAPTER_UNDEALT over all of them). The suite's
...[truncated 6151 chars]