// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import config from '../capacitor.config';

const ios = (path: string) => readFileSync(new URL(`../ios/App/${path}`, import.meta.url), 'utf8');
const pbxproj = ios('App.xcodeproj/project.pbxproj');
const infoPlist = ios('App/Info.plist');

const settings = (key: string) => [...pbxproj.matchAll(new RegExp(`\\b${key} = ([^;]+);`, 'g'))].map((m) => m[1]);

const plistValue = (xml: string, key: string) => {
  const match = xml.match(new RegExp(`<key>${key}</key>\\s*(<(\\w+)>[\\s\\S]*?</\\2>|<\\w+/>)`));
  if (!match) throw new Error(`${key} missing`);
  return match[1];
};

describe('iOS project', () => {
  it('defines every project object id once (a reused id makes Xcode refuse the project)', () => {
    const ids = [...pbxproj.matchAll(/^\s*([0-9A-F]{24}) \/\*[^*]*\*\/ = \{/gm)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(20);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('uses the Capacitor appId as the bundle id in every configuration', () => {
    expect(settings('PRODUCT_BUNDLE_IDENTIFIER')).toEqual([config.appId, config.appId]);
  });

  it('targets iPhone only', () => {
    expect(settings('TARGETED_DEVICE_FAMILY')).toEqual(['1', '1']);
  });

  it('shows the short name on the home screen', () => {
    expect(plistValue(infoPlist, 'CFBundleDisplayName')).toBe('<string>سليمان الرحيلي مباشر</string>');
  });

  it('declares HTTPS-only encryption so TestFlight builds need no compliance answer', () => {
    expect(plistValue(infoPlist, 'ITSAppUsesNonExemptEncryption')).toBe('<false/>');
  });

  it('keeps audio playing in the background and receives the silent live-dismiss push', () => {
    const modes = plistValue(infoPlist, 'UIBackgroundModes');
    expect(modes).toContain('<string>audio</string>');
    expect(modes).toContain('<string>remote-notification</string>');
  });

  it('signs release builds for production APNs', () => {
    expect(settings('CODE_SIGN_ENTITLEMENTS')).toContain('App/AppRelease.entitlements');
    expect(plistValue(ios('App/AppRelease.entitlements'), 'aps-environment')).toBe('<string>production</string>');
  });

  it('bundles a privacy manifest with the reasons for the plugins’ required-reason APIs', () => {
    expect(pbxproj).toMatch(/PrivacyInfo\.xcprivacy in Resources \*\/,/);
    const manifest = ios('App/PrivacyInfo.xcprivacy');
    expect(plistValue(manifest, 'NSPrivacyTracking')).toBe('<false/>');
    expect(manifest).toContain('<string>CA92.1</string>');
    expect(manifest).toContain('<string>C617.1</string>');
  });
});
