// birthRecord.mjs — #2037: the take's births track, and the tap that feeds it.
//
// A kept take banks the children born in it (ruling 5) — so the take has to carry the births. The
// press site cannot reach the recorder (store actions do not import the performance machinery), so
// it reports through this module-level tap, exactly the davisShift / formationLive pattern: the
// take's section factory installs the recorder's update as the tap while the take runs, and every
// resolved birth resolution — born, stillborn or declined — is noted with its press number. What
// the section stores is the attempt and the child: a born event carries the child's full record,
// so banking a kept take needs nothing but the take itself.

/** The births section's shape version, stored on the take. */
export const BIRTH_RECORD_VERSION = 1;

let birthTap = null;

/** Install (or clear, with null) the live birth tap — the recording take's ear. */
export function setBirthTap(fn) {
  birthTap = typeof fn === 'function' ? fn : null;
}

/** Report one resolved birth resolution to the standing take, if a take is listening. */
export function noteBirth(event) {
  if (!birthTap || !event) return;
  try {
    birthTap(event);
  } catch {
    /* a take that cannot hear a birth does not break the press that dealt it */
  }
}

/**
 * The take-side recorder: collects the birth events of one take.
 * Events are [frame, press, via, outcome, record|null] — the child rides a born event whole.
 */
export function createBirthRecorder({ getFrame = () => 0 } = {}) {
  const events = [];
  return {
    update(e) {
      if (!e || typeof e !== 'object') return;
      events.push([
        getFrame() | 0,
        e.press | 0,
        typeof e.via === 'string' ? e.via : 'spot',
        typeof e.outcome === 'string' ? e.outcome : '',
        e.record || null,
      ]);
    },
    finish() {
      return { version: BIRTH_RECORD_VERSION, events: events.map((e) => e.slice()) };
    },
  };
}

/** The child records a take section carries — what banking a kept take banks. Born events only. */
export function birthRecordsFromSection(section) {
  if (!section || !Array.isArray(section.events)) return [];
  const out = [];
  for (const e of section.events) {
    if (Array.isArray(e) && e[3] === 'born' && e[4]) out.push(e[4]);
  }
  return out;
}
