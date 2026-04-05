import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/webview',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/webview/main.tsx',
      output: {
        entryFileNames: 'main.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
    target: 'es2022',
    minify: true,
    cssMinify: true,
    chunkSizeWarningLimit: 2000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src/webview') },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
});
