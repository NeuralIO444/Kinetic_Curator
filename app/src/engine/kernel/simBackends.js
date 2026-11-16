// simBackends.js — K1 (#2186) slice 1: which implementation ran each simulation kernel, stamped into a take
// (K0 R1, docs/K0_TAKE_SEMANTICS.md §1). Pure: no GL, no DOM, no clock.
//   simLaw      'js-exact' — every sim kernel ran in JS (the take replays bit-exactly everywhere, as today)
//               'decisions-exact' — at least one kernel ran on the GPU (decisions exact; sim outcomes the recording
//               device's — the same-device chain, a later slice)
//   simBackends { fluid, culture, swarm } — a versioned id per kernel, so a changed kernel is detectable.
// Every kernel is JS today; the GPU fluid (#2195) is not wired. The player honours the RECORDED backend (K0 R4): a
// take that names a backend this build cannot run is reported, never silently re-run on another one.

/** The kernels a take stamps, in header order. */
export const SIM_KERNELS = Object.freeze(['fluid', 'culture', 'swarm']);

/**
 * K3 slice 2c/2d (#2188, Matt 2026-11-16: optional key): kernels a take MAY also stamp. Absent = the kernel ran in JS (every take before
 * the contacts producer, and every take that never recorded GPU contact stamps), so the header of such a take is byte-for-byte what it
 * was. 'gpu.contacts.v1' is the GPU dish-contact DETECTION: its pair list rides the take as the recorded input.dishContactStamps and
 * the CPU resolves exactly that list, so it replays anywhere.
 */
export const OPTIONAL_SIM_KERNELS = Object.freeze(['contacts']);

/** Every backend id this build KNOWS (can validate), per kernel. */
export const KNOWN_SIM_BACKENDS = Object.freeze({
  fluid: Object.freeze(['js.gs.v1', 'gpu.gs.v1']),
  culture: Object.freeze(['js.life.v1', 'gpu.life.v1']),
  swarm: Object.freeze(['js.swarm.v1']),
  contacts: Object.freeze(['js.contacts.v1', 'gpu.contacts.v1']),
});

/**
 * The backends this build can actually RUN. 'gpu.gs.v1' REPLAYS everywhere (K1 slice 4c): its field rides the take as the
 * recorded input.dishFluidCells, so replay needs no GPU; only RECORDING with it needs the GPU host. 'gpu.life.v1' (K2 slice
 * 2b) is the same: the culture's grid rides the take as the recorded input.dishCultureCells.
 */
export const RUNNABLE_SIM_BACKENDS = Object.freeze({
  fluid: Object.freeze(['js.gs.v1', 'gpu.gs.v1']),
  culture: Object.freeze(['js.life.v1', 'gpu.life.v1']),
  swarm: Object.freeze(['js.swarm.v1']),
  contacts: Object.freeze(['js.contacts.v1', 'gpu.contacts.v1']),
});

/** What every take recorded before this stamp existed ran on: all-JS. */
export const DEFAULT_SIM_BACKENDS = Object.freeze({ fluid: 'js.gs.v1', culture: 'js.life.v1', swarm: 'js.swarm.v1' });

const isJs = (id) => typeof id === 'string' && id.startsWith('js.');

/** The law a set of backends implies. Pure. */
export function simLawFor(backends) {
  const named = [...SIM_KERNELS, ...OPTIONAL_SIM_KERNELS.filter((k) => backends[k] !== undefined)];
  return named.every((k) => isJs(backends[k])) ? 'js-exact' : 'decisions-exact';
}

/** The stamp a recording writes now: the backends this build is running, and the law they imply. Pure. */
export function currentSimStamp(backends = DEFAULT_SIM_BACKENDS) {
  const simBackends = { fluid: backends.fluid, culture: backends.culture, swarm: backends.swarm };
  for (const k of OPTIONAL_SIM_KERNELS) if (backends[k] !== undefined) simBackends[k] = backends[k]; // omitted unless named: the JS-era header is unchanged
  return { simLaw: simLawFor(simBackends), simBackends };
}

/**
 * Validate a stored stamp (fail-closed on a malformed one). Absent on both is lawful — every take before this stamp.
 * Returns the stamp (defaults filled for an absent one); throws a plain Error with the reason otherwise.
 */
export function checkSimStamp(simLaw, simBackends) {
  if (simLaw === undefined && simBackends === undefined)
    return { simLaw: 'js-exact', simBackends: { ...DEFAULT_SIM_BACKENDS } };
  if (simLaw === undefined || simBackends === undefined) throw new Error('simLaw and simBackends come together');
  if (!simBackends || typeof simBackends !== 'object' || Array.isArray(simBackends))
    throw new Error('simBackends must be an object');
  const keys = Object.keys(simBackends);
  const extra = keys.filter((k) => !SIM_KERNELS.includes(k));
  if (!SIM_KERNELS.every((k) => keys.includes(k)) || !extra.every((k) => OPTIONAL_SIM_KERNELS.includes(k)))
    throw new Error(
      `simBackends must name exactly ${SIM_KERNELS.join(', ')}${OPTIONAL_SIM_KERNELS.length ? ` (and may also name ${OPTIONAL_SIM_KERNELS.join(', ')})` : ''}`,
    );
  for (const k of keys) {
    if (!KNOWN_SIM_BACKENDS[k].includes(simBackends[k]))
      throw new Error(`simBackends.${k} "${String(simBackends[k])}" is not a known backend`);
  }
  if (simLaw !== simLawFor(simBackends))
    throw new Error(`simLaw "${String(simLaw)}" does not match the backends (${simLawFor(simBackends)})`);
  return { simLaw, simBackends: { ...simBackends } };
}

/** Kernels whose recorded backend this build cannot run — [] when everything the take names is runnable. Pure. */
export function unrunnableSimBackends(simBackends) {
  return [...SIM_KERNELS, ...OPTIONAL_SIM_KERNELS.filter((k) => simBackends[k] !== undefined)].filter(
    (k) => !RUNNABLE_SIM_BACKENDS[k].includes(simBackends[k]),
  );
}
