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
import {
  createConductor,
  createFlatness,
  applyRouteOp,
  describeOp,
  flatBias,
  DAVIS_TAG,
  PHRASE_BARS,
  SPECTRUM_PARAMS,
  spectrumTarget,
  BRAKE_AT,
} from './mindConduct.js';
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
  // stage 2 — the spectrum marks: moving a marks dial by hand owns it (STIMULI -> SPECTRUM)
  ...Object.fromEntries(Object.entries(SPECTRUM_PARAMS).map(([k, param]) => [spectrumTarget(k), [param]])),
});
/** The `spectrum` op key a layout key belongs to (spectrumScale -> 'scale'), or null. */
const SPECTRUM_KEY_OF = Object.freeze(Object.fromEntries(Object.entries(SPECTRUM_PARAMS).map(([k, p]) => [p, k])));

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
  return () => {
    subs.delete(fn);
  };
}
const notify = () => {
  for (const f of subs) {
    try {
      f();
    } catch {
      /* a listener must not stop the trio */
    }
  }
};

/**
 * @param getRoutes   () => the scene's route table (null = the default table)
 * @param getTier     () => 't1'..'t4' | null   Davis's engagement tier
 * @param getBands    () => number[7] | null    the band levels now (null: audio off)
 * @param getActivity () => { keeps, rolls } in the recent window (LOIS's keep-rate read); absent = no bias
 * @param getSpectrum () => {centroid, flux, flatness} | null   the spectrum summary now (absent / null: none)
 * @param getTrail    () => {energy, channels, saturation} | null   the ACCUM buffer statistics now (#1807; absent / null: none)
 * @param isReplaying () => boolean
 * @param subscribe   (fn(state, prev)) => unsubscribe   the store's subscribe: the artist's route and dial edits
 * @param getMarks    () => { map, scale, displace, colour, locked: string[] } | null   stage 2: the spectrum marks now
 *                    (locked = the `spectrum` keys whose dial the artist has locked: treated as owned)
 * @param setMarkParam (layoutKey, value) => void   stage 2: a programmatic layout write (the store's setLayoutParam —
 *                    NOT the slider's layout:param event, which is the artist's hand: learn mode, the honest feed)
 * @returns { showBlock(), conductor, stop() }
 */
