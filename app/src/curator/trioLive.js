// trioLive.js — #1483 trio audio direction, stage 1 PR 2: the live driver of Davis's conducting.
//
//   audio:input / energy / tempo / onset / silence   what the show is doing (the `show` block the personas are told)
//   clock:bar                                        samples the bands (LOIS's flatness), lands a held proposal
//   mind:request { persona: davis, reply.route }     his proposal: the conductor's gate, then held to the phrase boundary
//   the artist's route and dial edits                owned targets; an edit of his row clears his mark; reverts back him off
//
// Everything he does is announced (`mind:route`: applied with its delta, or dropped with its reason), tagged on the row
// (`by: 'davis'`), and handed to the take's recorder. Muted while a take plays: the take's own record speaks.
// It never invents an edit: the proposal came from a persona decision (rules or Apple), validated by the contract.
import { on, emit, Events } from '../composition/eventBus.js';
import { createConductor, createFlatness, applyRouteOp, describeOp, flatBias, DAVIS_TAG, PHRASE_BARS } from './mindConduct.js';
import { DEFAULT_ROUTES } from '../gl/audioRoutes.mjs';

/** Which dial of the artist's belongs to which route target: moving it by hand owns the target (decision 3). */
export const DIAL_FOR_TARGET = Object.freeze({
  'render.squash': ['squash'],
  'render.alpha': ['audioAlphaMod'],
  'render.scale': ['audioScaleMod'],
  'render.breath': ['breath'],
  'render.glow': ['audioSwell'],
  'render.accum': ['accumulation', 'accumulationFade'],
  'color.hue': ['hueRotate'],
  'clock.kinemeRate': ['kinemeRate'],
});

const pairKey = (r) => `${r.input}>${r.target}`;
const effective = (routes) => (Array.isArray(routes) ? routes : DEFAULT_ROUTES);

let tap = null;
/** Observe every outcome (applied / dropped) for the take's record. One listener (or null). */
export function setConductTap(fn) {
  tap = typeof fn === 'function' ? fn : null;
}

// The dev readout (DEV -> MIND): what the trio is doing, for tuning. Not state: a holder, like the presence view.
const LOG_MAX = 12;
let view = null;
const subs = new Set();
/** The latest conducting view, or null when the trio is not running. */
export function getTrioView() {
  return view;
}
/** Called when the view changes; returns the unsubscribe. */
export function subscribeTrio(fn) {
  subs.add(fn);
  return () => { subs.delete(fn); };
}
const notify = () => { for (const f of subs) { try { f(); } catch { /* a listener must not stop the trio */ } } };

/**
 * @param getRoutes   () => the scene's route table (null = the default table)
 * @param getTier     () => 't1'..'t4' | null   Davis's engagement tier
 * @param getBands    () => number[7] | null    the band levels now (null: audio off)
 * @param getActivity () => { keeps, rolls } in the recent window (LOIS's keep-rate read); absent = no bias
 * @param isReplaying () => boolean
 * @param subscribe   (fn(state, prev)) => unsubscribe   the store's subscribe: the artist's route and dial edits
 * @returns { showBlock(), conductor, stop() }
 */
