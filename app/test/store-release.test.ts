// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SHOTS, TARGETS } from '../../scripts/store-screenshots.mjs';
import { parseRoute } from '../src/router';
import { tabs } from '../src/ui/NavBar';

const root = fileURLToPath(new URL('../..', import.meta.url));

const ignored = (path: string) => {
  try {
    execFileSync('git', ['check-ignore', '-q', '--no-index', path], { cwd: root });
    return true;
  } catch {
    return false;
  }
};

describe('store screenshots', () => {
  const pixels = ({ viewport, scale }: { viewport: { width: number; height: number }; scale: number }) => [
    viewport.width * scale,
    viewport.height * scale,
  ];

  it('renders the 6.9-inch iPhone size App Store Connect requires', () => {
    expect(pixels(TARGETS.ios)).toEqual([1320, 2868]);
  });

  it('shows only screens the apps’ tabs lead to, including the notifications web visitors never see', () => {
    const tabOf = (route: string) => tabs(true).find((t) => t.names.includes(parseRoute(route).name));
    expect(SHOTS.map((s) => tabOf(s.route)?.label)).toEqual(['الرئيسية', 'الدروس', 'التنبيهات']);
    const webOnly = tabs(false).filter((w) => !tabs(true).some((n) => n.href === w.href));
    expect(SHOTS.filter((s) => webOnly.some((w) => w.href === s.route))).toEqual([]);
  });

  it('builds the web app with the apps’ screens', () => {
    const script = readFileSync(`${root}scripts/store-screenshots.sh`, 'utf8');
    expect(script).toMatch(/VITE_NATIVE_UI=1 pnpm exec vite build --outDir "\$dist"/);
    expect(script).toMatch(/vite preview --outDir "\$dist"/);
  });

  it('renders a Play phone size within its 2:1 aspect limit', () => {
    const [w, h] = pixels(TARGETS.android);
    expect([w, h]).toEqual([1080, 1920]);
    expect(h / w).toBeLessThanOrEqual(2);
  });
});

describe('fastlane ignore rules', () => {
  it.each([
    'fastlane/.env',
    'fastlane/AuthKey_ABC123.p8',
    'fastlane/play-service-account.json',
    'fastlane/google-services.json',
    'fastlane/GoogleService-Info.plist',
    'fastlane/release.jks',
    'fastlane/key.properties',
    'fastlane/report.xml',
    'fastlane/ios.env',
    'fastlane/review-contact.env',
    'fastlane/metadata/ios/review_information/phone_number.txt',
    'fastlane/metadata/android/review_information/notes.txt',
    'AuthKey_ABC123.p8',
    'app/AuthKey_ABC123.p8',
  ])('keeps %s out of git', (path) => {
    expect(ignored(path)).toBe(true);
  });

  it.each([
    'fastlane/Fastfile',
    'fastlane/Fastfile.ios',
    'fastlane/Fastfile.android',
    'fastlane/age_rating.json',
    'fastlane/app_privacy_details.json',
    'fastlane/screenshots/ios/ar-SA/01-home.png',
    'fastlane/metadata/android/ar/images/phoneScreenshots/01-home.png',
  ])('tracks %s', (path) => {
    expect(ignored(path)).toBe(false);
  });
});

describe('repository ignore rules', () => {
  it.each([
    'release.jks',
    'app/android/release.jks',
    'app/android/app/upload.keystore',
    'app/android/key.properties',
    'app/android/keystore.properties',
    '.env',
    '.env.production',
    'app/.env.local',
    'firebase-service-account.json',
    'play-service-account.json',
    'app/android/app/google-services.json',
    'google-services.com.albadrmubasher.app.json',
  ])('keeps %s out of git', (path) => {
    expect(ignored(path)).toBe(true);
  });

  it.each(['app/android/app/build.gradle', 'app/capacitor.config.ts', 'app/package.json', 'server/wrangler.jsonc'])(
    'tracks %s',
    (path) => {
      expect(ignored(path)).toBe(false);
    },
  );
});
