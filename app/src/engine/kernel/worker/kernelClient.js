// kernel/worker/kernelClient.js — main-thread client (#1311).
//
// Posts STEP, receives FRAME, hands the transferred ArrayBuffers to the
// renderer with zero copy. Owns the fallback: `runInline: true` (the default)
// runs the same step function on the main thread — one code path, two hosts.
// The worker stays opt-in until the parity selfcheck is green in CI.
//
// Frame pacing: the worker steps on rAF-driven STEP messages from the main
// thread — the main thread stays the clock owner. Backpressure: if FRAME for
// frame N hasn't returned when the next STEP is due, the client re-presents
// frame N−1 once, then sheds (the governor treats a slow worker frame as a
// shed signal, not a freeze).
//
// Audio: audioEnergy et al are analyzed on the main thread, quantized per
// frame, and posted as data in STEP.events. The worker never reads live audio.

import {
  MSG,
  PROTOCOL_VERSION,
  ProtocolError,
  initMessage,
  stepMessage,
  setParamMessage,
  snapshotMessage,
  returnMessage,
  payloadBuffers,
} from './protocol.js';
import { dispatchToReply } from './stepKernel.js';

/**
 * Host seam. A host posts messages and delivers replies:
 *   { post(msg, transfers), onMessage(handler), terminate() }
 * The default hosts are built below (inline / real Worker); tests inject
 * scripted hosts. `post` may deliver synchronously (inline) or async (worker).
 */
function createInlineHost() {
  let session = null;
  let handler = null;
  return {
    post(msg) {
      const out = dispatchToReply(session, msg);
      session = out.session;
      if (out.reply && handler) handler(out.reply);
    },
    onMessage(h) {
      handler = h;
    },
    terminate() {},
  };
}

function createWorkerHost(url) {
  const worker = new Worker(url, { type: 'module' });
  let handler = null;
  worker.onmessage = (event) => {
    if (handler) handler(event.data);
  };
  worker.onerror = (event) => {
    if (handler) {
      handler({
        type: MSG.ERROR,
        protocol: PROTOCOL_VERSION,
        message: `worker error: ${(event && event.message) || 'unknown'}`,
      });
    }
  };
  return {
    post(msg, transfers) {
      worker.postMessage(msg, transfers || []);
    },
    onMessage(h) {
      handler = h;
    },
    terminate() {
      worker.terminate();
    },
  };
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.runInline=true] — default stays inline; the worker is
 *   opt-in (`runInline: false`) until parity is proven in CI.
 * @param {string|URL} [opts.workerUrl] — worker entry URL; defaults to
 *   kernel.worker.js next to this module (same pattern as gl/workerLiveLoop.js).
 * @param {object} [opts.host] — injected host (tests); overrides runInline.
 * @param {(err: object) => void} [opts.onProtocolError] — worker ERROR replies
 *   that match no pending request land here; default rethrows async.
 */
