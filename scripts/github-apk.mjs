// The sideloaded APK, published as a GitHub release that Obtainium follows. It is signed by its own key,
// so it can never update or be updated by the Play install (signed by Play App Signing).
// Usage, from the repo root: node scripts/github-apk.mjs check | verify <apk> | publish <apk>
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const REPO = 'abumalick/sualruhailymubasher';
export const PACKAGE = 'com.sualruhailymubasher.app';
export const ASSET_NAME = 'sualruhaily-mubasher.apk';
// Certificate of the sideload key (Bitwarden: "Sualruhaily Mubasher Obtainium APK signing key"). Installed copies
// only accept updates signed by it, so an APK signed by anything else must never be published.
// TBD-plan-4 matches no digest: every APK is refused until this project's own key exists and its SHA-256 is set here.
export const SIGNER_SHA256 = 'TBD-plan-4';

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

export function apkProblems({ badging, signers, expected, signer = SIGNER_SHA256 }) {
  const problems = [];
  if (badging.packageName !== PACKAGE) problems.push(`package is ${badging.packageName}, expected ${PACKAGE}`);
  for (const key of ['versionCode', 'versionName']) {
    if (badging[key] !== expected[key]) problems.push(`${key} is ${badging[key]}, build.gradle says ${expected[key]}`);
  }
  if (signers.length !== 1 || signers[0] !== signer) {
    problems.push(`signed by [${signers.join(', ')}], expected only the sideload key ${signer}`);
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

// `gh release view` prints exactly this for a tag with no release; any other failure (auth, network) must stop the publish
export const isReleaseNotFound = (stderr) => /^release not found$/m.test(stderr);

function buildTool(name) {
  const dir = join(process.env.ANDROID_HOME ?? join(process.env.HOME, 'Android/Sdk'), 'build-tools');
  const versions = readdirSync(dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return join(dir, versions.at(-1), name);
}

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

export const realIo = {
  gradle: () => readFileSync(join(ROOT, 'app/android/app/build.gradle'), 'utf8'),
  badging: (apk) => run(buildTool('aapt2'), ['dump', 'badging', apk]),
  signers: (apk) => run(buildTool('apksigner'), ['verify', '--print-certs', apk]),
  releaseExists: (tag) => {
    try {
      run('gh', ['release', 'view', tag, '--repo', REPO, '--json', 'tagName']);
      return true;
    } catch (e) {
      if (isReleaseNotFound(String(e.stderr ?? ''))) return false;
      throw new Error(`cannot check ${REPO} for ${tag}: ${String(e.stderr ?? e.message).trim()}`);
    }
  },
  // Written by scripts/release.sh: the Android entries since the previous GitHub release
  changelog: (locale) => {
    const path = join(ROOT, `.tmp/release-notes/github/${locale}.txt`);
    return existsSync(path) ? readFileSync(path, 'utf8') : '';
  },
  stage: (apk, notes) => {
    const out = join(ROOT, '.tmp/github-apk');
    mkdirSync(out, { recursive: true });
    const asset = join(out, ASSET_NAME);
    const notesFile = join(out, 'notes.md');
    copyFileSync(apk, asset);
    writeFileSync(notesFile, notes);
    return { asset, notesFile };
  },
  createRelease: (args) => execFileSync('gh', args, { stdio: 'inherit' }),
  log: (line) => console.log(line),
};

export function verify(apk, io = realIo) {
  const expected = gradleVersion(io.gradle());
  const badging = parseBadging(io.badging(apk));
  const problems = apkProblems({ badging, signers: parseSigners(io.signers(apk)), expected, signer: io.signer });
  if (problems.length) throw new Error(`${apk} cannot be published:\n- ${problems.join('\n- ')}`);
  io.log(`${apk}: ${badging.packageName} ${badging.versionName} (${badging.versionCode}), sideload key`);
  return badging;
}

// Builds are not reproducible: an asset people already installed is never replaced
function assertNewTag(tag, io) {
  if (io.releaseExists(tag)) throw new Error(`${REPO} already has ${tag}; raise versionName to publish a new APK`);
}

// Run before Play is touched, so a forgotten versionName bump fails while nothing is released yet
export function check(io = realIo) {
  const tag = releaseTag(gradleVersion(io.gradle()).versionName);
  assertNewTag(tag, io);
  io.log(`${REPO}: ${tag} is free`);
  return tag;
}

export function publish(apk, io = realIo) {
  const { versionName } = verify(apk, io);
  const tag = releaseTag(versionName);
  assertNewTag(tag, io);
  const notes = releaseNotes({ ar: io.changelog('ar'), en: io.changelog('en-US') });
  const { asset, notesFile } = io.stage(apk, notes);
  io.createRelease(releaseArgs({ tag, asset, notesFile }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, apk] = process.argv.slice(2);
  const commands = { check: () => check(), verify: () => verify(apk), publish: () => publish(apk) };
  if (!commands[command] || (command !== 'check' && !apk)) {
    console.error('usage: node scripts/github-apk.mjs check | verify <apk> | publish <apk>');
    process.exit(2);
  }
  try {
    commands[command]();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
