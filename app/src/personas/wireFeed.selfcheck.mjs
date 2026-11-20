// node src/personas/wireFeed.selfcheck.mjs
// #2390 (Persona Kernel P10) — the Wire's pure core: the parser (RSS 2.0, RSS 1.0, Atom; hostile input), the
// normalizer and dedupe, the shelf, the strict item check, and the selection a persona reads inside Mind's window.
// EVERY CAP IS PINNED AS A LITERAL here, never derived from the constant under test (a prior QA caught a selfcheck that
// computed its bound from the very constant it checked): the constants are asserted equal to the numbers written below.
import assert from 'node:assert/strict';
import {
  WIRE_MAX_FEED_CHARS,
  WIRE_PARSE_MAX_ITEMS,
  WIRE_ITEMS_PER_FEED,
  WIRE_SHELF_MAX,
  WIRE_FEEDS_MAX,
  WIRE_TITLE_MAX,
  WIRE_SUMMARY_MAX,
  WIRE_LINK_MAX,
  WIRE_FIELD_RAW_MAX,
  WIRE_ASK_MAX_ITEMS,
  WIRE_ASK_MAX_TOKENS,
  parseFeed,
  textOfField,
  normalizeItems,
  mergeShelf,
  cleanItem,
  checkWireItems,
  cleanFeed,
  cleanFeeds,
  cleanLink,
  cleanDate,
  cleanText,
  decodeEntities,
  canonicalLink,
  fnv1a,
  selectWireItems,
  withWireItems,
} from './wireFeed.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const tokens = (s) => Math.ceil(s.length / 4); // the window's estimator, written out (4 characters a token)

// ── the caps, as literals ────────────────────────────────────────────────────────────────────────────────
ok('the caps are the numbers written here (literal pins)', () => {
  assert.equal(WIRE_MAX_FEED_CHARS, 262144);
  assert.equal(WIRE_PARSE_MAX_ITEMS, 40);
  assert.equal(WIRE_ITEMS_PER_FEED, 10);
  assert.equal(WIRE_SHELF_MAX, 48);
  assert.equal(WIRE_FEEDS_MAX, 16);
  assert.equal(WIRE_TITLE_MAX, 160);
  assert.equal(WIRE_SUMMARY_MAX, 280);
  assert.equal(WIRE_LINK_MAX, 300);
  assert.equal(WIRE_FIELD_RAW_MAX, 8192);
  assert.equal(WIRE_ASK_MAX_ITEMS, 3);
  assert.equal(WIRE_ASK_MAX_TOKENS, 300);
});

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────────
const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel><title>Fixture Design</title><link>https://example.com/</link>
<item>
  <title>Type &amp; Grid: a <![CDATA[CDATA &amp; title]]></title>
  <link>https://example.com/a?utm_source=x</link>
  <description><![CDATA[<p>A <b>bold</b> summary &amp; more.</p><img src=x onerror=alert(1)>]]></description>
  <content:encoded><![CDATA[<p>THE FULL ARTICLE BODY SHOULD NEVER BE KEPT</p>]]></content:encoded>
  <pubDate>Thu, 19 Nov 2026 09:00:00 GMT</pubDate>
</item>
<item>
  <title>Second&#8217;s &#x2014; item</title>
  <link>https://example.com/b/</link>
  <description>Escaped &lt;em&gt;markup&lt;/em&gt; here</description>
  <dc:date>2026-11-17T10:00:00Z</dc:date>
</item>
<item><title>No link here</title><description>dropped</description></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Fixture</title>
<entry>
  <title type="html"><![CDATA[Atom <i>entry</i> one]]></title>
  <link rel="self" href="https://example.org/self.xml"/>
  <link rel="replies" href="https://example.org/replies"/>
  <link rel="alternate" type="text/html" href="https://example.org/posts/one?a=1&amp;b=2"/>
  <id>tag:example.org,2026:1</id>
  <published>2026-11-16T08:00:00Z</published>
  <summary type="text">Short summary of one.</summary>
