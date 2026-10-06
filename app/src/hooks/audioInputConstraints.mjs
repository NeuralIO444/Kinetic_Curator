// audioInputConstraints.mjs — getUserMedia constraints for a music input (#1052).
//
// Chrome processes microphone input for speech by default: echo cancellation,
// noise suppression and automatic gain. On music they pump and duck the
// signal, so the analyser reacts to the processing instead of the sound.
// KC-1 asks for the raw input. Pure: no DOM, no navigator.

/** The three speech-processing switches, all off. */
export const RAW_AUDIO = Object.freeze({
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
});

/**
 * Constraints for a live input. `sourceId` is 'default' (or empty) for the
 * system default device, otherwise an exact deviceId.
 */
export function audioInputConstraints(sourceId) {
  const audio = { ...RAW_AUDIO };
  if (sourceId && sourceId !== 'default') audio.deviceId = { exact: sourceId };
  return { audio };
}

/**
 * Which of the three the browser kept ON anyway, from track.getSettings().
 * A browser may ignore a constraint; an absent key means "not reported", not
 * "on". Returns [] when the input is raw.
 */
export function processingStillOn(settings) {
  if (!settings || typeof settings !== 'object') return [];
  return Object.keys(RAW_AUDIO).filter((k) => settings[k] === true);
}
