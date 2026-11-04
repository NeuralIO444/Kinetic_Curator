// KitBar (#1944) — the three kit slots a roll deals from, and "save these filters as a kit".
import { useState } from 'react';
import { useStore } from '../state/store.js';
import { emit, Events } from '../composition/eventBus.js';
import { SEED_KITS } from '../data/kits.js';
import { kitFromFilters } from './assetPoolLogic.mjs';

export function KitBar({ filters, canSave }) {
  const kits = useStore((s) => s.kits);
  const triad = useStore((s) => s.kitTriad);
  const note = useStore((s) => s.kitNote);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const all = [...SEED_KITS, ...kits];
  const slots = [0, 1, 2].map((i) => triad[i] || '');
  const setSlot = (i, id) => {
    const next = slots.slice();
    next[i] = id;
    emit(Events.ASSETS_KIT_TRIAD, next.filter(Boolean));
  };
  const save = () => {
    const kit = kitFromFilters(
      name,
      filters,
      all.map((k) => k.id),
    );
    if (!kit) return;
    emit(Events.ASSETS_KIT_SAVE, kit);
    setNaming(false);
    setName('');
  };
  return (
    <div className="pool-kits" role="group" aria-label="roll kits">
      <span className="insp-facet-name">kits</span>
      {slots.map((id, i) => (
        <select
          key={i}
          aria-label={`kit ${i + 1}`}
          value={id}
          title="A roll deals a share from each kit set here. Empty = today's roll."
          onChange={(e) => setSlot(i, e.target.value)}
        >
          <option value="">— kit {i + 1} —</option>
          {all.map((k) => (
            <option key={k.id} value={k.id} disabled={triad.includes(k.id) && k.id !== id}>
              {k.name}
            </option>
          ))}
        </select>
      ))}
      {kits.length > 0 && triad.some((id) => kits.some((k) => k.id === id)) && (
        <button
          type="button"
          className="chip-btn act"
          title="Delete the artist kits sitting in the slots"
          onClick={() =>
            triad.filter((id) => kits.some((k) => k.id === id)).forEach((id) => emit(Events.ASSETS_KIT_REMOVE, { id }))
          }
        >
          delete kit
        </button>
      )}
      {naming ? (
        <span className="pool-kit-name">
          <input
            autoFocus
            aria-label="kit name"
            maxLength={24}
            placeholder="kit name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setNaming(false);
            }}
          />
          <button type="button" className="chip-btn act" onClick={save}>
            save
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="chip-btn act"
          disabled={!canSave}
          title={canSave ? 'Save the active filters as a kit' : 'Set a category, facet or role filter first'}
          onClick={() => setNaming(true)}
        >
          save filters as kit
        </button>
      )}
      {note && <span className="pool-kit-note">{note}</span>}
    </div>
  );
}
