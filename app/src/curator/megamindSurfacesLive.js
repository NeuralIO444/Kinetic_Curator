// megamindSurfacesLive.js — #1526 MegaMind S2: the register surfaces, wired live for the dev panel.
//
// A driver in the megamindLive idiom: it owns the bus subscriptions and storage reads the pure surface
// module (megamindSurfaces.mjs) may not touch, asks the linked model through megamindVoice's surface
// chat, validates every reply (shape + grounding) before it is shown, and publishes a view the
// MEGAMIND tab renders. Every action is gated on the capability registry — the surface's own consumer
// entry, the measured record, local models only — and every action is a deliberate act (a button, or
// the dice cast that earns a fresh Davis citation). Nothing here runs on page load.
//
// What it reads is real: pacing from the Director's room history on the bus, telemetry narration from
// this session's mind:decision / mind:reply traffic, census + drift from the live keep ledger and the
// loaded taste (censusReport.tasteAgreement → censusReadout.agreementView — the T2 readout, computed,
// never fabricated), crown drafts from the crown log's latest entry, the guide from the shipped corpus.
import { Events, on } from '../composition/eventBus.js';
import {
  checkCapabilityRecord,
  consumerById,
  consumerEnabled,
  getCapabilities,
} from '../composition/capabilityRegistry.mjs';
import { askSurfaceText } from './megamindVoice.mjs';
import {
  GUIDE_DECLINE,
  buildCrownRequest,
  buildDriftRequest,
  buildGuideCorpus,
  buildGuideRequest,
  buildNarrationRequest,
  buildPacingRequest,
  buildReasonRequest,
  judgePacingProposal,
  parseSurfaceReply,
  retrieveGuide,
  validateCrownDraft,
  validateDriftReply,
  validateGuideReply,
  validateNarration,
  validatePacingProposal,
  validateReasonLine,
} from './megamindSurfaces.mjs';
import { getDavisCitation, setDavisReasonProse } from './tasteHead.js';
import { readCrowns } from './diceCrowns.js';
import { ledgerCounts, parseLedger, readLedgerText } from './tasteLedger.js';
import { getTaste } from './tasteStore.js';
import { tasteAgreement } from './censusReport.mjs';
import { agreementView } from './censusReadout.mjs';

/** The record a surface may use, or null: measured, local, and enabling THIS surface's consumer. */
export function surfaceRecord(consumerId, raw = getCapabilities()) {
  const rec = checkCapabilityRecord(raw);
  if (!rec || rec.badges.includes('cloud')) return null;
  return consumerEnabled(rec, consumerById(consumerId)) ? rec : null;
}

/** The T2 agreement readout over the live ledger + loaded taste, as the readout's own view model. */
export function liveAgreement() {
  try {
    const taste = getTaste();
    if (!taste) return { present: false, reason: 'no taste loaded' };
    const keeps = parseLedger(readLedgerText('keeps') || '', () => {});
    const passes = parseLedger(readLedgerText('passes') || '', () => {});
    return agreementView(tasteAgreement({ keeps, passes }, taste));
  } catch {
    return { present: false, reason: 'not measured' };
  }
}

