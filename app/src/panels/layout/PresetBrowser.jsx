// Preset groups + apply
import { useMemo } from 'react';
import { getPresetsByGroup, getPreset } from '../../data/presets.js';
import { emit, Events } from '../../composition/eventBus.js';

export function PresetBrowser({ composition }) {
  const groups = useMemo(() => getPresetsByGroup(), []);
  return (
    <div className="preset-groups">
      {groups.map(g => (
        <div key={g.id} className="preset-group">
          <div className="preset-group-label">{g.label}</div>
          <div className="preset-row">
            {g.presets.map(p => (
              <button
                key={p.id}
                className={`preset-btn ${composition === p.id ? 'active' : ''}`}
                onClick={() => emit(Events.LAYOUT_PRESET, p)}
                title={p.desc}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
