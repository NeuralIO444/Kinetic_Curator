/**
 * Host for the eval worker. Node-only (worker_threads).
 * Live loop stays on-thread — a postMessage hop is a frame.
 */
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const EVAL_WORKER_ABI = 'eval.worker.v1';

const WORKER_PATH = join(dirname(fileURLToPath(import.meta.url)), 'evalWorker.mjs');
const CALL_MS = 15000;

export function createEvalHost() {
  const worker = new Worker(WORKER_PATH);
  let nextId = 1;
  const pending = new Map();

  worker.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    const wait = pending.get(msg.id);
    if (!wait) return;
    pending.delete(msg.id);
    clearTimeout(wait.timer);
    if (msg.type === 'error') wait.reject(new Error(msg.message));
    else wait.resolve(msg);
  });
  worker.on('error', (err) => {
    for (const wait of pending.values()) {
      clearTimeout(wait.timer);
      wait.reject(err);
    }
    pending.clear();
  });

  function send(payload) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`eval worker timeout (${payload.type} #${id})`));
      }, CALL_MS);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ ...payload, id });
    });
  }

  return {
    abi: EVAL_WORKER_ABI,
    ping() {
      return send({ type: 'ping' });
    },
    eval(ctx, session = 'default') {
      return send({ type: 'eval', session, ctx });
    },
    reset(session = 'default') {
      return send({ type: 'reset', session });
    },
    async close() {
      await worker.terminate();
    },
  };
}