</entry>
<entry>
  <title>Atom two</title>
  <link href="https://example.org/posts/two"/>
  <updated>2026-11-10T08:00:00+01:00</updated>
  <content type="html">&lt;p&gt;Content only, no summary.&lt;/p&gt;</content>
</entry>
</feed>`;

const RDF = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
<channel><title>R</title></channel>
<item><title>RDF item</title><link>https://example.net/rdf-1</link><description>old style</description></item>
</rdf:RDF>`;

ok('RSS 2.0: titles, links, summaries, dates — text only, CDATA unwrapped, entities decoded, full text never kept', () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 2, 'the item with no link is dropped');
  assert.deepEqual(items[0], {
    title: 'Type & Grid: a CDATA & title',
    summary: 'A bold summary & more.',
    link: 'https://example.com/a?utm_source=x',
    date: '2026-11-19',
  });
  assert.deepEqual(items[1], {
    title: 'Second’s — item',
    summary: 'Escaped markup here',
    link: 'https://example.com/b/',
    date: '2026-11-17',
  });
  assert.ok(!JSON.stringify(items).includes('FULL ARTICLE'), 'content:encoded is never read as the summary when a description exists');
});

ok('Atom: the alternate link (not self / replies), summary else content, published else updated, query entities decoded', () => {
  const items = parseFeed(ATOM);
  assert.deepEqual(items, [
    { title: 'Atom entry one', summary: 'Short summary of one.', link: 'https://example.org/posts/one?a=1&b=2', date: '2026-11-16' },
    { title: 'Atom two', summary: 'Content only, no summary.', link: 'https://example.org/posts/two', date: '2026-11-10' },
  ]);
});

ok('RSS 1.0 (RDF) parses', () => {
  assert.deepEqual(parseFeed(RDF), [{ title: 'RDF item', summary: 'old style', link: 'https://example.net/rdf-1', date: null }]);
});

ok('not a feed = null, never a throw: HTML, a challenge page, JSON, empty, undefined, a number, binary', () => {
  assert.equal(parseFeed('<!doctype html><html><head></head><body><rss></rss></body></html>'), null);
  assert.equal(parseFeed('<html><body>Just a moment...</body></html>'), null);
  assert.equal(parseFeed('{"items":[{"title":"x"}]}'), null);
  assert.equal(parseFeed(''), null);
  assert.equal(parseFeed(undefined), null);
  assert.equal(parseFeed(42), null);
  assert.equal(parseFeed('\u0000\u0001\u0002 not xml'), null);
  assert.deepEqual(parseFeed('<rss><channel></channel></rss>'), []);
});

// ── hostile input ────────────────────────────────────────────────────────────────────────────────────────
const itemXml = (title, desc, link = 'https://e.com/x') =>
  `<rss><channel><item><title>${title}</title><link>${link}</link><description>${desc}</description></item></channel></rss>`;
const only = (xml) => {
  const r = parseFeed(xml);
  assert.ok(Array.isArray(r) && r.length === 1, `one item from ${xml.slice(0, 80)}`);
  return r[0];
};
const textOnly = (s) => assert.ok(!/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩﻿]/.test(s), `text only: ${JSON.stringify(s)}`);

ok('hostile: script, style, iframe and svg elements are removed WITH their content — escaped, in CDATA, or double-encoded', () => {
  const a = only(itemXml('t', '<![CDATA[Before<script>alert(1)</script>After<style>body{x:y}</style>End]]>'));
  assert.equal(a.summary, 'Before After End');
  const b = only(itemXml('&lt;script&gt;alert(2)&lt;/script&gt;Hello', 'x'));
  assert.equal(b.title, 'Hello');
  const c = only(itemXml('t', '&amp;lt;script&amp;gt;alert(3)&amp;lt;/script&amp;gt;Safe'));
  textOnly(c.summary);
  assert.ok(!c.summary.includes('alert(3)') || !/<|>/.test(c.summary));
  const d = only(itemXml('t', '<![CDATA[<iframe src="https://evil.example"></iframe><svg onload=alert(4)><circle/></svg>ok]]>'));
  assert.equal(d.summary, 'ok');
  const e = only(itemXml('t', '<![CDATA[head <script>never closed alert(5) and then more text]]>'));
  assert.equal(e.summary, 'head');
  for (const x of [a, b, c, d, e]) textOnly(`${x.title}${x.summary}`);
});

