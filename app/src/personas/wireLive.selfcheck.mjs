// node src/personas/wireLive.selfcheck.mjs
// #2390 (Persona Kernel P10) — the Wire, live: off by default, an empty feed list fetches nothing, launch/idle
// scheduling (no polling), injected fetch that fails quietly, the take's `wire` section (fail-closed, replay without the
// network), the Mind context, the queenView slot (read-only), and NOTHING RENDERS (a static sweep of every file that
// touches the Wire). Every number is pinned as a literal; no test touches the network, a real timer or the clock.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  WIRE_IDLE_MS,
  WIRE_REFRESH_MS,
  WIRE_BACKOFF_MAX_MS,
  WIRE_FETCH_TIMEOUT_MS,
  WIRE_LAUNCH_FALLBACK_MS,
  WIRE_CACHE_KEY,
  wireOn,
  wireFeedList,
  backoffMs,
  createWireDriver,
  startWire,
  stopWire,
  wireReader,
  wireSection,
} from './wireLive.js';
import { normalizeItems, parseFeed, mergeShelf } from './wireFeed.mjs';
import {
  WIRE_RECORD_VERSION,
  getWireItems,
  getWireView,
  holdWireShelf,
  wireHeld,
  setWireShelf,
  clearWireShelf,
  createWireRecorder,
  checkWireRecord,
  replayWireFrame,
  endWireReplay,
} from './wireRecord.mjs';
import { queenView } from './queenView.mjs';
import { buildContext } from '../curator/mindContext.js';
import { neutralReply } from '../curator/mindContract.js';
import { startMind } from '../curator/mindLive.js';
import { Events, emit, on } from '../composition/eventBus.js';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flush = () => new Promise((r) => setImmediate(r));

