// Playwright smoke config (#37)
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    trace: 'on-first-retry',
  },
  // The two WebM-recording specs are CPU-bound on CI: software GL (SwiftShader)
  // renders every captured frame on the CPU, and playback frame-counting needs
  // the page to keep up. Run beside the other workers they starve — the probe
  // (PR #579) showed both pass first try, no retries, when run alone on the same
  // runner, and fail on main in the parallel run (accum-recording times out at
  // 180s, loop-capture counts 2 frames). So they run last, one at a time: a
  // project chain, each depending on the one before it, after everything else.
  // Everything else keeps its parallelism.
  projects: [
    { name: 'app', testIgnore: /(accum-recording|loop-capture|midi)\.spec\.js/ },
    // The MIDI boot seeds a whole project (autoQuality off, accumulation on,
    // 40 nodes): software GL renders it at full cost, so beside the other
    // workers it starves and its boot eats a whole test timeout. It takes the
    // chain after app, one group at a time, like the recording specs.
    { name: 'midi', testMatch: /midi\.spec\.js/, dependencies: ['app'] },
    { name: 'rec-accum', testMatch: /accum-recording\.spec\.js/, dependencies: ['midi'] },
    { name: 'rec-loop', testMatch: /loop-capture\.spec\.js/, dependencies: ['rec-accum'] },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
