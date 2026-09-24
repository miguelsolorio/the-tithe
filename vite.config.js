import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  server: {
    port: 5199,
    // `vite --mode stable` serves without hot reload (steady play-testing
    // while files are being edited).
    hmr: mode !== 'stable',
  },
  build: {
    // three.js alone is ~650 kB minified; one chunk is fine for a game.
    chunkSizeWarningLimit: 1500,
  },
}));
