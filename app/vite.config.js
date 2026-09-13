import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base must match the GitHub Pages project path when deploying there.
// Override with: VITE_BASE=/ npm run build  (for Vercel / custom domain root)
const base = process.env.VITE_BASE ?? '/Kinetic_Curator/'

export default defineConfig({
  plugins: [react()],
  base,
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
