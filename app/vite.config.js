import { execSync, readFileSync } from 'node:child_process'
import { readFileSync as readFile } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFile(join(here, 'package.json'), 'utf8'))

const base = process.env.VITE_BASE ?? '/Kinetic_Curator/'

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
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(gitShortSha()),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