export function createSurfacesDriver({
  fetchImpl = (...a) => globalThis.fetch(...a),
  storage = typeof globalThis !== 'undefined' ? globalThis.localStorage : null,
} = {}) {
  const corpus = buildGuideCorpus();
  const rooms = []; // the Director's room history (readouts only — never gains)
  const tally = { decisions: 0, byBackend: {}, replies: 0, latencyMs: 0, latencyN: 0, failed: 0 };
  let view = {
    pacing: null, // { proposal, judgement }
    crownDraft: null, // { note, caption, lookNames, forLayout }
    telemetryLine: null,
    censusLine: null,
    drift: null, // { line, proposeRetrain, agreement }
    reason: null, // { clause, line }
    guide: null, // { query, answer, sources }
    busy: null,
    error: null,
  };
  const listeners = new Set();
  const publish = () => {
    for (const fn of listeners) {
      try {
        fn(view);
      } catch {
        /* a listener must not break the surfaces */
      }
    }
  };
  const set = (patch) => {
    view = { ...view, ...patch };
    publish();
  };

  const offs = [
    on(Events.DIRECTOR_ROOM, (p) => {
      if (p && typeof p === 'object') {
        rooms.push(p);
        if (rooms.length > 24) rooms.shift();
      }
    }),
    on(Events.MIND_DECISION, (d) => {
      if (!d || typeof d !== 'object') return;
      tally.decisions += 1;
      tally.byBackend[d.backend] = (tally.byBackend[d.backend] || 0) + 1;
    }),
    on(Events.MIND_REPLY, (r) => {
      if (!r || typeof r !== 'object') return;
      tally.replies += 1;
      if (Number.isFinite(r.latencyMs) && r.backend !== 'rules') {
        tally.latencyMs += r.latencyMs;
        tally.latencyN += 1;
      }
      if (r.reply == null) tally.failed += 1;
    }),
    on(Events.DICE_CAST, () => {
      // A fresh cast is when a new Davis citation can exist: if reason prose is enabled and the clause
      // changed, write the line (fire-and-forget; the template clause stands until a valid line lands).
      const clause = getDavisCitation();
      if (clause && (!view.reason || view.reason.clause !== clause)) driver.writeReason().catch(() => {});
    }),
  ];

  /** Ask the model for one surface reply and validate it; one re-ask on a discarded reply. */
  async function ask(consumerId, messages, validate) {
    const rec = surfaceRecord(consumerId);
    if (!rec) throw new Error('that surface is not enabled by the linked model');
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await askSurfaceText({ fetchImpl, record: rec, messages });
      const out = validate(parseSurfaceReply(text));
      if (out) return out;
    }
    throw new Error('the reply was discarded — shape or grounding failed twice');
  }

  const run = async (name, fn) => {
    set({ busy: name, error: null });
    try {
      await fn();
    } catch (e) {
      set({ error: `${name}: ${String(e && e.message ? e.message : e).slice(0, 160)}` });
    } finally {
      set({ busy: null });
    }
  };

  const telemetryFacts = () => [
    { label: 'persona decisions', value: tally.decisions },
    { label: 'answered by the linked model', value: tally.byBackend.ollama || 0 },
    { label: 'answered by Apple Intelligence', value: tally.byBackend.apple || 0 },
    { label: 'answered by the rules', value: tally.byBackend.rules || 0 },
    ...(tally.latencyN
      ? [{ label: 'mean model latency ms', value: Math.round(tally.latencyMs / tally.latencyN) }]
      : []),
    { label: 'replies dropped or failed', value: tally.failed },
  ];

  const censusFacts = () => {
    let counts = { keeps: 0, passes: 0 };
    try {
      counts = ledgerCounts(storage);
    } catch {
      /* unreadable storage reads as an empty ledger */
    }
    let crowns = 0;
    try {
      crowns = readCrowns(storage).length;
    } catch {
      /* as above */
    }
    const agreement = liveAgreement();
    return {
      agreement,
      facts: [
        { label: 'keeps in the ledger', value: counts.keeps ?? 0 },
        { label: 'passes in the ledger', value: counts.passes ?? 0 },
        { label: 'crowns logged', value: crowns },
        ...(agreement.present
          ? [
              { label: 'separation AUC', value: agreement.auc },
              { label: 'keeps mean score', value: agreement.keepsMean },
              { label: 'passes mean score', value: agreement.passesMean },
            ]
          : []),
      ],
    };
  };

  const driver = {
    view: () => view,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    stop() {
      for (const off of offs) {
        try {
          off();
        } catch {
          /* already gone */
        }
      }
    },
    /** #1145: propose a pacing move from the session's room history; the pure judge validates it. */
    proposePacing() {
      return run('pacing', async () => {
        if (!rooms.length) throw new Error('no Director rooms heard yet this session');
        const proposal = await ask('director.pacing', buildPacingRequest(rooms), validatePacingProposal);
        set({ pacing: { proposal, judgement: judgePacingProposal(proposal, rooms[rooms.length - 1]) } });
      });
    },
    /** Crown-time: draft the note / caption / Look names for the latest crown. Suggestions only. */
    draftCrown() {
      return run('crown', async () => {
        let crowns = [];
        try {
          crowns = readCrowns(storage);
        } catch {
          crowns = [];
        }
        const crown = crowns[crowns.length - 1];
        if (!crown) throw new Error('no crowns in the log yet');
        const draft = await ask('crown.assist', buildCrownRequest(crown, getDavisCitation()), validateCrownDraft);
        set({ crownDraft: { ...draft, forLayout: crown.layoutId ?? null } });
      });
    },
    /** Dev-panel narration of this session's consultation telemetry. */
    narrateTelemetry() {
      return run('telemetry', async () => {
        const out = await ask('devpanel.narration', buildNarrationRequest('telemetry', telemetryFacts()), (raw) =>
          validateNarration(raw, telemetryFacts()),
        );
        set({ telemetryLine: out.line });
      });
    },
    /** Dev-panel narration of the census + the live agreement readout. */
    narrateCensus() {
      return run('census', async () => {
        const { facts } = censusFacts();
        const out = await ask('devpanel.narration', buildNarrationRequest('census', facts), (raw) =>
          validateNarration(raw, facts),
        );
        set({ censusLine: out.line });
      });
    },
    /** Drift narration over the T2 readout; a retrain proposal survives only on real divergence. */
    narrateDrift() {
      return run('drift', async () => {
        const agreement = liveAgreement();
        if (!agreement.present) throw new Error(`no agreement readout to narrate (${agreement.reason || 'absent'})`);
        const out = await ask('narration.driftRetrain', buildDriftRequest(agreement), (raw) =>
          validateDriftReply(raw, agreement),
        );
        set({ drift: { ...out, agreement } });
      });
    },
    /** Davis reason prose for the standing citation; a valid line also feeds the CURATE hint's slot. */
    writeReason() {
      return run('reason', async () => {
        const clause = getDavisCitation();
        if (!clause) throw new Error('no Davis citation stands (the tree head has not picked, or a linear head)');
        const out = await ask('narration.davisReason', buildReasonRequest(clause), (raw) =>
          validateReasonLine(raw, clause),
        );
        setDavisReasonProse(clause, out.line);
        set({ reason: { clause, line: out.line } });
      });
    },
    /** The visitor guide: retrieval over the shipped corpus only; an empty retrieval declines unasked. */
    askGuide(query) {
      return run('guide', async () => {
        const chunks = retrieveGuide(query, corpus);
        if (!chunks.length) {
          set({ guide: { query, answer: GUIDE_DECLINE, sources: [] } });
          return;
        }
        const out = await ask('guide.docs', buildGuideRequest(query, chunks), (raw) => validateGuideReply(raw, chunks));
        set({ guide: { query, ...out } });
      });
    },
  };
  return driver;
}

// ── the app-wide singleton (created lazily by the dev panel; creation asks nothing) ─────────────────────
let driver = null;
let view = null;
const panelListeners = new Set();

export function ensureSurfacesDriver() {
  if (!driver) {
    driver = createSurfacesDriver();
    view = driver.view();
    driver.subscribe((v) => {
      view = v;
      for (const fn of panelListeners) {
        try {
          fn();
        } catch {
          /* a listener must not break the panel */
        }
      }
    });
  }
  return driver;
}

export function getSurfacesView() {
  return view;
}
export function subscribeSurfaces(fn) {
  panelListeners.add(fn);
  return () => panelListeners.delete(fn);
}
