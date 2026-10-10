// node src/engine/kernel/worker/kernelWorker.selfcheck.mjs
// #1311 acceptance — kernel worker 2/3: worker entry + versioned protocol + inline fallback.
//
// THE GATE: same seed + same events → bit-identical output worker vs runInline
// (N frames, hash comparison), over a REAL thread boundary (node worker_threads
// running the actual kernel.worker.js entry behind a parentPort→self shim).
// Plus: protocol rejects any event without a frame number; the transfer-list
// assertion fires in debug builds; default stays inline (worker is opt-in).

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { POINT_COLUMN_NAMES, createPointSet } from '../soa/pointSet.js';
import {
  MSG,
  EVENT,
  PROTOCOL_VERSION,
  ProtocolError,
  KNOWN_INIT_PARAMS,
  initMessage,
  stepMessage,
  setParamMessage,
  snapshotMessage,
  returnMessage,
  readyMessage,
  frameMessage,
  validateInitMessage,
  validateStepMessage,
  validateSetParamMessage,
  validateSnapshotMessage,
  assertTransferCoverage,
  payloadBuffers,
} from './protocol.js';
import {
  DEFAULT_STEP_PARAMS,
  dispatchKernelMessage,
  columnTransferList,
} from './stepKernel.js';
import { createKernelClient } from './kernelClient.js';
import { KERNEL_VERSION } from '../version.js';

const DIR = dirname(fileURLToPath(import.meta.url));

function throwsProtocol(fn, label) {
  assert.throws(fn, (e) => e instanceof ProtocolError, `${label}: expected ProtocolError`);
}

// ── protocol: every event carries a frame index, never wall-clock ───────────
{
  throwsProtocol(
    () => validateStepMessage(stepMessage({ frame: 3, dt: 1 / 60, events: [{ type: 'impulse', dx: 1, dy: 0 }] })),
    'STEP event without frame',
  );
  throwsProtocol(
    () => validateStepMessage(stepMessage({ frame: 3, dt: 1 / 60, events: [{ frame: 'now', type: 'impulse', dx: 1, dy: 0 }] })),
    'STEP event with wall-clock-ish frame',
  );
  throwsProtocol(
    () => validateStepMessage(stepMessage({ frame: 3, dt: 1 / 60, events: [{ frame: 4, type: 'impulse', dx: 1, dy: 0 }] })),
    'STEP event for a different frame',
  );
  throwsProtocol(() => validateSetParamMessage(setParamMessage({ key: 'damping', value: 0.9 })), 'SET_PARAM without frame');
  throwsProtocol(() => validateSnapshotMessage(snapshotMessage({})), 'SNAPSHOT without atFrame');
  throwsProtocol(() => validateInitMessage({ ...initMessage({ seed: 1 }), protocol: 999 }), 'INIT protocol mismatch');
  throwsProtocol(() => validateStepMessage({ ...stepMessage({ frame: 0, dt: 0.016 }), protocol: 999 }), 'STEP protocol mismatch');
  throwsProtocol(() => validateStepMessage(stepMessage({ frame: -1, dt: 0.016 })), 'negative STEP frame');
  throwsProtocol(() => validateStepMessage(stepMessage({ frame: 1.5, dt: 0.016 })), 'fractional STEP frame');
  throwsProtocol(() => validateStepMessage(stepMessage({ frame: 0, dt: 0.016, events: [{ frame: 0, type: 'nope' }] })), 'unknown event type');
  throwsProtocol(() => validateSetParamMessage(setParamMessage({ key: 'pointCount', value: 8, frame: 0 })), 'SET_PARAM non-settable key');
  throwsProtocol(
    () => validateInitMessage(initMessage({ seed: 1, params: { pointCount: 1.5 } })),
    'INIT fractional pointCount',
  );
  // Valid messages pass.
  validateStepMessage(stepMessage({ frame: 0, dt: 1 / 60, events: [{ frame: 0, type: 'audio-envelope', energy: 0.5 }] }));
  validateSetParamMessage(setParamMessage({ key: 'damping', value: 0.9, frame: 7 }));
  validateSnapshotMessage(snapshotMessage({ atFrame: 0 }));
  validateInitMessage(initMessage({ seed: 42, params: { pointCount: 64 } }));
}

// ── protocol: INIT param keys stay in sync with the step kernel defaults ────
{
  const a = new Set(KNOWN_INIT_PARAMS);
  const b = new Set(Object.keys(DEFAULT_STEP_PARAMS));
  assert.deepStrictEqual(a, b, 'KNOWN_INIT_PARAMS must equal DEFAULT_STEP_PARAMS keys');
}