const rssFor = (tag, count, base = 'https://a.example') =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>${tag}</title>` +
  Array.from(
    { length: count },
    (_, i) =>
      `<item><title>${tag} headline ${i}</title><link>${base}/${tag}/${i}</link><description>${tag} summary ${i}</description><pubDate>Thu, ${String(19 - i).padStart(2, '0')} Nov 2026 09:00:00 GMT</pubDate></item>`,
  ).join('') +
  `</channel></rss>`;
const okRes = (text) => ({ ok: true, status: 200, text: async () => text });
const FEEDS = [
  { id: 'aa', url: 'https://a.example/feed' },
  { id: 'bb', url: 'https://b.example/feed' },
];

const reset = () => {
  clearWireShelf();
  endWireReplay();
  holdWireShelf(false);
  delete globalThis.__KC_WIRE;
  delete globalThis.__KC_WIRE_FEEDS;
  delete globalThis.__KC_WIRE_PROBE;
};

/** A driver on spies: nothing real is touched. */
const rig = (over = {}) => {
  const calls = { fetch: [], idle: [], timers: [], subs: 0, unsubs: 0 };
  const store = new Map();
  let hb = null;
  const driver = createWireDriver({
    fetchImpl: async (url, init) => {
      calls.fetch.push({ url, init });
      return okRes(rssFor(url.includes('a.example') ? 'aa' : 'bb', 5, url.slice(0, url.indexOf('/feed'))));
    },
    getFeeds: () => FEEDS,
    enabled: () => true,
    busy: () => false,
    storage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
    now: () => 1_000_000,
    scheduleIdle: (fn) => calls.idle.push(fn),
    setTimeoutFn: (fn, ms) => {
      calls.timers.push(ms);
      return calls.timers.length;
    },
    clearTimeoutFn: () => {},
    subscribe: (fn) => {
      calls.subs++;
      hb = fn;
      return () => calls.unsubs++;
    },
    ...over,
  });
  return { driver, calls, store, beat: (e) => hb && hb(e) };
};

// ── the numbers, as literals ─────────────────────────────────────────────────────────────────────────────
await ok('the schedule is the numbers written here: idle 20 s, one round per 30 min, backoff to 24 h, 10 s timeout, 5 s fallback', () => {
  assert.equal(WIRE_IDLE_MS, 20000);
  assert.equal(WIRE_REFRESH_MS, 1800000);
  assert.equal(WIRE_BACKOFF_MAX_MS, 86400000);
  assert.equal(WIRE_FETCH_TIMEOUT_MS, 10000);
  assert.equal(WIRE_LAUNCH_FALLBACK_MS, 5000);
  assert.equal(WIRE_CACHE_KEY, 'kc.wire.shelf/1');
  assert.equal(WIRE_RECORD_VERSION, 1);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 40].map(backoffMs), [1800000, 3600000, 7200000, 14400000, 28800000, 57600000, 86400000, 86400000]);
});

// ── off by default ───────────────────────────────────────────────────────────────────────────────────────
await ok('OFF BY DEFAULT: no flag = wireOn false, the shipped feed list is empty, startWire does nothing', () => {
  reset();
  assert.equal(wireOn(), false);
  assert.deepEqual(JSON.parse(readFileSync(path.join(here, 'wireFeeds.json'), 'utf8')).feeds, [], 'the shipped feed list is EMPTY until Matt approves one');
  assert.deepEqual(wireFeedList(), []);
  assert.equal(startWire(), false);
  assert.equal(globalThis.__KC_WIRE_PROBE, undefined);
  assert.deepEqual(wireReader.itemsFor('lois', {}), []);
  assert.equal(wireSection(), null, 'the take section declines');
  assert.equal(queenView({}).wire.built, false);
});

await ok('the switch is exactly `=== true`: truthy values do not turn it on', () => {
  for (const v of [1, 'true', {}, [], 'yes']) {
    globalThis.__KC_WIRE = v;
    assert.equal(wireOn(), false, String(v));
  }
  globalThis.__KC_WIRE = true;
  assert.equal(wireOn(), true);
  reset();
});

await ok('flag ON but the feed list EMPTY (the shipped state) = no fetch, no timer, no subscription, no storage read', async () => {
  reset();
  globalThis.__KC_WIRE = true;
  let touched = 0;
  const r = rig({
    getFeeds: () => [],
    enabled: undefined, // the real rule: flag && feeds
    fetchImpl: async () => {
      touched++;
    },
    storage: { getItem: () => (touched++, null), setItem: () => touched++ },
  });
  assert.equal(r.driver.start(), false);
  assert.equal(startWire(), false, 'the app entry point agrees');
  assert.equal(r.calls.idle.length + r.calls.subs + r.calls.timers.length + touched, 0);
  assert.deepEqual(await r.driver.round(), { ran: false });
  assert.deepEqual(wireReader.itemsFor('lois', {}), []);
  reset();
});

await ok('feed override: a DEV list is cleaned (https, public host) and a list of junk is an empty list = nothing fetched', () => {
  reset();
  globalThis.__KC_WIRE_FEEDS = [{ id: 'ok', url: 'https://example.com/feed' }, { id: 'bad', url: 'http://localhost/x' }, 7];
  assert.deepEqual(wireFeedList(), [{ id: 'ok', url: 'https://example.com/feed' }]);
  globalThis.__KC_WIRE_FEEDS = [{ id: 'bad', url: 'file:///etc/passwd' }];
  assert.deepEqual(wireFeedList(), []);
  reset();
});

// ── launch and idle: no polling ──────────────────────────────────────────────────────────────────────────
await ok('LAUNCH: start() schedules ONE idle round and fetches nothing yet; the round fetches each feed once, in turn', async () => {
  reset();
  const r = rig();
  assert.equal(r.driver.start(), true);
  assert.equal(r.calls.fetch.length, 0, 'boot is never blocked: nothing is fetched until the idle moment');
  assert.equal(r.calls.idle.length, 1);
  assert.equal(r.calls.subs, 1);
  r.calls.idle[0]();
  await flush();
  await flush();
  assert.deepEqual(r.calls.fetch.map((c) => c.url), ['https://a.example/feed', 'https://b.example/feed']);
  assert.equal(getWireItems().length, 10, '5 + 5 items on the shelf');
  assert.equal(r.driver.state().items, 10);
  reset();
});

await ok('the request sends nothing about the artist: GET, no cookies, no referrer, only a safelisted Accept', async () => {
  reset();
  const r = rig();
  r.driver.start();
  r.calls.idle[0]();
  await flush();
  await flush();
  for (const { init } of r.calls.fetch) {
    assert.equal(init.method, 'GET');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.referrerPolicy, 'no-referrer');
    assert.equal(init.mode, 'cors');
    assert.deepEqual(Object.keys(init.headers), ['Accept']);
    assert.equal(init.body, undefined);
  }
  reset();
});

await ok('NO POLLING: no setInterval anywhere; a timer is only the 10 s fetch timeout (and the 5 s launch fallback), never shorter', async () => {
  const live = stripComments(read('personas/wireLive.js'));
  assert.doesNotMatch(live, /setInterval/);
  assert.doesNotMatch(live, /requestAnimationFrame/);
  const timeouts = [...live.matchAll(/setTimeout\s*\(/g)].length;
  assert.equal(timeouts, 2, 'the fetch timeout (injected) and the launch fallback — nothing else sets a timer');
  reset();
  const r = rig();
  r.driver.start();
  r.calls.idle[0]();
  await flush();
  await flush();
  assert.equal(r.calls.timers.length, 2, 'one timeout per fetch');
  for (const ms of r.calls.timers) assert.ok(ms >= 10000, `no timer under 10 s (${ms})`);
  const ctrl = stripComments(read('personas/wireFeed.mjs')) + stripComments(read('personas/wireRecord.mjs'));
  assert.doesNotMatch(ctrl, /setInterval|setTimeout|requestIdleCallback/, 'the pure modules schedule nothing');
  reset();
});

await ok('IDLE MOMENTS: a heartbeat below 20 s idle schedules nothing; at 20 s a round is scheduled once per 30 minutes', async () => {
  reset();
  const r = rig();
  r.driver.start();
  r.calls.idle[0](); // the launch round, at t = 1,000,000
  await flush();
  await flush();
  const base = 1_000_000;
  r.calls.idle.length = 0;
  r.beat({ ts: base + 1, idleMs: 19999 });
  assert.equal(r.calls.idle.length, 0, 'the artist is active: not an idle moment');
  r.beat({ ts: base + 25_000, idleMs: 20000 });
  assert.equal(r.calls.idle.length, 0, 'idle, but the last round was 25 s ago: the refresh window has not opened');
  r.beat({ ts: base + 1_799_999, idleMs: 60000 });
  assert.equal(r.calls.idle.length, 0, 'one millisecond short of 30 minutes');
  r.beat({ ts: base + 1_800_000, idleMs: 60000 });
  assert.equal(r.calls.idle.length, 1, 'idle and past 30 minutes: one round is scheduled (in an idle callback)');
  for (const bad of [null, {}, { ts: base + 9e9 }, { ts: base + 9e9, idleMs: 'x' }, { ts: base + 9e9, idleMs: NaN }]) {
    const before = r.calls.idle.length;
    r.beat(bad);
    assert.equal(r.calls.idle.length, before, `a malformed heartbeat is ignored: ${JSON.stringify(bad)}`);
  }
  reset();
});

await ok('never during a take: busy = no round; a round that finishes under a take waits, and lands after it', async () => {
  reset();
  let busy = false;
  const r = rig({ busy: () => busy });
  r.driver.start();
  busy = true;
  r.calls.idle[0]();
  await flush();
  assert.equal(r.calls.fetch.length, 0, 'a take is running: the launch round does not fetch');
  busy = false;
  // a take starts MID-round: the fetch resolves while busy, the shelf waits
  let release;
  const r2 = rig({
    busy: () => busy,
    fetchImpl: () =>
      new Promise((res) => {
        release = () => res(okRes(rssFor('aa', 3)));
      }),
    getFeeds: () => [FEEDS[0]],
  });
  r2.driver.start();
  r2.calls.idle[0]();
  await flush();
  busy = true;
  release();
  await flush();
  await flush();
  assert.equal(getWireItems().length, 0, 'the shelf did not land under the take');
  busy = false;
  r2.beat({ ts: 5_000_000, idleMs: 0 });
  assert.equal(getWireItems().length, 3, 'it lands when the take is over');
  reset();
});

await ok('a take HOLDS the shelf: setWireShelf is refused while held (belt and braces under the adapter)', () => {
  reset();
  const items = mergeShelf({ aa: normalizeItems('aa', parseFeed(rssFor('aa', 2))) });
  holdWireShelf(true);
  assert.equal(wireHeld(), true);
  assert.equal(setWireShelf(items), false);
  assert.deepEqual(getWireItems(), []);
  holdWireShelf(false);
  assert.equal(setWireShelf(items), true);
  assert.equal(getWireItems().length, 2);
  assert.equal(setWireShelf([{ not: 'clean' }]), false, 'an unclean shelf never lands');
  assert.equal(getWireItems().length, 2, 'and the standing shelf is untouched');
  reset();
});

// ── failures are quiet ───────────────────────────────────────────────────────────────────────────────────
await ok('FAILURES ARE QUIET: CORS (TypeError), offline, 500, HTML page, garbage, timeout — no throw, no log, the shelf stands, the feed backs off', async () => {
  reset();
  const noisy = {};
  for (const k of ['log', 'warn', 'error', 'info', 'debug']) {
    noisy[k] = console[k];
    console[k] = () => assert.fail(`console.${k} was called`);
  }
  try {
    const modes = [
      () => Promise.reject(new TypeError('Failed to fetch')), // CORS refusal and offline look the same in a browser
      () => Promise.reject(new DOMException('aborted', 'AbortError')),
      async () => ({ ok: false, status: 500, text: async () => 'oops' }),
      async () => ({ ok: true, status: 200, text: async () => '<!doctype html><html>Just a moment...</html>' }),
      async () => ({ ok: true, status: 200, text: async () => '\u0000\u0001garbage' }),
      async () => ({ ok: true, status: 200, text: async () => { throw new Error('body failed'); } }),
      async () => null,
      async () => ({ ok: true, status: 200, text: async () => rssFor('aa', 0) }),
      () => new Promise(() => {}), // never answers: the timeout
    ];
    for (const [i, mode] of modes.entries()) {
      reset();
      const r = rig({
        getFeeds: () => [FEEDS[0]],
        fetchImpl: mode,
        // the timeout fires at once in this rig
        setTimeoutFn: (fn, ms) => {
          assert.equal(ms, 10000);
          if (i === modes.length - 1) fn();
          return 1;
        },
      });
      r.driver.start();
      r.calls.idle[0]();
      await flush();
      await flush();
      await flush();
      assert.equal(getWireItems().length, 0, `mode ${i}: no items`);
      assert.deepEqual(r.driver.state().feeds, [{ id: 'aa', ok: false, failures: 1 }], `mode ${i}: the feed is marked failing`);
    }
  } finally {
    Object.assign(console, noisy);
  }
  reset();
});

await ok('NO RETRY STORM: a failing feed is not asked again until its backoff passes; one failure never hits a healthy feed', async () => {
  reset();
  let t = 1_000_000;
  let aaCalls = 0;
  let bbCalls = 0;
  const r = rig({
    now: () => t,
    fetchImpl: async (url) => {
      if (url.includes('a.example')) {
        aaCalls++;
        throw new TypeError('Failed to fetch');
      }
      bbCalls++;
      return okRes(rssFor('bb', 4));
    },
  });
  r.driver.start();
  r.calls.idle.shift()();
  await flush();
  await flush();
  assert.deepEqual([aaCalls, bbCalls], [1, 1]);
  assert.equal(getWireItems().length, 4, 'the healthy feed still lands');
  // 30 min + 1: bb is due (30 min refresh); aa backed off to 60 min (2^1 x 30)
  t += 1_800_001;
  await r.driver.round();
  assert.deepEqual([aaCalls, bbCalls], [1, 2], 'aa waits out its backoff; bb refreshes');
  t += 1_800_000; // 60 min after the first failure
  await r.driver.round();
  assert.deepEqual([aaCalls, bbCalls], [2, 3], 'aa is tried again after 60 min, once');
  assert.equal(r.driver.state().feeds[0].failures, 2);
  t += 3_600_000;
  await r.driver.round();
  assert.equal(aaCalls, 2, 'the second failure backs off to 2 hours: not 1');
  reset();
});

await ok('a failing feed keeps its last good items (the shelf is stale, not empty); a feed removed from the list leaves the shelf', async () => {
  reset();
  let fail = false;
  let feeds = FEEDS;
  let t = 1_000_000;
  const r = rig({
    now: () => t,
    getFeeds: () => feeds,
    fetchImpl: async (url) => {
      if (fail && url.includes('a.example')) throw new TypeError('x');
      return okRes(rssFor(url.includes('a.example') ? 'aa' : 'bb', 3, url.slice(0, url.indexOf('/feed'))));
    },
  });
  r.driver.start();
  r.calls.idle.shift()();
  await flush();
  await flush();
  assert.equal(getWireItems().length, 6);
  fail = true;
  t += 1_800_001;
  await r.driver.round({ force: true });
  assert.equal(getWireItems().length, 6, 'aa failed: its last items stand');
  feeds = [FEEDS[1]];
  t += 1_800_001;
  await r.driver.round({ force: true });
  assert.deepEqual([...new Set(getWireItems().map((i) => i.feed))], ['bb'], 'aa left the list: its items left the shelf');
  reset();
});

await ok('SIZE CAP: a huge body streams in at most 262,144 characters and the download is cancelled', async () => {
  reset();
  let reads = 0;
  let cancelled = false;
  const chunk = new TextEncoder().encode(`<rss><channel><item><title>x</title><link>https://a.example/x</link></item>${' '.repeat(100000)}`);
  const body = {
    getReader: () => ({
      read: async () => {
        reads++;
        return reads > 1000 ? { done: true } : { done: false, value: chunk };
      },
      cancel: async () => {
        cancelled = true;
      },
    }),
  };
  const r = rig({ getFeeds: () => [FEEDS[0]], fetchImpl: async () => ({ ok: true, status: 200, body, text: async () => assert.fail('text() would read it all') }) });
  r.driver.start();
  r.calls.idle[0]();
  await flush();
  await flush();
  assert.ok(reads <= 4, `read ${reads} chunks of ~100 KB: stopped at the 256 KiB cap`);
  assert.equal(cancelled, true);
  reset();
});

