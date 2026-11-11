// capabilityRegistry.mjs — #1525 MegaMind S1: what the linked local model has PROVEN it can do, as data.
//
// The plan's one genuinely new piece (docs/research/megamind-local-model-plan-2026-10-14.md §0b): connect-time
// detection publishes capabilities — cadence tier, badges, context — and every later MegaMind stage enables by
// CAPABILITY, never by backend name and never by model name. This module is the registry those stages read:
// the consumer table below (who needs what) plus the one live record (what the machine in front of us measured).
//
// The live record is written only by the link (curator/megamindLive.js) from a completed detection handshake,
// and cleared on disconnect — no record is the rules state, and every consumer reads disabled. Detection
// measures; nothing here assumes. A malformed record is refused whole (fail-closed, like mindContract).
//
// Hook note (2026-10-15): the XGBoost narration surfaces are consumers like everything else — Davis reason
// prose, drift/retrain narration, recap narration. The heads themselves (taste #1579–#1581, governor #1578)
// are Mind-tier and backend-agnostic: they get NO entry here, and no capability ever switches a head on or off.

/** Cadence tiers, fastest first: A per-bar, B phrase, C deep-verdict-only. Rank is the array index. */
export const CAPABILITY_TIERS = Object.freeze(['A', 'B', 'C']);
export const tierRank = (t) => CAPABILITY_TIERS.indexOf(t);

/** Badges a capability record may carry. 'embeddings' is earned by the #1528 slot, never by S1 detection. */
export const CAPABILITY_BADGES = Object.freeze(['vision', 'cloud', 'embeddings']);

/**
 * Who consumes capabilities, and what each one needs. `needs.tier` is the SLOWEST tier that still enables the
 * consumer (a faster tier always qualifies); `needs.badges` must all be present. Stages are the MegaMind
 * build stages from the plan (§6/§6b) — the registry enumerates consumers ahead of their stages so each
 * stage's gate already exists when it builds.
 */
export const CAPABILITY_CONSUMERS = Object.freeze([
  // S2 — the persona adapter (#1526)
  { id: 'persona.perBar', stage: 'S2', needs: { tier: 'A' }, note: 'personas consulted on every eligible bar' },
  {
    id: 'persona.phrase',
    stage: 'S2',
    needs: { tier: 'B' },
    note: 'personas consulted on phrase boundaries; replies cached per state-room',
  },
  {
    id: 'persona.deep',
    stage: 'S2',
    needs: { tier: 'C' },
    note: 'deep verdicts at section changes — any measured tier reaches this one',
  },
  {
    id: 'director.pacing',
    stage: 'S2',
    needs: { tier: 'C' },
    note: '#1145: the Director proposes pacing (widen / hold / push) from session history; the pure scheduler validates',
  },
  {
    id: 'conducting.sections',
    stage: 'S2',
    needs: { tier: 'C' },
    note: '#1483: section-cadence conducting proposals from spectral features (the audit gates this tier B/C)',
  },
  {
    id: 'library.classify',
    stage: 'S2',
    needs: { tier: 'B' },
    note: 'auto-classification proposals for new library assets — the metadata the dice scorer reads',
  },
  {
    id: 'crown.assist',
    stage: 'S2',
    needs: { tier: 'C' },
    note: 'crown-time keep notes / captions drafted for editing; Look-name suggestions (a name still lands only on Matt\u2019s word)',
  },
  {
    id: 'guide.docs',
    stage: 'S2',
    needs: { tier: 'C' },
    note: 'the visitor guide, retrieval-grounded in the shipped wiki/docs corpus only',
  },
  {
    id: 'devpanel.narration',
    stage: 'S2',
    needs: { tier: 'C' },
    note: 'dev-panel telemetry + census narration, from real logs only',
  },
  // The XGBoost narration surfaces (hook note, 2026-10-15): consumers like everything else. The heads get
  // NO entry (see the header) — narration reads a head's output, it never gates the head.
  {
    id: 'narration.davisReason',
    stage: 'S2',
    needs: { tier: 'C' },
    note: 'Davis reason prose, narrating the taste head\u2019s splits (hook note; hooks recorded on #1526)',
  },
  {
    id: 'narration.driftRetrain',
    stage: 'S2',
    needs: { tier: 'C' },
    note: 'drift / retrain narration (hook note; hooks recorded on #1526)',
  },
  {
    id: 'narration.tasteSummary',
    stage: 'S2',
    needs: { tier: 'C' },
    note: 'the dev-panel taste summary in words — narrates taste.json numbers, never alters them',
  },
  // S3 — vision (#1527)
  {
    id: 'lois.vision',
    stage: 'S3',
    needs: { tier: 'B', badges: ['vision'] },
    note: 'LOIS judges renders occasionally (E4 #1508): vision badge AND tier B or better — never per-bar',
  },
  {
    id: 'loot.ingest',
    stage: 'S3',
    needs: { badges: ['vision'] },
    note: '#1479: vision descriptions + tag proposals at loot ingest — offline cadence, any tier',
  },
  {
    id: 'stage.describe',
    stage: 'S3',
    needs: { badges: ['vision'] },
    note: 'on-demand stage description (the accessibility surface)',
  },
  // Follow-ons
  {
    id: 'narration.recap',
    stage: '#1529',
    needs: { tier: 'C' },
    note: 'replay recaps (#1461) + retro-capture summaries (#1367), told from the take\u2019s log',
  },
  {
    id: 'search.semantic',
    stage: '#1528',
    needs: { badges: ['embeddings'] },
    note: 'the embeddings slot: semantic search + the miner\u2019s novelty axis — no S1 detection earns this badge',
  },
]);

