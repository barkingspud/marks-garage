import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    // xfwd: pass the browser's address (localhost:5173) on as X-Forwarded-Host, so the API
    // server can send Discogs' sign-in back to this page rather than to port 8787.
    proxy: { '/api': { target: 'http://localhost:8787', xfwd: true } },
  },
  test: { root: '.', include: ['server/**/*.test.ts', 'core/**/*.test.ts', 'shared/**/*.test.ts'] },
} as never);
