// hornFaces.js — THE ROOM's horn strip: BLAST, HYBRID, SWISS GRIT, each state a measurement (#2388, Persona Kernel P8).
//
// Pure: no store, no bus, no clock, no timer. The panel hands in what the instrument MEASURED and this names the
// face's state; the face (panels/directors/HornStrip.jsx + curator/hornFaceGeometry.js) draws it. A face changes
// only when a measured input changes — there is no timer with an opinion, and no random draw (house rule, spec §4b).
//
// The measured inputs (every one an existing signal; nothing here is invented):
//   stageMode  the standing poem's treatment mode (layoutParams.fieldForm.raygun.mode) — 'carson' | 'shot' are
//              BLAST's, 'greiman' is HYBRID's (today's float mode, spec Q13 item 4), 'grit' is SWISS GRIT's. Set by
//              the performer's tap or by a doctrine's call; either way it is what is ON THE STAGE.
//   standing   the doctrine the Director has handed the stage to (state.poemDoctrine): 'carson' | 'ashworth' | null.
//              Armed for the next deal. HYBRID is not a doctrine yet (P5 #2385), so no horn reads 'greiman' here.
//   heat       the KIN tap heat step the instrument is showing (panels/layout/kineticHeat.mjs heatStep, 0..3). The
//              one measured heat in the instrument today; it sets how hard BLAST tears, and only while BLAST holds
//              the floor.
//   band       what the band did THIS phrase to this horn (bandRead below), from the personas/bandLive.js view.
//              Null when the band is off — the default — and, with the shipped null tuning table, always at rest.
//
// Not wired yet (so the face shows its at-rest state and says nothing more): HYBRID's bitmap bake, layered planes
// and spectrum colour (P5 #2385) and every doctrine's layout moves (P6 #2386). Until they land, HYBRID leaves rest
// only on its stage mode or on a band turn; SWISS GRIT and BLAST also on their standing doctrine.
//
// Surface law (R6): callsigns only. The state words below are the only copy this module produces.

import { getPersona } from '../personas/registry.mjs';
import { standingSolo } from '../personas/band.mjs';

/** The horn section in strip order (BLAST, HYBRID, SWISS GRIT), as record ids. */
export const HORN_IDS = Object.freeze(['carson', 'greiman', 'ashworth']);

/** Which treatment modes on the standing poem are each horn's own. */
export const HORN_STAGE_MODES = Object.freeze({
  carson: Object.freeze(['carson', 'shot']),
  greiman: Object.freeze(['greiman']),
  ashworth: Object.freeze(['grit']),
});

/** The doctrines the Director can hand the stage to (today BLAST and SWISS GRIT; HYBRID joins with P5). */
export const HORN_DOCTRINE_IDS = Object.freeze(['carson', 'ashworth']);

/** The tile's lowercase callsign, as the existing tiles set theirs (`cover`, `overlap`). */
export const hornLabel = (id) => getPersona(id).identity.callsign.toLowerCase();
/** The tile's own short name: SWISS GRIT is set as `swissg` so the name never clips in a narrow tile (Matt, 2026-11-19). Chat lines keep the full callsign. */
export const HORN_TILE_NAMES = Object.freeze({ ashworth: 'swissg' });
export const hornTileName = (id) => HORN_TILE_NAMES[id] ?? hornLabel(id);
/** The callsign as it reads in a sentence (BLAST, HYBRID, SWISS GRIT). */
export const hornCallsign = (id) => getPersona(id).identity.callsign;

export const HORN_WORDS = Object.freeze({
  REST: 'LAID OUT',
  ARMED: 'ARMED',
  SPECTRUM: 'SPECTRUM',
  BUILD: 'BUILDING',
  TEAR: Object.freeze([null, 'TEARING', 'SCATTER', 'BLASTING']),
  GRIT: 'GRITTING',
});

const isHorn = (id) => HORN_IDS.includes(id);
const clampStep = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(3, Math.round(n))) : 0);
const int = (n) => (Number.isFinite(n) ? Math.trunc(n) : 0);

/**
 * What the band did to horn `id` this phrase, from the band view (personas/bandLive.js getBandView) — or null when
 * the band is off. Only turns stamped with the view's own current phrase count: an answer lapses when the phrase
 * moves on, so a face never holds a stale verdict.
 *
 * @returns {null | { phrase:number, owns:boolean, answer:null|{verdict:string,move:string,to:string}, cutByCover:boolean, ended:boolean }}
 */
