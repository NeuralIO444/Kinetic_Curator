// KernelPanel — #1233: the kernel module roster, rendered FROM the registries.
//
// One TE tile per module registered in field/weather/feature registry.js —
// never a hardcoded list. A new module appears as a tile with zero
// panel-code edits; empty registries (weather, feature today) render no row
// at all: no tile, no crash.
//
// Tap a tile to probe it: fields instantiate through the registry's own
// `create` and report sample(0.5, 0.5) — deterministic per seed, read-only,
// no engine state touched. The probe value is a continuous signal (Davis
// amber); the face and tier are discrete (TE). Dev-only: the instrument's
// diagnostics bench, like BiologyPanel.
import { useState } from 'react';
import { useStore } from '../state/store.js';
import { registryTileRows, registryCounts, probeField } from './kernelTiles.mjs';

const ROW = { display: 'flex', gap: 6, flexWrap: 'wrap', margin: '2px 0 10px' };
const FAM = { fontSize: 9, letterSpacing: '0.12em', color: 'var(--dim)', margin: '8px 0 2px', textTransform: 'uppercase' };
const DETAIL = { fontSize: 10, color: 'var(--dim)', margin: '-6px 0 10px', lineHeight: 1.5 };
const PROBE = { color: 'var(--kc-davis)' };
const ERR = { color: 'var(--kc-red)' };

function declLine(t) {
  return `${t.id} · T${t.tier} · reads [${t.reads.join(', ') || '—'}] → writes [${t.writes.join(', ') || '—'}]`;
}

export function KernelPanel() {
  const seed = useStore((s) => s.seed);
  const [rows] = useState(registryTileRows); // import-time registrations are all in; read once
  const [counts] = useState(registryCounts);
  const [selected, setSelected] = useState(null);
  const [probes, setProbes] = useState({});

  const tap = (t) => {
    setSelected((prev) => (prev && prev.id === t.id ? null : t));
    if (t.family === 'field' && probes[t.id] === undefined) {
      let v;
      try {
        v = probeField(t.decl, seed);
      } catch {
        v = 'ERR';
      }
      setProbes((p) => ({ ...p, [t.id]: v === null ? '—' : v }));
    }
  };

  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <div style={{ fontSize: 13, marginBottom: 2 }}>
        <span><b>Kernel modules</b> <span style={{ opacity: 0.55 }}>the declared roster — tap to probe</span></span>
      </div>
      <p style={{ fontSize: 10, color: 'var(--dim)', margin: '6px 0' }} title="Registered modules per kernel family. New modules appear here with no panel edits.">
        {counts.map((c) => `${c.n} ${c.family}`).join(' · ')}
      </p>
      {rows.map((row) => (
        <div key={row.family}>
          <div style={FAM}>{row.family}</div>
          <div style={ROW} role="group" aria-label={`${row.family} modules`}>
            {row.tiles.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`te-cell${selected && selected.id === t.id ? ' sel' : ''}`}
                style={{ minWidth: 52 }}
                onClick={() => tap(t)}
                title={declLine(t)}
                aria-pressed={!!(selected && selected.id === t.id)}
                aria-label={`${t.family} module ${t.id}, tier ${t.tier}. Tap to probe.`}
              >
                <span className="te-glyph" aria-hidden="true">{t.face}</span>
                <span className="te-cell-label">T{t.tier}</span>
              </button>
            ))}
          </div>
          {selected && selected.family === row.family && (
            <div style={DETAIL}>
              {declLine(selected)}
              {selected.family === 'field' && probes[selected.id] !== undefined && (
                <> · <span style={probes[selected.id] === 'ERR' ? ERR : PROBE} title="sample(0.5, 0.5) at the project seed — same seed, same value">probe {probes[selected.id] === 'ERR' ? 'ERR' : `${Number(probes[selected.id]).toFixed(4)} @${seed >>> 0}`}</span></>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
