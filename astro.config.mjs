// @ts-check
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

const port = Number(process.env.PORT ?? 4321);

export default defineConfig({
  integrations: [react()],
  server: { port, host: '127.0.0.1' },
  devToolbar: { enabled: false },
  vite: {
    cacheDir: process.env.VITE_CACHE_DIR ?? 'node_modules/.vite',
    optimizeDeps: { include: ['three', 'pdfjs-dist', 'zustand', 'react', 'react-dom', 'lucide-react'] },
    worker: { format: 'es' },
    build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  },
});
