// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bumpVersion, compareVersions, planRelease, readVersions } from '../../scripts/release-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const GRADLE = readFileSync(`${root}app/android/app/build.gradle`, 'utf8');
const PBXPROJ = readFileSync(`${root}app/ios/App/App.xcodeproj/project.pbxproj`, 'utf8');
const VERSION_FILES = ['app/android/app/build.gradle', 'app/ios/App/App.xcodeproj/project.pbxproj'];
const v = (name: string, code: number) => ({ name, code });
const changedLines = (a: string, b: string) => {
  const [x, y] = [a.split('\n'), b.split('\n')];
  return x.filter((line, i) => line !== y[i]).length;
};

describe('versions', () => {
  it('reads both apps’ versions from the project files', () => {
    const { android, ios } = readVersions(GRADLE, PBXPROJ);
    expect(android).toEqual({ name: expect.stringMatching(/^\d+\.\d+\.\d+$/), code: expect.any(Number) });
    expect(ios).toMatch(/^\d+\.\d+(\.\d+)?$/);
  });

  it('compares version names numerically', () => {
    expect(compareVersions(v('1.0.10', 10), v('1.0.9', 9))).toBe(1);
    expect(compareVersions(v('1.0.9', 9), v('1.0.10', 10))).toBe(-1);
    expect(compareVersions(v('1.0.9', 9), v('1.0.9', 9))).toBe(0);
  });

  it('refuses a name and a code that move in different directions', () => {
    expect(() => compareVersions(v('1.0.10', 9), v('1.0.9', 9))).toThrow(/versionCode/);
  });
});

describe('planRelease', () => {
  const same = { before: v('1.0.9', 9), after: v('1.0.9', 9) };

  it('ships nothing for a merge of the agent or the docs', () => {
    expect(planRelease({ changedPaths: ['agent/albadr_agent/x.py', 'docs/a.md', 'CLAUDE.md'], ...same })).toEqual([]);
  });

  it('deploys the server and the web for an app, server, shared or web change', () => {
    for (const path of ['app/src/a.ts', 'server/src/a.ts', 'shared/src/a.ts', 'web/src/a.ts']) {
      expect(planRelease({ changedPaths: [path], ...same })).toEqual(['server', 'web']);
    }
  });

  it('ships every channel on a bump, the server and web first', () => {
    expect(planRelease({ changedPaths: VERSION_FILES, before: v('1.0.9', 9), after: v('1.0.10', 10) })).toEqual([
      'server',
      'web',
      'github-apk',
      'play-internal',
      'testflight',
    ]);
  });

  it('refuses a version rise that comes with other changes', () => {
    expect(() =>
      planRelease({ changedPaths: [...VERSION_FILES, 'app/src/a.ts'], before: v('1.0.9', 9), after: v('1.0.10', 10) }),
    ).toThrow(/only release\.sh bump/);
  });

  it('refuses a version decrease', () => {
    expect(() => planRelease({ changedPaths: VERSION_FILES, before: v('1.0.10', 10), after: v('1.0.9', 9) })).toThrow(
      /decrease/,
    );
  });
});

describe('bumpVersion', () => {
  const at = (gradle: string, pbxproj: string) => ({ gradle, pbxproj, kind: 'patch' as const });

  it('raises name and code in build.gradle and the iOS marketing version, nothing else', () => {
    const { android } = readVersions(GRADLE, PBXPROJ);
    const out = bumpVersion(at(GRADLE, PBXPROJ));
    const [major, minor, patch] = android.name.split('.').map(Number);
    expect(out.version).toEqual(v(`${major}.${minor}.${patch + 1}`, android.code + 1));
    expect(readVersions(out.gradle, out.pbxproj)).toEqual({ android: out.version, ios: out.version.name });
    expect(out.pbxproj.match(new RegExp(`MARKETING_VERSION = ${out.version.name.replace(/\./g, '\\.')};`, 'g'))).toHaveLength(2);
    expect(changedLines(GRADLE, out.gradle)).toBe(2);
    expect(changedLines(PBXPROJ, out.pbxproj)).toBe(2);
  });

  it('bumps minor and major from 1.0.9 (9)', () => {
    const gradle = GRADLE.replace(/versionCode \d+/, 'versionCode 9').replace(/versionName "[^"]+"/, 'versionName "1.0.9"');
    expect(bumpVersion({ gradle, pbxproj: PBXPROJ, kind: 'patch' }).version).toEqual(v('1.0.10', 10));
    expect(bumpVersion({ gradle, pbxproj: PBXPROJ, kind: 'minor' }).version).toEqual(v('1.1.0', 10));
    expect(bumpVersion({ gradle, pbxproj: PBXPROJ, kind: 'major' }).version).toEqual(v('2.0.0', 10));
  });
});