await ok('the cached shelf loads at launch (validated), a poisoned cache is no cache, and what lands is cached', async () => {
  reset();
  const first = rig();
  first.driver.start();
  first.calls.idle[0]();
  await flush();
  await flush();
  const saved = first.store.get('kc.wire.shelf/1');
  assert.ok(saved);
  assert.equal(JSON.parse(saved).items.length, 10);
  reset();
  const again = rig();
  again.store.set('kc.wire.shelf/1', saved);
  again.driver.start();
  assert.equal(getWireItems().length, 10, 'available at once, before any fetch');
  reset();
  for (const poison of ['not json', '{"v":1,"items":[{"title":"<script>"}]}', JSON.stringify({ v: 1, items: JSON.parse(saved).items.map((i, k) => (k ? i : { ...i, link: 'javascript:alert(1)' })) })]) {
    const p = rig();
    p.store.set('kc.wire.shelf/1', poison);
    assert.doesNotThrow(() => p.driver.start());
    assert.equal(getWireItems().length, 0, 'one bad item refuses the whole cache');
    reset();
  }
});

// ── the take ─────────────────────────────────────────────────────────────────────────────────────────────
const shelf = () => mergeShelf({ aa: normalizeItems('aa', parseFeed(rssFor('aa', 3))), bb: normalizeItems('bb', parseFeed(rssFor('bb', 2, 'https://b.example'))) });

