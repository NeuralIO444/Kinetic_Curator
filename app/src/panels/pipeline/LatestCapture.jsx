// LatestCapture — the result line under ESSENTIALS. Shows the panel's one
// status message (export / import / batch outcome) and the newest snapshot,
// right below the buttons that made them. Before this, both lived at the
// bottom of PIPELINE under DIAGNOSTICS, off-screen from the click.
import { latestCaptureView, statusTone } from './latestCapture.mjs';

export function LatestCapture({ snapshots, message }) {
  const view = latestCaptureView(snapshots);
  return (
    <div className="pipeline-latest" aria-live="polite">
      {message && <div className={`pipeline-status-line tone-${statusTone(message)}`}>{message}</div>}
      {view ? (
        <div className="pipeline-latest-row">
          <div className="pipeline-latest-thumb">
            {view.thumb ? (
              <img src={view.thumb} alt={`Latest capture, seed ${view.seed}`} />
            ) : (
              <span className="snap-fmt">{view.format}</span>
            )}
          </div>
          <div className="pipeline-latest-meta">
            <span className="pipeline-latest-title">LATEST · {view.time}</span>
            <span>seed {view.seed}</span>
            <span>{view.resolution}</span>
            <span className="pipeline-latest-count">{view.countLabel}</span>
          </div>
        </div>
      ) : (
        <div className="pipeline-hint">
          Nothing captured yet — press <b>S</b> to snap.
        </div>
      )}
    </div>
  );
}
