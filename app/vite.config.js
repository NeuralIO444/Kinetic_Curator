import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base must match the GitHub Pages project path when deploying there.
// Override with: VITE_BASE=/ npm run build  (for Vercel / custom domain root)
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
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