await ok('the take section: declines while off; on, it records the shelf in reach and holds the shelf; empty = absent', () => {
  reset();
  assert.equal(wireSection(), null);
  globalThis.__KC_WIRE = true;
  const empty = wireSection();
  assert.equal(wireHeld(), true, 'the shelf is held under a take');
  assert.equal(empty.stop(), undefined, 'nothing in reach = no section');
  assert.equal(wireHeld(), false);
  assert.ok(setWireShelf(shelf()));
  const sec = wireSection();
  const rec = sec.stop();
  assert.equal(rec.version, 1);
  assert.deepEqual(Object.keys(rec), ['version', 'items']);
  assert.equal(rec.items.length, 5);
  assert.deepEqual(rec.items, getWireItems());
  assert.deepEqual(JSON.parse(JSON.stringify(rec)), rec, 'plain JSON, survives a .kcperf round trip');
  assert.equal(createWireRecorder({ getItems: () => [{ junk: 1 }] }).finish(), undefined, 'an unclean shelf records nothing');
  reset();
});

await ok('the take check FAILS CLOSED: version, extra keys, any bad item, duplicates, over-long, wrong shapes', () => {
  reset();
  setWireShelf(shelf());
  const good = createWireRecorder().finish();
  assert.deepEqual(checkWireRecord(good), good);
  assert.notEqual(checkWireRecord(good).items, good.items, 'copied');
  const bad = [
    undefined,
    null,
    [],
    'x',
    {},
    { ...good, version: 2 },
    { ...good, version: '1' },
    { ...good, extra: true },
    { version: 1 },
    { version: 1, items: [] },
    { version: 1, items: 'x' },
    { ...good, items: [...good.items, good.items[0]] },
    { ...good, items: [...good.items, { ...good.items[0], id: 'aa:ffffffff', title: '<b>x</b>' }] },
    { ...good, items: good.items.map((i, k) => (k ? i : { ...i, link: 'javascript:alert(1)' })) },
    { ...good, items: good.items.map((i, k) => (k ? i : { ...i, extra: 1 })) },
    { ...good, items: Array.from({ length: 49 }, (_, i) => ({ ...good.items[0], id: `aa:${String(i).padStart(8, '0')}` })) },
  ];
  for (const b of bad) assert.equal(checkWireRecord(b), null, JSON.stringify(b)?.slice(0, 90));
  reset();
});

