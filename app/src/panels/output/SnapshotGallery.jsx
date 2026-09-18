import { useState } from 'react';
import { emit, Events } from '../../composition/eventBus.js';
import {
  encodeRecipe,
  copyTextToClipboard,
  recipeFieldsFromKept,
} from '../../state/recipes.js';

export function SnapshotGallery({ snapshots }) {
  // #307 — per-snapshot copy feedback: '✓ COPIED' for 1.5s, or the failure
  // label when the clipboard write didn't go through.
  const [copiedId, setCopiedId] = useState(null);

  const copyRecipe = async (s) => {
    const text = encodeRecipe(recipeFieldsFromKept(s));
    const ok = await copyTextToClipboard(text);
    const tag = ok ? s.id : `fail:${s.id}`;
    setCopiedId(tag);
    setTimeout(() => setCopiedId((cur) => (cur === tag ? null : cur)), 1500);
  };

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
                <button
                  className="micro-btn"
                  onClick={() => copyRecipe(s)}
                  title="Copy this kept render's recipe as plain text (kc-recipe/1) — paste it back with PASTE RECIPE to restore the exact scene"
                >
                  {copiedId === s.id ? '✓ COPIED' : copiedId === `fail:${s.id}` ? 'COPY FAILED' : '⧉ RECIPE'}
                </button>
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
