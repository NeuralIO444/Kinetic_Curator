// All asset categories — core + experimental
// Single source of truth (fixes B4: missing experimental categories)

export const CORE_CATEGORIES = ['organic', 'geometric', 'dots', 'linework', 'floral', 'stamps', 'radial'];

export const EXPERIMENTAL_CATEGORIES = ['crystalline', 'biosynthetic', 'fragments', 'scanlines'];

// 'creature' (#1694 slice 2): the pool citizen's category — its own filter chip in the pool panel.
// 'construct' (#2108): the house constructs' category — catalogue-only until the gate, so the pool panel shows its chip
// only once a construct is in the pool (AssetPoolPanel).
export const ALL_CATEGORIES = [...CORE_CATEGORIES, ...EXPERIMENTAL_CATEGORIES, 'creature', 'construct'];
