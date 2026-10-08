// DiceRoller.jsx — the tasteful dice UI: dice tile + 3-finalist tray.
//
// State lives in useDiceRoll.js. A finalist card shows the layout name and
// the cast as SVG thumbnails; clicking crowns it (layout via MIX, cast swap,
// keep-ledger entry, crown-log entry).
import { STUB_VOICES } from '../../data/voices.js';
import { ASSETS } from '../../data/assets/index.js';

const assetsById = new Map(ASSETS.map((a) => [a.id, a]));
const voiceById = new Map(STUB_VOICES.map((v) => [v.id, v]));

export function DiceTile({ onRoll }) {
  return (
    <button
      className="mode-tile dice-tile"
      onClick={onRoll}
      title="Roll the tasteful dice — 3 finalists, you crown one"
    >
      <span style={{ fontSize: '11px' }}>🎲</span>
      DICE
    </button>
  );
}

function wildnessNote(tray) {
  if (!tray.davisCode) return '';
  const how = tray.wildness >= 0.8 ? 'wide' : tray.wildness <= 0.3 ? 'close' : 'easy';
  return ` · ${tray.davisCode} rolls ${how}`;
}

function FinalistCard({ finalist, onCrown }) {
  const voice = voiceById.get(finalist.layoutId);
  return (
    <button className="dice-card" onClick={onCrown} title={`Crown ${voice?.name ?? finalist.layoutId}`}>
      <div className="dice-card-layout">
        <span className="dice-card-glyph">{voice?.glyph}</span>
        {voice?.name ?? finalist.layoutId}
      </div>
      <div className="dice-card-cast">
        {finalist.assetIds.map((id) => (
          <svg key={id} viewBox="0 0 100 100" className="dice-thumb" aria-hidden="true">
            <g dangerouslySetInnerHTML={{ __html: assetsById.get(id)?.svg || '' }} />
          </svg>
        ))}
      </div>
    </button>
  );
}

export function DiceTray({ tray, onCrown, onReroll, onDismiss }) {
  if (!tray) return null;
  return (
    <div className="dice-tray">
      <div className="dice-tray-head">
        <span>
          rolled {tray.rolled}, kept {tray.kept}
          {wildnessNote(tray)}
        </span>
        <span className="dice-tray-actions">
          <button onClick={onReroll} title="roll again">↻</button>
          <button onClick={onDismiss} title="dismiss">✕</button>
        </span>
      </div>
      <div className="dice-finalists">
        {tray.finalists.map((f) => (
          <FinalistCard key={`${f.layoutId}-${f.assetIds.join('+')}`} finalist={f} onCrown={() => onCrown(f)} />
        ))}
      </div>
    </div>
  );
}
