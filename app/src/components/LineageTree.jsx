/**
 * LineageTree.jsx — #2030 (creatures, of #1848): the selected creature's ancestry as a walkable tree in the
 * WetLab — the backstage companion to the stage's family-resemblance shimmer (#1851).
 *
 * Matt's rulings (2026-11-07): the tree is complete anywhere (the record retains its ancestry, written at
 * its birth and never recomputed); a compact summary rides the record, not full ancestor records; hand
 * edits show as deltas. The tree is a VIEW on the record alone (components/lineageTree.model.mjs) — it
 * never reads the bank, and it offers no edits: editing lives on the Genome Timeline. Generations are
 * derived from the retained graph, never stored; ancestors bred before summaries existed stand as stubs
 * (an id, no genes), and their generation is honestly unknown.
 * Discrete facts render TE (KC-1 DS): ids, generations, gene classes as plain text.
 */
import { useState } from 'react';
import { lineageTree, nodeDeltas } from './lineageTree.model.mjs';

const genLabel = (gen) => (gen === null ? 'gen —' : `gen ${String(gen).padStart(2, '0')}`);
const depthName = (d) => (d === 1 ? 'parents' : d === 2 ? 'grandparents' : `depth ${d}`);

function deltaLine(d) {
  if (d.cls === 'inherited') {
    const p = d.parents[0];
    return `inherited from ${d.fromId}${p && p.retained ? (p.matches ? ' · unchanged' : ' · differs from the retained value') : ''}`;
  }
  if (d.cls === 'crossed') {
    const parts = d.parents.map((p) => `${p.id}: ${p.retained ? p.valueText : 'not retained'}`);
    return `crossed · a blend of the parents — ${parts.join(' · ')}`;
  }
  if (d.cls === 'mutated') {
    if (d.mutation && d.mutation.kind === 'swap')
      return `mutated at birth · swapped from ${d.mutation.from} to ${d.mutation.to}`;
    if (d.mutation && d.mutation.kind === 'reroll') return `mutated at birth · re-rolled to ${d.mutation.value}`;
    return `mutated at birth · ${d.sourceText}`;
  }
  if (d.cls === 'hand') return `hand edit · ${d.sourceText}`;
  return d.sourceText;
}

export function LineageTree({ record }) {
  const tree = lineageTree(record);
  const [selectedId, setSelectedId] = useState(record.id);
  const selected = selectedId === record.id ? tree.self : tree.nodes.find((nd) => nd.id === selectedId) || tree.self;
  const view = nodeDeltas(record, selected.id);
  const depths = [...new Set(tree.nodes.map((nd) => nd.depth))].sort((a, b) => a - b);
  const founder = !record.lineage;

  const nodeChip = (node, label) => (
    <button
      key={node.id}
      type="button"
      className={`chip-btn ${node.id === selected.id ? 'act on' : 'act'}`}
      aria-pressed={node.id === selected.id}
      data-testid="lineage-node"
      title={
        node.stub
          ? `${node.id} — a parent; nothing more was retained`
          : `${node.id} · ${genLabel(node.gen)} · ${node.depth === 0 ? 'this creature' : `${node.depth} breeding event${node.depth === 1 ? '' : 's'} back`}`
      }
      onClick={() => setSelectedId(node.id)}
    >
      {label ?? node.id}
      {node.stub ? ' · not retained' : ` · ${genLabel(node.gen)}`}
    </button>
  );

  return (
    <div style={box} data-testid="lineage-tree">
      <div style={{ ...secTitle, ...caps }}>
        lineage · {record.id} · {tree.nodes.length} ancestor{tree.nodes.length === 1 ? '' : 's'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.5 }}>
        {founder && 'A founder: no parents were recorded for this creature — it is GEN 01, the root of its line.'}
        {!founder &&
          tree.complete &&
          'The whole line, retained in this record at each birth. Pick an ancestor to read what changed in it.'}
        {!founder &&
          !tree.complete &&
          'This record’s retained line. Part of it predates retained ancestry: those ancestors stand as stubs, and generation numbers stop where the record does.'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ ...caps, fontSize: 9, color: 'var(--dim)', letterSpacing: '0.1em' }}>this creature</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{nodeChip(tree.self)}</div>
      </div>
      {depths.map((d) => (
        <div key={d} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ ...caps, fontSize: 9, color: 'var(--dim)', letterSpacing: '0.1em' }}>{depthName(d)}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {tree.nodes.filter((nd) => nd.depth === d).map((nd) => nodeChip(nd))}
          </div>
        </div>
      ))}
      <div
        style={{ borderTop: '1px solid var(--line)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}
        data-testid="lineage-deltas"
      >
        <div style={{ fontSize: 11, color: 'var(--ink)' }}>
          {selected.id} · {genLabel(selected.gen)}
          {selected.depth > 0 && ` · ${selected.depth} back`}
        </div>
        {view && !view.retained && (
          <div style={{ fontSize: 10, color: 'var(--dim)', lineHeight: 1.5 }}>
            Not retained — this ancestor was a parent, and that is all the record kept. No genes, no deltas.
          </div>
        )}
        {view &&
          view.retained &&
          view.deltas.map((d) => (
            <div key={d.key} style={{ fontSize: 10, color: 'var(--dim)', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--ink)' }}>
                <span style={lower}>
                  {d.family}.{d.id}
                </span>{' '}
                · {d.valueText}
              </span>
              {' — '}
              {deltaLine(d)}
            </div>
          ))}
      </div>
    </div>
  );
}

const box = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 6,
  border: '1px solid var(--line)',
  fontSize: 10,
  color: 'var(--dim)',
};
const secTitle = { fontSize: 9, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--dim)' };
const caps = { textTransform: 'uppercase' };
const lower = { textTransform: 'lowercase' }; // DS §5: casing lives in style, JSX stays lowercase
