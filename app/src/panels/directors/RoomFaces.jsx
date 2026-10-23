// RoomFaces.jsx — #1560 S1 built this seam; S2 fills it: what renders INSIDE the codec's two face windows.
//
// ── SLICE 2: THE GENERATIVE FACES (docs/research/room-codec/06-faces-generative.md) ─────────────────────
// One dither pipeline, two sources (curator/roomDither.js does the math; this file owns the canvases, the
// animation clock and the OS motion preference):
//   Davis — his live rosette (the seed's sigil geometry) as a colour field, ordered-Bayer into a ramp of his
//           amber. The source turns at his state's own tempo (davisSigil's table) and breathes; the dither
//           stays stable while the source moves.
//   LOIS  — a shaded face construction read as glyph dither: cells shaded by character weight from her
//           state's fixed glyph set, her red entering by the state's tint.
// Both faces render the persona's REAL current state — the same honest state and mind overlay the panel
// already resolves — at the resolution of the persona's engagement tier (tier = resolution; the presence
// view's per-persona row, the dev panel's own source). State changes ease the face parameters to the new
// set, then settle to ambient breath (state-and-breath only — 08-Q11 default). Reduced motion settles both
// faces to a still dither (law 5): no turning, no breath, parameters snapped.
// The panel (RoomCodec), the window chrome, the name/state dressing and the transcript do not change.
import { useEffect, useMemo, useRef, useState } from 'react';
import { loisLook } from '../../curator/mindFace.js';
import { LOIS_FACES } from '../../curator/loisFace.js';
import { blendStyles } from '../../hooks/useMindFaces.js';
import { getPresenceView, subscribePresence } from '../../curator/mindPresenceLive.js';
import { UNMODULATED } from '../../curator/mindZodiac.js';
import {
  DITHER_GRIDS, gridTierFor, vibeBend, orderedLevel,
  buildDavisSource, davisSampler, davisFaceParams, davisRamp, DAVIS_LEVELS,
  loisSampler, loisFaceParams, loisInk, LOIS_GLYPHS, LOIS_LEVELS,
} from '../../curator/roomDither.js';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const CELL_PX = 6; // backing-store px per dither cell: the grid is the resolution, the canvas stays crisp
const TICK_MS = 110; // ambient redraw cadence — slow motion only (a turning rosette, a breath), never a video

/** The OS motion preference, live (LoisPill's pattern, #1588). */
function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED_MOTION_QUERY).matches,
  );
  useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia?.(REDUCED_MOTION_QUERY) : null;
    if (!mq?.addEventListener) return undefined;
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

/**
 * The persona's presence row — { tier, cool, mod } — plus the session's calendar reading, from the same
 * published view the dev panel reads (mindPresenceLive). Before the driver publishes (or if it never
 * runs) the face renders at tier 1, unmodulated: the honest floor, not a substitute reading.
 */
function useFacePresence(persona) {
  const [view, setView] = useState(getPresenceView);
  useEffect(() => subscribePresence(() => setView(getPresenceView())), []);
  const label = persona === 'lois' ? 'LOIS' : 'DAVIS';
  const row = view?.rows?.find((r) => r.label === label);
  return {
    tier: row?.tier ?? 1,
    cool: row?.cool ?? false,
    mod: row?.mod ?? UNMODULATED,
    reading: view?.reading ?? null,
  };
}

/** A design token as [r, g, b]: a `--x-rgb` triple when the token offers one, else the hex token parsed. */
function tokenRgb(el, tripleVar, hexVar, fallback) {
  if (!el) return fallback;
  const cs = getComputedStyle(el);
  const triple = cs.getPropertyValue(tripleVar).trim();
  if (triple) { const p = triple.split(',').map((v) => parseInt(v, 10)); if (p.length === 3 && p.every(Number.isFinite)) return p; }
  const hex = cs.getPropertyValue(hexVar).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  return fallback;
}

/**
 * The animation heart both faces share: a tiny rAF loop throttled to TICK_MS, easing the current parameter
 * set toward the target (state changes animate, then settle — 06), frozen solid under reduced motion.
 * `draw(params, phase)` paints one frame; phase = { angle, breath, lift } from the ambient clock.
 * Returns { ref, motion } — motion is 'turning' while the face is alive, 'still' when settled (the e2e
 * contract the sigil's class used to carry).
 */
