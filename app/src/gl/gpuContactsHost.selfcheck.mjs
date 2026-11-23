// K3 contacts producer: the host's frame protocol with a fake detection kernel (no GL), plus the flag. Run: node src/gl/gpuContactsHost.selfcheck.mjs
import assert from 'node:assert/strict';
import { createGpuContactsHost, gpuContactsWanted, CONTACTS_CAP_BODIES } from './gpuContactsHost.mjs';
import { contactStampsFit, isContactStamps } from '../engine/dishContactStamps.mjs';

// flag: off by default; layout param, window flag, or URL turns it on
assert.equal(gpuContactsWanted({}, null), false);
assert.equal(gpuContactsWanted(null, { location: { search: '' } }), false);
assert.equal(gpuContactsWanted({ gpuContacts: true }, null), true);
assert.equal(gpuContactsWanted({}, { __KC_GPU_CONTACTS: true }), true);
assert.equal(gpuContactsWanted({}, { location: { search: '?x=1&gpuContacts=1' } }), true);
assert.equal(gpuContactsWanted({}, { location: { search: '?gpuContacts=10' } }), false);

// a fake kernel: submit queues, poll hands back the result only after `readyAfter` polls
const fake = (result, readyAfter = 1) => {
  let pend = null;
  let polls = 0;
  return {
    submits: 0,
    submit(t) {
      this.submits++;
      pend = t;
      polls = 0;
    },
    poll() {
      if (!pend) return null;
      if (++polls < readyAfter) return null;
      pend = null;
      return result;
    },
    dispose() {},
  };
};
const table = (nb) => ({ nb });

{
  const gpu = fake(
    {
      contacts: [
        { a: 3, b: 5 },
        { a: 0, b: 2 },
        { a: 0, b: 1 },
      ],
      overflow: 2,
    },
    2,
  );
  const h = createGpuContactsHost(null, { gpu });
  assert.equal(h.take(), null, 'nothing submitted -> no list');
  h.submit(null);
  h.submit(table(1));
  assert.equal(h.stats.skippedSmall, 2);
  assert.equal(gpu.submits, 0, 'fewer than two bodies never reach the GPU');
  h.submit(table(8));
  assert.equal(gpu.submits, 1);
  assert.equal(h.take(), null, 'not ready on the first poll: the frame runs the grid pass');
  const got = h.take(); // the second poll: the readback is done
  assert.ok(isContactStamps(got), 'a ready list is a well-formed stamp');
  assert.equal(got.nb, 8);
  assert.deepEqual([...got.a], [0, 0, 3], 'canonical order');
  assert.deepEqual([...got.b], [1, 2, 5]);
  assert.ok(contactStampsFit(got, 8) && !contactStampsFit(got, 9), 'fits only its own table size');
  assert.equal(h.take(), null, 'a list is consumed once');
  assert.equal(h.stats.delivered, 1);
  assert.equal(h.stats.overflow, 2, 'kernel overflow is carried to stats, never silent');
}
{
  // busy: a submit while one is in flight is skipped and counted (no leaked fence)
  const gpu = fake({ contacts: [], overflow: 0 }, 99);
  const h = createGpuContactsHost(null, { gpu });
  h.submit(table(4));
  h.submit(table(4));
  assert.equal(gpu.submits, 1);
  assert.equal(h.stats.skippedBusy, 1);
}
{
  // cap: a table over the cap is skipped and counted, never half-detected
  const gpu = fake({ contacts: [], overflow: 0 });
  const h = createGpuContactsHost(null, { gpu });
  assert.equal(h.stats.cap, CONTACTS_CAP_BODIES);
  assert.equal(CONTACTS_CAP_BODIES, 2048, 'cap ladder step 2 (350 -> 1,024 -> 2,048; each raise = Matt merges)');
  h.submit(table(CONTACTS_CAP_BODIES + 1));
  assert.equal(gpu.submits, 0);
  assert.equal(h.stats.skippedOverCap, 1);
  h.submit(table(CONTACTS_CAP_BODIES));
  assert.equal(gpu.submits, 1);
}
{
  // an empty detection is still a list: it says "no contacts", it is not the grid pass
  const gpu = fake({ contacts: [], overflow: 0 });
  const h = createGpuContactsHost(null, { gpu });
  h.submit(table(5));
  const got = h.take();
  assert.ok(isContactStamps(got) && got.a.length === 0 && got.nb === 5);
}
console.log('gpuContactsHost selfcheck OK');
