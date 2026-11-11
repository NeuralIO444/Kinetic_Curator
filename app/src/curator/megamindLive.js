// megamindLive.js — #1525 MegaMind S1: the live Ollama link driver. Owns what the pure core may not touch:
// fetch, localStorage, the wall clock, and the bus. Dev-panel only — the MEGAMIND tab drives it.
//
// NOTHING is probed on page load or on driver creation: connecting is a user act (plan §1). Creation only
// reads the saved endpoint+model back for the form. On a completed detection the measured capabilities are
// published to the capability registry (composition/capabilityRegistry.mjs) and announced on the bus as
// MEGAMIND_LINK telemetry; on disconnect the registry clears and MegaMind is on rules again, silently —
// no main-UI surface ever announces any of this (the MIND_STATUS doctrine).
import { Events, emit } from '../composition/eventBus.js';
import { setCapabilities } from '../composition/capabilityRegistry.mjs';
import { isTauriRuntime } from '../platform/desktop.mjs';
import {
  DEFAULT_ENDPOINT,
  badgesFor,
  classifyTier,
  detectOs,
  errorCopy,
  fetchShow,
  fetchTags,
  isSafariUa,
  normalizeEndpoint,
  preloadModel,
  runWarmProbe,
} from './megamindLink.mjs';

export const LINK_STORAGE_KEY = 'kc:megamind:link';

const readSaved = (storage) => {
  try {
    const raw = storage ? storage.getItem(LINK_STORAGE_KEY) : null;
    const s = raw ? JSON.parse(raw) : null;
    if (s && typeof s.endpoint === 'string' && typeof s.model === 'string')
      return { endpoint: s.endpoint, model: s.model };
  } catch {
    /* unreadable storage is no storage */
  }
  return null;
};

/**
 * @param fetchImpl  fetch (the real one by default; injected by the selfcheck)
 * @param storage    { getItem, setItem, removeItem } (localStorage by default; absent/throwing = session only)
 * @param now        () => ms, the probe timer (performance.now by default)
 * @param stamp      () => epoch ms for the record (Date.now by default)
 * @param origin     this page's origin, for the OLLAMA_ORIGINS= line
 * @param userAgent  for the Safari gate and the per-OS restart step
 * @param isDesktop  () => bool — the desktop shell is exempt from the Safari gate (it is the supported surface)
 */