function useFaceCanvas({ target, draw }) {
  const ref = useRef(null);
  const stateRef = useRef({ params: target, angle: 0, last: null });
  const drawRef = useRef(draw);
  const targetRef = useRef(target);
  useEffect(() => { drawRef.current = draw; targetRef.current = target; });
  const [motion, setMotion] = useState('still');
  const reduced = useReducedMotion();

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const st = stateRef.current;
    let raf = 0; let lastTick = 0;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (lastTick && now - lastTick < TICK_MS) return;
      const dt = st.last ? Math.min(0.5, (now - st.last) / 1000) : 0;
      st.last = now; lastTick = now;
      const tgt = targetRef.current;
      // ease the parameters toward the target set (a state's face re-generates, it does not cut)
      let maxDelta = 0;
      const next = { ...st.params };
      for (const k of Object.keys(tgt)) {
        if (typeof tgt[k] === 'number' && typeof next[k] === 'number') {
          const d = (tgt[k] - next[k]) * (reduced ? 1 : 1 - Math.exp(-dt / 0.35));
          next[k] += d; maxDelta = Math.max(maxDelta, Math.abs(tgt[k] - next[k]));
        } else next[k] = tgt[k];
      }
      st.params = next;
      const spin = tgt.spinS && next.spinDir ? next.spinDir / tgt.spinS : 0; // radians/sec comes from the tempo
      if (!reduced && spin) st.angle += spin * Math.PI * 2 * dt;
      const t = now / 1000;
      // Her breath, at an amplitude the dither can feel (Matt, 2026-10-23: LOIS was hardly visible — an idle
      // animation like Davis's): the lift used to run ±0.006, under the glyph ramp's quantization step
      // (~0.055 of shade), so the construction breathed on paper and sat still on screen. It now runs
      // Davis's breath magnitude at HER per-state tempo (params.breathS — BURN hurries, AWAY drifts), and
      // the cells at every contour flip as the face rises and settles. His draw reads `breath`; hers `lift`.
      const liftS = Number.isFinite(next.breathS) && next.breathS > 0 ? next.breathS : 5.25;
      const phase = {
        angle: st.angle,
        breath: reduced ? 1 : 1 + 0.028 * Math.sin((t * Math.PI * 2) / 6.5),
        lift: reduced ? 0 : 0.028 * Math.sin((t * Math.PI * 2) / liftS),
      };
      drawRef.current(cv, st.params, phase);
      const alive = !reduced && (!!spin || maxDelta > 0.002);
      setMotion((cur) => { const m = alive ? 'turning' : 'still'; return cur === m ? cur : m; });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return { ref, motion };
}

/** Paint a grid of colour dots (Davis) from a sampler. One path per level: five fills a frame, no more. */
function paintDots(cv, cells, sampler, ramp, levels) {
  const cx = cv.getContext && cv.getContext('2d');
  if (!cx) return;
  const px = cells * CELL_PX;
  if (cv.width !== px) { cv.width = px; cv.height = px; }
  cx.clearRect(0, 0, px, px);
  const paths = Array.from({ length: levels }, () => []);
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const x = ((i + 0.5) / cells) * 2 - 1; const y = ((j + 0.5) / cells) * 2 - 1;
      const lvl = orderedLevel(sampler(x, y), i, j, levels);
      if (lvl > 0) paths[lvl].push([i, j]);
    }
  }
  const rad = CELL_PX * 0.44;
  for (let lvl = 1; lvl < levels; lvl++) {
    if (!paths[lvl].length) continue;
    cx.fillStyle = ramp[lvl];
    cx.beginPath();
    for (const [i, j] of paths[lvl]) {
      const cxp = (i + 0.5) * CELL_PX; const cyp = (j + 0.5) * CELL_PX;
      cx.moveTo(cxp + rad, cyp);
      cx.arc(cxp, cyp, rad, 0, 7);
    }
    cx.fill();
  }
}

