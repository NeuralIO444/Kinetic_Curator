import { useEffect, useMemo, useRef, useState } from "react";
import { emit, Events } from "../../composition/eventBus.js";
import { parseProject } from "../../state/projectDocument.js";
import {
  paletteImportMessage,
  paletteImportCount,
} from "./paletteImportCopy.mjs";
import {
  importConfirmMessage,
  loadedMessage,
  missingPaletteMessage,
  rememberRecent,
  readRecent,
  dirtyMessage,
} from "./pipelineNotices.mjs";
import { readThumbnail } from "./thumbnail.mjs";
import { buildProjectPayload } from "../../hooks/useProjectPayload.js";
import { useStore } from "../../state/store.js";
import { helpText } from "../../data/helpCopy.js";
import { retrainNudge, dismissRetrainNudge } from "../../curator/tasteHead.js";
import { getTaste } from "../../curator/tasteStore.js";
import { getBiologyPolicy, importBiologyPolicy } from "../../biology/policy.js";
import { readUserPresets, writeUserPresets } from "../../data/canvasPresets.js";
import {
  parseBundle,
  bundleSummary,
  bundleMessage,
  bundleConfirmLine,
  isBundle,
} from "../../state/bundle.js";
import { BUNDLE_SANITIZERS } from "../../state/bundleParts.js";
import {
  buildExportBundle,
  downloadJsonFile,
  exportEnvelopeFilename,
  sniffImportKind,
} from "./bundleFile.js";

