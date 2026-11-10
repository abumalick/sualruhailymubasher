// Store screenshots from the web build with real lessons from the production API.
// Usage: node scripts/store-screenshots.mjs <base url> <ios|android>...
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Viewport x scale = the store's pixel size: 1320x2868 is Apple's 6.9-inch iPhone, 1080x1920 fits Play's 2:1 limit
export const TARGETS = {
  ios: { viewport: { width: 440, height: 956 }, scale: 3, dir: 'fastlane/screenshots/ios/ar-SA' },
  android: { viewport: { width: 360, height: 640 }, scale: 3, dir: 'fastlane/metadata/android/ar/images/phoneScreenshots' },
};

const SHOTS = [
  { name: '01-home', route: '#/' },
  { name: '02-recordings', route: '#/course/tafsir-saadi' },
  { name: '03-notifications', route: '#/notifications' },
];

async function chooseAllLessons(page) {
  const boxes = page.getByRole('checkbox');
  await boxes.first().waitFor();
  for (const box of await boxes.all()) await box.check();
  await page.getByRole('button').last().click();
  await page.getByRole('link', { name: 'الرئيسية' }).waitFor();
}

async function capture(browser, base, target) {
  const { viewport, scale, dir } = TARGETS[target];
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale, locale: 'ar', timezoneId: 'Asia/Riyadh' });
  const page = await context.newPage();
  await page.goto(base);
  await chooseAllLessons(page);
  mkdirSync(join(ROOT, dir), { recursive: true });
  for (const shot of SHOTS) {
    await page.goto(`${base}/${shot.route}`);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    const file = join(ROOT, dir, `${shot.name}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  }
  await context.close();
}

async function main([base, ...targets]) {
  if (!base || targets.length === 0 || targets.some((t) => !TARGETS[t])) {
    console.error('usage: store-screenshots.mjs <base url> <ios|android>...');
    process.exit(2);
  }
  const browser = await chromium.launch();
  try {
    for (const target of targets) await capture(browser, base, target);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
