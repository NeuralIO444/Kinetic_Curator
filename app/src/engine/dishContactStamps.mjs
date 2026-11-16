// dishContactStamps.mjs — K3 slice 2c (#2188): the GPU dish pass's contact list as a RECORDED INPUT. Pure.
//
// With contact detection on the GPU (slice 2a) the SET of touching pairs is a decision made on the recording device, in float32. It
// enters the resolver as a recorded, sparse input — only the touching pairs, two body-table indices each — and the resolver
// resolves THAT list on the CPU, in the recorded order, with the unchanged CPU resolution maths. So live == replay bit for bit on
// any device, with no GPU needed to replay (the K1 dishFluidCells / K2 dishCultureCells pattern; the JS grid pass stays the
// reference, R4). `nb` rides along as the integrity check: the body table is rebuilt from the same state on replay, so its size
// must match, and a list that does not fit this frame's table is ignored (fail closed -> the grid pass runs, as always).
//
// Documented divergence from the grid pass: the grid pass re-reads positions as it goes, so a pair that only starts to overlap
// after an earlier correction is still met later in the same pass. A stamped list is the snapshot's contact set, so such secondary
// contacts resolve on the next tick instead. The order is the recorded one (the packer emits canonical: a ascending, then b).

const MAX_BODIES = 65535;

/** Pack detection output ([{ a, b }, ...] from the 2a decode or referenceContacts) for a table of nb bodies -> { nb, a, b } (Uint16 pairs, canonical order). */
export function packContactStamps(contacts, nb) {
  const list = [];
  if (Array.isArray(contacts) && Number.isInteger(nb) && nb > 0 && nb <= MAX_BODIES) {
    for (const c of contacts) {
      if (c && Number.isInteger(c.a) && Number.isInteger(c.b) && c.a >= 0 && c.a < c.b && c.b < nb) list.push(c);
    }
    list.sort((p, q) => p.a - q.a || p.b - q.b);
  }
  const a = new Uint16Array(list.length);
  const b = new Uint16Array(list.length);
  for (let k = 0; k < list.length; k++) {
    a[k] = list[k].a;
    b[k] = list[k].b;
  }
  return { nb: Number.isInteger(nb) && nb > 0 && nb <= MAX_BODIES ? nb : 0, a, b };
}

/** Is this a well-formed stamp object? (Fail-closed: a recorded input must never throw the resolver.) Does not check bounds against a table. */
export function isContactStamps(c) {
  return (
    !!c &&
    typeof c === 'object' &&
    Number.isInteger(c.nb) &&
    c.nb > 0 &&
    c.nb <= MAX_BODIES &&
    ArrayBuffer.isView(c.a) &&
    ArrayBuffer.isView(c.b) &&
    c.a.length === c.b.length
  );
}

/** Do these stamps fit a table of `nb` bodies, every pair in range with a < b? The consumer's gate. */
export function contactStampsFit(c, nb) {
  if (!isContactStamps(c) || c.nb !== nb) return false;
  for (let k = 0; k < c.a.length; k++) {
    if (!(c.a[k] < c.b[k] && c.b[k] < nb)) return false;
  }
  return true;
}
