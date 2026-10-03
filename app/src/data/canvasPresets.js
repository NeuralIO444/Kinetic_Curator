// #606 canvas presets — SETUP. Instrument default stays 1000×700 until a preset applies.
export const INSTRUMENT_CANVAS = Object.freeze({ w: 1000, h: 700, fps: 60, id: 'instrument' });

export const CANVAS_PRESETS = Object.freeze([
  { id: 'instrument', group: 'VJ', label: 'Instrument 1000×700', w: 1000, h: 700, fps: 60 },
  { id: 'hd', group: 'VJ', label: 'HD 1920×1080', w: 1920, h: 1080, fps: 60 },
  { id: '720', group: 'VJ', label: '1280×720', w: 1280, h: 720, fps: 60 },
  { id: 'uhd', group: 'VJ', label: 'UHD 3840×2160', w: 3840, h: 2160, fps: 60 },
  { id: 'portrait-hd', group: 'VJ', label: 'Portrait HD 1080×1920', w: 1080, h: 1920, fps: 60 },
  { id: 'reel', group: 'Social', label: 'Reel / Story 1080×1920', w: 1080, h: 1920, fps: 30 },
  { id: 'ig-portrait', group: 'Social', label: 'IG Portrait 1080×1350', w: 1080, h: 1350, fps: 30 },
  { id: 'yt-hd', group: 'Social', label: 'YouTube HD 1920×1080', w: 1920, h: 1080, fps: 30 },
  { id: 'ig-tall', group: 'Social', label: 'IG Tall 1080×1440', w: 1080, h: 1440, fps: 30 },
  { id: 'ig-square', group: 'Social', label: 'IG Square 1080×1080', w: 1080, h: 1080, fps: 30 },
  { id: 'ig-landscape', group: 'Social', label: 'IG Landscape 1080×566', w: 1080, h: 566, fps: 30 },
  { id: 'vj-ultrawide', group: 'VJ', label: 'VJ Ultrawide 2560×1080', w: 2560, h: 1080, fps: 60 },
  { id: 'vj-ultrawide-qhd', group: 'VJ', label: 'VJ Ultrawide QHD 3440×1440', w: 3440, h: 1440, fps: 60 },
  { id: 'vj-triple-hd', group: 'VJ', label: 'VJ Triple-HD 5760×1080', w: 5760, h: 1080, fps: 60 },
  // OOH — vendor rasters are examples, not universal specs. Each carries its
  // source; the Times Square entry is one spectacular's raster.
  { id: 'ooh-lamar-bulletin', group: 'OOH', label: 'Lamar Digital Bulletin 1400×400', w: 1400, h: 400, fps: 60, source: 'Lamar Advertising autoscale template (example only — bulletins vary by market)' },
  { id: 'ooh-jcdecaux-fhd', group: 'OOH', label: 'JCDecaux DOOH 1920×1080', w: 1920, h: 1080, fps: 60, source: 'JCDecaux digital network Full HD (example only — units vary)' },
  { id: 'ooh-jcdecaux-billboard', group: 'OOH', label: 'JCDecaux Digital Billboard 1260×720', w: 1260, h: 720, fps: 60, source: 'JCDecaux digital billboard, aspect-locked (example only)' },
  { id: 'ooh-times-square', group: 'OOH', label: 'Times Square-class 10048×2368', w: 10048, h: 2368, fps: 60, source: 'Example only — 1535 Broadway-class spectacular raster; not a universal spec' },
]);

export const CANVAS_FPS = Object.freeze([24, 25, 30, 50, 60]);

export const STAGE_MODES = Object.freeze(['preview', 'fullscreen', 'syphon']);

export function clampCanvasDim(n, fallback) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(7680, Math.max(256, v));
}

export function sanitizeCanvasSpec(raw = {}) {
  const w = clampCanvasDim(raw.canvasW ?? raw.w, INSTRUMENT_CANVAS.w);
  const h = clampCanvasDim(raw.canvasH ?? raw.h, INSTRUMENT_CANVAS.h);
  const fps = CANVAS_FPS.includes(raw.canvasFps ?? raw.fps) ? (raw.canvasFps ?? raw.fps) : 60;
  const presetId = typeof raw.canvasPresetId === 'string' ? raw.canvasPresetId : 'custom';
  const stageMode = STAGE_MODES.includes(raw.stageMode) ? raw.stageMode : 'preview';
  return { canvasW: w, canvasH: h, canvasFps: fps, canvasPresetId: presetId, stageMode };
}

export function authoredCanvas(state = {}) {
  const spec = sanitizeCanvasSpec(state);
  return { w: spec.canvasW, h: spec.canvasH, fps: spec.canvasFps };
}

/**
 * Actual rendered pixel dims after the governor's renderScale trim.
 * Mirrors liveLoop: scale clamps to [0.1, 1], dims round to at least 2px.
 */
export function renderDims(w, h, scale) {
  const s = Math.min(1, Math.max(0.1, Number(scale) || 1));
  return { w: Math.max(2, Math.round(w * s)), h: Math.max(2, Math.round(h * s)), scale: s };
}

export function isInstrumentCanvas(spec) {
  return spec.canvasW === 1000 && spec.canvasH === 700;
}

/** Cabinets across × cabinets down × pixels per cabinet. Writes the native raster. */
export function ledRaster(cabinetsW, cabinetsH, cabinetPx) {
  const cw = Math.max(1, Math.round(Number(cabinetsW) || 1));
  const ch = Math.max(1, Math.round(Number(cabinetsH) || 1));
  const px = Math.max(1, Math.round(Number(cabinetPx) || 1));
  return { w: cw * px, h: ch * px };
}

const PRESET_KEY = 'kc:canvas-presets';

export function sanitizeUserPresets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p) => p && typeof p === 'object').slice(0, 24).map((p) => {
    const spec = sanitizeCanvasSpec(p);
    const label = String(p?.label || `${spec.canvasW}×${spec.canvasH}`).slice(0, 40);
    const id = String(p?.id || `mine-${spec.canvasW}x${spec.canvasH}`).slice(0, 40);
    return { id, group: 'Mine', label, w: spec.canvasW, h: spec.canvasH, fps: spec.canvasFps };
  });
}

export function readUserPresets() {
  try { return sanitizeUserPresets(JSON.parse(localStorage.getItem(PRESET_KEY) || '[]')); }
  catch { return []; }
}

export function writeUserPresets(list) {
  const next = sanitizeUserPresets(list);
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

const SESSION_KEY = 'kc:canvas-session';

/** Last-used canvas (W/H/fps/preset) — the boot fallback when no project is loaded. */
export function readCanvasSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = sanitizeCanvasSpec(JSON.parse(raw));
    return { canvasW: s.canvasW, canvasH: s.canvasH, canvasFps: s.canvasFps, canvasPresetId: s.canvasPresetId };
  } catch { return null; }
}

export function writeCanvasSession(spec) {
  try {
    const s = sanitizeCanvasSpec(spec || {});
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      canvasW: s.canvasW, canvasH: s.canvasH, canvasFps: s.canvasFps, canvasPresetId: s.canvasPresetId,
    }));
  } catch { /* private mode */ }
}
