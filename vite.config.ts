import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base を相対パスにして、GitHub Pages などサブディレクトリ配下でもそのまま動くようにする
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900,
  },
});
