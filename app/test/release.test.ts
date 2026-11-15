// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  bumpVersion,
  compareVersions,
  composeNotes,
  FALLBACK_NOTES,
  latestTag,
  parseEntry,
  planRelease,
  readVersions,
} from '../../scripts/release-lib.mjs';

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
    expect(planRelease({ changedPaths: ['agent/sualruhaily_agent/x.py', 'docs/a.md', 'CLAUDE.md'], ...same })).toEqual([]);
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

describe('change entries', () => {
  const json = (o: object) => JSON.stringify(o);
  const ok = { platforms: ['android', 'ios'], ar: 'إصلاح', en: 'Fix' };

  it('reads a valid entry', () => {
    expect(parseEntry('changes/a.json', json(ok))).toEqual({ file: 'changes/a.json', ...ok });
  });

  it.each([
    ['not JSON', '{'],
    ['no platforms', json({ ...ok, platforms: [] })],
    ['an unknown platform', json({ ...ok, platforms: ['windows'] })],
    ['an empty Arabic text', json({ ...ok, ar: ' ' })],
    ['no English text', json({ platforms: ['ios'], ar: 'x' })],
  ])('refuses %s, naming the file', (_, text) => {
    expect(() => parseEntry('changes/bad.json', text)).toThrow(/changes\/bad\.json/);
  });

  it('every entry in the repo is valid', () => {
    const dir = `${root}changes`;
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      expect(() => parseEntry(`changes/${name}`, readFileSync(`${dir}/${name}`, 'utf8'))).not.toThrow();
    }
  });
});

describe('composeNotes', () => {
  const entry = (platforms: string[], en: string) => parseEntry('changes/x.json', JSON.stringify({ platforms, ar: `ع ${en}`, en }));

  it('lists only the platform’s own entries, in order', () => {
    const entries = [entry(['android'], 'Android fix'), entry(['ios'], 'iOS fix'), entry(['android', 'ios'], 'Both')];
    expect(composeNotes(entries, 'android', 'en', 500)).toBe('• Android fix\n• Both');
    expect(composeNotes(entries, 'ios', 'ar', 4000)).toBe('• ع iOS fix\n• ع Both');
  });

  it('keeps whole bullets under the limit and marks the cut', () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry(['android'], `Change number ${i} `.padEnd(40, 'x')));
    const notes = composeNotes(entries, 'android', 'en', 500);
    expect(notes.length).toBeLessThanOrEqual(500);
    expect(notes.endsWith('\n• …')).toBe(true);
    expect(notes.split('\n').slice(0, -1).every((l) => /^• Change number \d+ x+$/.test(l))).toBe(true);
  });

  it('falls back to a generic line when the platform has no entry', () => {
    expect(composeNotes([entry(['web'], 'Web only')], 'ios', 'en', 4000)).toBe(FALLBACK_NOTES.en);
    expect(composeNotes([], 'android', 'ar', 500)).toBe(FALLBACK_NOTES.ar);
  });
});

describe('latestTag', () => {
  it('picks the highest version of the channel, numerically', () => {
    const tags = ['release/play/1.0.9', 'release/play/1.0.10', 'release/github/1.0.11', 'release/appstore/1.0'];
    expect(latestTag(tags, 'play')).toBe('release/play/1.0.10');
    expect(latestTag(tags, 'appstore')).toBe('release/appstore/1.0');
    expect(latestTag(tags, 'testflight')).toBeNull();
  });
});