await ok('REPLAY NEEDS NO NETWORK: playback reads the take’s items, never the live shelf; an older or malformed take reads an empty shelf', async () => {
  reset();
  const liveItems = shelf();
  setWireShelf(liveItems);
  const take = createWireRecorder().finish();
  // a different machine, a different live shelf — and no network at all
  clearWireShelf();
  setWireShelf(mergeShelf({ zz: normalizeItems('zz', parseFeed(rssFor('zz', 4, 'https://z.example'))) }));
  const original = globalThis.fetch;
  globalThis.fetch = () => assert.fail('replay touched the network');
  try {
    replayWireFrame(take);
    assert.deepEqual(getWireItems(), take.items, 'the take’s items, exactly');
    assert.deepEqual(queenView({}).wire.items, take.items);
    assert.equal(replayWireFrame(take), false, 'per frame it acts once');
    endWireReplay();
    assert.deepEqual(getWireItems().map((i) => i.feed), ['zz', 'zz', 'zz', 'zz'], 'leaving playback reads the live shelf again');
    replayWireFrame(undefined); // a take from before P10 (or made with the Wire off)
    assert.deepEqual(getWireItems(), [], 'no section = an empty shelf, never the live one');
    endWireReplay();
    replayWireFrame({ ...take, items: [{ ...take.items[0], link: 'javascript:alert(1)' }] }); // malformed
    assert.deepEqual(getWireItems(), [], 'a malformed section fails closed to an empty shelf');
    endWireReplay();
  } finally {
    globalThis.fetch = original;
  }
  reset();
});

