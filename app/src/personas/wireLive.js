// personas/wireLive.js — #2390 (Persona Kernel P10): the Wire, wired live. Fetch only; nothing renders.
//
// OPT-IN, default OFF: `globalThis.__KC_WIRE === true` (a DEV flag like the band's; per machine, read at launch, never
// saved in a project) AND a non-empty feed list. The shipped list is EMPTY (wireFeeds.json) until Matt approves a
// proposal, so with the flag on and nothing approved there is still no fetch and no timer; a machine can try feeds
// with the DEV override `globalThis.__KC_WIRE_FEEDS = [{ id, url }]` (also never saved). Off, start() does nothing:
// no subscription, no timer, no network, no storage read — the instrument is byte-identical.
//
// WHEN IT FETCHES (Matt's ruling, #2390): once at launch (in an idle moment, after boot), then only in idle moments,
// NEVER polling. There is no interval and no timer of ours shorter than 5 s: the idle moments are the artist's own
// quiet — the activity heartbeat (an existing bus event) reporting idleMs ≥ WIRE_IDLE_MS — and even then a round runs
// at most once per WIRE_REFRESH_MS, with exponential backoff per feed on failure. Never per frame. Never during a take
// (recording or playing): a round that lands while a take runs waits and is applied afterwards.
//
// WHAT IT SENDS: a plain GET, no cookies, no referrer, no custom headers beyond a safelisted Accept — nothing about
// the artist. WHAT IT KEEPS: plain text (headline, short summary, link, day), capped, in memory (and a validated copy
// in localStorage, per machine). Failures are QUIET: CORS refusals (most design feeds send no CORS headers — a browser
// fetch to them fails by design), offline, timeouts, bad bytes, HTTP errors: no log, no retry storm, no throw; the feed
// backs off and the last shelf stands. The adapter never blocks boot or a frame (it awaits nothing on either path).
// Wall-clock is used for scheduling ONLY (the heartbeat's own stamp); what is recorded is the items, never the time.
import { on, Events } from '../composition/eventBus.js';
import { isRecordingPerformance } from '../gl/performanceCapture.mjs';
import { isPlaybackActive } from '../gl/playback.mjs';
import shipped from './wireFeeds.json' with { type: 'json' };
import {
  WIRE_MAX_FEED_CHARS,
  checkWireItems,
  cleanFeeds,
  mergeShelf,
  normalizeItems,
  parseFeed,
  selectWireItems,
} from './wireFeed.mjs';
import { clearWireShelf, createWireRecorder, getWireItems, holdWireShelf, setWireShelf } from './wireRecord.mjs';

/** An idle moment: the artist has touched nothing for this long (ms). */
export const WIRE_IDLE_MS = 20000;
/** A feed is fetched at most this often (ms): 30 minutes. */
export const WIRE_REFRESH_MS = 1800000;
/** A failing feed backs off exponentially up to this (ms): 24 hours. */
export const WIRE_BACKOFF_MAX_MS = 86400000;
/** One fetch gives up after this long (ms). */
export const WIRE_FETCH_TIMEOUT_MS = 10000;
/** Where a platform without requestIdleCallback runs the launch round (ms after boot). */
export const WIRE_LAUNCH_FALLBACK_MS = 5000;
export const WIRE_CACHE_KEY = 'kc.wire.shelf/1';

/** Is the Wire switched on (per machine, off by default)? */
export function wireOn() {
  try {
    return globalThis.__KC_WIRE === true;
  } catch {
    return false;
  }
}

/** The feeds now: the DEV override if one is set, else the shipped list (empty until Matt approves one). */
export function wireFeedList() {
  try {
    const o = globalThis.__KC_WIRE_FEEDS;
    return cleanFeeds(Array.isArray(o) ? o : shipped.feeds);
  } catch {
    return [];
  }
}

/** Milliseconds a failing feed waits: REFRESH × 2^failures, capped. */
export function backoffMs(failures) {
  return Math.min(WIRE_REFRESH_MS * 2 ** Math.max(0, Math.min(failures, 16)), WIRE_BACKOFF_MAX_MS);
}

