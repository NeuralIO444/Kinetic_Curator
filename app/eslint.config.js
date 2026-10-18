import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import determinismPlugin from './eslint-rules/determinism.mjs';
import {
  DETERMINISM_ALLOWLIST,
  DETERMINISM_FORBIDDEN,
  DETERMINISM_CLOCK_DIRS,
} from './eslint-rules/determinism-allowlist.mjs';

export default defineConfig([
  globalIgnores(['dist', 'eslint-rules/fixtures']),
  {
    // Tooling configs run in Node, not the browser.
    files: ['vite.config.js', 'eslint.config.js', 'playwright.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [js.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Determinism law (#1637, audit fix 4): no unseeded Math.random and
    // no wall-clock reads in engine paths without a reasoned, exact-count
    // allowance. This block is also what brings .mjs files under lint —
    // for this rule only.
    files: ['src/**/*.{js,mjs,jsx}'],
    plugins: { determinism: determinismPlugin },
    rules: {
      'determinism/no-unseeded-random-or-clock': [
        'error',
        {
          allow: DETERMINISM_ALLOWLIST,
          forbidden: DETERMINISM_FORBIDDEN,
          clockDirs: DETERMINISM_CLOCK_DIRS,
        },
      ],
    },
  },
  {
    // Selfchecks are the harness, not the instrument: they stub dice and
    // clocks precisely to prove the production code deterministic. The
    // #553 guard excluded them from its scan; the exclusion carries over.
    files: ['src/**/*.selfcheck.mjs'],
    rules: { 'determinism/no-unseeded-random-or-clock': 'off' },
  },
]);