/** Paint a grid of glyphs (LOIS): one glyph per cell, its weight picked by the dither stage, its ink by level. */
function paintGlyphs(cv, cells, sampler, glyphs, inks) {
  const cx = cv.getContext && cv.getContext('2d');
  if (!cx) return;
  const px = cells * CELL_PX;
  if (cv.width !== px) { cv.width = px; cv.height = px; }
  cx.clearRect(0, 0, px, px);
  cx.font = `${CELL_PX}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  let lastInk = null;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const x = ((i + 0.5) / cells) * 2 - 1; const y = ((j + 0.5) / cells) * 2 - 1;
      const lvl = orderedLevel(sampler(x, y), i, j, LOIS_LEVELS);
      const g = glyphs[lvl];
      if (!g || g === ' ') continue;
      if (inks[lvl] !== lastInk) { cx.fillStyle = inks[lvl]; lastInk = inks[lvl]; }
      cx.fillText(g, (i + 0.5) * CELL_PX, (j + 0.5) * CELL_PX + CELL_PX * 0.06);
    }
  }
}

// LOIS's honest faces are unique strings; the code is recovered from the face the panel resolved (the seam
// hands this component the face, as it always has).
const LOIS_CODE_BY_FACE = Object.freeze(Object.fromEntries(Object.values(LOIS_FACES).map((f) => [f.face, f.code])));

/**
 * LOIS's face, generative (S2): the shaded construction in glyph dither, wearing the honest state's
 * parameter set — with the mind's requested face easing over it for the blend's length when the mind has
 * asked for one, exactly the seam's old contract (one bar, cross-faded, honest face underneath).
 */
export function LoisFaceNow({ face, overlay, barS }) {
  const look = overlay?.id ? loisLook(overlay.id) : null;
  const styles = blendStyles(overlay, barS);
  const honestCode = LOIS_CODE_BY_FACE[face] || 'VIBE';
  return (
    <span className="codec-face mind-blend" aria-hidden="true">
      <span className="mind-honest" style={styles.honest}><LoisDither code={honestCode} /></span>
      {look && <span className="mind-over" style={styles.mind}><LoisDither code={look.code} /></span>}
    </span>
  );
}

function LoisDither({ code }) {
  const presence = useFacePresence('lois');
  const cells = DITHER_GRIDS[gridTierFor(presence.tier, presence.cool)];
  const bend = vibeBend(presence.mod, presence.reading);
  const target = useMemo(() => ({ ...loisFaceParams(code), spinS: null, spinDir: 0 }), [code]);
  const inkRef = useRef(null);
  const { ref } = useFaceCanvas({
    target,
    draw: (cv, params, phase) => {
      if (!inkRef.current) {
        const ink = tokenRgb(cv, '--ink-rgb', '--ink', [232, 232, 224]);
        const red = tokenRgb(cv, '--kc-red-rgb', '--kc-red', [255, 77, 0]);
        inkRef.current = { ink, red };
      }
      const glyphs = LOIS_GLYPHS[params.glyphs] || LOIS_GLYPHS.vibe;
      const inks = Array.from({ length: LOIS_LEVELS }, (_, l) => loisInk(l, params.tint, bend.warmth, inkRef.current.ink, inkRef.current.red));
      paintGlyphs(cv, cells, loisSampler(params, { lift: phase.lift, contrast: bend.contrast }), glyphs, inks);
    },
  });
  return <canvas ref={ref} className="codec-dither lois-dither" width={cells * CELL_PX} height={cells * CELL_PX} data-state={code} aria-hidden="true" />;
}

/**
 * Davis's face, generative (S2): his rosette — the seed's own sigil geometry — dithered in colour. It
 * turns at the tempo of the state it is handed (the panel resolves which code: a requested canonical state
 * turns at its own tempo, an invented one keeps his honest tempo) and is still and dim at rest, as the
 * sigil was; the state is readable from the label with the motion off (DS rule 7).
 */
export function DavisFaceNow({ seed, code }) {
  const presence = useFacePresence('davis');
  const cells = DITHER_GRIDS[gridTierFor(presence.tier, presence.cool)];
  const bend = vibeBend(presence.mod, presence.reading);
  const source = useMemo(() => buildDavisSource(seed), [seed]);
  const target = useMemo(() => davisFaceParams(code), [code]);
  const rgbRef = useRef(null);
  const { ref, motion } = useFaceCanvas({
    target,
    draw: (cv, params, phase) => {
      if (!rgbRef.current) rgbRef.current = tokenRgb(cv, '--kc-davis-rgb', '--kc-davis', [255, 205, 130]);
      const sampler = davisSampler(source, {
        angle: phase.angle, breath: code ? phase.breath : 1,
        density: params.density, ringGain: params.ringGain, contrast: bend.contrast,
      });
      paintDots(cv, cells, sampler, davisRamp(rgbRef.current, bend.warmth), DAVIS_LEVELS);
    },
  });
  return (
    <canvas ref={ref} className="codec-dither davis-dither" width={cells * CELL_PX} height={cells * CELL_PX}
      data-state={code || 'none'} data-motion={code ? motion : 'still'} role="img"
      aria-label={code ? `Davis, ${code}` : 'Davis, resting'} />
  );
}
