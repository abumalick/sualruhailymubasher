// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ASSET_NAME,
  type GithubApkIo,
  check,
  isReleaseNotFound,
  publish,
  REPO,
  SIGNER_SHA256,
  apkProblems,
  gradleVersion,
  parseBadging,
  parseSigners,
  releaseArgs,
  releaseNotes,
  releaseTag,
} from '../../scripts/github-apk.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

// Captured from the 1.0.6 release APK: `aapt2 dump badging` and `apksigner verify --print-certs`
const BADGING = `package: name='com.sualruhailymubasher.app' versionCode='6' versionName='1.0.6' platformBuildVersionName='16' platformBuildVersionCode='36' compileSdkVersion='36' compileSdkVersionCodename='16'
minSdkVersion:'24'
targetSdkVersion:'36'
native-code: 'arm64-v8a' 'armeabi-v7a' 'x86' 'x86_64'
`;
const SIGNED_BY_SIDELOAD_KEY = `Signer #1 certificate DN: CN=Sualruhaily Mubasher, O=H2 Alliance
Signer #1 certificate SHA-256 digest: 7979d855f5a8ed011c9e9d54467dd431b227a6bf34451dd39c66708a330cac83
Signer #1 certificate SHA-1 digest: 0532034ba24b1d18a34c137cbe277d2b7df18ee1
Signer #1 certificate MD5 digest: 85978e55501abd2125755bf0829199a1
`;
const OTHER_KEY = 'a'.repeat(64);

const gradle = readFileSync(`${root}app/android/app/build.gradle`, 'utf8');
const expected = { versionCode: '6', versionName: '1.0.6' };