// onMessage: shown by the parent, the same slot batch-completion writes to —
// matches the original single status line under this section.
export function DataExportRow({
  seed,
  seedOffsets,
  paletteId,
  paletteOverrides,
  paletteLocks,
  layoutParams,
  lockedParams,
  caGrid,
  enabledAssets,
  quality,
  autoQuality,
  assetWeightOverrides,
  assetKineme,
  audioRoutes,
  midiMap,
  customAssets,
  layers,
  activeLayerId,
  layerSnapshots,
  userPalettes,
  favorites,
  keeps,
  onMessage,
}) {
  const fileInputRef = useRef(null);
  const [pendingBundle, setPendingBundle] = useState(null); // #1051 — { fileName, parsed }
  const [recent, setRecent] = useState(() => readRecent());
  const [loadedName, setLoadedName] = useState(null);
  const [pendingImport, setPendingImport] = useState(null); // #647 — { fileName, doc, sanitized, note }
  const exportedPayload = useRef(null);
  const [behind, setBehind] = useState(false);
  const tasteStatus = useStore((s) => s.tasteStatus);
  const tasteExperimental = useStore((s) => s.tasteExperimental);
  const setTasteExperimental = useStore((s) => s.setTasteExperimental);
  const loisStatus = useStore((s) => s.loisStatus);
  const importTasteToStore = useStore((s) => s.importTaste);
  const importShelf = useStore((s) => s.importShelf); // #1051
  const userVoices = useStore((s) => s.userVoices); // #1063
  const importUserVoices = useStore((s) => s.importUserVoices); // #1063
  const clearTaste = useStore((s) => s.clearTaste);
  const [nudgeTick, setNudgeTick] = useState(0); // #925 — re-render after dismissing the retrain nudge
  // #925 — one dismissible hint line under the taste status, past ~50 new
  // keeps since the last train. Reactive on taste import (tasteStatus),
  // keep changes (keeps), and dismissal (nudgeTick).
  const nudgeLine = useMemo(
    () => retrainNudge(getTaste(), keeps || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasteStatus, keeps, nudgeTick],
  );
  const projectTitle = useStore((s) => s.projectTitle);
  const setProjectTitle = useStore((s) => s.setProjectTitle);

  const projectFields = {
    seed,
    seedOffsets,
    paletteId,
    paletteOverrides,
    paletteLocks,
    layoutParams,
    lockedParams,
    caGrid,
    enabledAssets,
    quality,
    autoQuality,
    assetWeightOverrides,
    assetKineme,
    audioRoutes,
    midiMap,
    customAssets,
    layers,
    activeLayerId,
    layerSnapshots,
    projectTitle,
  };

  // #1216 — EXPORT writes the one file: bundle parts plus the readable hits
  // feed section for studio/hits_bridge.py. No separate HITS export.
  const exportEnvelope = () => {
    const bundle = buildExportBundle({
      ...projectFields,
      userPalettes,
      userVoices,
      favorites,
      keeps,
    });
    const filename = exportEnvelopeFilename();
    downloadJsonFile(bundle, filename);
    onMessage(
      `${bundleMessage({ good: Object.keys(bundle.parts), bad: [] }, "Exported")} → ${filename}`,
    );
    exportedPayload.current = JSON.stringify(
      buildProjectPayload(projectFields),
    );
    setRecent(rememberRecent(filename));
    setBehind(false);
  };

  useEffect(() => {
    setBehind(
      Boolean(
        dirtyMessage(
          exportedPayload.current,
          JSON.stringify(buildProjectPayload(projectFields)),
        ),
      ),
    );
  }, [projectFields]);

  // #1216 — one drop zone: sniff the kind, route to the existing parser.
  const importSniffed = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      let raw;
      try {
        raw = JSON.parse(ev.target.result);
      } catch {
        onMessage("Import: not valid JSON");
        return;
      }
      const kind = sniffImportKind(raw);
      if (kind === "bundle") {
        if (!isBundle(raw)) {
          onMessage("Import: not a KC-1 bundle");
          return;
        }
        const parsed = parseBundle(raw, BUNDLE_SANITIZERS);
        if (!parsed.ok) {
          onMessage(`Bundle: ${parsed.error}`);
          return;
        }
        setPendingBundle({ fileName: file.name, parsed });
        return;
      }
      if (kind === "project") {
        const result = parseProject(raw);
        if (!result.ok) {
          onMessage(result.error);
          return;
        }
        if (layers?.length) {
          // #647 — confirm before the import replaces the live piece. The
          // dialog shows the incoming seed and offers export-first.
          setPendingImport({
            fileName: file.name,
            doc: result.doc,
            sanitized: result.sanitized,
          });
          return;
        }
        applyImport(file.name, result.doc, result.sanitized);
        return;
      }
      if (kind === "taste") {
        // #762 — a bad file says why and changes nothing.
        const r = importTasteToStore(raw);
        onMessage(r.ok ? "Taste loaded" : `Taste: ${r.error}`);
        if (r.ok) setTimeout(() => onMessage(null), 2000);
        return;
      }
      if (kind === "palettes") {
        // Palettes MERGE through the palette importer; the bundle path does
        // the same for its palettes part (#1064).
        const list = Array.isArray(raw) ? raw : [raw];
        emit(Events.PALETTE_IMPORT, list);
        onMessage(paletteImportMessage(list)); // #601: what the store keeps, not what the file held
        return;
      }
      if (kind === "hits") {
        // The studio feed: its embedded project restores through the project
        // path. The keeps rows are feed rows, not ledger entries — a bundle
        // restores everything.
        const result = parseProject(raw.project);
        if (!result.ok) {
          onMessage("Hits file: the embedded project is not readable");
          return;
        }
        const note = `Project loaded from ${file.name} — the keeps rows are the studio feed; export a bundle for a full restore`;
        if (layers?.length) {
          setPendingImport({
            fileName: file.name,
            doc: result.doc,
            sanitized: result.sanitized,
            note,
          });
          return;
        }
        applyImport(file.name, result.doc, result.sanitized, note);
        return;
      }
      onMessage(
        "Import: not a KC-1 file (bundle, project, taste, palettes, or hits)",
      );
    };
    // #640 — a failed file read (disk error, permissions) must say so
    // instead of failing silently.
    reader.onerror = () => onMessage("Could not read file");
    reader.readAsText(file);
  };

  const applyImport = (fileName, doc, sanitized, note) => {
    emit(Events.EXPORT_LOAD_PROJECT, doc);
    const miss = missingPaletteMessage(doc, userPalettes);
    const loaded = loadedMessage(fileName, doc, sanitized);
    onMessage(note || (miss ? `${loaded}. ${miss}` : loaded));
    setLoadedName(fileName);
    setRecent(rememberRecent(fileName));
    exportedPayload.current = JSON.stringify(
      buildProjectPayload(projectFields),
    );
  };

  const cancelImport = () => setPendingImport(null);

  const proceedImport = () => {
    if (!pendingImport) return;
    applyImport(
      pendingImport.fileName,
      pendingImport.doc,
      pendingImport.sanitized,
      pendingImport.note,
    );
    setPendingImport(null);
  };

  const exportFirstImport = () => {
    if (!pendingImport) return;
    exportEnvelope();
    applyImport(
      pendingImport.fileName,
      pendingImport.doc,
      pendingImport.sanitized,
      pendingImport.note,
    );
    setPendingImport(null);
  };

  // Each bundle part is applied by the same path its own single import uses.
  const applyBundle = () => {
    if (!pendingBundle) return;
    const { parsed } = pendingBundle;
    const p = parsed.parts;
    const failed = [];
    // #1064 — every apply path reports what actually landed, so the result line
    // matches the screen instead of the file. `given` is how many entries the file held.
    const counts = {};
    const given = (name) => p[name]?.given;
    if (p.userPalettes?.ok) {
      // Palettes MERGE through the palette importer (the same one ↑ IMPORT uses for palette files).
      useStore.getState().importUserPalettes(p.userPalettes.value);
      counts.userPalettes = {
        kept: paletteImportCount(p.userPalettes.value),
        given: given("userPalettes"),
      };
    }
    if (p.userVoices?.ok)
      counts.userVoices = {
        kept: importUserVoices(p.userVoices.value),
        given: given("userVoices"),
      }; // #1063
    if (p.favorites?.ok || p.keeps?.ok) {
      const landed = importShelf({
        favorites: p.favorites?.ok ? p.favorites.value : undefined,
        keeps: p.keeps?.ok ? p.keeps.value : undefined,
      });
      if (p.favorites?.ok)
        counts.favorites = {
          kept: landed.favorites,
          given: given("favorites"),
        };
      if (p.keeps?.ok)
        counts.keeps = { kept: landed.keeps, given: given("keeps") };
    }
    if (p.taste?.ok) {
      const r = importTasteToStore(p.taste.value);
      if (!r.ok) failed.push({ name: "taste", error: r.error });
    }
    if (p.biology?.ok) {
      const r = importBiologyPolicy(p.biology.value);
      if (!r.ok) failed.push({ name: "biology", error: r.error });
    }
    if (p.canvasPresets?.ok)
      counts.canvasPresets = {
        kept: writeUserPresets(p.canvasPresets.value).length,
        given: given("canvasPresets"),
      };
    if (p.project?.ok) emit(Events.EXPORT_LOAD_PROJECT, p.project.value.doc);
    // The hits section is the studio's feed, not restorable state — the
    // favorites/keeps parts above already restored the live ledgers.
    const s = bundleSummary(parsed);
    s.bad.push(...failed);
    s.good = s.good.filter((g) => !failed.some((f) => f.name === g));
    onMessage(bundleMessage(s, "Bundle imported", counts));
    setPendingBundle(null);
  };

  const exportEnvelopeFirst = () => {
    exportEnvelope();
    applyBundle();
  };

  return (
    <>
      <div className="pipeline-row">
        <input
          value={projectTitle}
          onChange={(e) => setProjectTitle(e.target.value)}
          placeholder="Project title (optional)"
          title="Project title — used in export filenames"
          style={{ flex: 2, fontSize: 11 }}
        />
        <button
          className="big-btn dl act"
          onClick={exportEnvelope}
          style={{ flex: 1 }}
          title="Export everything in one file: project, hits, palettes, voices, favorites, keeps, taste (X)"
        >
          ↓ EXPORT
        </button>
        <button
          className="big-btn act"
          onClick={() => fileInputRef.current?.click()}
          style={{ flex: 1 }}
          title="Import a bundle, project, taste, palettes, or hits file"
        >
          ↑ IMPORT
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={importSniffed}
          style={{ display: "none" }}
        />
      </div>
      {pendingImport && (
        <div
          style={{
            border: "1px solid #8a6d2f",
            padding: 8,
            margin: "2px 0 6px",
            background: "#16130c",
          }}
        >
          <div style={{ fontSize: 11, marginBottom: 6 }}>
            {importConfirmMessage(
              pendingImport.fileName,
              pendingImport.doc.seed,
            )}
          </div>
          <div className="pipeline-row" style={{ gap: 6 }}>
            <button
              className="big-btn dl"
              onClick={exportFirstImport}
              style={{ flex: 1 }}
              title="Save the current piece to a file first, then import"
            >
              Export current first
            </button>
            <button
              className="big-btn"
              onClick={cancelImport}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button
              className="big-btn"
              onClick={proceedImport}
              style={{ flex: 1 }}
              title="Replace the current piece with the imported file"
            >
              Proceed
            </button>
          </div>
        </div>
      )}
      {pendingBundle &&
        (() => {
          const s = bundleSummary(pendingBundle.parsed);
          return (
            <div
              style={{
                border: "1px solid #8a6d2f",
                padding: 8,
                margin: "2px 0 6px",
                background: "#16130c",
              }}
            >
              <div style={{ fontSize: 11, marginBottom: 6 }}>
                {bundleConfirmLine(pendingBundle.fileName, s)}
              </div>
              <div className="pipeline-row" style={{ gap: 6 }}>
                <button
                  className="big-btn dl"
                  onClick={exportEnvelopeFirst}
                  style={{ flex: 1 }}
                  title="Save a bundle of what is here first, then restore"
                >
                  Export current first
                </button>
                <button
                  className="big-btn"
                  onClick={() => setPendingBundle(null)}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  className="big-btn"
                  onClick={applyBundle}
                  style={{ flex: 1 }}
                  title="Replace what is here with the bundle"
                >
                  Proceed
                </button>
              </div>
            </div>
          );
        })()}
      {/* #762 — the artist's own switch: the 0.3 fidelity rule stays the default; ON lets a thin, below-bar taste
          steer anyway, and the status line below says EXPERIMENTAL for as long as it does. Discrete, so TE. */}
      <div className="pipeline-row" title={helpText("output-taste")}>
        <button
          type="button"
          className={`big-btn ${tasteExperimental ? "active" : ""}`}
          aria-pressed={tasteExperimental}
          onClick={() => setTasteExperimental(!tasteExperimental)}
          style={{ flex: 3 }}
          title="Experimental taste: let a taste that scores below the 0.3 fidelity bar steer CURATOR anyway. Off by default; the bar itself does not change."
        >
          experimental taste
        </button>
        <button
          className="big-btn act"
          onClick={clearTaste}
          style={{ flex: 1 }}
          title="Forget the imported taste"
        >
          clear
        </button>
      </div>
      {/* #962 (UX-2): read-only hint lines live in their own demoted zone,
          visually separated from the tappable export buttons above. */}
      <div className="pipeline-export-hints">
        <div
          className="taste-status"
          style={{ fontSize: 10, opacity: 0.75, margin: "2px 0 6px" }}
        >
          {tasteStatus}
        </div>
        {/* #997 — the Lois boldness line sits under the taste line: not trained,
            fidelity too low, or boldness live. Honest either way; never a picker. */}
        <div
          className="lois-status"
          style={{ fontSize: 10, opacity: 0.6, margin: "0 0 6px" }}
        >
          {loisStatus}
        </div>
        {/* #925 — retrain nudge: one tap dismisses, stays quiet until ~50 more keeps */}
        {nudgeLine && (
          <button
            className="pipeline-hint"
            style={{
              fontSize: 10,
              opacity: 0.75,
              background: "none",
              border: "none",
              padding: 0,
              textAlign: "left",
              cursor: "pointer",
              color: "inherit",
              font: "inherit",
            }}
            title="One tap dismisses — it stays quiet until ~50 more keeps"
            onClick={() => {
              dismissRetrainNudge((keeps || []).length);
              setNudgeTick((t) => t + 1);
            }}
          >
            {nudgeLine} ✕
          </button>
        )}
        {loadedName && (
          <div className="pipeline-hint" style={{ fontSize: 10 }}>
            Loaded {loadedName}
            {readThumbnail(projectFields) ? "" : ""}
          </div>
        )}
        {behind && (
          <div className="pipeline-hint" style={{ fontSize: 10 }}>
            Export is behind the live piece
          </div>
        )}
        {recent.length > 0 && (
          <div className="pipeline-hint" style={{ fontSize: 10 }}>
            Recent: {recent.join(" · ")}
          </div>
        )}
      </div>
    </>
  );
}