await ok('same seed + same take = same output: the Mind context and queenView read identically from a take, twice, on different live shelves', () => {
  reset();
  setWireShelf(shelf());
  const take = createWireRecorder().finish();
  const read = () => {
    globalThis.__KC_WIRE = true;
    replayWireFrame(take);
    const out = JSON.stringify({ ctx: wireReader.itemsFor('lois', { palette: 'bone' }), q: queenView({}).wire });
    endWireReplay();
    return out;
  };
  const a = read();
  clearWireShelf();
  setWireShelf(mergeShelf({ zz: normalizeItems('zz', parseFeed(rssFor('zz', 4, 'https://z.example'))) }));
  const b = read();
  assert.equal(a, b);
  reset();
});

// ── the readers ──────────────────────────────────────────────────────────────────────────────────────────
await ok('queenView: the typed empty slot stands with nothing in reach; the items fill it read-only (frozen, plain data)', () => {
  reset();
  assert.deepEqual(queenView({}).wire, { schema: 'kc-wire/0', built: false, items: [] }, 'byte-identical to before P10');
  assert.equal(getWireView(), null);
  setWireShelf(shelf());
  const v = queenView({});
  assert.equal(v.wire.schema, 'kc-wire/1');
  assert.equal(v.wire.built, true);
  assert.equal(v.wire.items.length, 5);
  assert.ok(Object.isFrozen(v.wire) && Object.isFrozen(v.wire.items) && Object.isFrozen(v.wire.items[0]));
  assert.throws(() => {
    'use strict';
    v.wire.items.push({});
  });
  getWireItems()[0].title = 'mutated copy';
  assert.notEqual(queenView({}).wire.items[0].title, 'mutated copy', 'readers get copies: the holder cannot be written through them');
  assert.deepEqual(JSON.parse(JSON.stringify(v.wire)), v.wire);
  reset();
});

const SNAP = { layers: [{ type: 'content' }], enabledAssetCount: 4, paletteId: 'bone', room: { lois: 'VIBE', davis: 'FLOW' }, band: 'normal', keepsCount: 9, bpm: 121.4, audio: 'mic', creatures: 2 };
const driveMind = async (wire) => {
  const captured = [];
  const decisions = [];
  const off = on(Events.MIND_DECISION, (d) => decisions.push(d));
  const model = {
    name: 'apple',
    available: () => true,
    info: () => ({ available: true, model: 'stub' }),
    ask: async (persona, context) => {
      captured.push({ persona, context });
      return neutralReply(persona);
    },
  };
  const stop = startMind({ getSnapshot: () => SNAP, getSeed: () => 4242, model, ...(wire ? { wire } : {}) });
  for (let bar = 1; bar <= 4; bar++) {
    emit(Events.CLOCK_BAR, { bar, bpm: 120 });
    await flush();
    await flush();
  }
  stop();
  off();
  return { captured, decisions };
};

await ok('MIND CONTEXT, Wire off: the reader attached but the switch off hands the model the IDENTICAL contexts and decisions', async () => {
  reset();
  setWireShelf(shelf()); // items exist, but the switch is off
  const plain = await driveMind(null);
  const wired = await driveMind(wireReader);
  assert.ok(plain.captured.length > 0, 'the model was actually asked');
  assert.deepEqual(wired.captured, plain.captured);
  assert.deepEqual(wired.decisions, plain.decisions);
  for (const c of wired.captured) assert.equal(c.context.wire, undefined);
  reset();
});