export function createKernelClient({ runInline = true, workerUrl, host, onProtocolError } = {}) {
  const activeHost = host || (runInline ? createInlineHost() : createWorkerHost(workerUrl || new URL('./kernel.worker.js', import.meta.url)));
  const mode = host ? 'injected' : runInline ? 'inline' : 'worker';

  let readyInfo = null;
  let initWaiter = null;
  let pendingStep = null; // { frame, resolve, reject }
  let pendingSnapshot = null; // { atFrame, resolve, reject }
  let lastFrame = null; // { frame, columns } — last FRAME received
  let unansweredMisses = 0;
  let terminated = false;

  const reportError = (err) => {
    if (onProtocolError) onProtocolError(err);
    else {
      throw new ProtocolError(`unmatched worker error: ${err.message || err}`);
    }
  };

  function handleReply(reply) {
    if (!reply || typeof reply.type !== 'string') return;
    if (reply.protocol !== PROTOCOL_VERSION) {
      reportError({ message: `protocol mismatch on reply (got ${String(reply.protocol)})` });
      return;
    }
    switch (reply.type) {
      case MSG.READY: {
        readyInfo = reply;
        if (initWaiter) {
          const w = initWaiter;
          initWaiter = null;
          w.resolve(reply);
        }
        break;
      }
      case MSG.FRAME: {
        const p = pendingStep;
        pendingStep = null;
        unansweredMisses = 0;
        lastFrame = { frame: reply.frame, columns: reply.columns };
        if (p) {
          if (reply.frame !== p.frame) {
            p.reject(new ProtocolError(`FRAME ${reply.frame} does not answer STEP ${p.frame}`));
          } else {
            p.resolve({ ok: true, frame: reply.frame, columns: reply.columns, count: reply.count });
          }
        }
        break;
      }
      case MSG.SNAPSHOT_RESULT: {
        const s = pendingSnapshot;
        pendingSnapshot = null;
        if (s) {
          if (reply.frame !== s.atFrame) {
            s.reject(new ProtocolError(`SNAPSHOT_RESULT ${reply.frame} != ${s.atFrame}`));
          } else {
            s.resolve({ frame: reply.frame, columns: reply.columns, count: reply.count });
          }
        }
        break;
      }
      case MSG.PARAM_ACK:
        break; // fire-and-forget; ordering with STEP is guaranteed by the channel
      case MSG.ERROR: {
        const err = new ProtocolError(`worker: ${reply.message}`);
        if (pendingStep && reply.forFrame === pendingStep.frame) {
          const p = pendingStep;
          pendingStep = null;
          p.reject(err);
        } else if (pendingSnapshot && reply.forFrame === pendingSnapshot.atFrame) {
          const s = pendingSnapshot;
          pendingSnapshot = null;
          s.reject(err);
        } else if (initWaiter) {
          const w = initWaiter;
          initWaiter = null;
          w.reject(err);
        } else {
          reportError(reply);
        }
        break;
      }
      default:
        reportError({ message: `unknown reply type "${reply.type}"` });
    }
  }

  activeHost.onMessage(handleReply);

  function ensureLive() {
    if (terminated) throw new ProtocolError('client is terminated');
  }

  const client = {
    /** Host mode: 'inline' | 'worker' | 'injected'. */
    mode,
    /** True once READY has arrived. */
    get isReady() {
      return readyInfo !== null;
    },
    /** The READY payload (seed echo, params, kernelVersion). */
    get readyInfo() {
      return readyInfo;
    },

    /** INIT → READY handshake. Resolves with the READY payload. */
    init({ seed, recipe, params } = {}) {
      ensureLive();
      if (initWaiter) throw new ProtocolError('init already in flight');
      return new Promise((resolve, reject) => {
        initWaiter = { resolve, reject };
        activeHost.post(initMessage({ seed, recipe, params }), []);
      });
    },

    /**
     * Post STEP for `frame`. Resolves with { ok, frame, columns, count }.
     * Backpressure: while a STEP is unanswered, the next call re-presents
     * the last received frame once ({ rePresented: true }); further calls
     * shed ({ ok: false, shed: true }) — the governor's shed signal.
     * `events` must already be quantized per frame (audio included).
     */
    stepFrame(frame, dt, events) {
      ensureLive();
      if (pendingStep) {
        unansweredMisses += 1;
        if (lastFrame && unansweredMisses === 1) {
          return Promise.resolve({
            ok: true,
            rePresented: true,
            frame: lastFrame.frame,
            columns: lastFrame.columns,
          });
        }
        return Promise.resolve({ ok: false, shed: true, frame });
      }
      return new Promise((resolve, reject) => {
        pendingStep = { frame, resolve, reject };
        unansweredMisses = 0;
        activeHost.post(stepMessage({ frame, dt, events }), []);
      });
    },

    /** SET_PARAM {key, value, frame} — fire-and-forget; ordered vs STEP. */
    setParam(key, value, frame) {
      ensureLive();
      activeHost.post(setParamMessage({ key, value, frame }), []);
    },

    /** SNAPSHOT {atFrame} → full column dump of that frame (transferred). */
    snapshot(atFrame) {
      ensureLive();
      if (pendingSnapshot) throw new ProtocolError('snapshot already in flight');
      return new Promise((resolve, reject) => {
        pendingSnapshot = { atFrame, resolve, reject };
        activeHost.post(snapshotMessage({ atFrame }), []);
      });
    },

    /**
     * Hand frame buffers back to the worker for ping-pong reuse (zero-copy
     * round trip). No-op in inline mode — the columns stay live there.
     * Do not release a frame the client may still need to re-present: after
     * release, lastFrame's buffers are detached on this side.
     */
    releaseFrame(result) {
      ensureLive();
      if (mode !== 'worker' && mode !== 'injected') return;
      if (!result || !result.columns) return;
      activeHost.post(returnMessage({ frame: result.frame, columns: result.columns }), payloadBuffers({ columns: result.columns }));
    },

    /** Consecutive unanswered STEPs (governor telemetry). */
    get backpressureMisses() {
      return unansweredMisses;
    },

    terminate() {
      terminated = true;
      if (pendingStep) pendingStep.reject(new ProtocolError('client terminated'));
      if (pendingSnapshot) pendingSnapshot.reject(new ProtocolError('client terminated'));
      if (initWaiter) initWaiter.reject(new ProtocolError('client terminated'));
      pendingStep = pendingSnapshot = initWaiter = null;
      activeHost.terminate();
    },
  };

  return client;
}
