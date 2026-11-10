// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TARGETS } from '../../scripts/store-screenshots.mjs';

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
