// Combines all asset parts into window.ASSETS
window.ASSETS = [
  ...(window.ASSETS_PART1 || []),
  ...(window.ASSETS_PART2 || []),
  ...(window.ASSETS_PART3 || []),
];
window.ASSET_CATEGORIES = ['organic', 'geometric', 'dots', 'linework', 'floral', 'stamps', 'radial'];
