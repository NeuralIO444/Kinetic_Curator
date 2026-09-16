/**
 * Material catalog. Base assets stay geometry.
 * Live code picks a material id + u; it never authors stops on the rAF path.
 */

export const MATERIALS = [
  { id: 'flat', kind: 'flat' },
  { id: 'plate', kind: 'radial', inner: 0.15, outer: 0.85 },
  { id: 'wash', kind: 'linear', angle: 90 },
  { id: 'stipple', kind: 'pattern', cell: 6 },
];

export function materialFrame(id, u) {
  const t = Number.isFinite(u) ? Math.min(1, Math.max(0, u)) : 0;
  const mat = MATERIALS.find((m) => m.id === id) || MATERIALS[0];
  return { ...mat, t };
}

export function materialHref(id) {
  const mat = MATERIALS.find((m) => m.id === id) || MATERIALS[0];
  if (mat.kind === 'flat') return null;
  return `#kc-mat-${mat.id}`;
}
