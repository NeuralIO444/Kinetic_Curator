/**
 * LineageTree.jsx — #2030 (creatures, of #1848): the selected creature's ancestry as a walkable tree in the
 * WetLab — the backstage companion to the stage's family-resemblance shimmer (#1851). #2034 (the Big Lab):
 * the tree is drawn as a pedigree — generation rows of creature tiles with connector lines to their three
 * parents, frontier stubs as ghost outlines — and the selected node's deltas are grouped by source, so a
 * source shared by four genes is printed once, as a group head, not four times.
 *
 * Matt's rulings (2026-11-07): the tree is complete anywhere (the record retains its ancestry, written at
 * its birth and never recomputed); a compact summary rides the record, not full ancestor records; hand
 * edits show as deltas. The tree is a VIEW on the record alone (components/lineageTree.model.mjs) — it
 * never reads the bank, and it offers no edits: editing lives on the Genome Timeline. Generations are
 * derived from the retained graph, never stored; ancestors bred before summaries existed stand as stubs
 * (an id, no genes), and their generation is honestly unknown.
 * Discrete facts render TE (KC-1 DS): ids, generations, gene classes as plain text.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { lineageTree, nodeDeltas } from './lineageTree.model.mjs';

const genLabel = (gen) => (gen === null ? 'gen —' : `gen ${String(gen).padStart(2, '0')}`);
const depthName = (d) => (d === 1 ? 'parents' : d === 2 ? 'grandparents' : `depth ${d}`);

/** A node's body shape id: the record's own, or the FORM.body gene its summary entry retained. */
function bodyOf(record, nodeId) {
  if (nodeId === record.id) return record.body;
  const entry = (Array.isArray(record.ancestry) ? record.ancestry : []).find((e) => e.id === nodeId);
  const g =
    entry && Array.isArray(entry.genes) ? entry.genes.find((x) => x.family === 'FORM' && x.id === 'body') : null;
  return g && typeof g.value === 'string' ? g.value : null;
}

/** The delta groups of one node: deltas sharing a source print under that source, once (DS rule 2 keeps
 *  every gene's own value and class on its line; only the repeated phrase is factored out). */
