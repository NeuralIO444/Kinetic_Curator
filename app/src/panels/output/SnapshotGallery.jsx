import { emit, Events } from '../../composition/eventBus.js';

export function SnapshotGallery({ snapshots }) {
  return (
    <>
      <div className="output-row">
        <button className="big-btn dl" onClick={() => emit(Events.EXPORT_CLEAR_SNAPSHOTS)} style={{ width: '100%' }}>✕ CLEAR</button>
      </div>

      {snapshots.length > 0 && (
        <div className="snapshot-strip">
          {snapshots.map((s) => (
            <div key={s.id} className="snap">
              <div className="snap-thumb">
                {s.thumb
                  ? <img src={s.thumb} alt={`Snapshot, seed ${s.seed.toString(16)}`} />
                  : <span className="snap-fmt">{s.format}</span>}
              </div>
              <div className="snap-meta">
                <span>{s.seed.toString(16)}</span>
                <span>{s.resolution}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {snapshots.length === 0 && (
        <div className="output-hint">Press <b>S</b> for snap · RENDER · BATCH · ACCUM for trails · PROJECT for state</div>
      )}
    </>
  );
}
