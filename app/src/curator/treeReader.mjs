// treeReader.mjs — XGBoost T3: "read the model" (spec §7.5 — printable,
// or it doesn't ship). The dev panel's view of the active tree head,
// reshaped from the VALIDATED head object tasteHead.js keeps — the raw
// taste file is never re-parsed here.
//
// The text mirrors studio/curator.py's describe_trees (the trainer's own
// inspect output): the ensemble's shape, its strongest features by total
// split gain, and its top trees by total gain, formatted the same way
// (_format_spec_tree's if/else/leaf lines, %g gains, signed 4-decimal
// leaves) — so what Matt reads in the dev panel is what the Studio
// printed at train time, word for word where the words exist.
import { XGB_HEAD_KIND, headUsable, describeFeatureValue } from './tasteHead.js';

const fmtG = (x) => String(Number(x.toPrecision(6)));
const fmtLeaf = (x) => `${x >= 0 ? '+' : '-'}${Math.abs(x).toFixed(4)}`;

/** (nodes, maxDepth) of one tree — spec_head_stats' walk: depth counts
 * split levels from the root (root = 0); a leaf reports its own depth. */
function treeStats(node, depth = 0) {
  if ('leaf' in node) return { nodes: 1, depth };
  const y = treeStats(node.y, depth + 1);
  const n = treeStats(node.n, depth + 1);
  return { nodes: 1 + y.nodes + n.nodes, depth: Math.max(y.depth, n.depth) };
}

const treeGain = (node) => ('leaf' in node ? 0 : node.gain + treeGain(node.y) + treeGain(node.n));

/** The split value as the words describe it: a boolean spelled 'true' in
 * the file reads with the boolean's words, as the trainer's describe_term
 * reads it. */
function describeSplitValue(name, v) {
  const dv = v === 'true' ? true : v === 'false' ? false : v;
  return describeFeatureValue(name, dv);
}

/** _format_spec_tree, line for line. */
function formatTree(node, names, depth = 0) {
  const pad = '  '.repeat(depth);
  if ('leaf' in node) return [`${pad}-> ${fmtLeaf(node.leaf)}`];
  const name = names[node.f];
  const cond =
    node.op === '<' ? `${name} < ${fmtG(node.v)}` : `${name} = ${String(node.v)} (${describeSplitValue(name, node.v)})`;
  return [
    `${pad}if ${cond}  [gain ${fmtG(node.gain)}]`,
    ...formatTree(node.y, names, depth + 1),
    `${pad}else`,
    ...formatTree(node.n, names, depth + 1),
  ];
}

/**
 * The reader's model of a taste: absent states stay absent, with the
 * reason named (the census readout's honesty idiom) — no taste, or a
 * taste whose head is the linear kind, both say so plainly. A tree head
 * renders regardless of the fidelity bar (inspect prints any head; the
 * bar governs steering, not readability) and says whether it is steering.
 */
export function treeHeadView(taste) {
  if (!taste) return { present: false, reason: 'no taste loaded' };
  const head = taste.head;
  if (!head || head.kind !== XGB_HEAD_KIND) {
    return { present: false, reason: 'taste has no tree head (linear head)' };
  }
  let nodes = 0;
  let maxDepth = 0;
  const perFeature = new Map();
  const tally = (node) => {
    if ('leaf' in node) return;
    const name = head.features[node.f];
    perFeature.set(name, (perFeature.get(name) || 0) + node.gain);
    tally(node.y);
    tally(node.n);
  };
  for (const t of head.trees) {
    const s = treeStats(t);
    nodes += s.nodes;
    maxDepth = Math.max(maxDepth, s.depth);
    tally(t);
  }
  const strongest = [...perFeature.entries()]
    .map(([feature, gain]) => ({ feature, gain }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 5);
  const ranked = head.trees
    .map((t) => ({ tree: t, gain: treeGain(t) }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3);
  const lines = [`xgboost trees · ${head.trees.length} trees, depth <= ${maxDepth}, ${nodes} nodes`];
  if (strongest.length) {
    lines.push(`strongest features: ${strongest.map((s) => `${s.feature} (gain ${fmtG(s.gain)})`).join(', ')}`);
  }
  ranked.forEach(({ tree, gain }, i) => {
    lines.push(`tree ${i} (total gain ${fmtG(gain)}):`);
    lines.push(...formatTree(tree, head.features));
  });
  return {
    present: true,
    headKind: head.kind,
    fidelity: head.fidelity,
    fitOn: head.fitOn,
    steering: headUsable(head),
    treeCount: head.trees.length,
    maxDepth,
    nodeCount: nodes,
    strongest,
    lines,
  };
}
