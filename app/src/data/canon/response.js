// data/canon/response.js — #2104 step 4: the Canon STYLE RESPONSE (spec §3, §10 ruling 5).
//
// A style answers the world it stands in. The response is a small record:
//
//   { kineme?: { breath?, drift?, pulse?, wobble? },  // amounts in the kineme vocabulary, each 0..1
//     material?: string }                             // how the style's marks answer the sun
//
// MEASURED BY DEFAULT, AUTHOR OVERRIDE WINS (§10 ruling 5): a style record may carry an authored
// `response` (data/canon/styles.js — the declaration); when it does, that record IS the response.
// When it does not, the response is the MEASURED centre of the style's own settings
// (data/canon/settings.js): the members' mean `breath` answers for kineme breath and their mean
// `lifeDrift` for kineme drift — the two motion quantities the settings actually measure.
// pulse and wobble are unmeasured (the spec says so plainly), so a measured response never
// invents them; only an author may declare them.
//
// THE MATERIAL VOCABULARY IS OPEN (§10 ruling 5): matte / enamel / wet are the starting set,
// not an enum. The door keeps any non-empty string and drops anything else — an unknown
// material is a new material, never an error.
//
// CONSUMPTION IS NOT THIS MODULE'S — AND IS NOT BUILT YET. This module declares and resolves
// the response; nothing on the render path reads it in this step. How the kineme amounts
// compose with a dealt look's own amounts ("scale, never override", spec §3) and how a named
// material reaches the sun are open questions recorded on #2104 — they go back to Matt one at
// a time rather than being decided here. What this step binds is everything the rulings DID
// fix: the world's boil on every clock, the world's finish as the final pass, the world's
// ground under the stage, and playback standing a take's recorded world back up.
import { canonStyleRecord } from './styles.js';
import { canonStyleSettings } from './settings.js';
import { chapterById } from '../chapters.js';

/** The kineme amounts a response may carry — the kineme vocabulary's own keys. */
export const RESPONSE_KINEME_KEYS = Object.freeze(['breath', 'drift', 'pulse', 'wobble']);

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * The one door for a style response (the world door's shape, fail-closed): non-object → null;
 * kineme amounts are kept per known key and clamped to 0..1 (a non-numeric amount drops that
 * key, never the record); the material is kept iff it is a non-empty string (the vocabulary is
 * open — any string is a material). A record carrying neither kineme amounts nor a material
 * is no response at all → null.
 */
export function sanitizeStyleResponse(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  const kin = raw.kineme;
  if (kin && typeof kin === 'object' && !Array.isArray(kin)) {
    const kept = {};
    for (const key of RESPONSE_KINEME_KEYS) {
      const v = Number(kin[key]);
      if (Number.isFinite(v)) kept[key] = clamp01(v);
    }
    if (Object.keys(kept).length) out.kineme = Object.freeze(kept);
  }
  if (typeof raw.material === 'string' && raw.material.trim()) out.material = raw.material.trim();
  return Object.keys(out).length ? Object.freeze(out) : null;
}

/**
 * The response of one Canon style: the authored record when the style declares one (author
 * override), else the measured centre of the style's settings, else null — a style with no
 * members to measure (techno / pixel / organic today) and an unknown id both answer null,
 * which downstream means: unmodulated, exactly as before this module existed.
 */
export function styleResponse(styleId) {
  const rec = canonStyleRecord(styleId);
  if (!rec) return null;
  const authored = sanitizeStyleResponse(rec.response);
  if (authored) return authored;
  const motion = canonStyleSettings(styleId)?.motion;
  if (!motion) return null;
  return sanitizeStyleResponse({ kineme: { breath: motion.breath, drift: motion.lifeDrift } });
}

/** The response of the style a chapter stands on (chapters declare their one Canon style). */
export function chapterStyleResponse(chapterId) {
  const chapter = chapterById(chapterId);
  return chapter ? styleResponse(chapter.style) : null;
}