export function startTrio({ getRoutes, getTier, getBands, getActivity = null, isReplaying = () => false, subscribe = null }) {
  const conductor = createConductor();
  const flatness = createFlatness();
  const audio = { on: false, energy: null, bpm: null, confidence: 0, silent: false, onsets: 0, onsetsThisBar: 0, sinceBars: 0 };
  let pending = null; // { op, landBar, bar }
  const log = []; // the last LOG_MAX outcomes, newest first
  let applying = false; // our own table write: not the artist
  let bar = 0;
  let bias = 0; // LOIS's keep-rate read, -1..+1
  const stops = [];

  const publish = () => {
    let tier;
    try { tier = getTier(); } catch { tier = null; }
    const table = effective(getRoutes());
    view = {
      on: audio.on, energy: audio.energy, bpm: audio.bpm, silent: audio.silent, sinceBars: audio.sinceBars,
      flatBars: flatness.flatBars(), flatBelow: flatness.threshold(), bias, tier, cooling: conductor.cooling(bar), owned: conductor.owned(),
      routes: table.length, mine: table.filter((r) => r.by === DAVIS_TAG).length,
      pending: pending ? { desc: describeOp(pending.op), landBar: pending.landBar } : null,
      log: log.slice(),
    };
    notify();
  };
  const announce = (e) => {
    emit(Events.MIND_ROUTE, e, { cause: 'mind' });
    if (tap !== null) { try { tap(e); } catch { tap = null; } }
    log.unshift({ bar: e.bar, landBar: e.landBar ?? null, status: e.status, reason: e.reason || null, desc: describeOp(e.op) });
    if (log.length > LOG_MAX) log.length = LOG_MAX;
    publish();
  };
  const resetShow = () => { audio.on = false; audio.energy = null; audio.bpm = null; audio.confidence = 0; audio.silent = false; audio.onsets = 0; audio.onsetsThisBar = 0; audio.sinceBars = 0; flatness.reset(); pending = null; };

  stops.push(on(Events.AUDIO_INPUT, (p) => {
    resetShow();
    audio.on = !!(p && p.source && p.source !== 'none');
    publish();
  }));
  stops.push(on(Events.AUDIO_ENERGY, (p) => { if (p && ['low', 'mid', 'high'].includes(p.level)) audio.energy = p.level; }));
  stops.push(on(Events.AUDIO_TEMPO, (p) => { if (p && Number.isFinite(p.bpm)) { audio.bpm = p.bpm; audio.confidence = Number(p.confidence) || 0; } }));
  stops.push(on(Events.AUDIO_ONSET, () => { audio.onsetsThisBar++; }));
  stops.push(on(Events.AUDIO_SILENCE_START, () => { audio.silent = true; }));
  stops.push(on(Events.AUDIO_SILENCE_END, () => { audio.silent = false; }));

  const land = (landBar) => {
    const p = pending; pending = null;
    if (!p) return;
    const table = effective(getRoutes());
    const res = applyRouteOp(table, p.op, DAVIS_TAG);
    if (!res) { announce({ status: 'dropped', reason: 'stale', op: p.op, bar: p.bar, landBar }); return; }
    applying = true;
    try { emit(Events.AUDIO_ROUTES_SET, { routes: res.routes, continuous: false }, { cause: 'persona:davis' }); } finally { applying = false; }
    conductor.commit(landBar);
    announce({ status: 'applied', op: p.op, delta: res.delta, bar: p.bar, landBar });
  };

  stops.push(on(Events.CLOCK_BAR, (p) => {
    if (!p || !Number.isInteger(p.bar)) return;
    bar = p.bar;
    if (isReplaying()) return; // a take plays: its own record speaks for the trio
    if (!audio.on) return;
    audio.sinceBars++;
    audio.onsets = audio.onsetsThisBar; audio.onsetsThisBar = 0;
    let bands;
    try { bands = audio.silent ? null : getBands(); } catch { bands = null; }
    let act;
    try { act = getActivity ? getActivity() : null; } catch { act = null; }
    bias = flatBias(act || {});
    flatness.setBias(bias);
    flatness.push(bands);
    if (pending && p.bar >= pending.landBar) land(p.bar);
    publish();
  }));

  stops.push(on(Events.MIND_REQUEST, (p) => {
    if (!p || p.persona !== 'davis' || !p.reply || !p.reply.route) return;
    if (isReplaying() || !audio.on) return;
    const op = p.reply.route;
    let tier;
    try { tier = getTier(); } catch { tier = null; }
    const v = conductor.consider(op, { bar: Number.isInteger(p.bar) ? p.bar : bar, tier });
    if (!v.ok) { announce({ status: 'dropped', reason: v.reason, op, bar: p.bar, landBar: null }); return; }
    if (pending) return; // one is already held for the boundary: the same conducting, said again on the next bar
    pending = { op, landBar: v.landBar, bar: p.bar };
    publish();
  }));

  // The artist: an edit of a route row (not ours) owns the row's targets; an edit of his row clears his mark and, if it
  // undoes what he did, counts as a revert.
  // Moving a target's own dial owns that target too (decision 3). That is read from the slider's own event
  // (layout:param), never from a diff of the layout: a recalled hit, a morph, an evolve or a preset rewrites many dials
  // at once, and none of that is the artist moving a dial by hand.
  const owns = (key) => { for (const [target, keys] of Object.entries(DIAL_FOR_TARGET)) if (keys.includes(key)) conductor.touch(target); };
  stops.push(on(Events.LAYOUT_PARAM, (p) => { if (p && typeof p.key === 'string') owns(p.key); }));
  stops.push(on(Events.FEEL_APPLY, () => { for (const k of ['audioModDepth', 'audioScaleMod', 'audioAlphaMod', 'audioSwell']) owns(k); })); // a FEEL pill sets the audio feel
  if (typeof subscribe === 'function') {
    stops.push(subscribe((state, prev) => {
      if (!state || !prev || applying) return;
      if (state.audioRoutes !== prev.audioRoutes) {
        const was = new Map(effective(prev.audioRoutes).map((r) => [pairKey(r), r]));
        const now = effective(state.audioRoutes);
        const nowKeys = new Set(now.map(pairKey));
        const changed = new Set(); // pairs the artist added or re-set
        const touched = new Set(); // targets that are now theirs
        let reverted = false; // they undid or changed something Davis did
        for (const r of now) {
          const b = was.get(pairKey(r));
          if (b && Math.abs(b.depth - r.depth) <= 1e-9) continue;
          changed.add(pairKey(r)); touched.add(r.target);
          if (b && b.by === DAVIS_TAG) reverted = true;
        }
        for (const [k, b] of was) {
          if (nowKeys.has(k)) continue;
          touched.add(b.target);
          if (b.by === DAVIS_TAG) reverted = true;
        }
        if (touched.size) conductor.touch([...touched]);
        if (reverted) conductor.revert(bar);
        // an edited row of his is the artist's now: clear the mark, once, as a plain table write
        if (Array.isArray(state.audioRoutes) && now.some((r) => r.by === DAVIS_TAG && changed.has(pairKey(r)))) {
          const routes = now.map((r) => (r.by === DAVIS_TAG && changed.has(pairKey(r)) ? { input: r.input, target: r.target, depth: r.depth } : r));
          applying = true;
          try { emit(Events.AUDIO_ROUTES_SET, { routes, continuous: false }, { cause: 'ownership' }); } finally { applying = false; }
        }
      }
    }));
  }

  return {
    conductor,
    /** The `show` block for the personas' context, or null while audio is off or a take plays. */
    showBlock() {
      if (!audio.on || isReplaying()) return null;
      return {
        energy: audio.energy, bpm: audio.bpm, confidence: audio.confidence, onsets: audio.onsets, silent: audio.silent,
        sinceBars: audio.sinceBars, flatBars: flatness.flatBars(),
        routes: effective(getRoutes()).map((r) => ({ input: r.input, target: r.target, depth: r.depth, ...(r.by ? { by: r.by } : {}) })),
        owned: conductor.owned(),
      };
    },
    stop() { for (const s of stops) { try { s(); } catch { /* best effort */ } } pending = null; conductor.reset(); view = null; notify(); },
  };
}

export { PHRASE_BARS };
