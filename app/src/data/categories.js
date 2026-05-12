// All asset categories — core + experimental
// Single source of truth (fixes B4: missing experimental categories)

export const CORE_CATEGORIES = [
  'organic', 'geometric', 'dots', 'linework', 'floral', 'stamps', 'radial',
];

export const EXPERIMENTAL_CATEGORIES = [
  'crystalline', 'biosynthetic', 'fragments', 'scanlines',
];

export const ALL_CATEGORIES = [...CORE_CATEGORIES, ...EXPERIMENTAL_CATEGORIES];
