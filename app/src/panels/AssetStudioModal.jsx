// AssetStudioModal — motif kit over P02. Not Illustrator.
// Lazy-loaded: the live bundle never imports this until the modal opens.
import { useEffect, useMemo, useRef, useState } from 'react';
import { PRIMITIVES } from '../assets/primitives.js';
import { traceSilhouette, blendContours, outerLoop, loopsToD, loopsToPath } from '../assets/silhouette.js';
import { ingestSvg } from '../assets/ingest.js';
import { sampleRig, rigFromStudioParts, hasRig, studioPartSvg, partAxes } from '../assets/subAnim.mjs';
import { ALL_CATEGORIES } from '../data/categories.js';
import { emit, Events } from '../composition/eventBus.js';

const ANIM_KINDS = ['none', 'spin', 'osc', 'pulse', 'blink', 'march'];

let seq = 1;
const SNAP = 10;
const UNDO_CAP = 20;
const snap = (n) => Math.round(n / SNAP) * SNAP;
const clampS = (n) => Math.max(0.3, Math.min(2.5, +Number(n).toFixed(2)));

function toSvg(parts) {
  return parts.map((p) => studioPartSvg(p)).join('');
}

function fresh(kind, extra = {}) {
  return { key: seq++, kind, x: 50, y: 50, rot: 0, scale: 1, sx: 1, sy: 1, token: 'ink', stroke: false, anim: { kind: 'none', amp: 20, phase: 0 }, ...extra };
}

/** Fingerprint of everything the merge trace depends on (module-level: no hook deps). */
function mergeKeyFor(allParts, keys, meltAmt, blend, subKeys = []) {
  const set = allParts.filter((p) => keys.includes(p.key));
  const fp = set
    .map((p) => [p.key, p.kind, p.x, p.y, p.rot, p.sx, p.sy, p.token, p.stroke, p.n, p.svg,
      subKeys.includes(p.key) ? 'sub' : 'add'].join('|'))
    .join(';');
  return `${blend ? 'B' : 'M'}|${meltAmt}|${fp}`;
}