ok('hostile: event handlers, comments, unterminated tags, stray angle brackets — nothing markup-shaped survives', () => {
  const a = only(itemXml('t', '<![CDATA[<a href="javascript:alert(1)" onclick="x()">click</a> <!-- hidden <b>x</b> --> tail <img src=x onerror=alert(1)]]>'));
  assert.equal(a.summary, 'click tail');
  const b = only(itemXml('1 < 2 > 0 <<b>>', 'a<b'));
  textOnly(`${b.title}${b.summary}`);
  const c = only(itemXml('t', '<![CDATA[<p>unterminated <b onmouseover=alert(1) ]]>'));
  textOnly(c.summary);
  assert.ok(!c.summary.includes('onmouseover'));
});

ok('hostile: nested and unterminated CDATA, a lone ]]>, CDATA inside the title — still plain text', () => {
  const a = only(itemXml('<![CDATA[outer <![CDATA[inner]]> tail ]]>', 'x'));
  assert.equal(a.title, 'outer inner tail');
  // an unterminated CDATA swallows the rest of the feed, so that item is never whole and is dropped; as a field cut short it is text
  assert.deepEqual(parseFeed(itemXml('ok', '<![CDATA[never terminated <b>bold</b> text')), []);
  assert.equal(textOfField('<![CDATA[never terminated <b>bold</b> text', 100), 'never terminated bold text');
  const c = only(itemXml('a ]]> b', 'x'));
  assert.equal(c.title, 'a b');
  // a tag NAMED inside a CDATA body is never taken for the item's own element
  const d = parseFeed(
    '<rss><channel><item><description><![CDATA[<title>FAKE</title><link>https://fake.example/</link>]]></description><title>Real</title><link>https://real.example/r</link></item></channel></rss>',
  );
  assert.equal(d.length, 1);
  assert.equal(d[0].title, 'Real');
  assert.equal(d[0].link, 'https://real.example/r');
});

ok('hostile: entities — numeric bombs, surrogates, NUL, out-of-range, unknown names; a DOCTYPE entity is never expanded', () => {
  const a = only(itemXml('x&#0;y&#1;z&#xD800;w&#x110000;v&#99999999;u&bogus;t', 's'));
  assert.equal(a.title, 'x y z w v&#99999999;u&bogus;t', 'an 8-digit reference is not an entity: left as inert text');
  assert.equal(decodeEntities('&#65;&#x42;&amp;&lt;&nbsp;&notanentity;'), 'AB&< &notanentity;');
  const xxe = `<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;"><!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<rss><channel><item><title>&lol2; &xxe; Real</title><link>https://e.com/x</link></item></channel></rss>`;
  const r = only(xxe);
  assert.equal(r.title, '&lol2; &xxe; Real', 'unknown entities are left as literal text — nothing is expanded, nothing is read');
});

ok('hostile: control characters, bidi overrides, zero-width marks, lone surrogates are removed', () => {
  const dirty = 'a\u0000b‮c⁦d​e﻿f\u007fg\ud800h\udc00i\u0085j';
  assert.equal(cleanText(dirty), 'a bcdef ghi j');
  assert.equal(cleanText('  many \n\t  spaces   here  '), 'many spaces here');
  assert.equal(cleanText('<<>>'), '');
  assert.equal(cleanText('😀 ok'), '😀 ok');
  const idem = cleanText(dirty);
  assert.equal(cleanText(idem), idem, 'idempotent');
  textOnly(only(itemXml(dirty, dirty)).title);
});

