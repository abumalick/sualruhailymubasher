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

const PLATFORMS = ['android', 'ios', 'web'];

export function parseEntry(file, json) {
  let entry;
  try {
    entry = JSON.parse(json);
  } catch (e) {
    throw new Error(`${file}: not valid JSON (${e.message})`);
  }
  const { platforms, ar, en } = entry ?? {};
  if (!Array.isArray(platforms) || !platforms.length) throw new Error(`${file}: "platforms" must list at least one of ${PLATFORMS.join(', ')}`);
  const unknown = platforms.filter((p) => !PLATFORMS.includes(p));
  if (unknown.length) throw new Error(`${file}: unknown platform ${unknown.join(', ')} (use ${PLATFORMS.join(', ')})`);
  for (const [key, text] of [['ar', ar], ['en', en]]) {
    if (typeof text !== 'string' || !text.trim()) throw new Error(`${file}: "${key}" must be a non-empty text`);
  }
  return { file, platforms, ar: ar.trim(), en: en.trim() };
}

export const FALLBACK_NOTES = { ar: 'تحسينات وإصلاحات.', en: 'Improvements and fixes.' };
const CUT = '• …';

export function composeNotes(entries, platform, lang, limit) {
  const bullets = entries.filter((e) => e.platforms.includes(platform)).map((e) => `• ${e[lang]}`);
  if (!bullets.length) return FALLBACK_NOTES[lang];
  const all = bullets.join('\n');
  if (all.length <= limit) return all;
  const kept = [];
  for (const b of bullets) {
    if ([...kept, b, CUT].join('\n').length > limit) break;
    kept.push(b);
  }
  return [...kept, CUT].join('\n');
}

// Each channel's notes start after the last release of the store it leads to
export const CHANNELS = {
  github: { platform: 'android', cursor: 'github' },
  'play-internal': { platform: 'android', cursor: 'play' },
  play: { platform: 'android', cursor: 'play' },
  testflight: { platform: 'ios', cursor: 'appstore' },
  appstore: { platform: 'ios', cursor: 'appstore' },
};

const numeric = (version) => version.split('.').map(Number);

export function latestTag(tags, cursor) {
  const prefix = `release/${cursor}/`;
  const ours = tags.filter((t) => t.startsWith(prefix) && /^\d+(\.\d+)*$/.test(t.slice(prefix.length)));
  ours.sort((a, b) => {
    const [x, y] = [numeric(a.slice(prefix.length)), numeric(b.slice(prefix.length))];
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
  });
  return ours.at(-1) ?? null;
}
