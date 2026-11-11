// megamindRecapLive.js — #1529: the recap driver, in the megamindSurfacesLive idiom.
//
// Two triggers, both deliberate ends of things — never anything during a performance:
//
//   REPLAY (#1461): the driver watches the playback holder the way TakeStrip does. While a take
//   plays, personas are muted and this driver does nothing at all — generation can only begin
//   once the holder reports the take ENDED. The rules recap is built at once and attached to the
//   loaded take (`perf.recap` — a record of the take, living where the take lives); a linked
//   model may then re-voice Davis's and LOIS's facts through the S2 surface chain, and only the
//   claims that survive the core's walk against the log are merged in.
//
//   RETRO (#1367): `summarizeCaptureTake` builds the "what just happened" summary from a retro
//   capture's own log (its frames are the window) for PerformanceButton to attach to the capture
//   before it is packed and saved.
//
// Every ask goes through the standing surface law: the `narration.recap` consumer's measured
// record, local models only, the registry's one Ollama origin — no new network surface, CSP
// untouched. With no record, no ask happens and the rules recap stands complete on its own.
import { getPlayback } from '../gl/playback.mjs';
import { askSurfaceText, surfaceRecord } from './megamindVoice.mjs';
import {
  RECAP_CONSUMER,
  buildRecapRequest,
  buildRulesRecap,
  mergeModelLines,
  recapClaimsFromText,
  verifyRecap,
} from './megamindRecap.mjs';

const PERSONAS = ['davis', 'lois'];

/** Re-voice one persona's facts through the linked model; returns the merged recap (or the input). */
async function enrichPersona(fetchImpl, record, recap, persona) {
  // A persona may only re-voice its own facts (plus the span): claims are walked against that
  // scope, so one voice can never swallow the other's lines.
  const mine = recap.facts.filter((x) => x.persona === persona || x.kind === 'span');
  if (!mine.some((x) => x.persona === persona)) return recap;
  const messages = buildRecapRequest(persona, recap.facts);
  for (let attempt = 0; attempt < 2; attempt++) {
    let text;
    try {
      text = await askSurfaceText({ fetchImpl, record, messages });
    } catch {
      return recap; // a failed ask leaves the rules lines standing — narration never blocks a record
    }
    const claims = recapClaimsFromText(text, mine);
    if (claims.length) return mergeModelLines(recap, persona, claims, record.model);
  }
  return recap;
}

/** The rules recap, enriched per persona where a measured record enables the surface. Never throws. */
async function enrichRecap(fetchImpl, recap) {
  try {
    const record = surfaceRecord(RECAP_CONSUMER);
    if (!record) return recap;
    let out = recap;
    for (const persona of PERSONAS) out = await enrichPersona(fetchImpl, record, out, persona);
    // The merged record is re-walked before it is kept: a violation keeps the rules record instead.
    return verifyRecap(out).length ? recap : out;
  } catch {
    return recap;
  }
}

export function createRecapDriver({
  fetchImpl = (...a) => globalThis.fetch(...a),
  playback = () => {
    const pb = getPlayback();
    return pb ? { perf: pb.perf, ended: pb.ended, active: pb.active } : null;
  },
} = {}) {
  let view = { perf: null, recap: null, busy: false };
  const listeners = new Set();
  const publish = () => {
    for (const fn of listeners) {
      try {
        fn(view);
      } catch {
        /* a listener must not break the driver */
      }
    }
  };
  const set = (patch) => {
    view = { ...view, ...patch };
    publish();
  };
  let recappedFor = null; // the perf object the standing recap belongs to
  let timer = null;

  const generate = async (perf) => {
    const rules = buildRulesRecap(perf, { kind: 'replay' });
    perf.recap = rules;
    set({ perf, recap: rules, busy: true });
    const enriched = await enrichRecap(fetchImpl, rules);
    if (recappedFor !== perf) return; // a newer take ended while the model was thinking
    perf.recap = enriched;
    set({ perf, recap: enriched, busy: false });
  };

  const driver = {
    view: () => view,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /**
     * One observation of the playback holder. THE MUTING PIN: unless the holder reports the take
     * ended, this is a no-op — no facts are read, no recap is built, no model is asked, however
     * often it is called during playback.
     */
    poll() {
      let pb = null;
      try {
        pb = playback();
      } catch {
        /* an unreadable holder reads as no playback */
      }
      if (!pb || !pb.perf) {
        if (view.perf && !pb) set({ perf: null, recap: null, busy: false });
        return;
      }
      if (!pb.ended) return;
      if (recappedFor === pb.perf) return;
      recappedFor = pb.perf;
      void generate(pb.perf);
    },
    start() {
      if (timer !== null) return;
      timer = setInterval(() => driver.poll(), 250);
      if (timer && typeof timer.unref === 'function') timer.unref();
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
    /** The retro path: a capture's summary, rules floor first, enriched where a model is linked. */
    async summarize(perf) {
      const rules = buildRulesRecap(perf, { kind: 'retro' });
      return enrichRecap(fetchImpl, rules);
    },
  };
  return driver;
}

// ── the app-wide singleton (created lazily by the take strip; creation asks nothing) ─────────────
let driver = null;
let view = null;
const panelListeners = new Set();

export function ensureRecapDriver() {
  if (!driver) {
    driver = createRecapDriver();
    view = driver.view();
    driver.subscribe((v) => {
      view = v;
      for (const fn of panelListeners) {
        try {
          fn();
        } catch {
          /* a listener must not break the strip */
        }
      }
    });
    driver.start();
  }
  return driver;
}

export function getRecapView() {
  return view;
}
export function subscribeRecaps(fn) {
  panelListeners.add(fn);
  return () => panelListeners.delete(fn);
}

/** PerformanceButton's seam: the summary for a retro capture, or null when it cannot be built. */
export async function summarizeCaptureTake(perf) {
  try {
    return await ensureRecapDriver().summarize(perf);
  } catch {
    return null;
  }
}
