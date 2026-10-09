import { useState, useRef } from "react";
import { emit, Events } from "../../composition/eventBus.js";
import { renderFinal } from "../../hooks/useMediaExport.js";
import { resolutionLabel } from "../../data/quality.js";
import { DsMatrix, DsChip } from "./ds.jsx";

export function RenderFinalBlock({
  glLoopRef,
  palette,
  seed,
  layoutParams,
  exportResolution,
  accumOn,
  rendering,
  setRendering,
  batchActive,
}) {
  const resLabel = resolutionLabel(exportResolution);
  // #570 — surface render failures like SNAP does (was console.warn only).
  const [renderError, setRenderError] = useState(null);
  const errTimer = useRef(null);

  const runRenderFinal = async () => {
    if (rendering) return;
    setRendering(true);

    try {
      // One instrument: finals capture the live GL frame as-is — with ACCUM
      // on, the captured frame is the trail buffer (history is pixels).
      await renderFinal({
        loopRef: glLoopRef,
        resolution: exportResolution,
        seedStr: seed.toString(16),
        onThumbnail: (thumb) => {
          emit(Events.EXPORT_SNAPSHOT, {
            seed,
            format: "PNG",
            resolution: accumOn ? `${resLabel} · ACCUM` : `${resLabel} · FINAL`,
            timestamp: new Date().toISOString().slice(11, 19),
            config: {
              layout: { ...layoutParams },
              palette: { id: palette.id },
              ...(accumOn ? { accum: true } : {}),
            },
            thumb,
          });
        },
      });
    } catch (e) {
      console.warn("[RENDER]", e);
      setRenderError(e && e.message ? e.message : String(e));
      if (errTimer.current) clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setRenderError(null), 6000);
    } finally {
      setRendering(false);
    }
  };

  return (
    <div
      style={{
        marginBottom: 8,
        padding: 8,
        border: "1px solid var(--line-2)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div
        className="ttl"
        style={{
          fontSize: 9,
          letterSpacing: "0.12em",
          color: "var(--dim)",
          marginBottom: 6,
        }}
      >
        render · still
      </div>
      <div className="pipeline-row" style={{ marginBottom: 6 }}>
        <DsMatrix
          label="export resolution"
          options={[
            { value: 1, label: "1X" },
            { value: 2, label: "2X" },
            { value: 4, label: "4X" },
          ]}
          value={exportResolution}
          onChange={(v) => emit(Events.EXPORT_RESOLUTION, v)}
        />
        <DsChip tone={accumOn ? "amber" : undefined}>
          {accumOn ? "ACCUM ON" : "ACCUM OFF"}
        </DsChip>
      </div>
      <button
        type="button"
        className="big-btn"
        onClick={runRenderFinal}
        disabled={rendering}
        style={{
          width: "100%",
          background: rendering ? "var(--line)" : "var(--accent)",
          color: rendering ? "var(--dim)" : "#000",
          borderColor: "var(--accent)",
          fontWeight: 800,
          letterSpacing: "0.08em",
        }}
      >
        {rendering && !batchActive ? "RENDERING…" : "▶ RENDER STILL"}
      </button>
      {renderError && (
        <div
          className="pipeline-hint"
          style={{ marginTop: 6, color: "var(--kc-warn)" }}
          title={renderError}
        >
          Render failed — {renderError.slice(0, 80)}
        </div>
      )}
      <div className="pipeline-hint" style={{ marginTop: 6 }}>
        {accumOn
          ? "ACCUM on — export captures the live trail buffer."
          : "Matches live preview. Denser 4K/8K finals: studio.py render --uncapped."}
      </div>
    </div>
  );
}