export function AssetStudioModal({ seedSvg = '', seedId = '', onClose }) {
  const [parts, setParts] = useState(() => (
    seedSvg ? [fresh('seed', { svg: seedSvg })] : []
  ));
  const [picked, setPicked] = useState(-1);
  const [category, setCategory] = useState('organic');
  const [hint, setHint] = useState(seedId.replace(/^user:/, '') || 'motif');
  const [sides, setSides] = useState(6);
  const [error, setError] = useState('');
  const [undoDepth, setUndoDepth] = useState(0);
  // Merge kit: tick 2+ parts to fuse. The preview traces the fused silhouette
  // live (accent); bake replaces the set with one 'merged' part via commit().
  // Trace results live in state, written only from async continuations —
  // the effect body itself never calls setState (lint rule).
  const [mergeKeys, setMergeKeys] = useState([]);
  // Subtract kit: ticked shapes flipped to "minus" punch holes out of the
  // merge instead of fusing in. Always a subset of mergeKeys.
  const [subtractKeys, setSubtractKeys] = useState([]);
  const [melt, setMelt] = useState(0);
  const [blendOn, setBlendOn] = useState(false);
  const [blendT, setBlendT] = useState(0.5);
  const [blendHold, setBlendHold] = useState(false);
  const [mergeOut, setMergeOut] = useState({ key: '', svg: '', d: '' });
  const [blendPair, setBlendPair] = useState(null);
  const traceToken = useRef(0);
  const drag = useRef(null);
  const svgRef = useRef(null);
  const sheetRef = useRef(null);

  // Parts ref mirrors state so commits can snapshot synchronously.
  const partsRef = useRef(parts);
  const histRef = useRef([]);
  const sync = (next) => { partsRef.current = next; setParts(next); };
  const snapshot = () => {
    histRef.current.push(partsRef.current);
    if (histRef.current.length > UNDO_CAP) histRef.current.shift();
    setUndoDepth(histRef.current.length);
  };
  /** Commit a new parts array, pushing the pre-state onto the undo stack. */
  const commit = (fn) => {
    snapshot();
    sync(fn(partsRef.current));
  };
  /** Apply without pushing (drag moves snapshot once at drag start). */
  const live = (fn) => sync(fn(partsRef.current));
  const undo = () => {
    const prev = histRef.current.pop();
    if (prev === undefined) return;
    sync(prev);
    setUndoDepth(histRef.current.length);
    setPicked(-1);
    setError('');
  };

  const svg = useMemo(() => toSvg(parts), [parts]);
  const compound = parts.length > 1;
  // Merge keys always name live parts (deleted keys are filtered, never stored back).
  const validMergeKeys = useMemo(
    () => mergeKeys.filter((k) => parts.some((p) => p.key === k)),
    [mergeKeys, parts],
  );
  const validSubtractKeys = useMemo(
    () => subtractKeys.filter((k) => validMergeKeys.includes(k)),
    [subtractKeys, validMergeKeys],
  );
  // 2+ ticked with at least one positive: 1 add + 1 subtract punches a hole.
  const merging = validMergeKeys.length >= 2
    && validMergeKeys.some((k) => !validSubtractKeys.includes(k));
  const toggleSubtract = (key) => {
    setSubtractKeys((ks) => (ks.includes(key) ? ks.filter((k) => k !== key) : [...ks, key]));
    setBlendOn(false);
  };

  // Live merge preview: rasterize the merge set, trace the fused silhouette
  // (the canvas boolean-unions overlaps for free), melt the joins
  // metaball-style, draw in accent. Dragging a part or moving the slider
  // re-traces; stale async runs are dropped by the token. While
  // re-tracing, the previous preview stays up (no flicker).
  useEffect(() => {
    const set = parts.filter((p) => validMergeKeys.includes(p.key));
    const positives = set.filter((p) => !validSubtractKeys.includes(p.key));
    const negatives = set.filter((p) => validSubtractKeys.includes(p.key));
    const key = mergeKeyFor(parts, validMergeKeys, melt, blendOn, validSubtractKeys);
    if (mergeOut.key === key) return undefined;
    const token = ++traceToken.current;
    let cancelled = false;
    (async () => {
      try {
        let svgOut = '';
        let dOut = '';
        let pair = null;
        if (set.length >= 2 && positives.length >= 1) {
          const loops = await traceSilhouette(toSvg(positives), 320, melt, toSvg(negatives));
          if (cancelled || token !== traceToken.current) return;
          dOut = loopsToD(loops);
          if (dOut) {
            svgOut = loopsToPath(loops).replace('currentColor', 'var(--accent)');
            // Blend morphs the outer silhouettes of the first two merge
            // shapes. Traced lazily: only while the blend preview is on.
            if (blendOn) {
              const la = outerLoop(await traceSilhouette(toSvg([positives[0]]), 200));
              const lb = outerLoop(await traceSilhouette(toSvg([positives[1]]), 200));
              if (cancelled || token !== traceToken.current) return;
              pair = la && lb ? { a: la, b: lb } : null;
            }
          }
        }
        if (cancelled || token !== traceToken.current) return;
        setMergeOut({ key, svg: svgOut, d: dOut });
        setBlendPair(pair);
      } catch {
        if (cancelled || token !== traceToken.current) return;
        setMergeOut({ key, svg: '', d: '' });
        setBlendPair(null);
        setError('merge preview failed — shapes stay separate');
      }
    })();
    return () => { cancelled = true; };
  }, [parts, validMergeKeys, validSubtractKeys, melt, blendOn, mergeOut.key]);

  // Blend scrub: ping-pong t 0→1→0 while the toggle is on, unless the user
  // is holding the manual slider.
  useEffect(() => {
    if (!blendOn || blendHold) return undefined;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now) => {
      setBlendT(0.5 - 0.5 * Math.cos(((now - t0) / 2600) * Math.PI * 2));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [blendOn, blendHold]);

  const blendSvg = useMemo(() => {
    if (!blendOn || !blendPair) return '';
    return loopsToPath([blendContours(blendPair.a, blendPair.b, blendT)])
      .replace('currentColor', 'var(--accent)');
  }, [blendOn, blendPair, blendT]);

  // The merge preview replaces the ticked parts on stage; the rest draw normally.
  // A shrunken merge set hides the preview via `merging` (no stale flash).
  const stageBase = useMemo(
    () => toSvg(merging ? parts.filter((p) => !validMergeKeys.includes(p.key)) : parts),
    [parts, validMergeKeys, merging],
  );
  // Blend falls back to the merged preview until its own trace lands.
  const previewSvg = merging ? (blendOn ? (blendSvg || mergeOut.svg) : mergeOut.svg) : '';
  // Bake is only offered when the trace matches the current inputs.
  const bakeReady = mergeOut.key === mergeKeyFor(parts, validMergeKeys, melt, blendOn, validSubtractKeys) && !!mergeOut.d;

  /** Fuse the merge set into one part; undo restores the originals. */
  const bakeMerge = () => {
    const key = mergeKeyFor(partsRef.current, validMergeKeys, melt, blendOn, validSubtractKeys);
    if (mergeOut.key !== key || !mergeOut.d) return;
    const set = partsRef.current.filter((p) => validMergeKeys.includes(p.key));
    if (set.length < 2) return;
    const mergedPart = fresh('merged', {
      svg: `<path d="${mergeOut.d}" fill-rule="evenodd" fill="currentColor"/>`,
    });
    commit((p) => [...p.filter((row) => !validMergeKeys.includes(row.key)), mergedPart]);
    setMergeKeys([]);
    setSubtractKeys([]);
    setBlendOn(false);
    setBlendHold(false);
    setPicked(partsRef.current.length - 1);
  };

  // ---- ANIM: sub-animation rig (sprite-editor edition) ----
  const [animPeriod, setAnimPeriod] = useState(1.6);
  const [animFrames, setAnimFrames] = useState(8);
  const [previewFrame, setPreviewFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  const rig = useMemo(() => rigFromStudioParts(parts), [parts]);
  const rigActive = useMemo(() => hasRig(parts), [parts]);
  // Filmstrip: the baked frame strip, re-rendered live whenever the rig changes.
  const stripFrames = useMemo(() => {
    if (!rigActive) return [];
    const out = [];
    for (let i = 0; i < animFrames; i++) out.push(sampleRig(rig, (i / animFrames) * animPeriod, animPeriod));
    return out;
  }, [rig, rigActive, animFrames, animPeriod]);

  useEffect(() => {
    if (!playing || !rigActive) return undefined;
    const ms = Math.max(60, (animPeriod / animFrames) * 1000);
    const id = setInterval(() => setPreviewFrame((f) => (f + 1) % animFrames), ms);
    return () => clearInterval(id);
  }, [playing, rigActive, animPeriod, animFrames]);

  const pickedAnim = (picked >= 0 && parts[picked]?.anim) || { kind: 'none', amp: 20, phase: 0 };
  const setAnimKind = (kind) => {
    if (picked < 0) return;
    commit((p) => p.map((row, i) => (i === picked
      ? { ...row, anim: { kind, amp: row.anim?.amp ?? 20, phase: row.anim?.phase ?? 0 } }
      : row)));
  };
  // Sliders scrub live (one undo step per drag: snapshot on grab).
  const beginScrub = () => { if (picked >= 0) snapshot(); };
  const scrubAnim = (patch) => {
    if (picked < 0) return;
    live((p) => p.map((row, i) => (i === picked ? { ...row, anim: { ...row.anim, ...patch } } : row)));
  };

  // Esc closes the modal; the live canvas keeps running underneath.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const add = (kind) => {
    commit((p) => {
      const extra = kind === 'poly' ? { n: sides } : {};
      const next = [...p, fresh(kind, extra)];
      setPicked(next.length - 1);
      return next;
    });
  };
  const patchSel = (fn) => {
    if (picked < 0) return;
    commit((p) => p.map((row, i) => (i === picked ? fn(row) : row)));
  };
  const bump = (key, d) => patchSel((r) => {
    const { sx, sy } = partAxes(r);
    if (key === 'both') {
      const n = clampS((sx + sy) / 2 + d);
      return { ...r, scale: n, sx: n, sy: n };
    }
    const next = key === 'sx' ? clampS(sx + d) : clampS(sy + d);
    return key === 'sx' ? { ...r, sx: next } : { ...r, sy: next };
  });
  const delSel = () => {
    if (picked < 0) return;
    const i = picked;
    const deadKey = partsRef.current[i]?.key;
    commit((p) => p.filter((_, n) => n !== i));
    if (deadKey !== undefined) setMergeKeys((ks) => ks.filter((k) => k !== deadKey));
    setPicked(-1);
  };
  const dup = () => {
    if (picked < 0) return;
    commit((p) => {
      const copy = { ...p[picked], key: seq++, x: snap(p[picked].x + 10), y: snap(p[picked].y + 10) };
      const next = [...p, copy];
      setPicked(next.length - 1);
      return next;
    });
  };
  const zShift = (dir) => {
    if (picked < 0) return;
    const i = picked;
    commit((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const next = p.slice();
      const tmp = next[i]; next[i] = next[j]; next[j] = tmp;
      setPicked(j);
      return next;
    });
  };

  const pt = (e) => {
    const el = svgRef.current;
    if (!el) return { x: 50, y: 50 };
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
    };
  };

  const onDown = (e) => {
    const { x, y } = pt(e);
    let hit = -1;
    let best = 1e9;
    partsRef.current.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < best && d < 18 * 18) { best = d; hit = i; }
    });
    setPicked(hit);
    if (hit >= 0) {
      snapshot(); // one undo step for the whole drag
      drag.current = { i: hit, dx: partsRef.current[hit].x - x, dy: partsRef.current[hit].y - y };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const { x, y } = pt(e);
    const { i, dx, dy } = drag.current;
    live((p) => p.map((row, n) => (n === i ? { ...row, x: snap(x + dx), y: snap(y + dy) } : row)));
  };
  const onUp = () => { drag.current = null; };

  // Paste into the stage runs the same allow-list as ingest (#113).
  const onPaste = (e) => {
    const text = e.clipboardData?.getData('text/plain') || e.clipboardData?.getData('image/svg+xml');
    if (!text || !/<svg|<(path|g|circle|ellipse|rect|polygon|polyline|line)[\s>]/i.test(text)) return;
    e.preventDefault();
    e.stopPropagation();
    const res = ingestSvg(text, { id: 'paste' });
    if (!res.ok) { setError(`paste rejected: ${res.error}`); return; }
    setError('');
    commit((p) => {
      const next = [...p, fresh('seed', { svg: res.asset.svg })];
      setPicked(next.length - 1);
      return next;
    });
  };

  const wrapped = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${svg}</svg>`;

  const save = () => {
    if (!parts.length && !seedSvg) return;
    const body = svg || seedSvg;
    const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
    // Persist the sub-animation rig when any part carries motion; the atlas
    // expansion + per-tick frame picking consume it on the canvas.
    const sub = rigActive ? { frames: animFrames, period: animPeriod, rig } : null;
    if (seedId && String(seedId).startsWith('user:')) emit(Events.ASSETS_REPLACE, { id: seedId, svg: out, sub });
    else emit(Events.ASSETS_INGEST, { svg: out, hint, category, weight: 'medium', source: 'hand', sub });
    onClose(true);
  };

  const exportSvg = () => {
    if (!parts.length && !seedSvg) return;
    const blob = new Blob([wrapped()], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(hint || 'motif').replace(/[^a-z0-9_-]+/gi, '_')}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div style={veil} onClick={() => onClose(false)} role="presentation">
      <div ref={sheetRef} style={sheet} onClick={(e) => e.stopPropagation()} onPaste={onPaste}>
        <header style={head}>
          <span>ASSET STUDIO</span>
          <span style={{ color: 'var(--dim)', fontSize: 9 }}>{compound ? 'compound' : 'single-path'} · snap {SNAP} · undo {undoDepth}/{UNDO_CAP}</span>
          <button type="button" className="chip-btn" title="Close without saving" onClick={() => onClose(false)}>ESC</button>
        </header>
        <div style={body}>
          <svg ref={svgRef} viewBox="0 0 100 100" style={stage}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <g dangerouslySetInnerHTML={{ __html: grid }} />
            <g dangerouslySetInnerHTML={{ __html: stageBase }} />
            {previewSvg ? <g dangerouslySetInnerHTML={{ __html: previewSvg }} /> : null}
            {picked >= 0 && parts[picked] && (
              <circle cx={parts[picked].x} cy={parts[picked].y} r="3" fill="none" stroke="var(--accent)" strokeWidth="0.8" />
            )}
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.keys(PRIMITIVES).map((id) => (
                <button key={id} type="button" className="chip-btn" title={`Add a ${id} shape`} onClick={() => add(id)}>{id}</button>
              ))}
              <button type="button" className="chip-btn" onClick={() => add('poly')}>POLY</button>
              <select value={sides} onChange={(e) => setSides(+e.target.value)} style={field} title="polygon sides">
                {[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Nudge the picked shape left" onClick={() => patchSel((r) => ({ ...r, x: snap(r.x - SNAP) }))}>←</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Nudge the picked shape right" onClick={() => patchSel((r) => ({ ...r, x: snap(r.x + SNAP) }))}>→</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Nudge the picked shape up" onClick={() => patchSel((r) => ({ ...r, y: snap(r.y - SNAP) }))}>↑</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Nudge the picked shape down" onClick={() => patchSel((r) => ({ ...r, y: snap(r.y + SNAP) }))}>↓</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Rotate the picked shape −15°" onClick={() => patchSel((r) => ({ ...r, rot: r.rot - 15 }))}>↺15</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Rotate the picked shape +15°" onClick={() => patchSel((r) => ({ ...r, rot: r.rot + 15 }))}>↻15</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Shrink the picked shape" onClick={() => bump('both', -0.1)}>S-</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Grow the picked shape" onClick={() => bump('both', 0.1)}>S+</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Squash the picked shape horizontally" onClick={() => bump('sx', -0.1)}>Sx-</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Stretch the picked shape horizontally" onClick={() => bump('sx', 0.1)}>Sx+</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Squash the picked shape vertically" onClick={() => bump('sy', -0.1)}>Sy-</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Stretch the picked shape vertically" onClick={() => bump('sy', 0.1)}>Sy+</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Paint the picked shape ink" onClick={() => patchSel((r) => ({ ...r, token: 'ink' }))}>INK</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Paint the picked shape accent" onClick={() => patchSel((r) => ({ ...r, token: 'accent' }))}>ACCENT</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Flip the picked shape between filled and outline" onClick={() => patchSel((r) => ({ ...r, stroke: !r.stroke }))}>FILL/STROKE</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Duplicate the picked shape" onClick={dup}>DUP</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Delete the picked shape" onClick={delSel}>DEL</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Send the picked shape one step back" onClick={() => zShift(-1)}>Z-</button>
              <button type="button" className="chip-btn" disabled={picked < 0} title="Bring the picked shape one step forward" onClick={() => zShift(1)}>Z+</button>
            </div>
            <div style={mergeBox}>
              <div style={mergeTitle}>MERGE</div>
              {parts.length === 0 && <span style={dimNote}>add 2+ shapes, then tick them to fuse</span>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 96, overflowY: 'auto' }}>
                {parts.map((p, i) => {
                  const ticked = validMergeKeys.includes(p.key);
                  const isSub = validSubtractKeys.includes(p.key);
                  return (
                    <div key={p.key} style={mergeRow}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} title={`Fuse shape ${i + 1} (${p.kind}) into the merge`}>
                        <input type="checkbox" checked={ticked}
                          onChange={(e) => {
                            setMergeKeys((ks) => (e.target.checked ? [...ks, p.key] : ks.filter((k) => k !== p.key)));
                            if (!e.target.checked) setSubtractKeys((ks) => ks.filter((k) => k !== p.key));
                          }} />
                        <span>{i + 1} · {p.kind}</span>
                      </label>
                      {ticked && (
                        <button type="button" className="chip-btn"
                          title={isSub ? `Shape ${i + 1} subtracts: it punches a hole out of the merge` : `Shape ${i + 1} adds: flip to subtract and it cuts a hole instead`}
                          onClick={() => toggleSubtract(p.key)}
                          style={isSub ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
                          {isSub ? '−' : '+'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <label style={lbl} title="Melt the fused joins, metaball-style. 0 is a tight union.">
                melt {melt}
                <input type="range" min="0" max="12" step="0.5" value={melt} disabled={!merging}
                  onChange={(e) => setMelt(+e.target.value)} style={{ width: '100%' }} />
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                <button type="button" className="chip-btn" disabled={!merging || validSubtractKeys.length > 0}
                  title={validSubtractKeys.length > 0 ? 'Blend is add-shapes only — untick the subtract shapes to morph' : 'Preview a morph between the first two merge shapes (preview only, never baked)'}
                  onClick={() => { setBlendOn((b) => !b); setBlendHold(false); }}>
                  {blendOn ? 'BLEND ■' : 'BLEND ▶'}
                </button>
                <button type="button" className="chip-btn" disabled={!bakeReady}
                  title="Fuse the ticked shapes into one shape (undo restores the originals)"
                  onClick={bakeMerge} style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                  BAKE MERGE
                </button>
              </div>
              {blendOn && (
                <label style={lbl} title="Scrub the morph by hand (pauses the animation)">
                  blend {Math.round(blendT * 100)}%
                  <input type="range" min="0" max="1" step="0.01" value={blendT}
                    onChange={(e) => { setBlendT(+e.target.value); setBlendHold(true); }} style={{ width: '100%' }} />
                </label>
              )}
            </div>
            <label style={lbl} title="Which family the saved asset lands in.">
              family
              <select value={category} title="Which family the saved asset lands in." onChange={(e) => setCategory(e.target.value)} style={field}>
                {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={lbl} title="Name for the saved overlay asset.">
              id hint
              <input value={hint} title="Name for the saved overlay asset." onChange={(e) => setHint(e.target.value)} style={field} />
            </label>
            {error && <p style={{ margin: 0, fontSize: 10, color: 'var(--accent)' }}>{error}</p>}
            <p style={{ margin: 0, fontSize: 9, color: 'var(--dim)', letterSpacing: '0.04em' }}>
              Sx/Sy stretch on one axis. S± stays uniform. Merge fuses ticked shapes, melt rounds the joins; flip a ticked shape to − and it punches a hole instead; blend is preview-only.
            </p>
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', display: 'flex', alignItems: 'center', gap: 6 }}>
                ANIM
                <span style={{ color: rigActive ? 'var(--accent)' : 'var(--dim)', fontSize: 9, letterSpacing: '0.04em' }}>
                  {rigActive ? '● live' : '○ off'}
                </span>
              </div>
              <label style={lbl} title="Seconds per full animation loop.">
                period
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="range" min={0.4} max={4} step={0.1} value={animPeriod} onChange={(e) => setAnimPeriod(+e.target.value)} style={{ flex: 1 }} />
                  <span style={{ color: 'var(--ink)', fontSize: 10, minWidth: 34 }}>{animPeriod.toFixed(1)}s</span>
                </span>
              </label>
              <label style={lbl} title="Baked frames per loop — more frames, smoother motion, more atlas cells.">
                frames
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="range" min={2} max={16} step={1} value={animFrames} onChange={(e) => { setAnimFrames(+e.target.value); setPreviewFrame(0); }} style={{ flex: 1 }} />
                  <span style={{ color: 'var(--ink)', fontSize: 10, minWidth: 34 }}>{animFrames}</span>
                </span>
              </label>
              <label style={lbl} title="Motion for the picked part. 'none' = static layer.">
                picked part motion
                <select value={pickedAnim.kind} disabled={picked < 0} onChange={(e) => setAnimKind(e.target.value)} style={field}>
                  {ANIM_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label style={lbl} title="osc: ±degrees · pulse: ±fraction (0.3 = ±30%) · march: units per loop · spin/blink: unused">
                amount
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="range" min={0} max={50} step={1} value={pickedAnim.amp} disabled={picked < 0}
                    onPointerDown={beginScrub} onChange={(e) => scrubAnim({ amp: +e.target.value })} style={{ flex: 1 }} />
                  <span style={{ color: 'var(--ink)', fontSize: 10, minWidth: 34 }}>{pickedAnim.amp}</span>
                </span>
              </label>
              <label style={lbl} title="Offsets this layer's cycle in periods — chevron chase: 0, 0.33, 0.66.">
                phase
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="range" min={0} max={1} step={0.05} value={pickedAnim.phase} disabled={picked < 0}
                    onPointerDown={beginScrub} onChange={(e) => scrubAnim({ phase: +e.target.value })} style={{ flex: 1 }} />
                  <span style={{ color: 'var(--ink)', fontSize: 10, minWidth: 34 }}>{Number(pickedAnim.phase).toFixed(2)}</span>
                </span>
              </label>
              {rigActive ? (
                <>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button type="button" className="chip-btn" onClick={() => setPlaying((v) => !v)}>{playing ? 'STOP' : 'PLAY'}</button>
                    <span style={{ fontSize: 9, color: 'var(--dim)' }}>frame {Math.min(previewFrame, stripFrames.length - 1) + 1}/{animFrames}</span>
                  </div>
                  <svg viewBox="0 0 100 100" style={{ width: 120, height: 120, background: '#0a0a0a', border: '1px solid var(--line)', alignSelf: 'center' }}
                    dangerouslySetInnerHTML={{ __html: stripFrames[Math.min(previewFrame, stripFrames.length - 1)] || '' }} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {stripFrames.map((f, i) => (
                      <button key={i} type="button" title={`preview frame ${i + 1}`} onClick={() => { setPlaying(false); setPreviewFrame(i); }}
                        style={{ padding: 0, border: i === previewFrame ? '1px solid var(--accent)' : '1px solid var(--line)', background: '#0a0a0a', cursor: 'pointer', lineHeight: 0 }}>
                        <svg viewBox="0 0 100 100" width={34} height={34} dangerouslySetInnerHTML={{ __html: f }} />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 9, color: 'var(--dim)' }}>
                  Pick a part, give it a motion — the frame strip appears here. SAVE TO POOL keeps the rig.
                </p>
              )}
            </div>
          </div>
        </div>
        <footer style={foot}>
          <button type="button" className="chip-btn" title="Remove the last added shape" onClick={undo} disabled={!undoDepth}>UNDO</button>
          <button type="button" className="chip-btn" title="Remove every shape" onClick={() => { commit(() => []); setPicked(-1); setMergeKeys([]); setSubtractKeys([]); setBlendOn(false); setBlendHold(false); }}>CLEAR</button>
          <button type="button" className="chip-btn" title="Download the motif as an SVG file" onClick={exportSvg} disabled={!parts.length && !seedSvg}>EXPORT SVG</button>
          <button type="button" className="chip-btn" title="Save this motif to the asset pool" onClick={save} disabled={!parts.length && !seedSvg} style={{ marginLeft: 'auto', borderColor: 'var(--accent)', color: 'var(--accent)' }}>SAVE TO POOL</button>
        </footer>
      </div>
    </div>
  );
}

const grid = '<g stroke="rgba(255,255,255,0.08)" stroke-width="0.4" fill="none">'
  + Array.from({ length: 11 }, (_, i) => `<line x1="${i * 10}" y1="0" x2="${i * 10}" y2="100"/><line x1="0" y1="${i * 10}" x2="100" y2="${i * 10}"/>`).join('')
  + '</g>';

const veil = { position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const sheet = {
  width: 720, height: 520, minWidth: 520, minHeight: 380, maxWidth: '92vw', maxHeight: '88vh',
  resize: 'both', overflow: 'auto',
  background: 'var(--bg, #111)', border: '1px solid var(--line)', color: 'var(--ink)', fontFamily: 'inherit',
  display: 'flex', flexDirection: 'column',
};
const head = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--line)', fontSize: 10, letterSpacing: '0.14em', fontWeight: 700, flex: '0 0 auto' };
const body = { display: 'flex', gap: 12, padding: 12, flex: '1 1 auto', minHeight: 0 };
const stage = { background: '#0a0a0a', border: '1px solid var(--line)', flex: '1 1 auto', minWidth: 280, height: '100%', touchAction: 'none' };
const foot = { display: 'flex', gap: 6, padding: '8px 10px', borderTop: '1px solid var(--line)', flex: '0 0 auto' };
const mergeBox = { border: '1px solid var(--line)', padding: 6, display: 'flex', flexDirection: 'column', gap: 5 };
const mergeTitle = { fontSize: 9, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--dim)' };
const mergeRow = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--ink)', cursor: 'pointer' };
const dimNote = { fontSize: 9, color: 'var(--dim)' };
const lbl = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 9, letterSpacing: '0.08em', color: 'var(--dim)', textTransform: 'uppercase' };
const field = { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)', fontSize: 11, padding: '4px 6px' };