await ok('MIND CONTEXT, Wire on: only the model-bound copy carries up to 3 cited items; the decisions still land', async () => {
  reset();
  globalThis.__KC_WIRE = true;
  setWireShelf(shelf());
  const { captured, decisions } = await driveMind(wireReader);
  assert.ok(captured.length > 0);
  for (const c of captured) {
    assert.ok(Array.isArray(c.context.wire) && c.context.wire.length >= 1 && c.context.wire.length <= 3);
    for (const w of c.context.wire) {
      assert.deepEqual(Object.keys(w), ['cite', 'text']);
      assert.match(w.cite, /^wire\/(aa|bb) · 2026-11-\d\d$/);
    }
  }
  assert.ok(decisions.length > 0);
  const ctx = buildContext(SNAP);
  assert.equal(ctx.wire, undefined, 'the rules path never sees the Wire: buildContext is untouched');
  reset();
});

await ok('a throwing reader never breaks or colours an ask', async () => {
  reset();
  const plain = await driveMind(null);
  const boom = await driveMind({
    itemsFor() {
      throw new Error('boom');
    },
  });
  assert.deepEqual(boom.captured, plain.captured);
  assert.deepEqual(boom.decisions, plain.decisions);
});

// ── nothing renders ──────────────────────────────────────────────────────────────────────────────────────
const walk = (dir) => {
  const out = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist') continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(js|jsx|mjs)$/.test(e)) out.push(p);
  }
  return out;
};
const WIRE_FILES = ['personas/wireFeed.mjs', 'personas/wireRecord.mjs', 'personas/wireLive.js'];

