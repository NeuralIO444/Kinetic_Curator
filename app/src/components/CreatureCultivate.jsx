/**
 * CreatureCultivate.jsx — #1872 (creatures, of #1848): CULTIVATE, the dry-run of a creature before stage
 * injection, as a WetLab panel. Matt's rulings (2026-11-07): the sketch is an animated miniature playing
 * live (not a pose strip), and CULTIVATE is a step you invoke between assembling (#1849) and injecting
 * (#1850) — not an always-on panel.
 *
 * On a record, the press produces the three reads together — the sketch (CreatureMiniature: the contract's
 * own expansion, or the solver's sweep for a linkage), the cost read (the registry's number for the body),
 * the integrity read (the gate's verdict where a feasibility notion exists; the Strand Bank's warnings) —
 * and writes them onto the record as its cultivation note, through the one door (state: cultivateCreature
 * → engine's withCultivation → sanitizeCreatureRecord). A failed integrity read is a stillbirth, recorded
 * honestly like any other outcome. CULTIVATE never blocks injection and never injects: the stage stays
 * the real gate. A beast's reads are derived live from its measures — its tile's door carries no
 * cultivation field, so nothing is written for a beast.
 *
 * Discrete facts render TE (KC-1 DS): scores, verdicts, seeds as plain digits and labels; the sketch is
 * continuous motion and renders Davis.
 */
import { useMemo } from 'react';
import { useStore } from '../state/store.js';
import { CreatureMiniature } from './CreatureMiniature.jsx';
import { cultivationNote, linkageReads, noteReads } from './cultivate.model.mjs';
import { creatureTile } from '../engine/creatureAssembler.js';

const r3 = (n) => Math.round(n * 1000) / 1000;

export function CreatureCultivate({ subject, assets = [], stageIds = [], overlay = [], seed = 0 }) {
  const cultivateCreature = useStore((s) => s.cultivateCreature); // #1872
  const storeNote = useStore((s) => s.creatureCultivateNote);
  // the miniature's drawing lookup: the pool's own drawings, plus the creature tile's (its body, dressed)
  const svgOf = useMemo(() => {
    const byId = new Map((assets || []).map((a) => [a && a.id, a && a.svg]));
    if (subject && subject.kind === 'record') {
      const tile = creatureTile(subject.record, subject.bodyAsset || null);
      if (tile) byId.set(tile.id, tile.svg);
    }
    return (id) => byId.get(id) || null;
  }, [assets, subject]);
  const measuresKey = subject && subject.kind === 'linkage' ? JSON.stringify(subject.measures) : '';
  const linkReads = useMemo(
    () => (subject && subject.kind === 'linkage' ? linkageReads(subject.measures) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measures compared by value (the key), not identity
    [measuresKey],
  );
  if (!subject) return null;

  if (subject.kind === 'linkage') {
    const m = linkReads && linkReads.metrics;
    return (
      <div style={box} data-testid="creature-cultivate">
        <div style={{ ...secTitle, ...caps }}>cultivate · {subject.id}</div>
        <CreatureMiniature subject={subject} size={176} />
        {linkReads && linkReads.feasible && m ? (
          <>
            <div style={readLine} data-testid="cultivate-integrity">
              integrity · assembles across the full cycle
            </div>
            <div style={readLine} data-testid="cultivate-metrics">
              step {r3(m.step)} · clearance {r3(m.clearance)} · flatness {r3(m.flatness)} · ripple {r3(m.ripple)} · duty{' '}
              {r3(m.duty)}
            </div>
          </>
        ) : (
          <div style={{ ...readLine, color: 'var(--kc-red)' }} data-testid="cultivate-integrity">
            integrity · stillborn — the linkage does not assemble at any crank angle
          </div>
        )}
        <div style={readLine} title="The registry prices asset drawings, and a beast’s bars wear parts the stage deals">
          cost — not priced
        </div>
        <div style={noteLine} title="A beast’s reads are live from its measures — its tile keeps no cultivation note">
          live reads · tile keeps no note
        </div>
      </div>
    );
  }

  const record = subject.record;
  const bodyAsset = subject.bodyAsset || null;
  const note = record.cultivated || null;
  const shown = note ? noteReads(note, record) : null;
  const myNote = storeNote && storeNote.id === record.id ? storeNote : null;
  return (
    <div style={box} data-testid="creature-cultivate">
      <div style={{ ...secTitle, ...caps }}>cultivate · {record.id}</div>
      <CreatureMiniature subject={subject} stageIds={stageIds} overlay={overlay} seed={seed} svgOf={svgOf} size={176} />
      {shown ? (
        <>
          <div style={readLine} data-testid="cultivate-note">
            cultivated under seed {shown.seed} · {shown.outcome}
          </div>
          <div style={readLine} data-testid="cultivate-cost">
            {shown.cost
              ? `cost ${shown.cost.score} · warning line ${shown.cost.threshold}${shown.cost.over ? ' · over the line' : ''}`
              : 'cost — unpriced: the body cannot be drawn'}
          </div>
          <div
            style={shown.outcome === 'stillborn' ? { ...readLine, color: 'var(--kc-red)' } : readLine}
            data-testid="cultivate-integrity"
          >
            {shown.outcome === 'stillborn'
              ? `integrity · stillborn — the body ${record.body} cannot be drawn, so no tile can be built from it`
              : 'integrity · viable — the body can be drawn, so a tile can be built and the stage can place it'}
          </div>
          {shown.warnings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {shown.warnings.map((w) => (
                <div
                  key={w.id}
                  style={{ fontSize: 11, color: 'var(--kc-red)', lineHeight: 1.5 }}
                  data-testid="cultivate-warning"
                >
                  ⚠ {w.what} — {w.why}
                  {w.cost ? ` · cost ${w.cost.score}, over the line ${w.cost.threshold}` : ''}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={noteLine} title="The dry-run writes its reads onto the record">
          not cultivated yet
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="chip-btn act"
          data-testid="cultivate-run"
          title="Dry-run this record: play its sketch, read its cost and integrity, and record the reads on the record"
          onClick={() => cultivateCreature(record.id, cultivationNote(record, bodyAsset, seed))}
        >
          {note ? 'cultivate again' : 'cultivate'}
        </button>
        <span style={noteText} role="status" aria-live="polite" data-testid="cultivate-feedback">
          {myNote && myNote.status === 'refused' && 'the door refused that cultivation — the record was not changed'}
          {myNote && myNote.status === 'no-record' && 'that record is no longer banked — nothing was changed'}
        </span>
      </div>
    </div>
  );
}

const box = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 6,
  border: '1px solid var(--line)',
  fontSize: 10,
  color: 'var(--dim)',
};
const secTitle = { fontSize: 9, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--dim)' };
const caps = { textTransform: 'uppercase' };
const readLine = { fontSize: 11, color: 'var(--ink)', lineHeight: 1.5 };
const noteLine = { fontSize: 11, color: 'var(--dim)', lineHeight: 1.5 };
const noteText = { fontSize: 10, color: 'var(--dim)', alignSelf: 'center', letterSpacing: '0.06em' };