describe('sideload APK checks', () => {
  it('reads the version the checkout builds', () => {
    expect(gradleVersion('versionCode 6\n        versionName "1.0.6"')).toEqual(expected);
    expect(gradleVersion(gradle).versionName).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('reads package and versions from aapt2', () => {
    expect(parseBadging(BADGING)).toEqual({ packageName: 'com.sualruhailymubasher.app', versionCode: '6', versionName: '1.0.6' });
  });

  it('reads the signer certificates from apksigner', () => {
    expect(parseSigners(SIGNED_BY_SIDELOAD_KEY)).toEqual([SIGNER_SHA256]);
  });

  it('accepts the APK the checkout builds, signed by the sideload key', () => {
    expect(apkProblems({ badging: parseBadging(BADGING), signers: [SIGNER_SHA256], expected })).toEqual([]);
  });

  it('refuses an APK signed by any other key, such as the Play upload key', () => {
    expect(apkProblems({ badging: parseBadging(BADGING), signers: [OTHER_KEY], expected })).toHaveLength(1);
    expect(apkProblems({ badging: parseBadging(BADGING), signers: [SIGNER_SHA256, OTHER_KEY], expected })).toHaveLength(1);
    expect(apkProblems({ badging: parseBadging(BADGING), signers: [], expected })).toHaveLength(1);
  });

  it('refuses a version or package other than the checkout’s', () => {
    expect(apkProblems({ badging: parseBadging(BADGING), signers: [SIGNER_SHA256], expected: { versionCode: '7', versionName: '1.0.7' } })).toHaveLength(2);
    const other = parseBadging(BADGING.replace('com.sualruhailymubasher.app', 'com.example.app'));
    expect(apkProblems({ badging: other, signers: [SIGNER_SHA256], expected })).toHaveLength(1);
  });
});

describe('GitHub release', () => {
  it('tags v<versionName>, which Obtainium matches to the installed version', () => {
    expect(releaseTag('1.0.6')).toBe('v1.0.6');
  });

  it('keeps one asset name across releases, so /releases/latest/download/<name> stays valid', () => {
    expect(ASSET_NAME).toBe('sualruhaily-mubasher.apk');
  });

  it('publishes a full release marked latest on the releases-only repo', () => {
    const args = releaseArgs({ tag: 'v1.0.6', asset: `.tmp/github-apk/${ASSET_NAME}`, notesFile: 'notes.md' });
    expect(args.slice(0, 4)).toEqual(['release', 'create', 'v1.0.6', `.tmp/github-apk/${ASSET_NAME}`]);
    expect(args).toContain('--latest');
    expect(args).not.toContain('--draft');
    expect(args).not.toContain('--prerelease');
    expect(args[args.indexOf('--repo') + 1]).toBe(REPO);
  });

  it('joins the Arabic and English release notes', () => {
    expect(releaseNotes({ ar: 'تحسينات\n', en: 'Improvements\n' })).toBe('تحسينات\n\nImprovements');
    expect(releaseNotes({ ar: '', en: 'Improvements' })).toBe('Improvements');
  });
});

describe('publishing', () => {
  const GRADLE = 'versionCode 6\n        versionName "1.0.6"';
  const fakeIo = (over: Partial<GithubApkIo> = {}) => {
    const calls: string[] = [];
    const io: GithubApkIo = {
      gradle: () => GRADLE,
      badging: () => BADGING,
      signers: () => SIGNED_BY_SIDELOAD_KEY,
      releaseExists: () => false,
      changelog: (locale) => `${locale} notes`,
      stage: (_apk, notes) => {
        calls.push(`stage ${notes}`);
        return { asset: `.tmp/github-apk/${ASSET_NAME}`, notesFile: '.tmp/github-apk/notes.md' };
      },
      createRelease: (args) => void calls.push(`gh ${args.join(' ')}`),
      log: () => {},
      ...over,
    };
    return { io, calls };
  };

  it('creates the release with the APK and both languages’ notes', () => {
    const { io, calls } = fakeIo();
    publish('app-release.apk', io);
    expect(calls).toEqual([
      'stage ar notes\n\nen-US notes',
      `gh release create v1.0.6 .tmp/github-apk/${ASSET_NAME} --repo ${REPO} --title v1.0.6 --notes-file .tmp/github-apk/notes.md --latest`,
    ]);
  });

  it('never replaces a release that exists', () => {
    const { io, calls } = fakeIo({ releaseExists: (tag) => tag === 'v1.0.6' });
    expect(() => publish('app-release.apk', io)).toThrow(/already has v1\.0\.6/);
    expect(calls).toEqual([]);
  });

  it('stops before staging or calling gh when the signer is wrong', () => {
    const { io, calls } = fakeIo({ signers: () => SIGNED_BY_SIDELOAD_KEY.replace(SIGNER_SHA256, OTHER_KEY) });
    expect(() => publish('app-release.apk', io)).toThrow(/cannot be published/);
    expect(calls).toEqual([]);
  });

  it('stops when GitHub cannot be checked, rather than assuming the tag is free', () => {
    const { io, calls } = fakeIo({ releaseExists: () => { throw new Error('cannot check'); } });
    expect(() => publish('app-release.apk', io)).toThrow(/cannot check/);
    expect(calls).toEqual([]);
  });

  it('checks the checkout’s tag before anything is built or promoted', () => {
    expect(check(fakeIo().io)).toBe('v1.0.6');
    expect(() => check(fakeIo({ releaseExists: () => true }).io)).toThrow(/already has v1\.0\.6/);
  });

  it('tells a missing release from other gh failures', () => {
    expect(isReleaseNotFound('release not found\n')).toBe(true);
    expect(isReleaseNotFound('HTTP 401: Bad credentials (https://api.github.com/graphql)\n')).toBe(false);
    expect(isReleaseNotFound('error connecting to api.github.com\n')).toBe(false);
  });
});

describe('release notes source', () => {
  it('reads the notes release.sh generated for the GitHub channel, not the Play changelogs', () => {
    const source = readFileSync(`${root}scripts/github-apk.mjs`, 'utf8');
    expect(source).toMatch(/\.tmp\/release-notes\/github\/\$\{locale\}\.txt/);
    expect(source).not.toMatch(/changelogs\//);
  });
});

describe('fastlane github_apk lane', () => {
  const fastfile = readFileSync(`${root}fastlane/Fastfile.android`, 'utf8');
  const lane = (name: string) => fastfile.slice(fastfile.indexOf(`lane :${name} do`), fastfile.indexOf('\n  end\n', fastfile.indexOf(`lane :${name} do`)));

  it('takes the sideload key from its own file and never keeps signing settings already in ENV', () => {
    const load = lane('load_github_apk_signing_env');
    expect(load).toMatch(/obtainium-apk\.env/);
    expect(load).toMatch(/ENV\[key\] = value/);
    expect(load).not.toMatch(/ENV\[k(ey)?\]\.to_s|ENV\[k(ey)?\]\s*\|\||\|\|=/);
  });

  it('builds a release APK, not the bundle, with push configured, and publishes it', () => {
    const apk = lane('github_apk');
    expect(apk.indexOf('load_github_apk_signing_env')).toBeLessThan(apk.indexOf('gradle('));
    expect(apk).toMatch(/check_google_services/);
    expect(apk).toMatch(/gradle\(task: "assemble", build_type: "Release"/);
    expect(apk).toMatch(/node scripts\/github-apk\.mjs publish #\{ANDROID_APK\}/);
  });

  it('points the APK update notice at its own releases, since Play cannot update an APK signed by another key', () => {
    const url = `https://github.com/${REPO}/releases/latest`;
    expect(lane('github_apk')).toContain(`VITE_ANDROID_UPDATE_URL=${url} pnpm --filter app build`);
    expect(lane('build')).not.toMatch(/VITE_ANDROID_UPDATE_URL/);
    const sources = readdirSync(`${root}app/src`, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => readFileSync(`${root}app/src/${f}`, 'utf8').includes('github.com'));
    expect(sources, 'the Play bundle must not carry a link to update outside Play').toEqual([]);
  });

  it('uploads only the bundle and its notes to internal testing; the listing goes up with a store release', () => {
    const internal = lane('internal');
    expect(internal).not.toMatch(/sync_image_upload/);
    for (const skip of ['skip_upload_metadata', 'skip_upload_images', 'skip_upload_screenshots']) {
      expect(internal).toMatch(new RegExp(`${skip}: true`));
    }
    expect(internal).not.toMatch(/skip_upload_changelogs/);
  });

  it('promotes to production without touching GitHub, whose APK went out with the version bump', () => {
    const production = lane('production');
    expect(production).toMatch(/track_promote_to: "production"/);
    expect(production).not.toMatch(/github/);
  });
});
