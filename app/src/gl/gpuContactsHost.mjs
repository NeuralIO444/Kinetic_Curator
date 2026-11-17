// K3 contacts producer (#2188) — the live loop's side of GPU dish-contact detection. OFF unless asked for: the per-Look layout
// param `gpuContacts`, the window flag __KC_GPU_CONTACTS, or `?gpuContacts=1` in the URL (the gpuSwarm flag's shape).
//
// Each frame, after the resolver ran, the loop hands this host the end-of-step body table (packContactBodies over the dish's
// active strata, the table the CPU pass itself builds). The host submits it to the all-pairs detection kernel (slice 2a) and
// polls the PBO + fence readback without waiting. When a result is ready, take() packs it as dishContactStamps for the NEXT
// frame's resolve input: the resolver resolves exactly that list on the CPU through the shared resolvePair (slice 2c), so the
// list is a RECORDED input and a take replays it on any device. A frame with no fresh list gets null and the grid pass runs, as
// always (JS kernels stay the reference, K0 R4). The list is 1-3 frames old by the time it is used: a body table of a different
// size is refused by the resolver's fit gate, and resolvePair re-reads positions and re-checks every disc, so a stale pair that
// no longer touches resolves to nothing. Feel (a one-frame-late contact) is Matt's review before any flag goes on.
//
// Cap ladder (Matt's ruling, 350 -> 1,024 -> 2,048; he merges any raise): CAP_BODIES is the single number. A table over the cap is
// skipped and counted, never half-detected, and the grid pass runs.
import { createGpuContacts } from './dishContactsGpu.mjs';
import { packContactStamps } from '../engine/dishContactStamps.mjs';

export const CONTACTS_CAP_BODIES = 2048; // ladder step 2 (was 350, then 1,024)

/** Is the producer asked for? Layout param, window flag, or URL (any one turns it on). */
export function gpuContactsWanted(layoutParams, win) {
  if (layoutParams && layoutParams.gpuContacts) return true;
  if (!win) return false;
  if (win.__KC_GPU_CONTACTS) return true;
  const search = win.location && typeof win.location.search === 'string' ? win.location.search : '';
  return /(?:^|[?&])gpuContacts=1(?:&|$)/.test(search);
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

export function createGpuContactsHost(gl, { cap = CONTACTS_CAP_BODIES, gpu = createGpuContacts(gl, cap) } = {}) {
  let inflight = null; // { nb, t0 } while a submit is waiting on its fence
  let fresh = null; // the decoded result waiting for take()
  const stats = {
    submitted: 0,
    delivered: 0,
    skippedOverCap: 0,
    skippedBusy: 0,
    skippedSmall: 0,
    overflow: 0,
    pairsLast: 0,
    latencyMsAvg: 0,
    submitMsAvg: 0,
    cap,
  };
  const drain = () => {
    if (!inflight) return;
    const got = gpu.poll();
    if (!got) return;
    stats.delivered++;
    stats.overflow += got.overflow;
    stats.pairsLast = got.contacts.length;
    stats.latencyMsAvg += (now() - inflight.t0 - stats.latencyMsAvg) / stats.delivered;
    fresh = { nb: inflight.nb, contacts: got.contacts };
    inflight = null;
  };
  return {
    stats,
    /** Queue detection for this frame's end-of-step table (null = fewer than two strata). Never waits on the GPU. */
    submit(table) {
      drain();
      if (!table || !(table.nb >= 2)) {
        stats.skippedSmall++;
        return;
      }
      if (table.nb > cap) {
        stats.skippedOverCap++;
        return;
      }
      if (inflight) {
        stats.skippedBusy++;
        return;
      }
      const t0 = now();
      gpu.submit(table);
      stats.submitted++;
      stats.submitMsAvg += (now() - t0 - stats.submitMsAvg) / stats.submitted;
      inflight = { nb: table.nb, t0 };
    },
    /** The fresh list as the next resolve's recorded input (dishContactStamps), consumed once; null when none is ready. */
    take() {
      drain();
      if (!fresh) return null;
      const out = packContactStamps(fresh.contacts, fresh.nb);
      fresh = null;
      return out;
    },
    dispose() {
      gpu.dispose();
      inflight = null;
      fresh = null;
    },
  };
}
