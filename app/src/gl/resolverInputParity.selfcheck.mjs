// node src/gl/resolverInputParity.selfcheck.mjs
// AUDIT: the resolver is fed from two places, the in-thread live loop (liveLoop.mjs) and the opt-in render worker
// (renderWorker.js). Every input key the live loop sends that the worker does not is a feature that is silently absent
// in worker mode (that is how `dishPins` was nearly dropped, and `assetAttach`, `dishFormed`, `dishLimbs` and
// `dishTraits` are today). The known gaps are LISTED here, each with its consequence; a NEW key on the live loop that is
// in neither the worker nor this list fails, so a gap is a decision, not an accident. A listed key the worker has
// since gained must be deleted from the list (the list only ever shrinks).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

/** Top-level keys of the object literal passed to `anchor` (a call such as `resolver.resolveLayers({`). */
function inputKeys(src, anchor) {
  const i = src.indexOf(anchor);
  assert.ok(i >= 0, `anchor not found: ${anchor}`);
  const open = src.indexOf('{', i);
  let depth = 0; let k = open;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth += 1;
    else if (src[k] === '}') { depth -= 1; if (depth === 0) break; }
  }
  const keys = [];
  let d = 0;
  for (const line of src.slice(open + 1, k).split('\n')) {
    const t = line.trim();
    if (d === 0 && !t.startsWith('//')) {
      const shorthand = /^([A-Za-z_]\w*)(\s*,\s*[A-Za-z_]\w*)+\s*,?$/.test(t); // `canvasW, canvasH,` on one line
      if (shorthand) keys.push(...t.split(',').map((x) => x.trim()).filter(Boolean));
      else {
        const m = /^(?:\.\.\.)?([A-Za-z_][A-Za-z0-9_]*)\s*(?::|,|$)/.exec(t);
        if (m) keys.push(m[1]);
      }
    }
    d += (line.match(/[{[(]/g) || []).length - (line.match(/[}\])]/g) || []).length;
  }
  return keys;
}

const live = new Set(inputKeys(readFileSync(new URL('./liveLoop.mjs', import.meta.url), 'utf8'), 'resolver.resolveLayers({'));
const worker = new Set(inputKeys(readFileSync(new URL('./renderWorker.js', import.meta.url), 'utf8'), 'resolver.resolveLayers({'));

/** What the worker path lacks, and what that means. Delete a line the day the worker gains the key. */
const KNOWN_WORKER_GAPS = {
  assetAttach: 'creatures use the shape\'s own attach points, not the artist\'s edits',
  dishFormed: 'no creature forms in worker mode (the formation rule runs from the main-thread frame tap)',
  dishLimbs: 'no second pair of wings in worker mode',
  dishTraits: 'no Davis shifts in worker mode',
  reducedMotion: 'the OS reduced-motion preference does not damp palette-breath in worker mode',
  soloStash: 'a MATH solo does not seed mid-grey in worker mode',
  motionSmoothing: 'the smoothing dial does not reach worker-mode swarm',
  phraseWrapGen: 'phrase wraps do not re-deal in worker mode',
  focusSwap: 'a focus swap re-seeds weather in worker mode',
  mixSeconds: 'the item morph runs at its default length in worker mode',
  scaleMul: 'the audio-routed scale multiplier is not sent: placements use the layout\'s own scale range',
  alphaBoost: 'the audio-routed alpha boost is not sent: placements use the layout\'s own alpha range',
  effectiveScale: 'the effective scale range (layout x audio route) is not sent: the resolver falls back to the layout\'s own',
  effectiveAlpha: 'the effective alpha range (layout + audio route) is not sent: the resolver falls back to the layout\'s own',
  effectiveScaleY: 'the unlinked Y scale range is not sent',
  canvasW: 'the canvas size is not sent: the resolver places on the default 1000 x 700 whatever the artist chose',
  canvasH: 'see canvasW',
};

// 1. a new live-loop input is a decision: in the worker, or listed above
{
  const undecided = [...live].filter((k) => !worker.has(k) && !(k in KNOWN_WORKER_GAPS));
  assert.deepEqual(undecided, [], `new resolver input(s) on the live loop that the worker path neither sends nor lists: ${undecided.join(', ')}.\n  Add them to renderWorker.js, or to KNOWN_WORKER_GAPS with the consequence.`);
}

// 2. the list only shrinks: a key the worker now sends must come off it, and a listed key must still be a live-loop input
{
  const stale = Object.keys(KNOWN_WORKER_GAPS).filter((k) => worker.has(k));
  assert.deepEqual(stale, [], `listed as a worker gap but the worker sends it now: ${stale.join(', ')}: delete the line`);
  const gone = Object.keys(KNOWN_WORKER_GAPS).filter((k) => !live.has(k));
  assert.deepEqual(gone, [], `listed but no longer a live-loop input: ${gone.join(', ')}`);
}

// 3. the worker is opt-in: the default instrument never runs on it, so these gaps are not what a performer meets by default
{
  assert.ok(!DEFAULT_LAYOUT_PARAMS.renderWorker, 'the render worker is off by default');
  const panel = readFileSync(new URL('../panels/CanvasPanel.jsx', import.meta.url), 'utf8');
  assert.ok(/allowWorker = !!\(layoutParams\.renderWorker \|\| layoutParams\.previewDownscale \|\| queryWorker \|\| queryDownscale\)/.test(panel), 'the worker is chosen only by an explicit setting or URL');
}

// 4. sanity: the parser sees the inputs it is meant to (so the check cannot pass by finding nothing)
{
  for (const k of ['layers', 'seed', 'dishPins', 'loopTimeMs']) assert.ok(live.has(k), `live loop sends ${k}`);
  assert.ok(live.size > 30 && worker.size > 20, `parsed ${live.size} live keys and ${worker.size} worker keys`);
  assert.ok(worker.has('dishPins'), 'the worker carries the pins');
}

console.log(`resolverInputParity.selfcheck: ok (${live.size} live inputs; ${Object.keys(KNOWN_WORKER_GAPS).length} listed worker gaps)`);
