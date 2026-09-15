// Project document — portable session state (#33).
// Full project JSON is the reproducible unit (seed alone is not).

export const PROJECT_VERSION = 1;
export const AUTOSAVE_KEY = 'kc:project:v1';

/**
 * @param {object} state - zustand-like slice of relevant fields
 * @returns {object} project document
 */
export function serializeProject(state) {
  return {
    version: PROJECT_VERSION,
    seed: state.seed >>> 0,
    paletteId: state.paletteId,
    layoutParams: { ...state.layoutParams },
    enabledAssets: { ...state.enabledAssets },
    quality: state.quality || 'balanced',
  };
}

/**
 * Normalize legacy OUTPUT JSON and v1 project docs.
 * @param {unknown} raw
 * @returns {{ ok: true, doc: object } | { ok: false, error: string }}
 */
export function parseProject(raw) {
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, error: 'Not a JSON object' };
  }

  // Legacy export: { seed, palette, layout }
  const isLegacy = raw.version == null && (raw.layout || raw.palette || raw.seed != null);
  if (isLegacy) {
    let seed = raw.seed;
    if (typeof seed === 'string') seed = parseInt(seed, 16);
    if (!Number.isFinite(seed)) seed = 0;
    return {
      ok: true,
      doc: {
        version: PROJECT_VERSION,
        seed: seed >>> 0,
        paletteId: raw.paletteId || raw.palette || 'praystation',
        layoutParams: raw.layoutParams || raw.layout || {},
        enabledAssets: raw.enabledAssets || null,
        quality: raw.quality || 'balanced',
      },
    };
  }

  if (raw.version !== PROJECT_VERSION) {
    return { ok: false, error: `Unsupported project version: ${raw.version}` };
  }

  let seed = raw.seed;
  if (typeof seed === 'string') seed = parseInt(seed, 16);
  if (!Number.isFinite(seed)) {
    return { ok: false, error: 'Invalid seed' };
  }

  return {
    ok: true,
    doc: {
      version: PROJECT_VERSION,
      seed: seed >>> 0,
      paletteId: typeof raw.paletteId === 'string' ? raw.paletteId : 'praystation',
      layoutParams: raw.layoutParams && typeof raw.layoutParams === 'object' ? { ...raw.layoutParams } : {},
      enabledAssets:
        raw.enabledAssets && typeof raw.enabledAssets === 'object' ? { ...raw.enabledAssets } : null,
      quality: typeof raw.quality === 'string' ? raw.quality : 'balanced',
    },
  };
}

export function downloadProject(doc, filename) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || `kinetic-curator-${(doc.seed >>> 0).toString(16)}.project.json`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export function readAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const result = parseProject(parsed);
    return result.ok ? result.doc : null;
  } catch {
    return null;
  }
}

export function writeAutosave(doc) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(doc));
  } catch (e) {
    console.warn('[project] autosave failed', e);
  }
}