export const consumerById = (id) => CAPABILITY_CONSUMERS.find((c) => c.id === id) ?? null;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cleanStr = (v, max = 200) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

/**
 * A capability record as a clean frozen copy, or null. The record is what detection measured:
 * { endpoint, model, tier, badges, context, thinking, probeMs, probeClean, at }.
 */
export function checkCapabilityRecord(raw) {
  if (!isObj(raw)) return null;
  const endpoint = cleanStr(raw.endpoint);
  const model = cleanStr(raw.model);
  if (!endpoint || !model || !CAPABILITY_TIERS.includes(raw.tier)) return null;
  if (!Array.isArray(raw.badges) || raw.badges.some((b) => !CAPABILITY_BADGES.includes(b))) return null;
  if (!(raw.context === null || (Number.isInteger(raw.context) && raw.context > 0))) return null;
  if (!['controllable', 'unreported'].includes(raw.thinking)) return null;
  if (!(raw.probeMs === null || (Number.isFinite(raw.probeMs) && raw.probeMs >= 0))) return null;
  if (typeof raw.probeClean !== 'boolean' || !Number.isFinite(raw.at)) return null;
  return Object.freeze({
    endpoint,
    model,
    tier: raw.tier,
    badges: Object.freeze([...new Set(raw.badges)]),
    context: raw.context,
    thinking: raw.thinking,
    probeMs: raw.probeMs,
    probeClean: raw.probeClean,
    at: raw.at,
  });
}

/** Pure: does this record enable this consumer? No record (rules) enables nothing. */
export function consumerEnabled(record, consumer) {
  if (!record || !consumer) return false;
  const needs = consumer.needs || {};
  if (needs.tier && tierRank(record.tier) > tierRank(needs.tier)) return false;
  for (const b of needs.badges || []) if (!record.badges.includes(b)) return false;
  return true;
}

// ── the live record ──────────────────────────────────────────────────────────────────────────────────────────
// One linked model at a time. Written by the link on connect / model change, cleared on disconnect.
let current = null;
const listeners = new Set();

/** The current capability record, or null (nothing linked — MegaMind is on rules). */
export function getCapabilities() {
  return current;
}

/** Publish a measured record (validated; a malformed one is refused and changes nothing). Returns the record in force. */
export function setCapabilities(raw) {
  const rec = raw === null ? null : checkCapabilityRecord(raw);
  if (raw !== null && !rec) return current;
  current = rec;
  for (const fn of listeners) {
    try {
      fn(current);
    } catch {
      /* a listener must not break the link */
    }
  }
  return current;
}

/** Is this consumer enabled by what's linked right now? Unknown consumer ids are never enabled. */
export function capabilityEnabled(consumerId) {
  return consumerEnabled(current, consumerById(consumerId));
}

export function subscribeCapabilities(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