function deltaGroups(deltas) {
  const groups = [];
  const byKey = new Map();
  const push = (key, head, line) => {
    let g = byKey.get(key);
    if (!g) {
      g = { key, head, lines: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.lines.push(line);
  };
  for (const d of deltas) {
    const geneLine = { key: d.key, family: d.family, id: d.id, valueText: d.valueText, suffix: '' };
    if (d.cls === 'inherited') {
      const p = d.parents[0];
      geneLine.suffix = p && p.retained ? (p.matches ? ' · unchanged' : ' · differs from the retained value') : '';
      push(`inherited:${d.fromId}`, `inherited from ${d.fromId}`, geneLine);
    } else if (d.cls === 'crossed') {
      const parts = d.parents.map((p) => `${p.id}: ${p.retained ? p.valueText : 'not retained'}`);
      geneLine.suffix = ` — crossed · a blend of the parents — ${parts.join(' · ')}`;
      push(`crossed:${d.key}`, null, geneLine);
    } else if (d.cls === 'mutated') {
      if (d.mutation && d.mutation.kind === 'swap')
        geneLine.suffix = ` · swapped from ${d.mutation.from} to ${d.mutation.to}`;
      else if (d.mutation && d.mutation.kind === 'reroll') geneLine.suffix = ` · re-rolled to ${d.mutation.value}`;
      else geneLine.suffix = ` · ${d.sourceText}`;
      push('mutated', 'mutated at birth', geneLine);
    } else if (d.cls === 'hand') {
      push(`hand:${d.sourceText}`, d.sourceText, geneLine);
    } else {
      push(`born:${d.sourceText}`, d.sourceText, geneLine);
    }
  }
  return groups;
}

export function LineageTree({ record, assets = [] }) {
  const tree = lineageTree(record);
  const [selectedId, setSelectedId] = useState(record.id);
  const selected = selectedId === record.id ? tree.self : tree.nodes.find((nd) => nd.id === selectedId) || tree.self;
  const view = nodeDeltas(record, selected.id);
  const founder = !record.lineage;

  // pedigree rows: the oldest ancestors on top, this creature at the bottom; a row is labelled by its
  // generation when the row agrees on one, else by its depth (the honest label the retained graph supports)
  const all = [tree.self, ...tree.nodes];
  const depths = [...new Set(all.map((nd) => nd.depth))].sort((a, b) => b - a);
  const rows = depths.map((depth) => {
    const members = all.filter((nd) => nd.depth === depth);
    const gens = new Set(members.map((m) => m.gen));
    const label =
      depth === 0 ? 'this creature' : gens.size === 1 && !gens.has(null) ? genLabel(members[0].gen) : depthName(depth);
    return { depth, members, label };
  });

  // connector lines: measured from the laid-out tiles (child's top edge → each parent's bottom edge),
  // redrawn whenever the chart's geometry changes; if a tile cannot be measured the line is simply absent
  const chartRef = useRef(null);
  const tileRefs = useRef(new Map());
  const [lines, setLines] = useState([]);
  useLayoutEffect(() => {
    const chart = chartRef.current;
    if (!chart) return undefined;
    const measure = () => {
      const box = chart.getBoundingClientRect();
      if (!(box.width > 0)) return;
      const out = [];
      for (const e of tree.edges) {
        const c = tileRefs.current.get(e.child);
        const p = tileRefs.current.get(e.parent);
        if (!c || !p) continue;
        const cb = c.getBoundingClientRect();
        const pb = p.getBoundingClientRect();
        out.push({
          key: `${e.child}->${e.parent}`,
          x1: cb.left + cb.width / 2 - box.left,
          y1: cb.top - box.top,
          x2: pb.left + pb.width / 2 - box.left,
          y2: pb.bottom - box.top,
        });
      }
      setLines(out);
    };
    measure();
    const raf = requestAnimationFrame(measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(chart);
    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the tree is a pure function of the record
  }, [record]);

  const tile = (node) => {
    const bodyId = bodyOf(record, node.id);
    const bodyAsset = bodyId ? (assets || []).find((a) => a.id === bodyId) || null : null;
    const sel = node.id === selected.id;
    return (
      <button
        key={node.id}
        type="button"
        ref={(el) => {
          if (el) tileRefs.current.set(node.id, el);
          else tileRefs.current.delete(node.id);
        }}
        style={{ ...tileBox, ...(node.stub ? tileGhost : null), ...(sel ? tileSel : null) }}
        aria-pressed={sel}
        data-testid="lineage-node"
        title={
          node.stub
            ? `${node.id} — a parent; nothing more was retained`
            : `${node.id} · ${genLabel(node.gen)} · ${node.depth === 0 ? 'this creature' : `${node.depth} breeding event${node.depth === 1 ? '' : 's'} back`}`
        }
        onClick={() => setSelectedId(node.id)}
      >
        <span style={genChip}>{node.gen === null ? '—' : String(node.gen).padStart(2, '0')}</span>
        {bodyAsset ? (
          <svg
            viewBox="0 0 100 100"
            width="40"
            height="40"
            style={{ display: 'block', margin: '0 auto' }}
            dangerouslySetInnerHTML={{ __html: bodyAsset.svg }}
          />
        ) : (
          <span style={{ display: 'block', height: 40, lineHeight: '40px', color: 'var(--dim)' }}>—</span>
        )}
        <span style={tileId}>{node.id}</span>
        {node.stub && <span style={{ display: 'block', fontSize: 8, color: 'var(--dim)' }}>not retained</span>}
      </button>
    );
  };

  return (
    <div style={box} data-testid="lineage-tree">
      <div style={{ ...secTitle, ...caps }}>
        lineage · {record.id} · {tree.nodes.length} ancestor{tree.nodes.length === 1 ? '' : 's'}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {founder ? (
          <span
            style={factChip}
            title="A founder: no parents were recorded for this creature — it is GEN 01, the root of its line"
          >
            founder · gen 01
          </span>
        ) : tree.complete ? (
          <span style={factChip} title="The whole line, retained in this record at each birth">
            line complete
          </span>
        ) : (
          <span
            style={factChip}
            title="Part of this line predates retained ancestry: those ancestors stand as stubs, and generation numbers stop where the record does"
          >
            stubs {tree.stubs}
          </span>
        )}
      </div>
      <div ref={chartRef} style={{ position: 'relative' }}>
        <svg
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {lines.map((l) => (
            <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="var(--line)" strokeWidth="1" />
          ))}
        </svg>
        {rows.map((row) => (
          <div key={row.depth} style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
            <span style={{ ...caps, fontSize: 9, color: 'var(--dim)', letterSpacing: '0.1em' }}>{row.label}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{row.members.map((nd) => tile(nd))}</div>
          </div>
        ))}
      </div>
      <div
        style={{ borderTop: '1px solid var(--line)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}
        data-testid="lineage-deltas"
      >
        <div style={{ fontSize: 11, color: 'var(--ink)' }}>
          {selected.id} · {genLabel(selected.gen)}
          {selected.depth > 0 && ` · ${selected.depth} back`}
        </div>
        {view && !view.retained && (
          <div
            style={{ fontSize: 10, color: 'var(--dim)', lineHeight: 1.5 }}
            title="This ancestor was a parent, and that is all the record kept"
          >
            not retained · no genes · no deltas
          </div>
        )}
        {view &&
          view.retained &&
          deltaGroups(view.deltas).map((g) => (
            <div key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {g.head && <div style={{ fontSize: 10, color: 'var(--dim)' }}>{g.head}</div>}
              {g.lines.map((ln) => (
                <div key={ln.key} style={{ fontSize: 10, color: 'var(--dim)', lineHeight: 1.5, paddingLeft: 10 }}>
                  <span style={{ color: 'var(--ink)' }}>
                    <span style={lower}>
                      {ln.family}.{ln.id}
                    </span>{' '}
                    · {ln.valueText}
                  </span>
                  {ln.suffix}
                </div>
              ))}
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
  fontSize: 10,
  color: 'var(--dim)',
};
const secTitle = { fontSize: 9, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--dim)' };
const caps = { textTransform: 'uppercase' };
const lower = { textTransform: 'lowercase' }; // DS §5: casing lives in style, JSX stays lowercase
const factChip = {
  fontSize: 9,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  border: '1px solid var(--line)',
  padding: '2px 6px',
  color: 'var(--dim)',
};
const tileBox = {
  position: 'relative',
  width: 76,
  padding: '4px 2px 3px',
  background: 'transparent',
  border: '1px solid var(--line)',
  color: 'var(--dim)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  flex: '0 0 auto',
};
const tileGhost = { borderStyle: 'dashed', opacity: 0.55 };
const tileSel = { borderColor: 'var(--kc-red)', outline: '1px solid var(--kc-red)', color: 'var(--ink)' };
const tileId = {
  display: 'block',
  fontSize: 8.5,
  letterSpacing: '0.04em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  marginTop: 2,
};
const genChip = {
  position: 'absolute',
  top: 2,
  left: 2,
  fontSize: 8,
  lineHeight: 1,
  padding: '2px 3px',
  background: '#000',
  border: '1px solid var(--line)',
  color: 'var(--ink)',
  letterSpacing: '0.06em',
};
