// useMindFaces.js — #1462 follow-on: the faces' mind overlay for a component, plus the blend's length (one bar).
import { useEffect, useState } from 'react';
import { getMindFaces, subscribeMindFaces } from '../curator/mindFace.js';
import { useStore } from '../state/store.js';
import { BEATS_PER_BAR } from '../gl/musicalClock.mjs';

/** { lois, davis, barS }: each overlay null or { id, intensity, invented, line, phase, weight }; barS = one bar in seconds. */
export function useMindFaces() {
  const [faces, setFaces] = useState(getMindFaces);
  useEffect(() => subscribeMindFaces(() => setFaces(getMindFaces())), []);
  const bpm = useStore((s) => s.beatBpm);
  const barS = (BEATS_PER_BAR * 60) / (Number.isFinite(bpm) && bpm > 0 ? bpm : 120);
  return { ...faces, barS };
}

/** Inline styles for the two layers of a blended face: the honest one under, the requested one over. */
export function blendStyles(overlay, barS) {
  const w = overlay && overlay.id ? overlay.weight : 0;
  const t = { transition: `opacity ${barS.toFixed(2)}s ease-in-out` };
  return { honest: { ...t, opacity: 1 - w }, mind: { ...t, opacity: w } };
}
