// beatLibrary.js — #1475: a small library of synthetic beats, as DATA (kc-beat/1), not recordings.
//
// Each pattern is 16 steps (sixteenths of a 4-beat bar) per lane: 'x' a full hit, 'o' a soft one, '.' a rest.
// Lanes: kick, snare, hat, bass. `bed` is the level of a slow bed under the hits (0..0.2). `swing` delays the odd
// sixteenths (0 straight .. 0.5 hard shuffle). `bpm` is the range the pattern feels right in; `intensity` 0..1 is how
// much it asks of the stage; `vibes` are the moods it fits.
//
// Hidden by design (DS rule 10): nothing here is surfaced, named in the UI, or listed anywhere a performer can see.
// It plays silently into the band feed (curator/setLive.js); a pack may add patterns later through the same format.

export const BEAT_VERSION = 'kc-beat/1';
export const STEPS = 16;
export const LANES = Object.freeze(['kick', 'snare', 'hat', 'bass']);
export const VIBES = Object.freeze(['calm', 'drive', 'lift', 'sparse', 'shift', 'weird']);

const P = (id, name, bpm, swing, intensity, vibes, lanes, bed = 0.05) => ({ id, name, bpm, swing, intensity, vibes, lanes, bed });

export const BEATS = Object.freeze([
  P('four-floor', 'four on the floor', [118, 128], 0, 0.8, ['drive'], { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..o...o...o...o.', bass: '..x...x...x...x.' }),
  P('slow-four', 'slow four', [70, 90], 0, 0.5, ['calm'], { kick: 'x.......x.......', snare: '................', hat: 'o...o...o...o...', bass: '................' }, 0.1),
  P('broken', 'broken beat', [100, 124], 0.1, 0.7, ['drive', 'shift'], { kick: 'x..x..x...x..x..', snare: '....x.......x..o', hat: 'x.x.x.x.x.x.x.xo', bass: 'x.....x...x.....' }),
  P('half-time', 'half time', [68, 84], 0, 0.55, ['calm', 'shift'], { kick: 'x.........x.....', snare: '........x.......', hat: 'o.o.o.o.o.o.o.o.', bass: 'x...............' }, 0.08),
  P('shuffle', 'shuffle', [88, 110], 0.33, 0.6, ['drive', 'lift'], { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.', bass: 'x.....o...x.....' }),
  P('pulse', 'ambient pulse', [60, 80], 0, 0.3, ['calm', 'sparse'], { kick: 'x...............', snare: '................', hat: '................', bass: '................' }, 0.14),
  P('threes', 'three against four', [96, 120], 0, 0.6, ['weird', 'shift'], { kick: 'x..x..x..x..x..x', snare: '....x.......x...', hat: 'o...o...o...o...', bass: '..o.....o.....o.' }),
  P('build', 'build', [110, 130], 0, 0.75, ['lift'], { kick: 'x...x...x...x...', snare: '........x.xxxxxx', hat: 'x.x.x.x.xxxxxxxx', bass: '................' }),
  P('drop', 'drop', [118, 130], 0, 0.9, ['lift', 'drive'], { kick: 'x.......x.......', snare: '....o.......o...', hat: 'o.o.o.o.o.o.o.o.', bass: 'x...x...x...x...' }, 0.02),
  P('tick', 'sparse tick', [70, 100], 0, 0.25, ['sparse', 'calm'], { kick: '................', snare: '................', hat: 'o...............', bass: '................' }, 0.12),
  P('two-step', 'two step', [128, 140], 0.05, 0.7, ['drive'], { kick: 'x.....x...x...x.', snare: '....x.......x...', hat: 'o.o.xo.o.o.xo.o.', bass: 'x.....o...x.....' }),
  P('breaks', 'breaks', [130, 150], 0.08, 0.85, ['drive', 'weird'], { kick: 'x.......x.x.....', snare: '....x..o.o..x..x', hat: 'x.xxx.xxx.xxx.xx', bass: 'x.......x.x.....' }),
  P('clave', 'clave', [96, 116], 0, 0.5, ['shift', 'weird'], { kick: 'x..x..x...x.x...', snare: '................', hat: 'o.o.o.o.o.o.o.o.', bass: 'x..o..x...x.o...' }),
  P('dub', 'dub', [70, 82], 0.12, 0.5, ['calm', 'weird'], { kick: 'x.......x..x....', snare: '....x.......x...', hat: '..o.....o.....o.', bass: '..x.......x.....' }, 0.1),
  P('eighths', 'driving eighths', [120, 138], 0, 0.8, ['drive', 'lift'], { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo', bass: 'xxxxxxxxxxxxxxxx' }, 0.03),
  P('glitch', 'glitch', [90, 130], 0.18, 0.65, ['weird', 'sparse'], { kick: 'x.....x..x......', snare: '...o....x..o...x', hat: '.x.o..x.o.x..x..', bass: '....x..o......x.' }),
]);

const STEP_RE = /^[xo.]{16}$/;
const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/**
 * Fail-closed validator for one pattern (a pack's, or a built-in in a test). Returns a clean copy or null.
 */
export function sanitizePattern(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && /^[a-z0-9-]{1,40}$/.test(raw.id) ? raw.id : null;
  if (!id) return null;
  const lanes = {};
  for (const l of LANES) {
    const v = raw.lanes && raw.lanes[l];
    if (typeof v !== 'string' || !STEP_RE.test(v)) return null;
    lanes[l] = v;
  }
  const b = Array.isArray(raw.bpm) && raw.bpm.length === 2 ? [Number(raw.bpm[0]), Number(raw.bpm[1])] : null;
  if (!b || !b.every(Number.isFinite) || b[0] < 40 || b[1] > 220 || b[0] > b[1]) return null;
  const vibes = Array.isArray(raw.vibes) ? raw.vibes.filter((v) => VIBES.includes(v)) : [];
  if (vibes.length === 0) return null;
  return {
    id, name: typeof raw.name === 'string' ? raw.name.slice(0, 40) : id,
    bpm: b, swing: num(Number(raw.swing), 0, 0.5, 0), intensity: num(Number(raw.intensity), 0, 1, 0.5),
    vibes, lanes, bed: num(Number(raw.bed), 0, 0.2, 0.05),
  };
}

export function findBeat(id) {
  return BEATS.find((b) => b.id === id) || null;
}
