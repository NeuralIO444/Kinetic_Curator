/**
 * GenomeTimeline.jsx — #1870 (creatures, of #1848): the genome of the selected creature as a strip in the WetLab.
 *
 * Matt's rulings (2026-11-07): the Timeline comes first (the Lineage Tree is its own later surface); one node per
 * gene, in record order; the surface inspects, mutates and replaces genes; edits are IN PLACE — no fork, no child,
 * no generation bump — and the edited gene's source is rewritten to record the hand act. The strip is a view on
 * the record plus writes through the one door (state: editCreatureGene → creatureBreed.handEditRecord →
 * sanitizeCreatureRecord); it keeps no genome state of its own beyond which node is selected.
 * #2034 (the Big Lab): the strip is a field of tiles grouped by family, each tile printing its gene's value on
 * its face; the readout bar prints the selected gene's source ONCE (in words — the raw source string rides the
 * tile's hover, moved not deleted, KC-1 DS rule 2).
 * Discrete facts render TE (KC-1 DS): ids, values, sources as plain text.
 */
import { useState } from 'react';
import { useStore } from '../state/store.js';
import { genomeStrip, geneActions, geneKey } from './genomeTimeline.model.mjs';

const REFUSAL_TEXT = {
  'no-mutation': 'that gene has no lawful mutation — the record was not changed',
  'illegal-source': 'that is not a legal source for this gene — the record was not changed',
  'illegal-value': 'that value is not legal for this gene — the record was not changed',
  door: 'the record door refused the edit — the record was not changed',
  nobody: 'the edited creature could not be drawn — the record was not changed',
  'id-taken': 'an import already uses this creature’s pool id — the record was not changed',
  'pool-full': 'the asset pool is full — the record was not changed',
  'no-gene': 'that gene is no longer on the record — nothing was changed',
  'no-record': 'that record is no longer banked — nothing was changed',
};

export function GenomeTimeline({ record, donors = [], legalBodies = [], hasBodyPoints = false }) {
  const editCreatureGene = useStore((s) => s.editCreatureGene); // #1870
  const note = useStore((s) => s.creatureGeneNote);
  const strip = genomeStrip(record);
  const genes = record.genome || [];
  const [selectedKey, setSelectedKey] = useState(() => (genes[0] ? geneKey(genes[0]) : ''));
  const [choice, setChoice] = useState('0');
  const gene = genes.find((g) => geneKey(g) === selectedKey) || genes[0] || null;
  if (!gene) return null;
  const node = strip.bands.flatMap((b) => b.nodes).find((n) => n.key === geneKey(gene));
  const actions = geneActions(record, gene, { legalBodies, donors, hasBodyPoints });
  const pick = Math.min(Math.max(Number(choice) || 0, 0), Math.max(actions.replace.length - 1, 0));
  const myNote = note && note.id === record.id ? note : null;

  const doReplace = () => {
    const opt = actions.replace[pick];
    if (!opt) return;
    const origin =
      opt.kind === 'donor'
        ? { kind: 'donor', donorId: opt.donorId }
        : opt.kind === 'asset'
          ? { kind: 'asset' }
          : { kind: opt.kind, value: opt.value };
    editCreatureGene(record.id, { action: 'replace', family: gene.family, id: gene.id, origin });
  };

  return (
    <div style={box} data-testid="genome-timeline">
      <div style={{ ...secTitle, ...caps }}>
        genome · {record.id} · {strip.count} gene{strip.count === 1 ? '' : 's'}
      </div>
      {strip.bands.map((band) => (
        <div key={band.family} style={{ display: 'flex', flexDirection: 'column', gap: 3 }} data-testid="genome-band">
          <span style={{ ...caps, fontSize: 9, color: 'var(--dim)', letterSpacing: '0.1em' }}>{band.family}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {band.nodes.map((n) => (
              <button
                key={n.key}
                type="button"
                className={`chip-btn ${n.key === geneKey(gene) ? 'act on' : 'act'}`}
                style={tile}
                aria-pressed={n.key === geneKey(gene)}
                data-testid="genome-node"
                title={`${n.family}.${n.id} · ${n.valueText} · ${n.sourceText} · source ${n.source}`}
                onClick={() => {
                  setSelectedKey(n.key);
                  setChoice('0');
                }}
              >
                <span style={{ display: 'block', fontSize: 10 }}>
                  {n.id}
                  {n.hand ? ' ✎' : ''}
                </span>
                <span style={tileValue}>{n.valueText}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div
        style={{ borderTop: '1px solid var(--line)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}
        data-testid="gene-readout"
      >
        <div style={{ fontSize: 11, color: 'var(--ink)' }}>
          <span style={lower}>
            {gene.family}.{gene.id}
          </span>{' '}
          · {node ? node.valueText : ''}
        </div>
        <div style={{ fontSize: 10, color: 'var(--dim)', lineHeight: 1.5 }} title={`source ${gene.source}`}>
          {node ? node.sourceText : ''}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="chip-btn act"
            data-testid="gene-mutate"
            disabled={!actions.mutate.ok}
            title={
              actions.mutate.ok
                ? 'Mutate this gene in place, under the breeding mutation laws, off the project seed'
                : actions.mutate.why
            }
            onClick={() => editCreatureGene(record.id, { action: 'mutate', family: gene.family, id: gene.id })}
          >
            mutate
          </button>
          {actions.replace.length > 0 && (
            <>
              <select
                aria-label="Replace from"
                data-testid="gene-replace-select"
                value={String(pick)}
                onChange={(e) => setChoice(e.target.value)}
              >
                {actions.replace.map((o, i) => (
                  <option key={`${o.kind}:${o.value ?? o.donorId ?? 'asset'}`} value={String(i)}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="chip-btn act"
                data-testid="gene-replace"
                title="Replace this gene’s value from the chosen source, in place"
                onClick={doReplace}
              >
                replace
              </button>
            </>
          )}
          {!actions.mutate.ok && <span style={{ fontSize: 10, color: 'var(--dim)' }}>{actions.mutate.why}</span>}
        </div>
        <span style={noteText} role="status" aria-live="polite" data-testid="gene-note">
          {myNote && myNote.status === 'mutated' && 'mutated in place — the gene’s source now records the hand edit'}
          {myNote && myNote.status === 'replaced' && 'replaced in place — the gene’s source now names its origin'}
          {myNote &&
            myNote.status === 'refused' &&
            (REFUSAL_TEXT[myNote.why] || 'refused — the record was not changed')}
        </span>
      </div>
    </div>
  );
}

const box = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 6,
  fontSize: 10,
  color: 'var(--dim)',
};
const tile = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 1,
  minWidth: 84,
  maxWidth: 150,
  padding: '5px 7px',
  textAlign: 'left',
  height: 'auto',
};
const tileValue = {
  display: 'block',
  fontSize: 9,
  color: 'var(--dim)',
  letterSpacing: 0,
  textTransform: 'none',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 134,
};
const secTitle = { fontSize: 9, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--dim)' };
const caps = { textTransform: 'uppercase' };
const lower = { textTransform: 'lowercase' }; // DS §5: casing lives in style, JSX stays lowercase
const noteText = { fontSize: 10, color: 'var(--dim)', letterSpacing: '0.06em' };
