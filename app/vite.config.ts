import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { playwright } from '@vitest/browser-playwright';
import type { BrowserCommand } from 'vitest/node';

type Media = { colorScheme?: 'light' | 'dark' | null; reducedMotion?: 'reduce' | 'no-preference' | null };
const emulateMedia: BrowserCommand<[Media]> = async (ctx, media) => {
  if (ctx.provider.name !== 'playwright') throw new Error(`emulateMedia needs playwright, got ${ctx.provider.name}`);
  await (ctx as unknown as { page: { emulateMedia: (m: Media) => Promise<void> } }).page.emulateMedia(media);
};

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
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }, { browser: 'webkit' }],
            commands: { emulateMedia },
          },
        },
      },
    ],
  },
});
