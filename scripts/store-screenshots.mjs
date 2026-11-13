// Store screenshots from the web build with real lessons from the production API.
// Usage: node scripts/store-screenshots.mjs <base url> <ios|android>...
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Viewport x scale = the store's pixel size: 1320x2868 is Apple's 6.9-inch iPhone, 1080x1920 fits Play's 2:1 limit
// (Android at 432 CSS px wide, so the player's title fits on one line as it does on iOS)
export const TARGETS = {
  ios: { viewport: { width: 440, height: 956 }, scale: 3, dir: 'fastlane/screenshots/ios/ar-SA' },
  android: { viewport: { width: 432, height: 768 }, scale: 2.5, dir: 'fastlane/metadata/android/ar/images/phoneScreenshots' },
};

// The story the listing tells: the morning and the evening lesson, listening live, revising a lesson from its
// recording, preparing the next one in the book, and the notifications that bring the listener back.
// Routes name each course rather than #/, which opens whichever lesson is nearest at capture time.
export const SHOTS = [
  { name: '01-fajr', route: '#/course/tafsir-saadi', slot: 'fajr' },
  { name: '02-maghrib', route: '#/course/kitab-tawhid', slot: 'maghrib' },
  { name: '03-live', route: '#/welcome', step: 'live' },
  { name: '04-recording', route: '#/course/tafsir-saadi', slot: 'fajr', step: 'recording' },
  { name: '05-book', route: '#/course/kitab-tawhid', slot: 'maghrib', step: 'book' },
  { name: '06-notifications', route: '#/notifications' },
];

// The onboarding opens with every lesson ticked and every switch on: walk it to the lessons.
async function finishOnboarding(page) {
  await page.getByRole('checkbox').first().waitFor();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'متابعة' }).click();
  await page.getByRole('button', { name: 'ابدأ' }).click();
  await page.getByRole('link', { name: 'المزيد' }).waitFor();
}

export const STEPS = {
  // The onboarding's own picture of a broadcast: with reduced motion it rests on the live player, playing.
  live: async (page) => {
    await page.getByRole('button', { name: 'متابعة' }).click();
    await page.locator('.pv-mixlr[data-playing]').waitFor();
  },
  // The latest recording, a third of the way in.
  recording: async (page) => {
    // The latest lesson's card: a broadcast's «استمع» or an older lesson's play button would start something else
    const listen = page.locator('.card.last').getByRole('button', { name: 'استمع', exact: true });
    if ((await listen.count()) === 0) throw new Error(`${page.url()}: the latest lesson has no recording to play`);
    await listen.click();
    const rail = page.getByRole('slider', { name: 'موضع التسجيل' });
    await page.waitForFunction((el) => Number(el.getAttribute('aria-valuemax')) > 0, await rail.elementHandle());
    const box = await rail.boundingBox();
    await rail.click({ position: { x: box.width / 3, y: box.height / 2 } });
    await page.waitForFunction((el) => Number(el.getAttribute('aria-valuenow')) > 60, await rail.elementHandle());
  },
  // The book opened from the next lesson's card, at the page where its passage starts.
  book: async (page) => {
    const open = page.getByRole('link', { name: /اقرأ في الكتاب/ });
    if ((await open.count()) === 0) throw new Error(`${page.url()}: no next passage with a book link`);
    await open.click();
    await page.locator('.pg .mkbanner').waitFor();
    // Ink on the page: an undrawn canvas is transparent black, so only opaque dark pixels count
    await page.waitForFunction(() => {
      const c = document.querySelector('.pg canvas');
      if (!c?.width) return false;
      const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255 && data[i] < 100) return true;
      return false;
    });
  },
};

async function capture(browser, base, target) {
  const { viewport, scale, dir } = TARGETS[target];
  // Reduced motion: every frame is the one the app rests on, not a moment of a transition.
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale, locale: 'ar', timezoneId: 'Asia/Riyadh', reducedMotion: 'reduce' });
  const first = await context.newPage();
  await first.goto(base);
  await finishOnboarding(first);
  await first.close();
  // A run replaces the whole set, so no screenshot from an older naming scheme survives it
  rmSync(join(ROOT, dir), { recursive: true, force: true });
  mkdirSync(join(ROOT, dir), { recursive: true });
  for (const shot of SHOTS) {
    // A page of its own, so a player started for one shot never shows in the next
    const page = await context.newPage();
    await page.goto(`${base}/${shot.route}`);
    await page.waitForLoadState('networkidle');
    // A renamed or retired course would otherwise put an empty page in the store
    if (shot.slot) await page.locator(`.lp[data-slot="${shot.slot}"]`).waitFor({ timeout: 10_000 });
    if (shot.step) await STEPS[shot.step](page);
    await page.evaluate(() => document.fonts.ready);
    const file = join(ROOT, dir, `${shot.name}.png`);
    await page.screenshot({ path: file });
    console.log(file);
    await page.close();
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
