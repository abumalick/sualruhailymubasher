// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { liveState, SHOTS, TARGETS } from '../../scripts/store-screenshots.mjs';
import { parseRoute } from '../src/router';

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

  it('tells the story: the Fajr and Maghrib lessons, listening live, revising a recording, preparing in the book, the notifications', () => {
    expect(SHOTS.map((s) => [s.name, parseRoute(s.route), s.slot, s.live, s.step])).toEqual([
      ['01-fajr', { name: 'course', id: 'tafsir-saadi' }, 'fajr', undefined, undefined],
      ['02-maghrib', { name: 'course', id: 'kitab-tawhid' }, 'maghrib', undefined, undefined],
      ['03-live', { name: 'course', id: 'tafsir-saadi' }, 'fajr', 'tafsir-saadi', undefined],
      ['04-recording', { name: 'course', id: 'tafsir-saadi' }, 'fajr', undefined, 'recording'],
      ['05-book', { name: 'course', id: 'kitab-tawhid' }, 'maghrib', undefined, 'book'],
      ['06-notifications', { name: 'notifications' }, undefined, undefined, undefined],
    ]);
  });

  // Shape and values from production's /api/state, Friday 13 Nov 2026, between lessons
  const offAir = {
    generatedAt: '2026-11-13T17:38:43.903Z',
    live: { isLive: false, mode: 'embed', embedUrl: 'https://albadrnet.mixlr.com/embed', streamUrl: null, courseId: null, startedAt: null },
    courses: [
      { id: 'tafsir-saadi', slot: 'fajr', time: '05:41', next: { date: '2026-11-15', time: '05:41', number: 465 } },
      { id: 'kitab-tawhid', slot: 'maghrib', time: '18:05', next: null },
    ],
  };

  it('shows a course live from the start of its next lesson, a few minutes in, keeping the rest of the state', () => {
    const { state, now } = liveState(offAir, 'tafsir-saadi');
    expect(state).toEqual({ ...offAir, live: { ...offAir.live, isLive: true, courseId: 'tafsir-saadi', startedAt: '2026-11-15T02:41:00.000Z' } });
    expect(state.courses).toBe(offAir.courses);
    expect(now.toISOString()).toBe('2026-11-15T02:53:00.000Z');
  });

  it('refuses a course with no next lesson, rather than inventing a broadcast', () => {
    expect(() => liveState(offAir, 'kitab-tawhid')).toThrow(/no next lesson/);
    expect(() => liveState(offAir, 'gone')).toThrow(/no next lesson/);
  });

  it('never captures #/, which opens whichever lesson is nearest at capture time', () => {
    expect(SHOTS.map((s) => parseRoute(s.route).name)).not.toContain('home');
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
    'fastlane/screenshots/ios/ar-SA/01-fajr.png',
    'fastlane/metadata/android/ar/images/phoneScreenshots/01-fajr.png',
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

describe('App Store submission', () => {
  const fastfile = readFileSync(`${root}fastlane/Fastfile.ios`, 'utf8');
  const submitLane = fastfile.slice(fastfile.indexOf('lane :submit do'), fastfile.indexOf('lane :build_status do'));

  it('releases on approval, which deliver applies only while uploading the listing', () => {
    expect(submitLane).toMatch(/automatic_release: true/);
    expect(submitLane).not.toMatch(/skip_metadata: true/);
  });

  it('lets deliver wait for the newest processed build instead of naming one that may still be processing', () => {
    expect(submitLane).not.toMatch(/build_number:/);
    expect(submitLane).toMatch(/app_version: ios_marketing_version/);
  });

  it('sends the What’s New text release.sh wrote for each App Store language', () => {
    expect(submitLane).toMatch(/lane :submit do \|options\|/);
    expect(submitLane).toMatch(/%w\[ar-SA en-US\]/);
    expect(submitLane).toMatch(/release_notes: notes/);
  });

  it('declares the third-party content, the only content-rights answer deliver sends', () => {
    expect(submitLane).toMatch(/submission_information: \{ content_rights_contains_third_party_content: true \}/);
  });
});

describe('TestFlight upload', () => {
  const fastfile = readFileSync(`${root}fastlane/Fastfile.ios`, 'utf8');
  const betaLane = fastfile.slice(fastfile.indexOf('lane :beta do'), fastfile.indexOf('lane :metadata do'));

  it('gives testers the notes file release.sh wrote, resolved from the repo root', () => {
    expect(betaLane).toMatch(/lane :beta do \|options\|/);
    expect(betaLane).toMatch(/File\.read\(File\.expand_path\(options\[:changelog_file\], IOS_ROOT\)\)/);
    expect(betaLane).toMatch(/upload_to_testflight\([^)]*changelog:/);
  });
});

describe('listing uploads', () => {
  it('keep the version released on approval, so a later upload never turns it back to manual', () => {
    expect(readFileSync(`${root}fastlane/Deliverfile`, 'utf8')).toMatch(/^automatic_release true$/m);
  });
});