/** Read a response's text, at most `cap` characters, stopping the download there when the body streams. */
async function readCapped(res, cap) {
  const reader = res && res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
  if (!reader || typeof TextDecoder !== 'function') return String(await res.text()).slice(0, cap);
  const dec = new TextDecoder('utf-8', { fatal: false });
  let out = '';
  for (let i = 0; i < 4096 && out.length < cap; i++) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  try {
    await reader.cancel();
  } catch {
    /* already closed */
  }
  return out.slice(0, cap);
}

/**
 * The driver. Every seam is injected so the selfchecks never touch the network, a clock or a timer: fetchImpl,
 * getFeeds, enabled, busy (a take records or plays), storage, now, scheduleIdle (run a function in an idle moment),
 * setTimeoutFn (the fetch timeout), subscribe (the heartbeat: fn => unsubscribe).
 */
export function createWireDriver({
  fetchImpl = (...a) => globalThis.fetch(...a),
  getFeeds = wireFeedList,
  enabled = () => wireOn() && getFeeds().length > 0,
  busy = () => isRecordingPerformance() || isPlaybackActive(),
  storage = typeof globalThis !== 'undefined' ? globalThis.localStorage : null,
  now = () => Date.now(),
  scheduleIdle = defaultScheduleIdle,
  setTimeoutFn = (...a) => globalThis.setTimeout(...a),
  clearTimeoutFn = (...a) => globalThis.clearTimeout(...a),
  subscribe = (fn) => on(Events.ACTIVITY_HEARTBEAT, fn),
} = {}) {
  let started = false;
  let running = false;
  let unsub = null;
  let lastRoundAt = null;
  let pending = null; // a shelf fetched while a take ran, applied once it is over
  const byFeed = {}; // feedId -> items (the last good fetch; a failing feed keeps its stale items)
  const health = {}; // feedId -> { failures, nextAt, ok }

  const apply = (shelf) => {
    if (!setWireShelf(shelf)) return false;
    try {
      if (storage) storage.setItem(WIRE_CACHE_KEY, JSON.stringify({ v: 1, items: shelf }));
    } catch {
      /* a cache that cannot persist is still a shelf for this session */
    }
    return true;
  };
  const flush = () => {
    if (pending && !busy()) {
      const s = pending;
      pending = null;
      apply(s);
    }
  };

  /** One feed: items, or null (any failure — quiet). */
  const fetchOne = async (feed) => {
    let timer = null;
    try {
      const timeout = new Promise((_, rej) => {
        timer = setTimeoutFn(() => rej(new Error('timeout')), WIRE_FETCH_TIMEOUT_MS);
      });
      const text = await Promise.race([
        (async () => {
          const res = await fetchImpl(feed.url, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            redirect: 'follow',
            referrerPolicy: 'no-referrer',
            headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8' },
          });
          if (!res || !res.ok) return null;
          return readCapped(res, WIRE_MAX_FEED_CHARS);
        })(),
        timeout,
      ]);
      const parsed = text === null ? null : parseFeed(text);
      return parsed ? normalizeItems(feed.id, parsed) : null;
    } catch {
      return null;
    } finally {
      if (timer !== null) clearTimeoutFn(timer);
    }
  };

  /** One round over the feeds that are due, one at a time. `force` ignores the backoff (the DEV probe). */
  const round = async ({ force = false } = {}) => {
    if (running || !enabled() || busy()) return { ran: false };
    running = true;
    const t = now();
    let ok = 0;
    let failed = 0;
    try {
      const feeds = getFeeds();
      for (const id of Object.keys(byFeed)) if (!feeds.some((f) => f.id === id)) delete byFeed[id];
      for (const feed of feeds) {
        const h = health[feed.id] || (health[feed.id] = { failures: 0, nextAt: 0, ok: null });
        if (!force && t < h.nextAt) continue;
        if (busy() || !enabled()) break; // a take began, or the switch went off, mid-round
        const items = await fetchOne(feed);
        if (items && items.length) {
          byFeed[feed.id] = items;
          h.failures = 0;
          h.nextAt = t + WIRE_REFRESH_MS;
          h.ok = true;
          ok++;
        } else {
          h.failures += 1;
          h.nextAt = t + backoffMs(h.failures);
          h.ok = false;
          failed++;
        }
      }
      lastRoundAt = t;
      if (ok) {
        const shelf = mergeShelf(byFeed);
        if (busy()) pending = shelf;
        else apply(shelf);
      }
    } finally {
      running = false;
    }
    return { ran: true, ok, failed };
  };

  const onHeartbeat = (e) => {
    try {
      if (!started) return;
      flush();
      if (running || !enabled() || busy()) return;
      if (!e || !Number.isFinite(e.idleMs) || e.idleMs < WIRE_IDLE_MS) return; // not an idle moment
      const t = Number.isFinite(e.ts) ? e.ts : now();
      if (lastRoundAt !== null && t - lastRoundAt < WIRE_REFRESH_MS) return; // at most one round per refresh window
      scheduleIdle(() => {
        round().catch(() => {});
      });
    } catch {
      /* the Wire never breaks a heartbeat */
    }
  };

  return {
    /** Launch: load the cached shelf, listen for idle moments, run the first round in an idle moment. False when off. */
    start() {
      if (started) return true;
      if (!enabled()) return false;
      started = true;
      try {
        const raw = storage ? storage.getItem(WIRE_CACHE_KEY) : null;
        const cached = raw ? checkWireItems(JSON.parse(raw).items) : null;
        if (cached && cached.length) setWireShelf(cached);
      } catch {
        /* a bad cache is no cache */
      }
      unsub = subscribe(onHeartbeat);
      scheduleIdle(() => {
        round().catch(() => {});
      });
      return true;
    },
    stop() {
      started = false;
      if (typeof unsub === 'function') unsub();
      unsub = null;
      pending = null;
      clearWireShelf();
    },
    round,
    /** DEV view: what the Wire holds and how each feed is doing (no times — scheduling only). */
    state: () => ({
      started,
      running,
      feeds: getFeeds().map((f) => ({ id: f.id, ok: health[f.id] ? health[f.id].ok : null, failures: health[f.id] ? health[f.id].failures : 0 })),
      items: getWireItems().length,
    }),
  };
}

