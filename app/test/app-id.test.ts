// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import config from '../capacitor.config';

const APP_ID = 'com.albadrmubasher.app';
const appDir = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(appDir + path, 'utf8');
const javaDir = (sourceSet: string) => `android/app/src/${sourceSet}/java/${APP_ID.replaceAll('.', '/')}/`;
const packageLine = new RegExp(`^package ${APP_ID.replaceAll('.', '\\.')};`);

describe('application id', () => {
  it('is the Capacitor appId', () => {
    expect(config.appId).toBe(APP_ID);
  });

  it('is the Android applicationId and namespace', () => {
    const gradle = read('android/app/build.gradle');
    expect(gradle).toContain(`applicationId "${APP_ID}"`);
    expect(gradle).toContain(`namespace = "${APP_ID}"`);
  });

  it('is the package of the activity and the messaging service the manifest names', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    for (const cls of ['MainActivity', 'LessonsMessagingService']) {
      expect(manifest).toContain(`android:name=".${cls}"`);
      expect(read(`${javaDir('main')}${cls}.java`)).toMatch(packageLine);
    }
  });

  it('is the package of the Android tests', () => {
    expect(read(`${javaDir('test')}ExampleUnitTest.java`)).toMatch(packageLine);
    expect(read(`${javaDir('androidTest')}ExampleInstrumentedTest.java`)).toContain(`assertEquals("${APP_ID}"`);
  });

  it('is the package name in the Android strings', () => {
    const strings = read('android/app/src/main/res/values/strings.xml');
    expect(strings).toContain(`<string name="package_name">${APP_ID}</string>`);
    expect(strings).toContain(`<string name="custom_url_scheme">${APP_ID}</string>`);
  });

  it('leaves no trace of the old ids on Android', () => {
    const files = [
      'capacitor.config.ts',
      'android/app/build.gradle',
      ...readdirSync(appDir + 'android/app/src', { recursive: true, encoding: 'utf8' })
        .filter((f) => /\.(java|xml|kt)$/.test(f))
        .map((f) => `android/app/src/${f}`),
    ];
    for (const file of files) {
      expect(read(file), file).not.toMatch(/net[./]h2[./]albadrlessons|com[./]getcapacitor[./]myapp/);
      expect(file).not.toMatch(/net\/h2\/albadrlessons|com\/getcapacitor\/myapp/);
    }
  });
});

describe('home-screen label', () => {
  it('is the short name in the Capacitor config and both Android labels', () => {
    const strings = read('android/app/src/main/res/values/strings.xml');
    expect(config.appName).toBe('دروس البدر');
    expect(strings).toContain(`<string name="app_name">${config.appName}</string>`);
    expect(strings).toContain(`<string name="title_activity_main">${config.appName}</string>`);
  });
});
