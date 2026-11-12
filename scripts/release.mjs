// Release CLI: gathers git data from the repo in the current directory, then applies release-lib's decisions.
// Usage: node scripts/release.mjs plan <pre> <post> | bump <patch|minor|major> | version | notes <channel> <commit> <out-dir>
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bumpVersion, CHANNELS, composeNotes, latestTag, parseEntry, planRelease, readVersions, VERSION_FILES } from './release-lib.mjs';

const [GRADLE, PBXPROJ] = VERSION_FILES;
const LOCALES = {
  android: { limit: 500, files: { ar: 'ar', 'en-US': 'en' } },
  ios: { limit: 4000, files: { 'ar-SA': 'ar', 'en-US': 'en' } },
};

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const versionsAt = (rev) => readVersions(git('show', `${rev}:${GRADLE}`), git('show', `${rev}:${PBXPROJ}`)).android;
const lines = (text) => text.split('\n').filter(Boolean);

function plan(pre, post) {
  const changedPaths = lines(git('diff', '--name-only', pre, post));
  return planRelease({ changedPaths, before: versionsAt(pre), after: versionsAt(post) }).join(' ');
}

function bump(kind) {
  const out = bumpVersion({ gradle: readFileSync(GRADLE, 'utf8'), pbxproj: readFileSync(PBXPROJ, 'utf8'), kind });
  writeFileSync(GRADLE, out.gradle);
  writeFileSync(PBXPROJ, out.pbxproj);
  return `${out.version.name} (${out.version.code})`;
}

const version = () => readVersions(readFileSync(GRADLE, 'utf8'), readFileSync(PBXPROJ, 'utf8')).android.name;

function notes(channel, commit, outDir) {
  const spec = CHANNELS[channel];
  if (!spec) throw new Error(`unknown channel ${channel} (${Object.keys(CHANNELS).join(', ')})`);
  const since = latestTag(lines(git('tag', '--list', `release/${spec.cursor}/*`)), spec.cursor);
  const range = since ? `${since}..${commit}` : commit;
  const added = lines(git('log', '--reverse', '--diff-filter=A', '--format=', '--name-only', range, '--', 'changes/'));
  const entries = [...new Set(added)].filter((f) => f.endsWith('.json')).map((f) => parseEntry(f, git('show', `${commit}:${f}`)));
  const { limit, files } = LOCALES[spec.platform];
  mkdirSync(outDir, { recursive: true });
  for (const [locale, lang] of Object.entries(files)) {
    writeFileSync(join(outDir, `${locale}.txt`), composeNotes(entries, spec.platform, lang, limit));
  }
  return `${channel}: ${entries.filter((e) => e.platforms.includes(spec.platform)).length} entries since ${since ?? 'the beginning'}`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2);
  const commands = {
    plan: () => plan(args[0], args[1]),
    bump: () => bump(args[0] ?? 'patch'),
    version: () => version(),
    notes: () => notes(args[0], args[1], args[2]),
  };
  const arity = { plan: 2, bump: 0, version: 0, notes: 3 };
  if (!commands[command] || args.length < arity[command]) {
    console.error('usage: node scripts/release.mjs plan <pre> <post> | bump [patch|minor|major] | version | notes <channel> <commit> <out-dir>');
    process.exit(2);
  }
  try {
    console.log(commands[command]());
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
