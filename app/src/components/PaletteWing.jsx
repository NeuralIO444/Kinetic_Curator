// PaletteWing (#953) — the palette lab: a slide-out wing anchored to the
// palette strip. Generate (harmony core) / edit (live) / save (named, no
// "Palette 1" defaults) / import / export, plus the saved library.
//
// The wing edits the ACTIVE palette through overrides, so every tweak hits
// the canvas live via the existing resolved-palette path. Generate lands as
// unsaved overrides; Save snapshots them into a named user: palette.
import { useState, useRef, useEffect } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { emit, Events } from '../composition/eventBus.js';
import { buildHarmony, applyWithLocks, SCHEME_IDS } from '../engine/harmony.js';
import {
  paletteToExportJson,
  parseImportPalettes,
  randomSeedHex,
} from './paletteWing.mjs';

const randomScheme = (rng = Math.random) => SCHEME_IDS[Math.floor(rng() * SCHEME_IDS.length)];

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function PaletteWing({ open, onClose }) {
  const { palette, userPalettes, paletteLocks } = useApp();
  // The name field is the most important control in the panel (#953 Lois
  // pass): a palette without a name doesn't save. No "Palette 1" defaults.
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [lastGen, setLastGen] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const swatches = palette?.swatches || [];
  const canSave = name.trim().length > 0;

  const generate = () => {
    const scheme = randomScheme();
    const seed = randomSeedHex();
    const generated = buildHarmony(seed, scheme, swatches.length);
    const next = applyWithLocks(swatches, generated, paletteLocks);
    emit(Events.PALETTE_OVERRIDES, { swatches: next });
    setLastGen(`${scheme.toUpperCase()} · ${seed}`);
    setMsg('');
  };

  const save = () => {
    if (!canSave) return;
    emit(Events.PALETTE_SAVE, { name: name.trim() });
    setName('');
    setMsg(`Saved “${name.trim()}” — it's in the strip and the KIN roll.`);
  };

  const exportPalette = () => {
    const json = paletteToExportJson(palette, name);
    const safe = json.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'palette';
    downloadJson(`${safe}.palette.json`, json);
    setMsg(`Exported ${safe}.palette.json`);
  };

  const importFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const list = parseImportPalettes(String(reader.result || ''));
      if (list.length === 0) {
        setMsg('Nothing usable in that file — palettes need a colors array.');
        return;
      }
      emit(Events.PALETTE_IMPORT, list);
      setMsg(`Imported ${list.length} palette${list.length > 1 ? 's' : ''} — ${list.map((p) => p.name).join(', ')}`);
    };
    reader.readAsText(file);
  };

  return (
    <div className="palette-wing" role="dialog" aria-label="Palette lab">
      <div className="palette-wing-head">
        <span className="palette-wing-title ttl">palette lab</span>
        <button type="button" className="palette-wing-close" title="Close (Esc)" onClick={onClose}>×</button>
      </div>

      <label className="palette-wing-label" htmlFor="palette-wing-name">NAME IT — VOID didn't become real from hex values</label>
      <input
        id="palette-wing-name"
        className="palette-wing-name"
        type="text"
        value={name}
        maxLength={40}
        placeholder="Give it a name…"
        onChange={(e) => setName(e.target.value)}
      />

      <div className="palette-wing-row">
        <button type="button" className="palette-wing-btn act primary" onClick={generate} title="Random harmony scheme + seed color → lands here unsaved">
          ⚄ generate
        </button>
        {lastGen && <span className="palette-wing-gen-note" title="Last generation">{lastGen}</span>}
      </div>

      <div className="palette-wing-label lbl">swatches — click to edit, canvas follows live</div>
      <div className="palette-wing-swatches">
        {swatches.map((sw, i) => (
          <label key={i} className="palette-wing-sw" style={{ background: sw }} title={`S${i + 1} ${sw}`}>
            <input
              type="color"
              className="palette-color-input"
              value={sw}
              onChange={(e) => emit(Events.PALETTE_SWATCH, { index: i, hex: e.target.value })}
            />
          </label>
        ))}
        <label className="palette-wing-sw meta" style={{ background: palette.bg }} title={`BG ${palette.bg}`}>
          <span className="palette-wing-sw-tag">BG</span>
          <input type="color" className="palette-color-input" value={palette.bg} onChange={(e) => emit(Events.PALETTE_BG, { hex: e.target.value })} />
        </label>
        <label className="palette-wing-sw meta" style={{ background: palette.ink }} title={`INK ${palette.ink}`}>
          <span className="palette-wing-sw-tag">INK</span>
          <input type="color" className="palette-color-input" value={palette.ink} onChange={(e) => emit(Events.PALETTE_INK, { hex: e.target.value })} />
        </label>
      </div>

      <div className="palette-wing-row">
        <button
          type="button"
          className="palette-wing-btn act primary"
          onClick={save}
          disabled={!canSave}
          title={canSave ? `Save “${name.trim()}” to your library` : 'Name it first — a palette without a name doesn’t save'}
        >
          ↓ save
        </button>
        <button type="button" className="palette-wing-btn act" onClick={() => emit(Events.PALETTE_CLEAR_OVERRIDES)} title="Drop unsaved tweaks, back to the catalog">
          ↻ reset
        </button>
      </div>

      <div className="palette-wing-row">
        <button type="button" className="palette-wing-btn act" onClick={exportPalette} title="Download this palette as a standalone JSON file">
          ⤓ export
        </button>
        <button type="button" className="palette-wing-btn act" onClick={() => fileRef.current?.click()} title="Import a palette JSON file">
          ⤒ import
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={importFile} />
      </div>

      {msg && <div className="palette-wing-msg">{msg}</div>}

      <div className="palette-wing-label lbl">your palettes — click to load, × to delete</div>
      <div className="palette-wing-library">
        {(userPalettes || []).length === 0 && (
          <span className="palette-wing-empty">Nothing saved yet. Generate one, name it, save it.</span>
        )}
        {(userPalettes || []).map((p) => (
          <div key={p.id} className={`palette-wing-lib-row ${p.id === palette.id ? 'active' : ''}`}>
            <button
              type="button"
              className="palette-wing-lib-load"
              onClick={() => emit(Events.PALETTE_SET_ID, { id: p.id })}
              title={`Load ${p.name}`}
            >
              <span className="palette-wing-lib-swatches">
                {(p.swatches || []).slice(0, 6).map((s, i) => (
                  <span key={i} className="palette-wing-lib-sw" style={{ background: s }} />
                ))}
              </span>
              <span className="palette-wing-lib-name">{p.name}</span>
            </button>
            <button
              type="button"
              className="palette-wing-lib-del"
              onClick={() => emit(Events.PALETTE_DELETE, { id: p.id })}
              title={`Delete ${p.name}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