ok('hostile: links — javascript:, data:, file:, credentials, spaces, quotes, over-long, relative are all refused', () => {
  for (const bad of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://example.com/x',
    'https://user:pass@example.com/x',
    'https://example.com/a b',
    'https://example.com/"><script>',
    '/relative/path',
    'example.com/no-scheme',
    '//example.com/x',
    `https://example.com/${'a'.repeat(300)}`,
    '',
    '   ',
  ])
    assert.equal(cleanLink(bad), null, bad);
  assert.equal(cleanLink('https://example.com/ok?a=1&amp;b=2'), 'https://example.com/ok?a=1&b=2');
  assert.equal(cleanLink(`https://example.com/${'a'.repeat(280)}`).length, 300, 'exactly 300 is the longest link kept');
  assert.equal(cleanLink(`https://example.com/${'a'.repeat(281)}`), null, '301 is refused, never truncated');
  assert.equal(parseFeed(itemXml('t', 's', 'javascript:alert(1)')).length, 0, 'an item with a refused link is dropped');
});

ok('hostile: size — a huge feed is read to 262,144 characters and 40 items; a huge field is cut to its caps', () => {
  const big = [];
  for (let i = 0; i < 500; i++) big.push(`<item><title>Item ${i}</title><link>https://e.com/${i}</link><description>${'word '.repeat(50)}</description></item>`);
  const feed = `<rss><channel>${big.join('')}</channel></rss>`;
  assert.ok(feed.length > 262144 / 2);
  const items = parseFeed(feed);
  assert.equal(items.length, 40, 'at most 40 items scanned');
  const pad = '<rss><channel>' + ' '.repeat(262144) + '<item><title>Late</title><link>https://e.com/late</link></item></channel></rss>';
  assert.deepEqual(parseFeed(pad), [], 'an item past 262,144 characters is never read');
  const edge = '<rss><channel>' + ' '.repeat(262144 - 14 - 200) + '<item><title>Edge</title><link>https://e.com/edge</link></item></channel></rss>';
  assert.equal(parseFeed(edge).length, 1, 'an item inside the first 262,144 characters is read');
  const longTitle = 'T'.repeat(5000);
  const longSummary = 'word '.repeat(30000);
  const one = only(itemXml(longTitle, longSummary));
  assert.ok(one.title.length <= 160, `title ${one.title.length}`);
  assert.ok(one.summary.length <= 280, `summary ${one.summary.length}`);
  assert.ok(one.title.endsWith('…') && one.summary.endsWith('…'));
  const t0 = Date.now();
  parseFeed(`<rss><channel><item><title>x</title><link>https://e.com/x</link><description>${'<'.repeat(200000)}</description></item></channel></rss>`);
  parseFeed(`<rss><channel>${'<item>'.repeat(20000)}</channel></rss>`);
  parseFeed(`<rss>${'<![CDATA['.repeat(20000)}`);
  assert.ok(Date.now() - t0 < 5000, 'pathological input parses in bounded time');
});

ok('hostile: malformed XML — unclosed items and tags, mismatched tags, truncated mid-item — parse what is whole, never throw', () => {
  const r = parseFeed('<rss><channel><item><title>One</title><link>https://e.com/1</link></item><item><title>Two</title><link>https://e.com/2</link>');
  assert.deepEqual(r.map((i) => i.title), ['One'], 'the truncated last item is dropped');
  const s = parseFeed('<rss><channel><item><title>A</b></title><link>https://e.com/a</link></i></item></channel></rss>');
  assert.equal(s.length, 1);
  assert.doesNotThrow(() => parseFeed('<rss><item><title><link></item>'));
  assert.doesNotThrow(() => parseFeed('<<<<<<<rss>>>>>>>'));
});

// ── dates, links, ids ────────────────────────────────────────────────────────────────────────────────────
ok('dates: RFC 822 and ISO 8601 read by hand to YYYY-MM-DD; nonsense is null; no clock is read', () => {
  assert.equal(cleanDate('Thu, 19 Nov 2026 09:00:00 GMT'), '2026-11-19');
  assert.equal(cleanDate('2026-02-28T10:00:00Z'), '2026-02-28');
  assert.equal(cleanDate('2024-02-29'), '2024-02-29');
  assert.equal(cleanDate('2026-02-29'), null);
  assert.equal(cleanDate('31 Apr 2026'), null);
  assert.equal(cleanDate('5 March 2026'), '2026-03-05');
  assert.equal(cleanDate('1850-01-01'), null);
  assert.equal(cleanDate('2101-01-01'), null);
  assert.equal(cleanDate('yesterday'), null);
  assert.equal(cleanDate(''), null);
  assert.equal(cleanDate(undefined), null);
});

