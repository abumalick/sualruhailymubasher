// Release decisions: what a merge ships, the next version, and each channel's notes. No I/O here.
import { gradleVersion } from './github-apk.mjs';

export const VERSION_FILES = ['app/android/app/build.gradle', 'app/ios/App/App.xcodeproj/project.pbxproj'];
const DEPLOY_DIRS = ['app/', 'server/', 'shared/', 'web/'];
const TEST_BUILDS = ['github-apk', 'play-internal', 'testflight'];

export function readVersions(gradle, pbxproj) {
  const { versionCode, versionName } = gradleVersion(gradle);
  if (!versionCode || !versionName) throw new Error('versionCode or versionName not found in build.gradle');
  const ios = [...new Set([...pbxproj.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]))];
  if (ios.length !== 1) throw new Error(`project.pbxproj has ${ios.length} marketing versions: ${ios.join(', ')}`);
  return { android: { name: versionName, code: Number(versionCode) }, ios: ios[0] };
}

const parts = (name) => {
  if (!/^\d+\.\d+\.\d+$/.test(name)) throw new Error(`version ${name} is not X.Y.Z`);
  return name.split('.').map(Number);
};

export function compareVersions(a, b) {
  const [x, y] = [parts(a.name), parts(b.name)];
  const i = x.findIndex((n, k) => n !== y[k]);
  const byName = i === -1 ? 0 : Math.sign(x[i] - y[i]);
  const byCode = Math.sign(a.code - b.code);
  if (byName !== byCode) throw new Error(`versionName ${a.name}/${b.name} and versionCode ${a.code}/${b.code} disagree`);
  return byName;
}

export function planRelease({ changedPaths, before, after }) {
  const order = compareVersions(after, before);
  if (order < 0) throw new Error(`version decrease: ${before.name} (${before.code}) -> ${after.name} (${after.code})`);
  if (order > 0) {
    const others = changedPaths.filter((p) => !VERSION_FILES.includes(p));
    if (others.length) {
      throw new Error(`the version rose together with other changes (${others.join(', ')}): only release.sh bump may raise it`);
    }
    return ['server', 'web', ...TEST_BUILDS];
  }
  return changedPaths.some((p) => DEPLOY_DIRS.some((d) => p.startsWith(d))) ? ['server', 'web'] : [];
}

export function bumpVersion({ gradle, pbxproj, kind }) {
  const { android } = readVersions(gradle, pbxproj);
  const [major, minor, patch] = parts(android.name);
  const name = { major: `${major + 1}.0.0`, minor: `${major}.${minor + 1}.0`, patch: `${major}.${minor}.${patch + 1}` }[kind];
  if (!name) throw new Error(`unknown bump kind: ${kind}`);
  const version = { name, code: android.code + 1 };
  return {
    gradle: gradle.replace(/versionCode\s+\d+/, `versionCode ${version.code}`).replace(/versionName\s+"[^"]+"/, `versionName "${name}"`),
    pbxproj: pbxproj.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${name};`),
    version,
  };
}
