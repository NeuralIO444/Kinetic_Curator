// DEV → TASTE (XGBoost T3): "read the model" — spec §7.5, printable or
// it doesn't ship. Renders the ACTIVE tree head from the validated taste
// the app already holds (curator/treeReader.mjs reshapes it; the raw
// taste file is never re-parsed), in the trainer inspect's own text, so
// the model's biggest opinions can be read and argued with in the room.
// Read-only: nothing here steers, imports, or clears. Dev-panel only —
// the perform surface never sees the model, only its manners.
import { useStore } from '../state/store.js';
import { getTaste } from '../curator/tasteStore.js';
import { treeHeadView } from '../curator/treeReader.mjs';

const h3 = { margin: '14px 0 4px', fontSize: 12, letterSpacing: '0.08em' };
const pre = {
  margin: 0,
  padding: '8px 10px',
  border: '1px solid #333',
  overflowX: 'auto',
  fontSize: 11,
  lineHeight: 1.5,
  whiteSpace: 'pre',
};

export function TasteTreePanel() {
  useStore((s) => s.tasteRev); // #762 idiom: re-read when a taste is imported/cleared
  const view = treeHeadView(getTaste());
  if (!view.present) {
    return (
      <div style={{ padding: 12 }}>
        <h3 style={h3}>READ THE MODEL</h3>
        <p style={{ opacity: 0.75 }}>{view.reason} — nothing to read.</p>
      </div>
    );
  }
  return (
    <div style={{ padding: 12 }}>
      <h3 style={h3}>READ THE MODEL</h3>
      <p style={{ opacity: 0.75, margin: '4px 0 8px' }}>
        {view.treeCount} trees · depth ≤ {view.maxDepth} · {view.nodeCount} nodes · fidelity {view.fidelity.toFixed(2)}{' '}
        · fit on {view.fitOn} ·{view.steering ? ' steering live' : ' below the bar — not steering'}
      </p>
      <pre style={pre}>{view.lines.join('\n')}</pre>
    </div>
  );
}