ok('ids and canonical links: stable hash, tracking and fragment and trailing slash do not make a different page', () => {
  assert.equal(fnv1a('hello'), '4f9f2cab');
  assert.equal(fnv1a(''), '811c9dc5');
  assert.equal(canonicalLink('https://Example.com/a/?utm_source=x&fbclid=1#frag'), 'https://example.com/a');
  assert.equal(canonicalLink('https://example.com/a?id=2&utm_medium=y'), 'https://example.com/a?id=2');
  assert.notEqual(canonicalLink('https://example.com/a?id=2'), canonicalLink('https://example.com/a?id=3'));
});

// ── normalize, dedupe, shelf ─────────────────────────────────────────────────────────────────────────────
const raw = (i, over = {}) => ({ title: `Title ${i}`, summary: `Summary ${i}`, link: `https://e.com/p${i}`, date: `2026-11-${String(10 + (i % 15)).padStart(2, '0')}`, ...over });

ok('normalize: ids, the feed tag, newest first, dedupe by canonical link, the newest 10 kept', () => {
  const parsed = [raw(1), raw(2), raw(1, { link: 'https://e.com/p1/?utm_source=z#x', title: 'Dup of 1' })];
  const items = normalizeItems('feed-a', parsed);
  assert.equal(items.length, 2, 'the same page twice is one item');
  assert.deepEqual(Object.keys(items[0]), ['id', 'feed', 'title', 'summary', 'link', 'date']);
  assert.match(items[0].id, /^feed-a:[0-9a-f]{8}$/);
  assert.equal(items[0].feed, 'feed-a');
  assert.ok(items[0].date >= items[1].date, 'newest first');
  const many = Array.from({ length: 30 }, (_, i) => raw(i));
  assert.equal(normalizeItems('feed-a', many).length, 10);
  assert.deepEqual(normalizeItems('Bad Id!', many), []);
  assert.deepEqual(normalizeItems('feed-a', null), []);
  assert.deepEqual(normalizeItems('feed-a', [null, 3, { title: 'x' }, { link: 'https://e.com/y' }]), []);
});

