// Prettier — adopted in slices (audit standards, #1684).
//
// Settings were measured against the tree's own conventions: single
// quotes, semicolons, 2-space indent, trailing commas, and printWidth
// 120 (the width that flagged the fewest of the ~1,067 source files
// when adoption was measured — ~905 files predate any formatter).
//
// Adoption state lives in .prettierignore: unadopted trees start
// ignored and are negated back in per formatting slice, each slice
// sweep-verified. `npm run format:check` guards only what's adopted.
export default {
  singleQuote: true,
  semi: true,
  tabWidth: 2,
  trailingComma: 'all',
  printWidth: 120,
};
