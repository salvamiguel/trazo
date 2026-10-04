import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works at /, /trazo/ (GitHub Pages) or any sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { fs: { allow: ['../..'] } },
  build: { outDir: '../../site', emptyOutDir: true, chunkSizeWarningLimit: 13000 },
});