ok('normalize is deterministic: the same feed gives the same items and ids, twice', () => {
  const a = normalizeItems('x', parseFeed(RSS));
  const b = normalizeItems('x', parseFeed(RSS));
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

ok('the shelf: a round across feeds, deduped across feeds, capped at 48, ordered newest first, bad items refused', () => {
  const byFeed = {};
  for (const f of ['aa', 'bb', 'cc', 'dd', 'ee', 'ff']) byFeed[f] = normalizeItems(f, Array.from({ length: 10 }, (_, i) => raw(i, { link: `https://${f}.com/p${i}` })));
  const shelf = mergeShelf(byFeed);
  assert.equal(shelf.length, 48, '6 feeds x 10 items = 60, the shelf holds 48');
  for (const f of ['aa', 'bb', 'cc', 'dd', 'ee', 'ff']) assert.ok(shelf.filter((i) => i.feed === f).length >= 8, `a round across feeds: ${f} is not crowded out`);
  for (let i = 1; i < shelf.length; i++) assert.ok(shelf[i - 1].date >= shelf[i].date, 'newest first');
  assert.equal(new Set(shelf.map((i) => i.id)).size, 48);
  const same = { aa: normalizeItems('aa', [raw(1)]), bb: normalizeItems('bb', [raw(1)]) };
  assert.equal(mergeShelf(same).length, 1, 'the same page from two feeds is one item');
  assert.equal(mergeShelf({ aa: [{ id: 'aa:zzzzzzzz', feed: 'aa' }] }).length, 0, 'an item that is not clean never lands');
  assert.deepEqual(mergeShelf(null), []);
  assert.deepEqual(mergeShelf({}), []);
});

ok('cleanItem / checkWireItems fail closed: exact keys, clean text, a real link, a real date, unique ids, at most 48', () => {
  const good = normalizeItems('aa', [raw(1)])[0];
  assert.deepEqual(cleanItem(good), good);
  assert.notEqual(cleanItem(good), good, 'a copy');
  const bad = [
    { ...good, extra: 1 },
    { ...good, title: '' },
    { ...good, title: 'has <b>markup</b>' },
    { ...good, title: 'x'.repeat(161) },
    { ...good, summary: 'y'.repeat(281) },
    { ...good, summary: 'two  spaces' },
    { ...good, link: 'javascript:alert(1)' },
    { ...good, link: 'https://e.com/a b' },
    { ...good, date: '2026-13-01' },
    { ...good, date: 5 },
    { ...good, id: 'bb:0badf00d' },
    { ...good, id: 'nope' },
    { ...good, feed: 'Bad Feed' },
    { ...good, summary: undefined },
    null,
    'str',
    [],
  ];
  for (const b of bad) assert.equal(cleanItem(b), null, JSON.stringify(b));
  assert.equal(cleanItem({ ...good, date: null }).date, null);
  assert.deepEqual(checkWireItems([good]), [good]);
  assert.equal(checkWireItems([good, good]), null, 'duplicate ids');
  assert.equal(checkWireItems([good, { ...good, title: '' }]), null, 'one bad item refuses the list');
  assert.equal(checkWireItems('x'), null);
  const items49 = Array.from({ length: 49 }, (_, i) => normalizeItems('aa', [raw(i)])[0]);
  assert.equal(checkWireItems(items49), null, '49 is over the cap of 48');
  assert.equal(checkWireItems(items49.slice(0, 48)).length, 48);
  assert.deepEqual(checkWireItems([]), []);
});

ok('feeds: https only, a public host name, a slug id; no credentials, ports, IPs, localhost; at most 16; duplicates dropped', () => {
  assert.deepEqual(cleanFeed({ id: 'ok-feed', url: 'https://example.com/feed/' }), { id: 'ok-feed', url: 'https://example.com/feed/' });
  for (const bad of [
    { id: 'a', url: 'http://example.com/feed' },
    { id: 'a', url: 'https://localhost/feed' },
    { id: 'a', url: 'https://printer.local/feed' },
    { id: 'a', url: 'https://127.0.0.1/feed' },
    { id: 'a', url: 'https://[::1]/feed' },
    { id: 'a', url: 'https://10.0.0.5/feed' },
    { id: 'a', url: 'https://intranet/feed' },
    { id: 'a', url: 'https://u:p@example.com/feed' },
    { id: 'a', url: 'https://example.com:8443/feed' },
    { id: 'A', url: 'https://example.com/feed' },
    { id: '', url: 'https://example.com/feed' },
    { id: 'a', url: 'javascript:alert(1)' },
    { id: 'a', url: 5 },
    null,
  ])
    assert.equal(cleanFeed(bad), null, JSON.stringify(bad));
  const list = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, url: `https://example.com/${i}` }));
  assert.equal(cleanFeeds(list).length, 16);
  assert.equal(cleanFeeds([list[0], list[0]]).length, 1);
  assert.deepEqual(cleanFeeds(null), []);
});

// ── selection ────────────────────────────────────────────────────────────────────────────────────────────
const shelfOf = (count, feeds = ['aa', 'bb', 'cc'], long = false) => {
  const byFeed = {};
  for (const f of feeds)
    byFeed[f] = normalizeItems(
      f,
      Array.from({ length: count }, (_, i) => raw(i, { link: `https://${f}.com/p${i}`, title: `${f} headline ${i}`, summary: long ? 'long summary words '.repeat(14) : `${f} short ${i}` })),
    );
  return mergeShelf(byFeed);
};