// ── protocol: every FRAME payload buffer is in the transfer list ────────────
{
  const set = createPointSet(4);
  set.count = 4;
  const reply = frameMessage({ frame: 0, columns: set, count: 4 });
  const full = columnTransferList(set);
  assert.deepStrictEqual(assertTransferCoverage(reply, full, { debug: true }), [], 'full coverage passes');
  const short = full.slice(1);
  throwsProtocol(() => assertTransferCoverage(reply, short, { debug: true }), 'clone fallback throws in debug builds');
  const missing = assertTransferCoverage(reply, short, { debug: false });
  assert.strictEqual(missing.length, 1, 'prod reports the missing buffer instead of throwing');
}

// ── dispatch: fail-closed sequencing ────────────────────────────────────────
{
  throwsProtocol(() => dispatchKernelMessage(null, stepMessage({ frame: 0, dt: 0.016 })), 'STEP before INIT');
  const s0 = dispatchKernelMessage(null, initMessage({ seed: 7 }));
  assert.strictEqual(s0.reply.type, MSG.READY, 'INIT → READY');
  assert.strictEqual(s0.reply.protocol, PROTOCOL_VERSION, 'READY carries the protocol version');
  assert.strictEqual(s0.reply.kernelVersion, KERNEL_VERSION, 'READY carries the kernel version');
  let session = s0.session;
  const r0 = dispatchKernelMessage(session, stepMessage({ frame: 0, dt: 1 / 60 }));
  session = r0.session;
  assert.strictEqual(r0.reply.type, MSG.FRAME, 'STEP → FRAME');
  assert.strictEqual(r0.reply.frame, 0, 'FRAME echoes the STEP frame');
  assert.strictEqual(r0.transfers.length, POINT_COLUMN_NAMES.length, 'FRAME transfers every column buffer');
  throwsProtocol(() => dispatchKernelMessage(session, stepMessage({ frame: 2, dt: 1 / 60 })), 'skipped frame is a protocol error');
  throwsProtocol(() => dispatchKernelMessage(session, { type: 'bogus', protocol: PROTOCOL_VERSION }), 'unknown message type');
  const snap = dispatchKernelMessage(session, snapshotMessage({ atFrame: 0 }));
  assert.strictEqual(snap.reply.type, MSG.SNAPSHOT_RESULT, 'SNAPSHOT → SNAPSHOT_RESULT');
  assert.notStrictEqual(snap.reply.columns.x.buffer, r0.reply.columns.x.buffer, 'snapshot copies (never detaches the live set)');
}

// ── client: default stays inline; worker is opt-in ───────────────────────────
{
  const def = createKernelClient();
  assert.strictEqual(def.mode, 'inline', 'default stays inline');
  def.terminate();
  const src = readFileSync(join(DIR, 'kernelClient.js'), 'utf8');
  assert.match(src, /new Worker\(url, \{ type: 'module' \}\)/,
    'worker host constructs a module worker');
  assert.match(src, /new URL\('\.\/kernel\.worker\.js', import\.meta\.url\)/,
    'worker entry URL resolved relative to the module (same pattern as gl/workerLiveLoop.js)');
}

// ── client: backpressure — re-present once, then shed ────────────────────────
{
  let handler = null;
  const posted = [];
  const fakeHost = {
    post(msg, transfers) { posted.push({ msg, transfers }); },
    onMessage(h) { handler = h; },
    terminate() {},
  };
  const client = createKernelClient({ host: fakeHost });
  const ip = client.init({ seed: 1 });
  assert.strictEqual(posted[0].msg.type, MSG.INIT, 'init posts INIT');
  handler(readyMessage({ seed: 1, params: {}, kernelVersion: KERNEL_VERSION }));
  await ip;

  // Nothing received yet: an unanswered STEP sheds immediately (nothing to re-present).
  const s0 = client.stepFrame(0, 1 / 60, []);
  const s1 = client.stepFrame(1, 1 / 60, []);
  assert.strictEqual((await s1).shed, true, 'no frame received yet → shed, not re-present');
  assert.strictEqual(posted.filter((p) => p.msg.type === MSG.STEP).length, 1, 'shed STEP is never posted');

  // Answer frame 0; hold frame 1; the next STEP re-presents 0 once, then sheds.
  const set = createPointSet(2);
  set.count = 2;
  handler(frameMessage({ frame: 0, columns: set, count: 2 }));
  const r0 = await s0;
  assert.strictEqual(r0.ok, true, 'frame 0 resolves');
  const p1 = client.stepFrame(1, 1 / 60, []);
  const rp = await client.stepFrame(2, 1 / 60, []);
  assert.strictEqual(rp.rePresented, true, 'unanswered STEP re-presents the last frame once');
  assert.strictEqual(rp.frame, 0, 're-presented frame is N−1');
  const sh = await client.stepFrame(3, 1 / 60, []);
  assert.strictEqual(sh.ok, false, 'second unanswered STEP sheds');
  assert.strictEqual(sh.shed, true, 'shed flag set (governor shed signal)');
  assert.strictEqual(client.backpressureMisses, 2, 'miss counter tracks consecutive unanswered STEPs');
  handler({ type: MSG.ERROR, protocol: PROTOCOL_VERSION, message: 'boom', forFrame: 1 });
  await assert.rejects(p1, (e) => e instanceof ProtocolError, 'worker ERROR rejects the pending STEP');
  client.terminate();
}

