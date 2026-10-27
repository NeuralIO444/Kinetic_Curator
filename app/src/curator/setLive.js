// setLive.js — #1475: the live driver of the set. Once a frame the live loop asks it for the synthetic band levels; it
// answers null while the stage is ambient and real audio is absent or has the bands.
//
//   idle for a while + no real audio  ->  a beat from the library, chosen by the room, fades in over two bars
//   the artist acts, or real audio arrives  ->  it yields (the arbiter's crossfade), then only what is left
//
// Silent: it adds to the same band feed the meter feeds, so every route, kineme and pattern track reacts as it does to
// real audio, and a take replays it from the inputs it already records (scaleMul / alphaBoost / beatDrive).
import { BEATS } from './beatLibrary.js';
import { playLevels } from './beatPlayer.mjs';
import { createSourceArbiter } from './sourceArbiter.mjs';
import { getMusicalTime } from '../composition/clockLive.js';
import { hashU01 } from '../engine/kernel/rng.js';
import { setSetMagnitude } from './swayView.mjs';

/** Which moods the room asks for (Davis's state), widest first. */
const VIBES_FOR = Object.freeze({
  FLOW: ['drive'],
  SEEDLING: ['calm', 'sparse'],
  STUCK: ['shift', 'weird'],
  UGLY: ['sparse', 'calm'],
  BLOOM: ['lift', 'drive'],
});
const DEFAULT_VIBES = ['calm'];
/** What the stress band asks of the stage. */
const INTENSITY_FOR = Object.freeze({ relax: 0.85, normal: 0.65, tighten: 0.4 });
/** A pattern holds this many bars before the room may pick again. */
export const HOLD_BARS = 16;

const barOf = (t) => t.bar;

/**
 * Choose a pattern: vibe match first, tempo fit second, seeded among the best so the same dish gives the same set.
 * Pure (exported for the selfcheck).
 */
export function choosePattern({ vibes, bpm, seed, slot, lib = BEATS }) {
  const want = Array.isArray(vibes) && vibes.length ? vibes : DEFAULT_VIBES;
  const score = (p) => {
    const vibe = Math.max(0, ...p.vibes.map((v) => (want.includes(v) ? 2 - want.indexOf(v) * 0.5 : 0)));
    const mid = (p.bpm[0] + p.bpm[1]) / 2;
    const fit = bpm >= p.bpm[0] && bpm <= p.bpm[1] ? 1 : Math.max(0, 1 - Math.abs(bpm - mid) / 60);
    return vibe + fit;
  };
  const ranked = lib.map((p) => ({ p, s: score(p) })).sort((a, b) => b.s - a.s || (a.p.id < b.p.id ? -1 : 1));
  const top = ranked.filter((r) => r.s >= ranked[0].s - 0.5).slice(0, 4);
  const u = hashU01(seed >>> 0, 'dyn', 0x5e7 + (slot | 0));
  return top[Math.min(top.length - 1, Math.floor(u * top.length))].p;
}

/**
 * @param getBpm       () => the BEAT BPM
 * @param getIdleMs    () => ms since the artist last did anything
 * @param getRealLevel () => the real audio's overall level 0..1 (0 when off)
 * @param getRoom      () => { davis: 'FLOW' | ... | null, lois: 'AWAY' | ... | null }
 * @param getBand      () => 'relax' | 'normal' | 'tighten' | null
 * @param getSeed      () => the document seed
 * @returns { feed(loopMs), stop() }
 */
export function createSet({ getBpm, getIdleMs, getRealLevel, getRoom, getBand, getSeed }) {
  const arbiter = createSourceArbiter();
  let current = null;
  let slot = -1;
  const feed = (loopMs) => {
    const bpm = Number(getBpm()) || 120;
    const barMs = (60000 / bpm) * 4;
    const idle = Number(getIdleMs());
    const st = arbiter.update(loopMs, idle, getRealLevel(), barMs);
    setSetMagnitude(st.mix > 0.05 ? 0.5 + 0.5 * st.mix : 0);
    if (st.mix <= 0) {
      current = null;
      slot = -1;
      return null;
    }
    const t = getMusicalTime();
    const s = Math.floor(barOf(t) / HOLD_BARS);
    if (!current || s !== slot) {
      slot = s;
      const room = getRoom() || {};
      const vibes = room.lois === 'AWAY' ? ['calm', 'sparse'] : VIBES_FOR[room.davis] || DEFAULT_VIBES;
      current = choosePattern({ vibes, bpm, seed: getSeed(), slot: s });
    }
    const intensity = INTENSITY_FOR[getBand()] ?? INTENSITY_FOR.normal;
    const lv = playLevels(current, t.pos, { intensity });
    return { mix: st.mix, coarse: lv.coarse, bands: lv.bands, source: st.source, pattern: current.id };
  };
  return {
    feed,
    source: () => arbiter.mix(),
    reset() {
      arbiter.reset();
      current = null;
      slot = -1;
      setSetMagnitude(0);
    },
  };
}
