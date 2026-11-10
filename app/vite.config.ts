import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [preact()],
  server: { proxy: { '/api': process.env.API_ORIGIN ?? 'http://127.0.0.1:8787' } },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: (asset) =>
          asset.names.some((n) => n.endsWith('.mjs')) ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', environment: 'happy-dom', include: ['test/**/*.test.{ts,tsx}'], exclude: ['test/visual/**'] } },
      {
        extends: true,
        test: {
          name: 'visual',
          include: ['test/visual/**/*.test.{ts,tsx}'],
          browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] },
        },
      },
    ],
  },
});
