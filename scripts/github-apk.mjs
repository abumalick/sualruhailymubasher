// The sideloaded APK, published as a GitHub release that Obtainium follows. It is signed by its own key,
// so it can never update or be updated by the Play install (signed by Play App Signing).
// Usage, from the repo root: node scripts/github-apk.mjs verify|publish <apk>
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const REPO = 'abumalick/albadrmubasher';
export const PACKAGE = 'com.albadrmubasher.app';
export const ASSET_NAME = 'albadr-mubasher.apk';
// Certificate of the sideload key (Bitwarden: "Albadr Mubasher Obtainium APK signing key"). Installed copies
// only accept updates signed by it, so an APK signed by anything else must never be published.
export const SIGNER_SHA256 = '7979d855f5a8ed011c9e9d54467dd431b227a6bf34451dd39c66708a330cac83';

// Obtainium compares the tag with the installed versionName
export const releaseTag = (versionName) => `v${versionName}`;

export function gradleVersion(gradle) {
  return {
    versionCode: gradle.match(/versionCode\s+(\d+)/)?.[1],
    versionName: gradle.match(/versionName\s+"([^"]+)"/)?.[1],
  };
}

export function parseBadging(badging) {
  const line = badging.split('\n').find((l) => l.startsWith('package:')) ?? '';
  const attr = (name) => line.match(new RegExp(`\\b${name}='([^']*)'`))?.[1];
  return { packageName: attr('name'), versionCode: attr('versionCode'), versionName: attr('versionName') };
}

export const parseSigners = (apksigner) =>
  [...apksigner.matchAll(/^Signer #\d+ certificate SHA-256 digest: ([0-9a-f]{64})$/gm)].map((m) => m[1]);

export function apkProblems({ badging, signers, expected }) {
  const problems = [];
  if (badging.packageName !== PACKAGE) problems.push(`package is ${badging.packageName}, expected ${PACKAGE}`);
  for (const key of ['versionCode', 'versionName']) {
    if (badging[key] !== expected[key]) problems.push(`${key} is ${badging[key]}, build.gradle says ${expected[key]}`);
  }
  if (signers.length !== 1 || signers[0] !== SIGNER_SHA256) {
    problems.push(`signed by [${signers.join(', ')}], expected only the sideload key ${SIGNER_SHA256}`);
  }
  return problems;
}

export const releaseNotes = ({ ar, en }) => [ar.trim(), en.trim()].filter(Boolean).join('\n\n');

export const releaseArgs = ({ tag, asset, notesFile }) => [
  'release', 'create', tag, asset,
  '--repo', REPO,
  '--title', tag,
  '--notes-file', notesFile,
  '--latest',
];

function buildTool(name) {
  const dir = join(process.env.ANDROID_HOME ?? join(process.env.HOME, 'Android/Sdk'), 'build-tools');
  const versions = readdirSync(dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return join(dir, versions.at(-1), name);
}

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' });

function verify(apk) {
  const expected = gradleVersion(readFileSync(join(ROOT, 'app/android/app/build.gradle'), 'utf8'));
  const badging = parseBadging(run(buildTool('aapt2'), ['dump', 'badging', apk]));
  const problems = apkProblems({ badging, signers: parseSigners(run(buildTool('apksigner'), ['verify', '--print-certs', apk])), expected });
  if (problems.length) throw new Error(`${apk} cannot be published:\n- ${problems.join('\n- ')}`);
  console.log(`${apk}: ${badging.packageName} ${badging.versionName} (${badging.versionCode}), sideload key`);
  return badging;
}

function releaseExists(tag) {
  try {
    run('gh', ['release', 'view', tag, '--repo', REPO, '--json', 'tagName']);
    return true;
  } catch {
    return false;
  }
}

function publish(apk) {
  const { versionCode, versionName } = verify(apk);
  const tag = releaseTag(versionName);
  // Builds are not reproducible: an asset people already installed is never replaced
  if (releaseExists(tag)) throw new Error(`${REPO} already has ${tag}; raise versionName to publish a new APK`);
  const changelog = (locale) => {
    const path = join(ROOT, `fastlane/metadata/android/${locale}/changelogs/${versionCode}.txt`);
    return existsSync(path) ? readFileSync(path, 'utf8') : '';
  };
  const out = join(ROOT, '.tmp/github-apk');
  mkdirSync(out, { recursive: true });
  const asset = join(out, ASSET_NAME);
  const notesFile = join(out, 'notes.md');
  copyFileSync(apk, asset);
  writeFileSync(notesFile, releaseNotes({ ar: changelog('ar'), en: changelog('en-US') }));
  execFileSync('gh', releaseArgs({ tag, asset, notesFile }), { stdio: 'inherit' });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, apk] = process.argv.slice(2);
  if (!apk || !['verify', 'publish'].includes(command)) {
    console.error('usage: node scripts/github-apk.mjs verify|publish <apk>');
    process.exit(2);
  }
  try {
    (command === 'verify' ? verify : publish)(apk);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
