# The Wire — proposed starter feeds (P10, #2390)

**Status: PROPOSAL for Matt to keep or cut. The shipped list is EMPTY** (`app/src/personas/wireFeeds.json`), so the Wire fetches nothing until a list is approved and copied into that file. Nothing here is wired.

Checked 2026-11-20 with a plain HTTP client that says what it is (no browser disguise). "Live" means: HTTP 200, a real RSS or Atom document that the Wire's parser reads, and an item dated within the last two weeks (Identity Designed is slower, see its row). "robots" means the feed path is allowed for a generic crawler by the site's `robots.txt`. The Wire keeps only headline, link, a short summary (280 characters at most) and the day — never article text.

## Proposed (10)

| Name                     | Feed URL                                          | Covers                                         | Live                                               | Terms note                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CreativeApplications.Net | `https://www.creativeapplications.net/feed/atom/` | creative coding, installation, critical making | yes (newest 2026-11-17)                            | robots allows. Their terms page returned 403 to us, so not read. Use the `/feed/atom/` path: plain `/feed/` answers HTTP 200 with an HTML page to our client. Only 5 items in the Atom feed.                                                                               |
| Colossal                 | `https://www.thisiscolossal.com/feed/`            | art, illustration, design, photography         | yes (2026-11-19)                                   | robots allows. Terms page not found at the obvious URL, so not read.                                                                                                                                                                                                       |
| Design Observer          | `https://designobserver.com/feed/`                | design criticism and culture                   | yes (2026-11-19)                                   | robots allows. Terms page returned 403, not read.                                                                                                                                                                                                                          |
| Creative Boom            | `https://www.creativeboom.com/feed/`              | illustration, graphic design, branding         | yes (2026-11-19)                                   | robots allows. Terms page not found at the obvious URL, not read.                                                                                                                                                                                                          |
| Core77                   | `https://www.core77.com/blog/rss.xml`             | industrial and product design                  | yes (2026-11-18; dated by its `a10:updated` field) | robots allows. Terms page read: no mention of feeds or scraping.                                                                                                                                                                                                           |
| Design Milk              | `https://design-milk.com/feed/`                   | product, interiors, art, tech design           | yes (2026-11-19)                                   | robots allows. Terms page read: no mention of feeds or scraping.                                                                                                                                                                                                           |
| Identity Designed        | `https://identitydesigned.com/feed/`              | brand identity case studies                    | yes, but slow (newest 2026-11-05)                  | robots allows. Terms page not found, not read.                                                                                                                                                                                                                             |
| Motionographer           | `https://motionographer.com/feed/`                | motion design (close to Matt's own work)       | yes (2026-11-19)                                   | robots allows. Terms page not found, not read. The feed is not well-formed XML (a strict parser rejects it); the Wire's lenient parser reads it.                                                                                                                           |
| Fast Company Design      | `https://www.fastcompany.com/co-design/rss`       | design and business                            | yes (2026-11-19)                                   | robots allows. Terms page returned 403, not read. The only feed here that sends a CORS header (`*`), so the only one a browser can fetch directly today (see the CORS note).                                                                                               |
| PRINT Magazine           | `https://www.printmag.com/feed/`                  | graphic design, typography                     | yes (2026-11-19)                                   | robots allows. Their terms forbid scraping or automated access "except as permitted by robots.txt or our written authorization"; robots.txt allows this path. Ask them if you want it in writing. The feed is large (about 870 KB): the Wire reads only the first 256 KiB. |

## From the issue's original six: none could be confirmed, so none are proposed

| Name               | What we tried                                            | Result                                                                                                                                                               |
| ------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| It's Nice That     | `https://www.itsnicethat.com/articles.rss`               | Live, valid RSS, newest 2026-11-19. **Its own `robots.txt` disallows that path for every crawler**, so we do not propose it. Ask them for permission if you want it. |
| Fonts In Use       | `/feed`, `/uses.atom`, `/uses.rss`, `/rss`, `/index.rss` | All answered HTTP 500 with an HTML page. Only a comments feed (`/comments.rss`) worked, and that is not the site's articles. **Could not verify a feed.**            |
| AIGA Eye on Design | `eyeondesign.aiga.org/feed`, `/rss`, `/rss.xml`          | HTTP 404. The `aiga.org` side answers with a bot challenge page. **Could not verify a feed.**                                                                        |
| Brand New          | `underconsideration.com/brandnew/feed`, `/atom.xml`      | `/feed` returns a WordPress error (HTTP 500). `/atom.xml` is a valid feed whose newest item is from 2020 (dead). **No live feed found.**                             |

## Also found and dropped

- **Art of the Title** — its feed redirects to a FeedBurner address that now serves an unrelated spam feed (Vietnamese footwear ads). Dropped; a good example of why the Wire treats feeds as hostile.
- **Typographica** — live but the newest item is from June 2025.
- **Dezeen** — live, but the feed is 2.5 MB. Possible later; the Wire reads 256 KiB of it.
- **Creative Review** — HTTP 403 to our client. **Eye Magazine** — feed URL returned 404.

## What we could not verify, plainly

- **Terms of use** for most sites: several terms pages returned 403 or were not at the obvious URL, so the only terms we actually read are Core77's and Design Milk's (nothing about feeds) and PRINT's (scraping allowed only as robots.txt permits). For the rest, all we can say is that `robots.txt` allows the feed path. Syndication feeds are published for readers and aggregators, and the Wire keeps only headline, link, a 280-character excerpt and the day, but a feed being public is not a licence. Keep or cut with that in mind.
- **Each feed from a browser:** none of the ten except Fast Company sends CORS headers (checked with a plain GET). See below.

## CORS — the catch Matt should know about

A browser (and the Tauri webview) may only read a cross-origin response when the server says so with a CORS header. Of the feeds above, only Fast Company Design sends one. So with the shelf fetching from the app as it is today, **most of these feeds will quietly fail** (the Wire handles that silently and backs off, as ruled, but they will not fill the shelf). Reading them all needs a fetch that does not go through the browser's cross-origin rule, for example a small Tauri-side fetch command (the app has no HTTP client in its Rust side today), or a tiny relay. That is a separate, bigger decision and is not in this PR. Until then the practical way to see the Wire work is the Fast Company feed (or any feed that sends CORS).

## Trying a list on your machine (DEV only, never saved)

In the browser console before the app loads, or in a DEV build:

```js
globalThis.__KC_WIRE = true;
globalThis.__KC_WIRE_FEEDS = [
  { id: "fastco", url: "https://www.fastcompany.com/co-design/rss" },
];
```

Then reload. With the switch on and a non-empty list the Wire fetches once at launch (in an idle moment) and afterwards only when you have been idle for 20 seconds and 30 minutes have passed. `globalThis.__KC_WIRE_PROBE.state()` and `.items()` show what it holds; `.refreshNow()` forces one round. Nothing appears on screen.
