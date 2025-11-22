import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import electron from 'vite-plugin-electron';
import path from 'path';

export default defineConfig({
  plugins: [
    svelte(),
    electron([
      {
        entry: 'electron/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['zod', 'better-sqlite3', 'kysely', 'electron'],
            },
          },
        },
      },
      {
        // Preload script - use static CJS file instead of Vite bundling
        // Vite's bundling adds ESM exports to CJS files which breaks Electron
        entry: 'electron/preload/preload.cjs',
        onstart(args) {
          // Copy the static preload file to dist
          const fs = require('fs');
          const srcPath = 'electron/preload/preload.cjs';
          const destDir = 'dist-electron/preload';
          const destPath = destDir + '/index.cjs';
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          fs.copyFileSync(srcPath, destPath);
          args.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: 'index.cjs',
              },
            },
          },
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, '../core/src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
