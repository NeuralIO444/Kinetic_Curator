// kernel.worker.js — worker entry (#1311).
//
// Owns one dish instance (via the session in stepKernel.js). Runs the
// deterministic step per STEP message and writes results into one of two
// double-buffered SoA frame sets; FRAME payloads cross by transfer, never
// by clone (asserted below — the clone fallback throws in debug builds).
//
// Web-worker globals only (self.onmessage / self.postMessage): the kernel
// purity gate (purity.selfcheck.mjs) forbids DOM/React/gl here, and `self`
// is the worker-safe global. The node parity selfcheck drives this exact
// file in a real thread via a parentPort→self bootstrap shim.

import { PROTOCOL_VERSION, MSG, assertTransferCoverage } from './protocol.js';
import { dispatchToReply } from './stepKernel.js';

// Debug builds keep every contract assertion hot (matches the SoA pools'
// "debug on by default" convention). Prod builds flip this to false and the
// transfer assertion degrades to structured-clone fallback.
const DEBUG = true;

let session = null;

self.onmessage = (event) => {
  const msg = event && event.data;
  const out = dispatchToReply(session, msg);
  session = out.session;
  const reply = out.reply;
  if (!reply) return; // RETURN needs no reply
  if (reply.type === MSG.FRAME || reply.type === MSG.SNAPSHOT_RESULT) {
    assertTransferCoverage(reply, out.transfers, { debug: DEBUG });
  }
  self.postMessage(reply, out.transfers);
};

// The entry's contract, asserted structurally by the selfcheck so the
// wiring above can't silently rot: one session, message in → reply out,
// transfers asserted before every post.
export const WORKER_ENTRY_CONTRACT = Object.freeze({
  protocol: PROTOCOL_VERSION,
  owns: 'one dish session via stepKernel.dispatchToReply',
  clock: 'main thread (STEP frames are the clock; no wall-clock reads here)',
});