// ── THE GATE: worker vs runInline, bit-identical over a real thread ──────────
function hashColumns(columns, count) {
  const h = createHash('sha256');
  const n = count >>> 0;
  const nb = Buffer.allocUnsafe(4);
  nb.writeUInt32LE(n);
  h.update(nb);
  for (const name of POINT_COLUMN_NAMES) {
    const col = columns[name];
    h.update(new Uint8Array(col.buffer, col.byteOffset, n * col.BYTES_PER_ELEMENT));
  }
  return h.digest('hex');
}

function eventsFor(f) {
  const evs = [];
  if (f % 8 === 0) evs.push({ frame: f, type: EVENT.IMPULSE, dx: 3.5, dy: -2.25 });
  if (f % 4 === 0) evs.push({ frame: f, type: EVENT.AUDIO_ENVELOPE, energy: (f % 5) * 0.2 });
  return evs;
}

/** Run the REAL kernel.worker.js in a real thread: parentPort bridged to web-style self. */
async function startRealWorkerThread() {
  const tmp = mkdtempSync(join(tmpdir(), 'kc-worker-1311-'));
  const entryUrl = pathToFileURL(join(DIR, 'kernel.worker.js')).href;
  const bootstrap = join(tmp, 'bootstrap.mjs');
  // The shim emulates browser Worker queueing: messages that arrive before
  // the entry assigns self.onmessage are queued and flushed on assignment —
  // without this, an INIT posted during worker boot is silently dropped
  // (node 20 delivers it before the entry's import resolves; node 24 won
  // the race the other way — either order must work).
  writeFileSync(
    bootstrap,
    `import { parentPort } from 'node:worker_threads';
const box = {};
const early = [];
globalThis.self = {
  postMessage(msg, transfers) { parentPort.postMessage(msg, transfers); },
  set onmessage(h) {
    box.h = h;
    let m;
    while ((m = early.shift()) !== undefined) h({ data: m });
  },
  get onmessage() { return box.h; },
};
parentPort.on('message', (m) => {
  if (box.h) box.h({ data: m });
  else early.push(m);
});
await import(${JSON.stringify(entryUrl)});
`,
  );
  const worker = new Worker(pathToFileURL(bootstrap));
  let threadError = null;
  worker.on('error', (e) => {
    threadError = e;
  });
  const host = {
    post(msg, transfers) {
      worker.postMessage(msg, transfers || []);
    },
    onMessage(h) {
      worker.on('message', h);
    },
    terminate() {
      worker.terminate();
      rmSync(tmp, { recursive: true, force: true });
    },
    get threadError() {
      return threadError;
    },
  };
  return host;
}

