import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // three.js alone is ~640 kB (minified): it gets its own chunk, shared by every page and
    // cached by the browser independently of the (small, frequently changing) page code
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        telescope: resolve(import.meta.dirname, 'telescope/index.html'),
        camera: resolve(import.meta.dirname, 'camera/index.html'),
        observatory: resolve(import.meta.dirname, 'observatory/index.html'),
        filters: resolve(import.meta.dirname, 'filters/index.html'),
      },
      output: {
        manualChunks: (id: string) => (id.includes('node_modules/three/') ? 'three' : id.includes('node_modules/lil-gui/') ? 'gui' : undefined),
      },
    },
  },
});
