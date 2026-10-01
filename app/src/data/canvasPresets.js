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

export function isInstrumentCanvas(spec) {
  return spec.canvasW === 1000 && spec.canvasH === 700;
}