{
  const SEED = 1337;
  const PARAMS = { pointCount: 128, damping: 0.999, speed: 1.5, audioGain: 0.5 };
  const N = 64;
  const DT = 1 / 60;

  async function initWithTimeout(client, host, label) {
    // Belt-and-braces: if the worker thread fails to boot, INIT would wait
    // forever and hang the suite (and CI). Fail loudly instead, carrying the
    // thread's error when there is one.
    const ms = 15000;
    let timer;
    try {
      await Promise.race([
        client.init({ seed: SEED, params: PARAMS }),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const werr = host && host.threadError ? ` worker thread error: ${host.threadError.message}` : '';
            reject(new Error(`${label}: INIT timed out after ${ms}ms.${werr}`));
          }, ms);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function runDrive(client, host, label) {
    const hashes = [];
    await initWithTimeout(client, host, label);
    assert.strictEqual(client.readyInfo.kernelVersion, KERNEL_VERSION, 'READY kernel version matches');
    for (let f = 0; f < N; f++) {
      if (f === 32) client.setParam('damping', 0.995, 32);
      const r = await client.stepFrame(f, DT, eventsFor(f));
      assert.strictEqual(r.ok, true, `frame ${f}: ok`);
      assert.strictEqual(r.rePresented, undefined, `frame ${f}: not re-presented`);
      assert.strictEqual(r.frame, f, `frame ${f}: echo`);
      hashes.push(hashColumns(r.columns, r.count));
      // Ping-pong every frame in non-inline mode: hand the buffers back and
      // keep stepping. The per-frame hash comparison below then proves the
      // reuse path is value-identical to a fresh write.
      if (client.mode !== 'inline') client.releaseFrame(r);
    }
    const snap = await client.snapshot(N - 1);
    return { hashes, snapHash: hashColumns(snap.columns, snap.count) };
  }

  const inlineClient = createKernelClient({ runInline: true });
  const inlineRes = await runDrive(inlineClient, null, 'inline');
  inlineClient.terminate();

  const threadHost = await startRealWorkerThread();
  const workerClient = createKernelClient({ runInline: false, host: threadHost });
  let workerRes;
  try {
    workerRes = await runDrive(workerClient, threadHost, 'worker');
  } finally {
    workerClient.terminate();
  }
  assert.strictEqual(threadHost.threadError, null, 'worker thread raised no errors');

  assert.strictEqual(workerRes.hashes.length, N, 'worker ran all frames');
  for (let f = 0; f < N; f++) {
    assert.strictEqual(workerRes.hashes[f], inlineRes.hashes[f], `frame ${f}: worker bit-identical to inline`);
  }
  assert.strictEqual(workerRes.snapHash, inlineRes.snapHash, 'SNAPSHOT bit-identical across hosts');
  const topHash = createHash('sha256').update(workerRes.hashes.join('')).digest('hex');
  const inlineTop = createHash('sha256').update(inlineRes.hashes.join('')).digest('hex');
  assert.strictEqual(topHash, inlineTop, 'run topHash identical');

  // Zero-copy ping-pong, same-thread: structuredClone with transfer faithfully
  // simulates postMessage (the source side's buffers detach), and same-thread
  // buffer identity holds, so reuse is directly observable. (Across a real
  // thread, transfer moves the memory but mints a new ArrayBuffer object —
  // identity can never hold there; the gate above already proves the
  // ping-pong path is value-identical over the real thread.)
  {
    let s = dispatchKernelMessage(null, initMessage({ seed: 11, params: { pointCount: 16 } })).session;
    const step = (f) => {
      const o = dispatchKernelMessage(s, stepMessage({ frame: f, dt: 1 / 60, events: [] }));
      s = o.session;
      return o;
    };
    const toClient = (o) => structuredClone(o.reply, { transfer: o.transfers });
    const toWorker = (reply) => structuredClone(reply.columns, { transfer: payloadBuffers(reply) });

    const o0 = step(0);
    const c0 = toClient(o0);
    assert.strictEqual(s.frames[0].x.buffer.byteLength, 0, 'STEP transfer detaches the worker-side frame set');
    const back = toWorker(c0);
    s = dispatchKernelMessage(s, returnMessage({ frame: 0, columns: back })).session;
    assert.strictEqual(s.reallocs, 0, 'reattach allocates nothing');
    const reusedBuf = s.frames[0].x.buffer;
    assert.ok(reusedBuf.byteLength > 0, 'reattached set is live');
    step(1);
    step(2);
    assert.strictEqual(s.reallocs, 0, 'frame 2 reuses the returned buffers (zero realloc)');
    assert.strictEqual(s.frames[0].x.buffer, reusedBuf, 'frame 2 wrote into the returned buffer object');
  }
  // Negative control: without RETURN the worker reallocates the detached set
  // (correct behavior — never silently reuses detached memory).
  {
    let s = dispatchKernelMessage(null, initMessage({ seed: 11, params: { pointCount: 16 } })).session;
    for (let f = 0; f < 3; f++) {
      const o = dispatchKernelMessage(s, stepMessage({ frame: f, dt: 1 / 60, events: [] }));
      s = o.session;
      structuredClone(o.reply, { transfer: o.transfers });
    }
    assert.strictEqual(s.reallocs, 1, 'detached set without RETURN reallocates exactly once');
  }

  console.log(`kernelWorker.selfcheck: gate topHash=${topHash}`);
}

// ── worker entry: structural contract (the wiring can't silently rot) ────────
{
  const src = readFileSync(join(DIR, 'kernel.worker.js'), 'utf8');
  assert.match(src, /self\.onmessage\s*=/, 'entry wires self.onmessage');
  assert.match(src, /self\.postMessage\(reply, out\.transfers\)/, 'entry posts with the transfer list');
  assert.match(src, /assertTransferCoverage\(reply, out\.transfers/, 'entry asserts transfer coverage before posting');
  assert.doesNotMatch(src, /\bwindow\b|\bdocument\b|\brequestAnimationFrame\b/, 'entry stays worker-pure (no DOM)');
}

console.log('kernelWorker.selfcheck: ok — protocol, transfer assertion, backpressure, worker≡inline bit-identical');
