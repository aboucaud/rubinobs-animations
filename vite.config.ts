import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        telescope: resolve(__dirname, 'telescope/index.html'),
        camera: resolve(__dirname, 'camera/index.html'),
        observatory: resolve(__dirname, 'observatory/index.html'),
      },
    },
  },
});