ok('selection: at most 3 items, at most 300 tokens of them, whole items only, [{ cite, text }], no links', () => {
  const shelf = shelfOf(10);
  const out = selectWireItems(shelf, { persona: 'lois' });
  assert.equal(out.length, 3);
  assert.deepEqual(Object.keys(out[0]), ['cite', 'text']);
  assert.match(out[0].cite, /^wire\/(aa|bb|cc) · 2026-11-\d\d$/);
  assert.ok(!JSON.stringify(out).includes('http'), 'the model reads text, never a link');
  const long = selectWireItems(shelfOf(10, ['aa', 'bb', 'cc', 'dd'], true), { persona: 'lois' });
  const spent = long.reduce((s, i) => s + tokens(i.text) + tokens(i.cite), 0);
  assert.ok(spent <= 300, `wire tokens ${spent} <= 300`);
  assert.ok(long.length >= 1 && long.length <= 3);
  for (const i of long) assert.ok(i.text.length <= 160 + 3 + 280, 'whole items: a headline, a dash, a capped summary');
});

ok('selection fits inside Mind’s 4,096-token window: the base context (Archive snippets included) is spent first', () => {
  const shelf = shelfOf(10);
  const cost = (o) => o.reduce((s, i) => s + tokens(i.text) + tokens(i.cite), 0);
  const roomy = selectWireItems(shelf, { persona: 'davis', baseContext: { palette: 'bone' } });
  assert.equal(roomy.length, 3);
  // a base context of exactly 4,096 tokens (16,384 characters of JSON) leaves no room: nothing rides
  const fill = (tok) => ({ pad: 'x'.repeat(tok * 4 - '{"pad":""}'.length) });
  assert.equal(tokens(JSON.stringify(fill(4096))), 4096);
  assert.deepEqual(selectWireItems(shelf, { persona: 'davis', baseContext: fill(4096) }), []);
  assert.deepEqual(selectWireItems(shelf, { persona: 'davis', baseContext: fill(4090) }).filter((i) => tokens(i.text) + tokens(i.cite) > 6), [], 'only what fits in 6 tokens');
  for (const room of [4096 - 4000, 4096 - 4050, 4096 - 4085]) {
    const base = fill(4096 - room);
    const out = selectWireItems(shelf, { persona: 'queen', baseContext: base });
    assert.ok(tokens(JSON.stringify(base)) + cost(out) <= 4096, `base + wire <= 4096 with ${room} tokens of room`);
  }
  assert.ok(cost(roomy) <= 300);
});

ok('selection is a pure function: the same inputs give the same items; personas start in different places; empty = []', () => {
  const shelf = shelfOf(10);
  const a = selectWireItems(shelf, { persona: 'lois', baseContext: { k: 1 } });
  const b = selectWireItems(shelf, { persona: 'lois', baseContext: { k: 1 } });
  assert.deepEqual(a, b);
  const people = ['lois', 'davis', 'queen', 'te', 'taste'].map((p) => JSON.stringify(selectWireItems(shelf, { persona: p })));
  assert.ok(new Set(people).size >= 2, 'the trio do not all read the same headlines');
  assert.deepEqual(selectWireItems([], { persona: 'lois' }), []);
  assert.deepEqual(selectWireItems(null, { persona: 'lois' }), []);
  assert.deepEqual(selectWireItems([{ bad: true }], { persona: 'lois' }), [], 'a shelf that is not clean reads as empty');
  assert.deepEqual(selectWireItems(shelf, { persona: 'lois', limit: 0 }), []);
  assert.equal(selectWireItems(shelf, { persona: 'lois', limit: 1 }).length, 1);
});

ok('withWireItems: with items a copy carrying them under wire; without, THE SAME OBJECT (byte-identical input)', () => {
  const ctx = { palette: 'bone', archive: [{ cite: 'c', text: 't' }] };
  assert.equal(withWireItems(ctx, []), ctx);
  assert.equal(withWireItems(ctx, null), ctx);
  assert.equal(withWireItems(ctx, undefined), ctx);
  const items = [{ cite: 'wire/aa · 2026-11-19', text: 'headline', extra: 'dropped' }];
  const w = withWireItems(ctx, items);
  assert.notEqual(w, ctx);
  assert.deepEqual(w, { palette: 'bone', archive: [{ cite: 'c', text: 't' }], wire: [{ cite: 'wire/aa · 2026-11-19', text: 'headline' }] });
  assert.equal(ctx.wire, undefined, 'the original is untouched');
});

console.log(`wireFeed.selfcheck: ${n} checks passed`);