function defaultScheduleIdle(fn) {
  if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(fn, { timeout: 10000 });
  else globalThis.setTimeout(fn, WIRE_LAUNCH_FALLBACK_MS);
}

let singleton = null;
/** The app's one driver (created on first use — importing this module does nothing). */
export function ensureWireDriver() {
  if (!singleton) singleton = createWireDriver();
  return singleton;
}

/** Launch the Wire (App boot). With the switch off, or no feed approved, this does nothing at all. */
export function startWire() {
  if (!wireOn() || wireFeedList().length === 0) return false;
  const d = ensureWireDriver();
  const started = d.start();
  if (started) {
    // the DEV console probe — exists only with the switch on; reads and (on purpose, from the console) refreshes
    globalThis.__KC_WIRE_PROBE = { state: d.state, items: getWireItems, refreshNow: () => d.round({ force: true }) };
  }
  return started;
}

/** Stop the Wire (App unmount). */
export function stopWire() {
  if (singleton) singleton.stop();
}

/** What Mind's asks read: { itemsFor(persona, context) } — [] whenever the Wire is off or the shelf is empty. */
export const wireReader = {
  itemsFor(persona, context) {
    if (!wireOn()) return [];
    return selectWireItems(getWireItems(), { persona, baseContext: context });
  },
};

/**
 * The take's `wire` section factory (registered in PerformanceButton like the band's): it DECLINES to start (null) while
 * the Wire is off, so a take made with the Wire off has no section and is byte-identical to before. While a take
 * records, the shelf is held — nothing lands under it.
 */
export function wireSection() {
  if (!wireOn()) return null;
  const rec = createWireRecorder();
  holdWireShelf(true);
  return {
    stop() {
      holdWireShelf(false);
      return rec.finish();
    },
  };
}
