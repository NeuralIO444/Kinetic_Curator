// personas/wireFeed.mjs — #2390 (Persona Kernel P10, spec §3a): the Wire's pure core.
//
// The Wire is an opt-in, read-only design-news shelf the band can read. This module is PURE data plumbing: it turns the
// text of an RSS 2.0 / RSS 1.0 / Atom feed into a short list of plain-text items, merges and caps the shelf, and picks
// what a persona may read inside Mind's token window. It touches no network, no storage, no clock, no die and no
// store (wireLive.js owns every one of those); everything here takes its inputs injected and returns plain data.
//
// Trust boundary (a feed is HOSTILE input — any site, any bytes):
//   - parseFeed never builds a DOM and never runs anything: it scans the text, so there is no HTML execution, no
//     external entity, no DTD, no script. Markup is STRIPPED (script / style / iframe elements go with their content);
//     what is kept is text only: no `<`, no `>`, no control or bidi-override characters, whitespace collapsed.
//   - sizes are capped at every step (the feed text, the items scanned, each field before and after stripping), and a
//     summary is kept SHORT (WIRE_SUMMARY_MAX) — headline, link, short summary, date: never a full-text copy.
//   - a link must parse as http(s) with no credentials; anything else drops the item.
//   - the output of parseFeed is already clean; `cleanItem` / `checkWireItems` re-prove it for anything that comes
//     back from storage or a take file (fail closed: one bad item refuses the whole list).
// Determinism: no Math.random, no Date, no performance.now — an item's id is a hash of its link, a date is the day the
// feed states (parsed by hand, no clock), and selection is a pure function of the shelf, the persona and the context.
import { estimateTokens, MIND_TOKEN_WINDOW } from './personaArchive.mjs';

export const WIRE_ITEM_SCHEMA = 'kc-wire-item/1';
/** A feed's text is read up to this many characters (256 KiB); the rest is ignored. */
export const WIRE_MAX_FEED_CHARS = 262144;
/** At most this many items are scanned in one feed. */
export const WIRE_PARSE_MAX_ITEMS = 40;
/** At most this many items are kept per feed (the newest). */
export const WIRE_ITEMS_PER_FEED = 10;
/** The whole shelf holds at most this many items (a round-robin across feeds, newest first). */
export const WIRE_SHELF_MAX = 48;
/** At most this many feeds are configured. */
export const WIRE_FEEDS_MAX = 16;
/** Field caps (characters, after stripping). A summary is a short excerpt, never the article. */
export const WIRE_TITLE_MAX = 160;
export const WIRE_SUMMARY_MAX = 280;
export const WIRE_LINK_MAX = 300;
/** A field's raw text is looked at only up to this many characters before stripping. */
export const WIRE_FIELD_RAW_MAX = 8192;
/** One persona ask carries at most this many Wire items… */
export const WIRE_ASK_MAX_ITEMS = 3;
/** …and at most this many (estimated) tokens of them, so the Wire never crowds the Archive out of the window. */
export const WIRE_ASK_MAX_TOKENS = 300;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ── text: decode, strip, clean ───────────────────────────────────────────────────────────────────────────────

const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
  middot: '·',
  bull: '•',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
  ntilde: 'ñ',
  ccedil: 'ç',
};

/** Decode the entities a feed uses (numeric and a short named list). Unknown entities are left as they are. */
export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,9});/g, (m, body) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(cp) || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return ' ';
      return String.fromCodePoint(cp);
    }
    return Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : m;
  });
}

/**
 * Text-only: no `<` or `>`, no control characters, no bidi overrides or zero-width marks, no lone surrogates,
 * whitespace collapsed and trimmed. Idempotent (cleanText(cleanText(x)) === cleanText(x)).
 */
