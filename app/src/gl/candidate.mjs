/**
 * GL candidate renderer — STUB. Phase 1 (#187) implements this.
 *
 * Interface contract (do not change without bumping GL_CONTRACT_VERSION):
 *   renderCandidate(scene, { width }) -> Promise<{ pixels, width, height }>
 * where `pixels` is RGBA row-major (Buffer or Uint8Array) at the requested
 * width, preserving the 1000x700 contract aspect ratio — byte-identical in
 * shape to what reference.mjs returns.
 *
 * Until Phase 1 lands, this throws a descriptive error so the harness
 * fails loudly instead of silently comparing nothing.
 */

export const CANDIDATE_READY = false;

export async function renderCandidate(/* scene, opts */) {
  throw new Error(
    '[parity] GL candidate renderer is not implemented yet — it lands in Phase 1 (#187). ' +
    'Run the harness with --candidate svg for reference self-parity.'
  );
}
