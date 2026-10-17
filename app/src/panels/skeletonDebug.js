// skeletonDebug.js — Phase 2 S1: the ?debug=skeleton gate, kept beside the overlay it mounts
// (the ?debug=stress precedent keeps its gate in curator/stressLive.js, next to its readout).

/** True when the page was opened with ?debug=skeleton (the skeleton overlay mounts only then). */
export const isSkeletonDebug = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'skeleton';
