import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'))

const isTauri = Boolean(process.env.TAURI_PLATFORM || process.env.TAURI_FAMILY || process.env.TAURI_DEBUG || process.env.TAURI_ENV_PLATFORM)
const base = isTauri ? '/' : (process.env.VITE_BASE ?? '/Kinetic_Curator/')

function gitShortSha() {
  if (process.env.VITE_BUILD_ID) return process.env.VITE_BUILD_ID
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  plugins: [react()],
  base,
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(gitShortSha()),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
