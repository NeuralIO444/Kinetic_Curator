/**
 * Eval worker (#108 item 5).
 * Node worker_threads entry. Staged-eval cache lives here.
 */
import { parentPort } from 'node:worker_threads';
import { evaluate } from '../evalContext.js';

export const EVAL_WORKER_ABI = 'eval.worker.v1';

const sessions = new Map();

function sessionOf(id) {
  if (!sessions.has(id)) sessions.set(id, { buffers: {} });
  return sessions.get(id);
}

parentPort.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'ping') {
    parentPort.postMessage({ type: 'pong', id: msg.id, abi: EVAL_WORKER_ABI });
    return;
  }
  if (msg.type === 'reset') {
    sessions.delete(msg.session || 'default');
    parentPort.postMessage({ type: 'reset', id: msg.id });
    return;
  }
  if (msg.type !== 'eval') return;
  const session = sessionOf(msg.session || 'default');
  try {
    const result = evaluate({ ...msg.ctx, buffers: session.buffers });
    parentPort.postMessage({
      type: 'result',
      id: msg.id,
      abi: EVAL_WORKER_ABI,
      items: result.items,
      safeCount: result.safeCount,
    });
  } catch (err) {
    parentPort.postMessage({
      type: 'error',
      id: msg.id,
      message: err && err.message ? err.message : String(err),
    });
  }
});
