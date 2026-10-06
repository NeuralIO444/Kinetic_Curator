// audioLoss.mjs — what "the audio input went away" means, kept pure (#1053).
//
// An unplugged USB audio device used to leave STIMULI silent with no word. Two
// separate things now say so: a live track that ends mid-run, and a chosen
// device that is already gone when AUDIO is switched on. No DOM, no store.

const DENIED = new Set(['NotAllowedError', 'SecurityError', 'PermissionDeniedError']);
const GONE = new Set(['NotFoundError', 'OverconstrainedError', 'NotReadableError', 'AbortError', 'DevicesNotFoundError']);

/**
 * Why did getUserMedia fail? A missing device is not a denied permission, and
 * the MIC BLOCKED notice must not claim it is. Unknown errors stay 'denied',
 * which is what the app did before this existed.
 * @returns {'denied'|'lost'}
 */
export function classifyAudioError(err) {
  const name = err && err.name;
  if (GONE.has(name) && !DENIED.has(name)) return 'lost';
  return 'denied';
}

/** One plain line (voice 3, blunt-technical) for the STIMULI source section. */
export function lostLine(name) {
  const who = typeof name === 'string' && name.trim() ? name.trim() : 'the audio input';
  return `input lost: ${who}`;
}

/** Audio inputs only, in the browser's order. */
export function audioInputs(devices) {
  return Array.isArray(devices) ? devices.filter((d) => d && d.kind === 'audioinput') : [];
}

/**
 * Is the chosen device missing from the current list? 'default' and file
 * sources are never "missing". An empty list means "not enumerated yet", not
 * "everything is gone", so it reports false.
 */
export function selectedInputMissing(source, devices) {
  if (!source || source.type !== 'device' || !source.id || source.id === 'default') return false;
  if (!Array.isArray(devices) || devices.length === 0) return false;
  return !devices.some((d) => d.deviceId === source.id);
}
