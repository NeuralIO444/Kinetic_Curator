// Stable ids for store records whose position in the array can change —
// removal must target a record, not a slot.
let fallbackCounter = 0;

export function genId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  fallbackCounter += 1;
  return `id-${Date.now()}-${fallbackCounter}`;
}