export function createLinkDriver({
  fetchImpl = (...a) => globalThis.fetch(...a),
  storage = globalThis.localStorage,
  now = () => performance.now(),
  stamp = () => Date.now(),
  origin = (globalThis.location && globalThis.location.origin) || '',
  userAgent = (globalThis.navigator && globalThis.navigator.userAgent) || '',
  isDesktop = isTauriRuntime,
} = {}) {
  const os = detectOs(`${(globalThis.navigator && globalThis.navigator.platform) || ''} ${userAgent}`);
  const saved0 = readSaved(storage);
  let state = {
    phase: 'idle', // idle | connecting | detecting | connected | error
    endpoint: saved0 ? saved0.endpoint : DEFAULT_ENDPOINT,
    model: null,
    models: [],
    record: null,
    error: null,
    saved: saved0,
  };
  let generation = 0; // a stale async completion must never overwrite a newer user act
  const listeners = new Set();
  const publish = () => {
    for (const fn of listeners) {
      try {
        fn(state);
      } catch {
        /* a listener must not break the link */
      }
    }
  };
  const set = (patch) => {
    state = { ...state, ...patch };
    publish();
  };
  const fail = (gate, ctx = {}) => {
    const copy = errorCopy(gate, { endpoint: state.endpoint, origin, os, ...ctx });
    set({ phase: state.record ? 'connected' : 'error', error: { gate, ...copy } });
    return false;
  };
  const save = (endpoint, model) => {
    try {
      if (storage) storage.setItem(LINK_STORAGE_KEY, JSON.stringify({ endpoint, model }));
    } catch {
      /* private mode: this session only */
    }
    set({ saved: { endpoint, model } });
  };

  /** Steps 2–3 of the handshake for one chosen model (plan §2): show, preload, one timed warm probe. */
  async function detect(endpoint, model, gen) {
    set({ phase: 'detecting', model, error: null });
    const shown = await fetchShow(fetchImpl, endpoint, model);
    if (gen !== generation) return false;
    if (!shown.ok) return fail(shown.gate, { model, status: shown.status });
    await preloadModel(fetchImpl, endpoint, model);
    if (gen !== generation) return false;
    const probe = await runWarmProbe(fetchImpl, endpoint, model, {
      thinking: shown.show.thinking === 'controllable',
      now,
    });
    if (gen !== generation) return false;
    if (probe.httpStatus === 404) return fail('model-gone', { model });
    if (probe.httpStatus && probe.httpStatus >= 400) return fail('http', { model, status: probe.httpStatus });
    const record = {
      endpoint,
      model,
      tier: classifyTier(probe),
      badges: badgesFor(model, shown.show),
      context: shown.show.context,
      thinking: shown.show.thinking,
      probeMs: Math.round(probe.ms),
      probeClean: probe.clean,
      at: stamp(),
    };
    setCapabilities(record);
    save(endpoint, model);
    emit(Events.MEGAMIND_LINK, {
      connected: true,
      endpoint,
      model,
      tier: record.tier,
      badges: [...record.badges],
      context: record.context,
    });
    set({ phase: 'connected', record, error: null });
    return true;
  }

  return {
    /** Step 1 of the handshake: the model list, names verbatim; then detection of the chosen model. */
    async connect(endpointRaw) {
      const gen = ++generation;
      const endpoint = normalizeEndpoint(endpointRaw);
      if (!endpoint) return fail('bad-endpoint');
      set({ endpoint });
      if (!isDesktop() && isSafariUa(userAgent)) return fail('safari');
      set({ phase: 'connecting', error: null, models: [], record: null });
      const tags = await fetchTags(fetchImpl, endpoint);
      if (gen !== generation) return false;
      if (!tags.ok) {
        setCapabilities(null);
        return fail(tags.gate, { status: tags.status });
      }
      if (!tags.models.length) {
        setCapabilities(null);
        return fail('no-models');
      }
      set({ models: tags.models });
      const saved = state.saved;
      let model;
      if (saved && saved.endpoint === endpoint && saved.model) {
        if (!tags.models.some((m) => m.name === saved.model)) {
          setCapabilities(null);
          return fail('model-gone', { model: saved.model });
        }
        model = saved.model;
      } else {
        model = tags.models[0].name;
      }
      return detect(endpoint, model, gen);
    },
    /** Detection re-runs on every model change (plan §2) — the new model's show + probe, then the registry moves. */
    async changeModel(model) {
      if (!state.models.some((m) => m.name === model)) return fail('model-gone', { model });
      const gen = ++generation;
      const before = state.model;
      const okDetect = await detect(state.endpoint, model, gen);
      if (!okDetect && gen === generation && state.record) set({ model: before }); // a failed re-detect leaves the live link named
      return okDetect;
    },
    /** Re-run detection for the connected model (the probe is a user act; this is its button). */
    async redetect() {
      if (!state.model) return false;
      const gen = ++generation;
      return detect(state.endpoint, state.model, gen);
    },
    /** Clear the stored endpoint+model and the registry; MegaMind returns to rules, silently. */
    disconnect() {
      generation++;
      try {
        if (storage) storage.removeItem(LINK_STORAGE_KEY);
      } catch {
        /* nothing stored, nothing to clear */
      }
      setCapabilities(null);
      emit(Events.MEGAMIND_LINK, { connected: false });
      set({ phase: 'idle', model: null, models: [], record: null, error: null, saved: null });
    },
    view: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// ── the app-wide singleton (created lazily by the dev panel; creation probes nothing) ────────────────────
let driver = null;
let view = null;
const panelListeners = new Set();

export function ensureLinkDriver() {
  if (!driver) {
    driver = createLinkDriver();
    view = driver.view();
    driver.subscribe((s) => {
      view = s;
      for (const fn of panelListeners) {
        try {
          fn();
        } catch {
          /* a listener must not break the link */
        }
      }
    });
  }
  return driver;
}

/** The dev panel's view of the link, or null before the panel first asks. */
export function getLinkView() {
  return view;
}
export function subscribeLink(fn) {
  panelListeners.add(fn);
  return () => panelListeners.delete(fn);
}