export function startTrio({
  getRoutes,
  getTier,
  getBands,
  getActivity = null,
  getSpectrum = null,
  getTrail = null,
  isReplaying = () => false,
  subscribe = null,
  getMarks = null,
  setMarkParam = null,
}) {
  const conductor = createConductor();
  const flatness = createFlatness();
  const mineMarks = new Set(); // stage 2: the marks dials (spectrum keys) Davis set and the artist has not touched since
  /** The spectrum marks now, or null (no reader, or it threw / gave nothing usable). */
  const readMarks = () => {
    if (typeof getMarks !== 'function') return null;
    try {
      const m = getMarks();
      return m && typeof m === 'object' ? m : null;
    } catch {
      return null;
    }
  };
  const marksLocked = (m, key) => Array.isArray(m.locked) && m.locked.includes(key);
  const audio = {
    on: false,
    energy: null,
    bpm: null,
    confidence: 0,
    silent: false,
    onsets: 0,
    onsetsThisBar: 0,
    sinceBars: 0,
  };
  let pending = null; // { op, landBar, bar }
  const log = []; // the last LOG_MAX outcomes, newest first
  let applying = false; // our own table write: not the artist
  let bar = 0;
  let spectrum = null; // the latest spectrum summary, or null
  let trail = null; // #1807: the latest buffer statistics, or null (ACCUM off / no reading yet)
  let bias = 0; // LOIS's keep-rate read, -1..+1
  const stops = [];

  const publish = () => {
    let tier;
    try {
      tier = getTier();
    } catch {
      tier = null;
    }
    const table = effective(getRoutes());
    view = {
      on: audio.on,
      energy: audio.energy,
      bpm: audio.bpm,
      silent: audio.silent,
      sinceBars: audio.sinceBars,
      flatBars: flatness.flatBars(),
      flatBelow: flatness.threshold(),
      flatBy: flatness.reading().source, // 'spectrum' | 'bands' | null — what LOIS is judging the show on
      flatWhy: flatness.why(),
      bias,
      brake: bias >= BRAKE_AT,
      tier,
      cooling: conductor.cooling(bar),
      owned: conductor.owned(),
      routes: table.length,
      mine: table.filter((r) => r.by === DAVIS_TAG).length,
      marksMine: [...mineMarks].sort(),
      pending: pending ? { desc: describeOp(pending.op), landBar: pending.landBar } : null,
      log: log.slice(),
    };
    notify();
  };
  const announce = (e) => {
    emit(Events.MIND_ROUTE, e, { cause: 'mind' });
    if (tap !== null) {
      try {
        tap(e);
      } catch {
        tap = null;
      }
    }
    log.unshift({
      bar: e.bar,
      landBar: e.landBar ?? null,
      status: e.status,
      reason: e.reason || null,
      desc: describeOp(e.op),
    });
    if (log.length > LOG_MAX) log.length = LOG_MAX;
    publish();
  };
  const resetShow = () => {
    audio.on = false;
    audio.energy = null;
    audio.bpm = null;
    audio.confidence = 0;
    audio.silent = false;
    audio.onsets = 0;
    audio.onsetsThisBar = 0;
    audio.sinceBars = 0;
    spectrum = null;
    trail = null; // #1807
    flatness.reset();
    pending = null;
  };

  stops.push(
    on(Events.AUDIO_INPUT, (p) => {
      resetShow();
      audio.on = !!(p && p.source && p.source !== 'none');
      publish();
    }),
  );
  stops.push(
    on(Events.AUDIO_ENERGY, (p) => {
      if (p && ['low', 'mid', 'high'].includes(p.level)) audio.energy = p.level;
    }),
  );
  stops.push(
    on(Events.AUDIO_TEMPO, (p) => {
      if (p && Number.isFinite(p.bpm)) {
        audio.bpm = p.bpm;
        audio.confidence = Number(p.confidence) || 0;
      }
    }),
  );
  stops.push(
    on(Events.AUDIO_ONSET, () => {
      audio.onsetsThisBar++;
    }),
  );
  stops.push(
    on(Events.AUDIO_SILENCE_START, () => {
      audio.silent = true;
    }),
  );
  stops.push(
    on(Events.AUDIO_SILENCE_END, () => {
      audio.silent = false;
    }),
  );

  // stage 2: a `spectrum` op lands as one programmatic write of the marks dial (the take records it like any move)
  const landMarks = (p, landBar) => {
    const marks = readMarks();
    const param = SPECTRUM_PARAMS[p.op.key];
    const before = marks ? marks[p.op.key] : undefined;
    // the artist moved or locked this dial while the proposal waited for the boundary: it is theirs, not his to write
    if (conductor.isOwned(spectrumTarget(p.op.key)) || (marks && marksLocked(marks, p.op.key))) {
      announce({ status: 'dropped', reason: 'owned', op: p.op, bar: p.bar, landBar });
      return;
    }
    if (!marks || typeof setMarkParam !== 'function' || !param || !Number.isFinite(before) || before === p.op.value) {
      announce({ status: 'dropped', reason: 'stale', op: p.op, bar: p.bar, landBar });
      return;
    }
    applying = true;
    try {
      setMarkParam(param, p.op.value);
    } finally {
      applying = false;
    }
    mineMarks.add(p.op.key);
    conductor.commit(landBar);
    announce({
      status: 'applied',
      op: p.op,
      delta: { op: 'spectrum', before: { key: p.op.key, value: before }, after: { key: p.op.key, value: p.op.value } },
      bar: p.bar,
      landBar,
    });
  };

  const land = (landBar) => {
    const p = pending;
    pending = null;
    if (!p) return;
    if (p.op.op === 'spectrum') {
      landMarks(p, landBar);
      return;
    }
    const table = effective(getRoutes());
    const res = applyRouteOp(table, p.op, DAVIS_TAG);
    if (!res) {
      announce({ status: 'dropped', reason: 'stale', op: p.op, bar: p.bar, landBar });
      return;
    }
    applying = true;
    try {
      emit(Events.AUDIO_ROUTES_SET, { routes: res.routes, continuous: false }, { cause: 'persona:davis' });
    } finally {
      applying = false;
    }
    conductor.commit(landBar);
    announce({ status: 'applied', op: p.op, delta: res.delta, bar: p.bar, landBar });
  };

  stops.push(
    on(Events.CLOCK_BAR, (p) => {
      if (!p || !Number.isInteger(p.bar)) return;
      bar = p.bar;
      if (isReplaying()) return; // a take plays: its own record speaks for the trio
      if (!audio.on) return;
      audio.sinceBars++;
      audio.onsets = audio.onsetsThisBar;
      audio.onsetsThisBar = 0;
      let bands;
      try {
        bands = audio.silent ? null : getBands();
      } catch {
        bands = null;
      }
      if (audio.silent || !getSpectrum) spectrum = null;
      else {
        try {
          spectrum = getSpectrum() || null;
        } catch {
          spectrum = null;
        }
      }
      // #1807: the buffer statistics ride the same bar cadence — the trail
      // is a visual signal, not an audio one, so silence does not void it;
      // ACCUM off voids it (the sampler returns null, and stays honest).
      if (!getTrail) trail = null;
      else {
        try {
          trail = getTrail() || null;
        } catch {
          trail = null;
        }
      }
      let act;
      try {
        act = getActivity ? getActivity() : null;
      } catch {
        act = null;
      }
      bias = flatBias(act || {});
      flatness.setBias(bias);
      flatness.push(bands, spectrum); // stage 2: LOIS judges the spectrum when every bar of the phrase carried one
      if (pending && p.bar >= pending.landBar) land(p.bar);
      publish();
    }),
  );

  stops.push(
    on(Events.MIND_REQUEST, (p) => {
      if (!p || p.persona !== 'davis' || !p.reply || !p.reply.route) return;
      if (isReplaying() || !audio.on) return;
      const op = p.reply.route;
      let tier;
      try {
        tier = getTier();
      } catch {
        tier = null;
      }
      const v = conductor.consider(op, { bar: Number.isInteger(p.bar) ? p.bar : bar, tier });
      if (!v.ok) {
        announce({ status: 'dropped', reason: v.reason, op, bar: p.bar, landBar: null });
        return;
      }
      if (op.op === 'spectrum') {
        // a marks dial the artist locked is theirs, even if they never moved it this session
        const m = readMarks();
        if (m && marksLocked(m, op.key)) {
          announce({ status: 'dropped', reason: 'owned', op, bar: p.bar, landBar: null });
          return;
        }
      }
      if (pending) return; // one is already held for the boundary: the same conducting, said again on the next bar
      pending = { op, landBar: v.landBar, bar: p.bar };
      publish();
    }),
  );

  // The artist: an edit of a route row (not ours) owns the row's targets; an edit of his row clears his mark and, if it
  // undoes what he did, counts as a revert.
  // Moving a target's own dial owns that target too (decision 3). That is read from the slider's own event
  // (layout:param), never from a diff of the layout: a recalled hit, a morph, an evolve or a preset rewrites many dials
  // at once, and none of that is the artist moving a dial by hand.
  const owns = (key) => {
    for (const [target, keys] of Object.entries(DIAL_FOR_TARGET)) if (keys.includes(key)) conductor.touch(target);
  };
  stops.push(
    on(Events.LAYOUT_PARAM, (p) => {
      if (!p || typeof p.key !== 'string') return;
      owns(p.key);
      // stage 2: the artist moving a marks dial Davis set undoes his move — it is theirs now, and it counts as a revert
      const k = SPECTRUM_KEY_OF[p.key];
      if (k && mineMarks.has(k)) {
        mineMarks.delete(k);
        conductor.revert(bar);
        publish();
      }
    }),
  );
  stops.push(
    on(Events.FEEL_APPLY, () => {
      for (const k of ['audioModDepth', 'audioScaleMod', 'audioAlphaMod', 'audioSwell']) owns(k);
    }),
  ); // a FEEL pill sets the audio feel
  if (typeof subscribe === 'function') {
    stops.push(
      subscribe((state, prev) => {
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
            changed.add(pairKey(r));
            touched.add(r.target);
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
            const routes = now.map((r) =>
              r.by === DAVIS_TAG && changed.has(pairKey(r)) ? { input: r.input, target: r.target, depth: r.depth } : r,
            );
            applying = true;
            try {
              emit(Events.AUDIO_ROUTES_SET, { routes, continuous: false }, { cause: 'ownership' });
            } finally {
              applying = false;
            }
          }
        }
      }),
    );
  }

  return {
    conductor,
    /** The `show` block for the personas' context, or null while audio is off or a take plays. */
    showBlock() {
      if (!audio.on || isReplaying()) return null;
      return {
        energy: audio.energy,
        bpm: audio.bpm,
        confidence: audio.confidence,
        onsets: audio.onsets,
        silent: audio.silent,
        sinceBars: audio.sinceBars,
        flatBars: flatness.flatBars(),
        // LOIS's brake: passes piling up — she holds Davis to the safe moves until keeps come back (mindConduct BRAKE_AT)
        ...(bias >= BRAKE_AT ? { brake: true } : {}),
        routes: effective(getRoutes()).map((r) => ({
          input: r.input,
          target: r.target,
          depth: r.depth,
          ...(r.by ? { by: r.by } : {}),
        })),
        owned: [
          ...new Set([
            ...conductor.owned(),
            // a marks dial the artist locked is theirs too (stage 2)
            ...((m) =>
              m && Array.isArray(m.locked) ? m.locked.filter((k) => SPECTRUM_PARAMS[k]).map(spectrumTarget) : [])(
              readMarks(),
            ),
          ]),
        ],
        ...(spectrum ? { spectrum } : {}),
        ...(trail ? { trail } : {}), // #1807: beside the spectrum summary, per the issue
        ...((m) => (m ? { marks: { map: m.map, scale: m.scale, displace: m.displace, colour: m.colour } } : {}))(
          readMarks(),
        ),
      };
    },
    stop() {
      for (const s of stops) {
        try {
          s();
        } catch {
          /* best effort */
        }
      }
      pending = null;
      mineMarks.clear();
      conductor.reset();
      view = null;
      notify();
    },
  };
}

export { PHRASE_BARS };