export function bandRead(id, view) {
  if (!view || !view.on || !view.state || !isHorn(id)) return null;
  const phrase = view.state.phrase;
  const log = Array.isArray(view.log) ? view.log : [];
  const now = log.filter((t) => t && t.phrase === phrase);
  let answer = null;
  let cutByCover = false;
  let ended = false;
  for (const t of now) {
    if (t.kind === 'trade' && Array.isArray(t.answers)) {
      const mine = t.answers.find((a) => a && a.by === id);
      if (mine) answer = { verdict: mine.verdict, move: mine.move, to: t.by };
      if (t.by === id && t.answers.some((a) => a && a.by === 'lois' && a.move === 'cut')) cutByCover = true;
    }
    if (t.kind === 'yield' && t.ended === id) ended = true;
    if (t.kind === 'cut' && t.target === id) ended = true;
  }
  const solo = standingSolo(view.state, phrase);
  return { phrase, owns: !!solo && solo.by === id, answer, cutByCover, ended };
}

/**
 * One horn's face state from the measured inputs. Pure and total: junk in, rest out.
 *
 * @param {string} id  'carson' | 'greiman' | 'ashworth'
 * @param {{ stageMode?: string|null, stageSeed?: number|null, standing?: string|null, heat?: number, band?: object|null }} [m]
 * @returns {{ id:string, code:'REST'|'ARMED'|'ON'|'BUILD', word:string, degree:number, layers:number, armed:boolean,
 *             variant:number, reasons:string[] }}
 *   code     REST laid out · ARMED the doctrine stands, nothing on the stage yet · ON holding the floor · BUILD agreed
 *            with the call this phrase
 *   degree   0..3 — how torn (BLAST: the heat step) or how misregistered/gritted (SWISS GRIT); 0 for HYBRID
 *   layers   1 or 3 — HYBRID's translucent stack (3 only while she builds on someone)
 *   variant  the measured integer that picks the pattern (the band's phrase, else the stage record's seed); 0 at rest
 */
export function resolveHornState(id, m = {}) {
  const rest = Object.freeze({
    id,
    code: 'REST',
    word: HORN_WORDS.REST,
    degree: 0,
    layers: 1,
    armed: false,
    variant: 0,
    reasons: Object.freeze([]),
  });
  if (!isHorn(id)) return rest;
  const stage = !!m.stageMode && HORN_STAGE_MODES[id].includes(m.stageMode);
  const standing = m.standing === id && HORN_DOCTRINE_IDS.includes(id);
  const band = m.band || null;
  const owns = !!band && band.owns === true;
  const move = band && band.answer ? band.answer.move : null;
  const build = move === 'build';
  const counter = move === 'counter';
  const reasons = [];
  if (stage) reasons.push('stage');
  if (standing) reasons.push('standing');
  if (owns) reasons.push('solo');
  if (build) reasons.push('build');
  if (counter) reasons.push('counter');

  const onFloor = stage || owns || build || counter;
  const bandOnHorn = owns || build || counter;
  const variant = bandOnHorn && band ? int(band.phrase) : stage ? int(m.stageSeed) : 0;
  const heat = clampStep(m.heat);
  const out = (over) => Object.freeze({ ...rest, reasons: Object.freeze(reasons), variant, ...over });

  if (id === 'carson') {
    if (onFloor) {
      const degree = Math.max(1, heat);
      return out({ code: build ? 'BUILD' : 'ON', word: HORN_WORDS.TEAR[degree], degree });
    }
    if (standing) return out({ code: 'ARMED', word: HORN_WORDS.ARMED, armed: true, variant: 0 });
    return rest;
  }
  if (id === 'greiman') {
    if (build) return out({ code: 'BUILD', word: HORN_WORDS.BUILD, layers: 3 });
    if (onFloor) return out({ code: 'ON', word: HORN_WORDS.SPECTRUM });
    return rest;
  }
  // ashworth: the grid first, the destruction by rule — it grits only while it is actually destroying
  if (onFloor) {
    const degree = Math.min(3, (stage ? 2 : 1) + (stage && bandOnHorn ? 1 : 0));
    return out({ code: build ? 'BUILD' : 'ON', word: HORN_WORDS.GRIT, degree });
  }
  if (standing) return out({ code: 'ARMED', word: HORN_WORDS.ARMED, armed: true, variant: 0 });
  return rest;
}

/** All three horns, in strip order: [{ id, label, tile, callsign, ...state }]. */
export function resolveHorns(m = {}) {
  return HORN_IDS.map((id) => ({
    ...resolveHornState(id, { ...m, band: m.bands ? m.bands[id] : null }),
    label: hornLabel(id),
    tile: hornTileName(id),
    callsign: hornCallsign(id),
  }));
}