await ok('NOTHING RENDERS: only the engine side imports the Wire — no component, panel, hook or style file does', () => {
  const allowed = new Set(['App.jsx', 'components/PerformanceButton.jsx', 'curator/mindLive.js', 'personas/queenView.mjs', 'personas/wireLive.js', 'personas/wireRecord.mjs', 'personas/wireFeed.mjs']);
  const importers = [];
  for (const f of walk(SRC)) {
    const rel = path.relative(SRC, f).split(path.sep).join('/');
    if (rel.endsWith('.selfcheck.mjs') || /^personas\/wire(Feed|Record|Live)\./.test(rel)) continue;
    if (/from\s+['"][^'"]*\/wire(Feed|Record|Live)\.(m?js)['"]/.test(read(rel))) importers.push(rel);
  }
  assert.deepEqual(importers.sort(), [...allowed].filter((r) => !/^personas\/wire/.test(r)).sort());
  // and the places that import it only wire plumbing: no JSX is added around it. Not by function name — by what a
  // file imports: every identifier a render-capable file takes from the Wire may appear only on the import line and in
  // plain call/prop positions, never on a line that carries markup, a class, an aria, a title or a visible string.
  const SURFACE = /<[A-Za-z]|className|aria-|\btitle=|\bplaceholder=|\balt=|\blabel=/;
  const ALLOWED_IDS = {
    'App.jsx': ['endWireReplay', 'replayWireFrame', 'startWire', 'stopWire', 'wireReader'],
    'components/PerformanceButton.jsx': ['wireSection'],
  };
  for (const [rel, ids] of Object.entries(ALLOWED_IDS)) {
    const code = stripComments(read(rel));
    const imported = [];
    for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*\/wire(?:Feed|Record|Live)\.m?js['"]/g))
      imported.push(...m[1].split(',').map((x) => x.trim().split(/\s+as\s+/).pop()).filter(Boolean));
    assert.deepEqual(imported.sort(), ids, `${rel}: imports exactly the Wire plumbing it is allowed (a new Wire import fails here)`);
    assert.doesNotMatch(code, /import\s+\*\s+as\s+\w+\s+from\s*['"][^'"]*\/wire(?:Feed|Record|Live)\./, `${rel}: no namespace import of the Wire`);
    for (const line of code.split('\n')) {
      if (/^\s*import\b/.test(line)) continue;
      if (imported.some((id) => new RegExp(`\\b${id}\\b`).test(line))) assert.doesNotMatch(line, SURFACE, `${rel}: Wire plumbing line carries markup: ${line.trim()}`);
      // no string literal or JSX text anywhere in the file names the Wire (a title, aria-label, button, toast...)
      for (const lit of line.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
        if (/^\s*import\b|\bfrom\s*$/.test(line.slice(0, lit.index))) continue;
        assert.doesNotMatch(lit[2], /\bwire\b|design wire/i, `${rel}: a string literal names the Wire: ${line.trim()}`);
      }
      assert.doesNotMatch(line, />[^<>{}\n]*\bwire\b[^<>{}\n]*</i, `${rel}: visible JSX text names the Wire: ${line.trim()}`);
    }
  }
  // no other file — component, panel, hook — so much as names a Wire reader or shelf getter
  const READERS = /\b(getWireItems|getWireView|setWireShelf|holdWireShelf|clearWireShelf|wireReader|wireSection)\b/;
  for (const f of walk(SRC)) {
    const rel = path.relative(SRC, f).split(path.sep).join('/');
    if (rel.endsWith('.selfcheck.mjs') || /^personas\/wire(Feed|Record|Live)\./.test(rel) || rel === 'personas/queenView.mjs' || rel in ALLOWED_IDS) continue;
    assert.doesNotMatch(stripComments(read(rel)), READERS, `${rel}: names a Wire reader`);
  }
});

await ok('NOTHING RENDERS: the Wire files carry no JSX, no DOM, no label, title, aria, tooltip, alert or notification — and no user-visible string', () => {
  for (const f of WIRE_FILES) {
    const code = stripComments(read(f));
    assert.doesNotMatch(code, /\bdocument\b|\bwindow\b|innerHTML|textContent|createElement|querySelector|\.style\b|className/, `${f}: no DOM`);
    assert.doesNotMatch(code, /aria-|tooltip|\btitle=|\blabel\b|\balert\s*\(|\bconfirm\s*\(|Notification|toast|console\./i, `${f}: no surface`);
    assert.doesNotMatch(code, /(^|[=(,:?]\s*)<[A-Z][A-Za-z]*[\s/>]/m, `${f}: no JSX`);
    // every string literal in the Wire's own code is either an engine word (an id, a key, a pattern, a log-free code)
    // or one of the text-cleaning tables: list the literals with a space and a letter, which would read as copy
    const prose = [...code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)]
      .map((m) => m[2])
      .filter((s) => /[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(s) && !/^[a-z/+;=.,*:0-9 -]+$/.test(s) && !/\$\{|^\^|\\/.test(s));
    assert.deepEqual(prose, [], `${f}: a string that reads as copy`);
  }
});

await ok('NOTHING RENDERS: the Wire adds no store state, no project field, no event, no saved key but its own per-machine cache', () => {
  for (const f of WIRE_FILES) {
    const code = stripComments(read(f));
    assert.doesNotMatch(code, /useStore|state\/store|projectDocument|serializeProject|setState|dispatch\s*\(|emit\s*\(/, `${f}: writes no store, project or event`);
  }
  assert.doesNotMatch(read('composition/eventBus.js'), /WIRE/i, 'no Wire event on the bus');
  const keys = [...stripComments(read('personas/wireLive.js')).matchAll(/localStorage|setItem\(([^,]+),/g)].map((m) => m[0]);
  assert.ok(keys.every((k) => k === 'localStorage' || k === 'setItem(WIRE_CACHE_KEY,'), `only the Wire's own cache key is written: ${keys}`);
  const flagsRead = [...stripComments(read('personas/wireLive.js')).matchAll(/__KC_[A-Z_]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(flagsRead)].sort(), ['__KC_WIRE', '__KC_WIRE_FEEDS', '__KC_WIRE_PROBE']);
});

await ok('DETERMINISM: no Math.random, Date, performance.now in the engine paths; the adapter’s one clock is the injected default `now`', () => {
  for (const f of ['personas/wireFeed.mjs', 'personas/wireRecord.mjs']) {
    assert.doesNotMatch(stripComments(read(f)), /Math\.random|\bDate\b|performance\.now|crypto\.getRandomValues/, f);
  }
  const live = stripComments(read('personas/wireLive.js'));
  assert.deepEqual([...live.matchAll(/Date\.[a-zA-Z]+|new Date|Math\.random|performance\.now/g)].map((m) => m[0]), ['Date.now'], 'one clock read: the scheduling `now` default');
  assert.match(live, /now = \(\) => Date\.now\(\)/);
});

await ok('CALLSIGN LAW: no real name on any Wire string; QUEEN and GOVERNOR are never named in a Wire file', () => {
  const names = /\b(Tina|Turner|Bowie|David|Joshua|Davis|George|Lois|Greiman|April|Carson|Ashworth|Queen|Governor)\b/i;
  for (const f of WIRE_FILES) {
    const strings = [...stripComments(read(f)).matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((m) => m[2]);
    for (const s of strings) assert.doesNotMatch(s, names, `${f}: ${s}`);
  }
  const live = stripComments(read('personas/wireLive.js'));
  assert.doesNotMatch(live, /queen|governor/i);
});

await ok('SHARED FILES: the one-writer files are untouched by the Wire', () => {
  for (const f of ['gl/liveLoop.mjs', 'gl/liveResolve.mjs', 'engine/particles.js']) {
    let src = '';
    try {
      src = read(f);
    } catch {
      continue;
    }
    assert.doesNotMatch(src, /wireFeed|wireRecord|wireLive|__KC_WIRE/, f);
  }
});

reset();
stopWire();
console.log(`wireLive.selfcheck: ${n} checks passed`);
