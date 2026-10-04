import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works at /, /trazo/ (GitHub Pages) or any sub-path.
// Icon packs are separate chunks loaded on demand; TRAZO_SINGLE_FILE=1 folds everything into
// one script for hosts that serve a single HTML file.
const single = process.env.TRAZO_SINGLE_FILE === '1';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { fs: { allow: ['../..'] } },
  build: {
    outDir: single ? '../../site-single' : '../../site',
    emptyOutDir: true,
    chunkSizeWarningLimit: single ? 20000 : 3000,
    rollupOptions: single ? { output: { inlineDynamicImports: true } } : undefined,
  },
});
