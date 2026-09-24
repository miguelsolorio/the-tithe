import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js alone is ~650 kB minified; one chunk is fine for a game.
    chunkSizeWarningLimit: 1000,
  },
});
