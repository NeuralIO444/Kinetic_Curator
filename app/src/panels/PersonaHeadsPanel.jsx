// PersonaHeadsPanel — DEV readout for the trained persona heads (#2397, Adapters A4).
//
// Per head-holding seat: callsign, decision kind, head version, the labeled turns it learned from,
// its held-out score against the 0.3 earn-in bar, and a one-tap rollback. The launch note — the
// one line naming the last head change, by callsign — sits at the top and stays until the next
// change replaces it. Rollback restores the previous version in the store (past v1 it removes the
// entry; the version rolled back from retires for good) and takes effect at the next launch — this
// session keeps playing on the heads it loaded.
//
// Two seats are never listed: the rhythm seat holds no entry in the section this reads, by
// construction, and is never named anywhere; the bandleader shows under his DEV name, as the other
// DEV panels name him. Nothing here renders on stage or outside the DEV gate.

import { useState } from 'react';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { getTaste } from '../curator/tasteStore.js';
import { getLaunchNote } from '../curator/personaHeadsLive.js';
import { rollbackPersonaHead } from '../curator/personaRollbackLive.js';
import { HEAD_CALLSIGNS } from '../curator/personaHeadsBridge.mjs';
import { PERSONA_HEAD_IDS, HEAD_MIN_FIDELITY, personaHeadEarnedIn } from '../curator/tasteHead.js';
import { PERSONA_DECISION_KINDS } from '../curator/decisionFeatures.mjs';
import { isTauriRuntime } from '../platform/desktop.mjs';

const seatLabel = (id) => HEAD_CALLSIGNS[id] ?? (id === 'governor' ? 'GOVERNOR' : id);

function HeadRow({ id, kind, entry, desktop }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const earned = personaHeadEarnedIn(entry);
  const onRollback = () => {
    setBusy(true);
    rollbackPersonaHead(id, kind)
      .then((r) => {
        setResult(
          r.ok
            ? `rolled back: v${r.record.fromVersion} → ${r.record.toVersion === null ? 'no head (rules)' : `v${r.record.toVersion}`} at next launch — this session keeps v${r.record.fromVersion}`
            : r.reason,
        );
      })
      .finally(() => setBusy(false));
  };
  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid var(--kc-line, #2a2a2a)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <strong>
          {seatLabel(id)} · {kind}
        </strong>
        <span style={{ opacity: 0.75, fontSize: 12 }}>v{entry.version}</span>
      </div>
      <div style={{ fontSize: 12, opacity: 0.85 }}>
        learned from {entry.labeledTurns} turns · held-out {entry.heldOut.toFixed(2)} vs the {HEAD_MIN_FIDELITY} bar ·{' '}
        {earned ? 'earned in — steering' : 'not earned in — the rules still play this seat'}
      </div>
      <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          disabled={!desktop || busy}
          onClick={onRollback}
          title={desktop ? '' : 'rollback needs the desktop app'}
        >
          {busy
            ? 'rolling back…'
            : entry.version <= 1
              ? 'roll back (removes the head)'
              : `roll back to v${entry.version - 1}`}
        </button>
        {result ? <span style={{ fontSize: 12, opacity: 0.85 }}>{result}</span> : null}
      </div>
    </div>
  );
}

export function PersonaHeadsPanel() {
  const [taste] = useState(() => getTaste());
  const [note] = useState(() => getLaunchNote());
  const desktop = isTauriRuntime();
  const section = (taste && taste.personas) || null;
  const rows = [];
  if (section) {
    for (const id of PERSONA_HEAD_IDS) {
      for (const kind of PERSONA_DECISION_KINDS) {
        const entry = section[id] && section[id][kind];
        if (entry) rows.push({ id, kind, entry });
      }
    }
  }
  return (
    <div className="panel panel-persona-heads">
      <PanelHeader tag="DEV" title="PERSONA HEADS" subtitle="the trained decision heads in force, and their rollback" />
      <div style={{ padding: '10px 14px' }}>
        {note ? (
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            <strong>{note}</strong>
          </div>
        ) : null}
        {rows.length ? (
          rows.map((r) => <HeadRow key={`${r.id}|${r.kind}`} {...r} desktop={desktop} />)
        ) : (
          <p style={{ opacity: 0.8 }}>No persona heads loaded. The band plays on rules, exactly as before.</p>
        )}
        <p style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
          Heads load at launch from the nightly store and never change mid-session. A rollback edits the store and lands
          at the next launch.
        </p>
      </div>
    </div>
  );
}