export function cleanText(s) {
  const src = String(s ?? '');
  let out = '';
  let lastSpace = true;
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i);
    let piece = null;
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < src.length ? src.charCodeAt(i + 1) : 0;
      if (d >= 0xdc00 && d <= 0xdfff) {
        piece = src.slice(i, i + 2);
        i++;
      } else continue; // a lone high surrogate
    } else if (c >= 0xdc00 && c <= 0xdfff) continue; // a lone low surrogate
    else if (c === 0x3c || c === 0x3e) continue; // < >
    else if (
      c <= 0x20 ||
      c === 0x7f ||
      (c >= 0x80 && c <= 0xa0) ||
      c === 0x2028 ||
      c === 0x2029 ||
      c === 0x3000
    )
      piece = ' ';
    else if ((c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2060 && c <= 0x2069) || c === 0xfeff)
      continue; // zero-width marks, bidi overrides and isolates, BOM
    else piece = src[i];
    if (piece === ' ') {
      if (lastSpace) continue;
      lastSpace = true;
    } else lastSpace = false;
    out += piece;
  }
  return out.endsWith(' ') ? out.slice(0, -1) : out;
}

/** Truncate at a word boundary with '…' (never mid-surrogate). `max` counts UTF-16 units. */
export function clip(text, max) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  let end = max - 1;
  const cut = s.lastIndexOf(' ', end);
  if (cut > max * 0.5) end = cut;
  let head = s.slice(0, end);
  const last = head.charCodeAt(head.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) head = head.slice(0, -1);
  return `${head.replace(/ +$/, '')}…`;
}

const BLOCKED_ELEMENTS = ['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math'];

/** Remove one kind of element together with its content (an unterminated one takes the rest of the text). */
function dropElement(s, name) {
  let out = s;
  let from = 0;
  for (let guard = 0; guard < 64; guard++) {
    const lower = out.toLowerCase();
    let i = lower.indexOf(`<${name}`, from);
    while (i >= 0) {
      const c = lower.charCodeAt(i + 1 + name.length);
      if (c === 62 || c === 32 || c === 47 || c === 9 || c === 10 || c === 13 || Number.isNaN(c)) break;
      i = lower.indexOf(`<${name}`, i + 1);
    }
    if (i < 0) return out;
    const close = lower.indexOf(`</${name}`, i);
    if (close < 0) return out.slice(0, i);
    const gt = lower.indexOf('>', close);
    out = `${out.slice(0, i)} ${gt < 0 ? '' : out.slice(gt + 1)}`;
    from = i;
  }
  return out;
}

/** Strip markup from a text: comments, blocked elements with their content, then every remaining tag. */
export function stripMarkup(s) {
  let t = String(s ?? '');
  for (let guard = 0; guard < 64; guard++) {
    const i = t.indexOf('<!--');
    if (i < 0) break;
    const j = t.indexOf('-->', i + 4);
    t = j < 0 ? t.slice(0, i) : `${t.slice(0, i)} ${t.slice(j + 3)}`;
  }
  for (const name of BLOCKED_ELEMENTS) t = dropElement(t, name);
  t = t.replace(/<[!?/a-zA-Z][^>]*>/g, ' ');
  const open = t.search(/<[!?/a-zA-Z]/); // a tag that never closes takes the rest of the text with it
  return open < 0 ? t : t.slice(0, open);
}

/** Unwrap CDATA sections (their content is literal text), decode the rest. Tolerates nested and unterminated CDATA. */
function unwrap(raw) {
  const src = String(raw ?? '').slice(0, WIRE_FIELD_RAW_MAX);
  let out = '';
  let i = 0;
  for (let guard = 0; guard < 256 && i < src.length; guard++) {
    const a = src.indexOf('<![CDATA[', i);
    if (a < 0) {
      out += decodeEntities(src.slice(i));
      break;
    }
    out += decodeEntities(src.slice(i, a));
    const b = src.indexOf(']]>', a + 9);
    if (b < 0) {
      out += src.slice(a + 9);
      break;
    }
    out += src.slice(a + 9, b);
    i = b + 3;
  }
  return out.split('<![CDATA[').join(' ').split(']]>').join(' ');
}

/** A feed field's raw text as clean plain text, capped at `max` (the one door every title and summary goes through). */
export function textOfField(raw, max) {
  const stripped = stripMarkup(unwrap(raw));
  return clip(cleanText(decodeEntities(stripped)), max);
}

