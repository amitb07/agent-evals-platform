import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // `@evals/shared` is a CommonJS workspace package; pre-bundle it like a dependency.
  optimizeDeps: { include: ['@evals/shared'] },
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'happy-dom',
  },
});
