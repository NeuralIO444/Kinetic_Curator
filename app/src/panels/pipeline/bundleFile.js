// bundleFile.js — the one-file envelope (#1216).
//
// EXPORT writes it, IMPORT sniffs it. One JSON file carries everything:
// the bundle parts (project, palettes, voices, favorites, keeps, taste,
// biology, canvas presets) plus a top-level `hits` section — the readable
// studio feed ({ version, project, hits, keeps }) that studio/hits_bridge.py
// reads straight off the file, no separate HITS export.
//
// IMPORT sniffs the file kind and routes to the existing parser for each:
// bundle → the bundle confirm/apply path; project → the project confirm/apply
// path; taste.json → the taste store; palettes → the palette importer (merge);
// hits → the embedded project via the project path (the keeps rows are the
// studio's feed, not restorable ledger entries).
import { buildBundle, bundleFilename, isBundle } from "../../state/bundle.js";
import { buildProjectPayload } from "../../hooks/useProjectPayload.js";
import { hitsFromFavorites, keepsFromKeeps } from "../../state/hitsExport.js";
import { getTaste } from "../../curator/tasteStore.js";
import { validateTaste } from "../../curator/tasteHead.js";
import { getBiologyPolicy } from "../../biology/policy.js";
import { readUserPresets } from "../../data/canvasPresets.js";
import { parseProject } from "../../state/projectDocument.js";

/** Version of the hits feed envelope (matches the old ↓ HITS export). */
export const HITS_ENVELOPE_VERSION = 1;

// import.meta.env only exists under vite — node selfchecks get the fallback.
const appVersion = () =>
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_APP_VERSION) ||
  "0.9.0";

/**
 * Build the one file. `s` is the store state (Shell) or the DataExportRow
 * project fields plus userPalettes/favorites/keeps — buildProjectPayload
 * accepts either.
 */
export function buildExportBundle(s) {
  const project = buildProjectPayload(s);
  return buildBundle({
    project,
    userPalettes: s.userPalettes || [],
    userVoices: s.userVoices || [],
    favorites: s.favorites || [],
    keeps: s.keeps || [],
    taste: getTaste(),
    biology: getBiologyPolicy(),
    canvasPresets: readUserPresets(),
    hits: {
      version: HITS_ENVELOPE_VERSION,
      project,
      hits: hitsFromFavorites(s.favorites),
      keeps: keepsFromKeeps(s.keeps, s.favorites),
    },
    appVersion: appVersion(),
  });
}

/** Filename for the one file. */
export function exportEnvelopeFilename(now) {
  return bundleFilename(now);
}

export function downloadJsonFile(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

/**
 * Which importer a dropped file wants. Order matters: the bundle kind and the
 * taste kind are checked before the lenient project parser ever sees the file.
 */
export function sniffImportKind(raw) {
  if (raw === null || typeof raw !== "object") return "unknown";
  if (isBundle(raw)) return "bundle";
  if (!Array.isArray(raw)) {
    if (validateTaste(raw).ok) return "taste";
    if (Array.isArray(raw.hits)) return "hits";
    if (Array.isArray(raw.swatches)) return "palettes"; // a single palette object
  } else {
    return "palettes"; // the palette library is a JSON array
  }
  if (parseProject(raw).ok) return "project";
  return "unknown";
}
