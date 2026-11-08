import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` lets the built app be served from any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  plugins: [react()],
});
