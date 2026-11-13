// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { SKIP_SECONDS } from '../src/logic/seek';

const plugin = dirname(createRequire(import.meta.url).resolve('@capgo/capacitor-media-session/package.json'));
const service = readFileSync(join(plugin, 'android/src/main/java/com/capgo/mediasession/MediaSessionService.java'), 'utf8');
const appDrawables = fileURLToPath(new URL('../android/app/src/main/res/drawable', import.meta.url));

// The plugin's notification buttons are drawn with icons reading "30"; the app replaces them with its own.
const iconOf = (action: string) => service.match(new RegExp(`"${action}",\\s*new NotificationCompat\\.Action\\(\\s*R\\.drawable\\.(\\w+)`))?.[1];

it.each(['seekbackward', 'seekforward'])('the notification %s button shows the app\'s 15 second icon', (action) => {
  expect(SKIP_SECONDS).toBe(15);
  const icon = iconOf(action);
  expect(icon).toBeDefined();
  const file = join(appDrawables, `${icon}.xml`);
  expect(existsSync(file)).toBe(true);
  expect(readFileSync(file, 'utf8')).toContain('skips 15 seconds');
});