// ── links and dates ──────────────────────────────────────────────────────────────────────────────────────────

/** A link as a clean absolute http(s) URL string with no credentials, or null. */
export function cleanLink(raw) {
  let s = decodeEntities(String(raw ?? '').slice(0, WIRE_LINK_MAX * 2)).trim();
  if (!s || s.length > WIRE_LINK_MAX || /[\u0000- \u007f<>"'`\\]/.test(s)) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password || !u.hostname) return null;
  s = u.href;
  return s.length <= WIRE_LINK_MAX && !/[\u0000- \u007f<>"'`\\]/.test(s) ? s : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS_IN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const dayOk = (y, m, d) => y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= DAYS_IN[m - 1] + (m === 2 && leap(y) ? 1 : 0);
const pad = (n, w) => String(n).padStart(w, '0');

/** A feed's date as 'YYYY-MM-DD' (the day it states; read by hand, no clock), or null. */
export function cleanDate(raw) {
  const s = textOfField(raw, 64);
  let y;
  let m;
  let d;
  let hit = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (hit) {
    y = +hit[1];
    m = +hit[2];
    d = +hit[3];
  } else {
    hit = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/.exec(s);
    if (!hit) return null;
    d = +hit[1];
    m = MONTHS.indexOf(hit[2].toLowerCase()) + 1;
    y = +hit[3];
  }
  return dayOk(y, m, d) ? `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}` : null;
}

/** FNV-1a, 32 bits, as 8 hex digits — the item id's hash (pure; no crypto, no clock). */
export function fnv1a(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The key two links to the same page share: host lower-cased, no fragment, no tracking parameters, no trailing slash. */
export function canonicalLink(link) {
  try {
    const u = new URL(link);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_|ref$)/i.test(k)) u.searchParams.delete(k);
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : '';
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return String(link ?? '');
  }
}

// ── scanning the feed: no DOM, no regex over the whole text ───────────────────────────────────────────────────

/** The feed text with CDATA sections and comments blanked (same length), so a tag search never lands inside them. */
function mask(src) {
  let out = '';
  let i = 0;
  for (let guard = 0; guard < 100000 && i < src.length; guard++) {
    const a = src.indexOf('<![CDATA[', i);
    const c = src.indexOf('<!--', i);
    let start = -1;
    let endMark = '';
    if (a >= 0 && (c < 0 || a < c)) {
      start = a;
      endMark = ']]>';
    } else if (c >= 0) {
      start = c;
      endMark = '-->';
    }
    if (start < 0) {
      out += src.slice(i);
      break;
    }
    out += src.slice(i, start);
    const e = src.indexOf(endMark, start + 4);
    const stop = e < 0 ? src.length : e + endMark.length;
    out += ' '.repeat(stop - start);
    i = stop;
  }
  return out;
}

const BOUNDARY = new Set([62, 32, 47, 9, 10, 13]); // > space / tab lf cr
function openAt(lower, name, from) {
  let i = from;
  for (;;) {
    i = lower.indexOf(`<${name}`, i);
    if (i < 0) return -1;
    if (BOUNDARY.has(lower.charCodeAt(i + 1 + name.length))) return i;
    i += 1;
  }
}

/** The elements called `name` in [from, to): [{ attrs, inner, end }] — inner is the ORIGINAL text. */
function elements(src, lower, name, from, to, max) {
  const out = [];
  let i = from;
  while (out.length < max) {
    const at = openAt(lower, name, i);
    if (at < 0 || at >= to) break;
    const gt = lower.indexOf('>', at);
    if (gt < 0 || gt >= to || gt - at > 2048) break;
    const attrs = src.slice(at + 1 + name.length, gt);
    if (lower.charCodeAt(gt - 1) === 47) {
      out.push({ attrs, inner: '', end: gt + 1 });
      i = gt + 1;
      continue;
    }
    const close = lower.indexOf(`</${name}`, gt);
    if (close < 0 || close >= to) break; // unterminated: a truncated feed's last, partial element is dropped
    out.push({ attrs, inner: src.slice(gt + 1, close), end: close });
    const cgt = lower.indexOf('>', close);
    i = cgt < 0 ? to : cgt + 1;
  }
  return out;
}

/** One attribute's value out of a tag's attribute text, or ''. */
function attrOf(attrs, name) {
  const low = attrs.toLowerCase();
  let i = 0;
  for (let guard = 0; guard < 32; guard++) {
    i = low.indexOf(name, i);
    if (i < 0) return '';
    const before = i === 0 ? 32 : low.charCodeAt(i - 1);
    let j = i + name.length;
    i = j;
    if (before !== 32 && before !== 9 && before !== 10 && before !== 13) continue;
    while (low.charCodeAt(j) === 32) j++;
    if (low[j] !== '=') continue;
    j++;
    while (low.charCodeAt(j) === 32) j++;
    const q = attrs[j];
    if (q === '"' || q === "'") {
      const e = attrs.indexOf(q, j + 1);
      return e < 0 ? '' : attrs.slice(j + 1, e);
    }
    const m = /^[^\s>]+/.exec(attrs.slice(j));
    return m ? m[0] : '';
  }
  return '';
}

function firstElement(src, lower, names, from, to) {
  for (const n of names) {
    const [el] = elements(src, lower, n, from, to, 1);
    if (el) return el;
  }
  return null;
}

/**
 * The first real link of an item: an Atom-style href on a link with rel alternate (or no rel), else a link's text,
 * else a guid that is itself a link. Returns the cleaned URL or null.
 */
function linkOf(src, lower, from, to) {
  const links = elements(src, lower, 'link', from, to, 8);
  for (const l of links) {
    const href = attrOf(l.attrs, 'href');
    if (!href) continue;
    const rel = attrOf(l.attrs, 'rel').toLowerCase();
    if (rel && rel !== 'alternate') continue;
    const u = cleanLink(href);
    if (u) return u;
  }
  for (const l of links) {
    if (attrOf(l.attrs, 'href')) continue;
    const u = cleanLink(textOfField(l.inner, WIRE_LINK_MAX * 2));
    if (u) return u;
  }
  const guid = firstElement(src, lower, ['guid', 'id'], from, to);
  if (guid && attrOf(guid.attrs, 'ispermalink').toLowerCase() !== 'false') return cleanLink(textOfField(guid.inner, WIRE_LINK_MAX * 2));
  return null;
}

/**
 * Parse an RSS 2.0, RSS 1.0 (RDF) or Atom feed's text into raw items [{ title, summary, link, date }] (plain text,
 * not yet capped to a feed's keep count), or null when the text is not a feed (HTML, JSON, empty, a challenge page).
 * Never throws.
 */
export function parseFeed(text) {
  try {
    const src = String(text ?? '').slice(0, WIRE_MAX_FEED_CHARS);
    const lower = mask(src).toLowerCase();
    const root = [openAt(lower, 'rss', 0), openAt(lower, 'feed', 0), openAt(lower, 'rdf:rdf', 0)].filter((i) => i >= 0);
    if (!root.length) return null;
    const html = openAt(lower, 'html', 0);
    if (html >= 0 && html < Math.min(...root)) return null;
    const atom = openAt(lower, 'feed', 0) >= 0 && openAt(lower, 'rss', 0) < 0;
    const tag = atom ? 'entry' : 'item';
    const items = [];
    for (const el of elements(src, lower, tag, 0, src.length, WIRE_PARSE_MAX_ITEMS)) {
      // an element's own range, in the masked text, so a tag named inside a CDATA body is never taken for the item's
      const base = el.end - el.inner.length;
      const mlow = lower.slice(base, el.end);
      const part = el.inner;
      const titleEl = firstElement(part, mlow, ['title'], 0, part.length);
      const sumEl = firstElement(
        part,
        mlow,
        atom ? ['summary', 'content'] : ['description', 'content:encoded', 'summary'],
        0,
        part.length,
      );
      const dateEl = firstElement(
        part,
        mlow,
        atom ? ['published', 'updated'] : ['pubdate', 'dc:date', 'date', 'a10:updated', 'updated'],
        0,
        part.length,
      );
      const title = titleEl ? textOfField(titleEl.inner, WIRE_TITLE_MAX) : '';
      const link = linkOf(part, mlow, 0, part.length);
      if (!title || !link) continue;
      items.push({
        title,
        summary: sumEl ? textOfField(sumEl.inner, WIRE_SUMMARY_MAX) : '',
        link,
        date: dateEl ? cleanDate(dateEl.inner) : null,
      });
    }
    return items;
  } catch {
    return null;
  }
}

// ── feeds, items, the shelf ──────────────────────────────────────────────────────────────────────────────────

const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;
const HOST_PRIVATE = /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i;

/** A configured feed { id, url } as a clean copy, or null: a slug id and an https URL on a public host name. */
export function cleanFeed(f) {
  if (!isObj(f) || typeof f.id !== 'string' || !SLUG.test(f.id) || typeof f.url !== 'string') return null;
  let u;
  try {
    u = new URL(f.url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  if (HOST_PRIVATE.test(u.hostname) || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(':') || !u.hostname.includes('.')) return null;
  if (f.url.length > WIRE_LINK_MAX) return null;
  return { id: f.id, url: u.href };
}

/** A feed list as clean feeds, bad entries and duplicate ids dropped, capped at WIRE_FEEDS_MAX. */
export function cleanFeeds(list) {
  const out = [];
  const seen = new Set();
  for (const f of Array.isArray(list) ? list : []) {
    const c = cleanFeed(f);
    if (c && !seen.has(c.id) && out.length < WIRE_FEEDS_MAX) {
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

const byNewest = (a, b) => {
  if (a.date !== b.date) return a.date === null ? 1 : b.date === null ? -1 : a.date < b.date ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/**
 * One feed's parsed items as shelf items: ids, the feed's tag, deduped by canonical link, newest first, the newest
 * WIRE_ITEMS_PER_FEED kept. Items without a headline or link are already gone (parseFeed).
 */
export function normalizeItems(feedId, parsed) {
  const out = [];
  const seen = new Set();
  if (!SLUG.test(String(feedId)) || !Array.isArray(parsed)) return out;
  for (const p of parsed) {
    if (!isObj(p)) continue;
    const link = cleanLink(p.link);
    const title = cleanText(typeof p.title === 'string' ? p.title : '');
    if (!link || !title) continue;
    const key = canonicalLink(link);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `${feedId}:${fnv1a(key)}`,
      feed: feedId,
      title: clip(title, WIRE_TITLE_MAX),
      summary: clip(cleanText(typeof p.summary === 'string' ? p.summary : ''), WIRE_SUMMARY_MAX),
      link,
      date: typeof p.date === 'string' && cleanDate(p.date) === p.date ? p.date : null,
    });
  }
  return out.sort(byNewest).slice(0, WIRE_ITEMS_PER_FEED);
}

/**
 * The shelf: each feed's newest items, one round at a time across feeds (so one busy feed never fills it), deduped by
 * canonical link across feeds, capped at WIRE_SHELF_MAX, ordered newest first. `byFeed` is { feedId: items[] }.
 */
export function mergeShelf(byFeed) {
  const ids = Object.keys(isObj(byFeed) ? byFeed : {})
    .filter((k) => SLUG.test(k))
    .sort();
  const lists = ids.map((id) => (Array.isArray(byFeed[id]) ? byFeed[id].filter((i) => cleanItem(i)) : []));
  const out = [];
  const seen = new Set();
  for (let round = 0; round < WIRE_ITEMS_PER_FEED && out.length < WIRE_SHELF_MAX; round++) {
    for (const list of lists) {
      const item = list[round];
      if (!item || out.length >= WIRE_SHELF_MAX) continue;
      const key = canonicalLink(item.link);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...item });
    }
  }
  return out.sort(byNewest);
}

const KEYS = ['id', 'feed', 'title', 'summary', 'link', 'date'];
const ITEM_ID = /^[a-z0-9][a-z0-9-]{0,31}:[0-9a-f]{8}$/;

/**
 * A shelf item, proved: exactly the six keys, every field already clean (a stored or recorded item must equal its own
 * clean form), within the caps. Returns a copy or null.
 */
export function cleanItem(o) {
  if (!isObj(o)) return null;
  const keys = Object.keys(o);
  if (keys.length !== KEYS.length || !KEYS.every((k) => keys.includes(k))) return null;
  const { id, feed, title, summary, link, date } = o;
  if (typeof id !== 'string' || !ITEM_ID.test(id) || typeof feed !== 'string' || !SLUG.test(feed) || id.split(':')[0] !== feed) return null;
  if (typeof title !== 'string' || !title || title.length > WIRE_TITLE_MAX || cleanText(title) !== title) return null;
  if (typeof summary !== 'string' || summary.length > WIRE_SUMMARY_MAX || cleanText(summary) !== summary) return null;
  if (typeof link !== 'string' || cleanLink(link) !== link) return null;
  if (date !== null && (typeof date !== 'string' || cleanDate(date) !== date)) return null;
  return { id, feed, title, summary, link, date };
}

/** A list of shelf items, proved whole: at most `max`, every item clean, ids unique — or null (fail closed). */
export function checkWireItems(list, max = WIRE_SHELF_MAX) {
  if (!Array.isArray(list) || list.length > max) return null;
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const c = cleanItem(raw);
    if (!c || seen.has(c.id)) return null;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

// ── selection: what a persona may read ───────────────────────────────────────────────────────────────────────

/** The text an item carries into a persona ask: its headline, then its short summary. */
export function wireItemText(item) {
  return item.summary ? `${item.title} — ${item.summary}` : item.title;
}
/** The citation an item carries: where it came from and the day. Never a link — the model reads text, not URLs. */
export function wireCite(item) {
  return `wire/${item.feed} · ${item.date ?? 'undated'}`;
}

/** Items in rounds across feeds (feed ids sorted, each feed newest first). */
function interleave(shelf) {
  const groups = new Map();
  for (const item of shelf) {
    if (!groups.has(item.feed)) groups.set(item.feed, []);
    groups.get(item.feed).push(item);
  }
  const lists = [...groups.keys()].sort().map((k) => groups.get(k));
  const out = [];
  for (let r = 0; lists.some((l) => r < l.length); r++) for (const l of lists) if (r < l.length) out.push(l[r]);
  return out;
}

/**
 * What one persona may read of the shelf for one ask, inside Mind's window: whole items in a stable order that starts
 * at a place the persona's own id picks (so the trio do not all read the same headline), at most WIRE_ASK_MAX_ITEMS
 * and WIRE_ASK_MAX_TOKENS of them, only what still fits the 4,096-token window after the base context (the Archive's
 * snippets included) is spent. Returns [{ cite, text }] — [] for an empty shelf. A pure function of its inputs.
 */
export function selectWireItems(
  shelf,
  { persona = '', baseContext = null, windowTokens = MIND_TOKEN_WINDOW, limit = WIRE_ASK_MAX_ITEMS, maxTokens = WIRE_ASK_MAX_TOKENS } = {},
) {
  const items = checkWireItems(shelf);
  if (!items || !items.length) return [];
  const ordered = interleave(items);
  const start = parseInt(fnv1a(String(persona)), 16) % ordered.length;
  let spent = estimateTokens(JSON.stringify(baseContext ?? {}));
  let wire = 0;
  const out = [];
  for (let k = 0; k < ordered.length && out.length < limit; k++) {
    const item = ordered[(start + k) % ordered.length];
    const cite = wireCite(item);
    const text = wireItemText(item);
    const cost = estimateTokens(text) + estimateTokens(cite);
    if (wire + cost > maxTokens || spent + cost > windowTokens) continue;
    wire += cost;
    spent += cost;
    out.push({ cite, text });
  }
  return out;
}

/**
 * The ask-bound context: with items, a shallow copy carrying them under `wire`; without, THE SAME OBJECT — so with the
 * Wire off (or the shelf empty) the model sees byte-identical input.
 */
export function withWireItems(context, items) {
  if (!Array.isArray(items) || !items.length) return context;
  return { ...context, wire: items.map((s) => ({ cite: s.cite, text: s.text })) };
}
