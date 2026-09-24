export function PrintDeskBlock({ rendering, onOpen }) {
  return (
    <div style={{ marginBottom: 8, padding: 8, border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--dim)', marginBottom: 6 }}>PRINT DESK</div>
      <button
        type="button"
        className="big-btn"
        onClick={onOpen}
        disabled={rendering}
        title="Open the print desk: frozen 1×/2× still + ffmpeg allow-list post (issue #172)"
        style={{ width: '100%', fontWeight: 700, letterSpacing: '0.06em' }}
      >
        🖨 PRINT…
      </button>
      <div className="pipeline-hint" style={{ marginTop: 6 }}>
        Frozen still, post chips, PNG + sidecar. Live canvas never calls ffmpeg.
      </div>
    </div>
  );
}
