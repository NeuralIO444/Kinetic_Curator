import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgo from 'vite-plugin-svgo'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgo({
      multipass: true,
      plugins: [
        { name: 'removeViewBox', active: false },
        { name: 'cleanupAttrs' },
        { name: 'removeComments' },
        { name: 'removeMetadata' },
      ],
    }),
  ],
  build: {
    chunkSizeWarningLimit: 600,
    // Skip modulepreload for heavy vendor chunks that are explicitly lazy.
    // Without this, Rolldown follows dynamic-import graphs and inserts
    // `<link rel="modulepreload">` tags that download PIXI / GSAP / Tone at
    // page load, defeating the lazy-loading we set up in CanvasPanel etc.
    modulePreload: {
      resolveDependencies: (filename, deps) =>
        deps.filter(d => !/vendor-(pixi|tone|gsap)/.test(d)),
    },
    rolldownOptions: {
      output: {
        // Split heavy vendors so the initial main bundle stays lean.
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('pixi.js')) return 'vendor-pixi';
            if (id.includes('/tone/') || id.endsWith('/tone')) return 'vendor-tone';
            if (id.includes('gsap')) return 'vendor-gsap';
            if (id.includes('react-dom')) return 'vendor-react-dom';
            if (id.includes('react') || id.includes('zustand')) return 'vendor-react';
          }
        },
      },
    },
  },
})
