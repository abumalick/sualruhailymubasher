// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VERSION_FILES } from '../../scripts/release-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const cli = join(root, 'scripts/release.mjs');
let repo: string;

const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
const release = (...args: string[]) => execFileSync('node', [cli, ...args], { cwd: repo, encoding: 'utf8' }).trim();
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
};
const commit = (message: string) => {
  git('add', '-A');
  git('commit', '-q', '-m', message);
  return git('rev-parse', 'HEAD');
};
const entry = (platforms: string[], en: string) => JSON.stringify({ platforms, ar: `ع ${en}`, en });

beforeAll(() => {
  mkdirSync(join(root, '.tmp'), { recursive: true });
  repo = mkdtempSync(join(root, '.tmp/release-cli-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t.t');
  git('config', 'user.name', 't');
  for (const file of VERSION_FILES) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    copyFileSync(join(root, file), join(repo, file));
  }
  write('.gitignore', '.tmp/\n');
  write('changes/old.json', entry(['android'], 'Before the release'));
  commit('init');
  git('tag', 'release/play/1.0.9');
  write('changes/a.json', entry(['android'], 'Android fix'));
  commit('a');
  write('changes/b.json', entry(['ios'], 'iOS fix'));
  write('changes/README.md', 'not an entry');
  commit('b');
  write('changes/c.json', entry(['android', 'ios'], 'Both'));
  commit('c');
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('release.mjs notes', () => {
  it('writes the channel’s platform entries added since its store’s last release', () => {
    const out = join(repo, '.tmp/notes-play');
    release('notes', 'play-internal', 'HEAD', out);
    expect(readFileSync(join(out, 'en-US.txt'), 'utf8')).toBe('• Android fix\n• Both');
    expect(readFileSync(join(out, 'ar.txt'), 'utf8')).toBe('• ع Android fix\n• ع Both');
  });

  it('uses the App Store locales for iOS, and all history before the first release', () => {
    const out = join(repo, '.tmp/notes-ios');
    release('notes', 'testflight', 'HEAD', out);
    expect(readFileSync(join(out, 'en-US.txt'), 'utf8')).toBe('• iOS fix\n• Both');
    expect(readFileSync(join(out, 'ar-SA.txt'), 'utf8')).toBe('• ع iOS fix\n• ع Both');
  });

  it('refuses an unknown channel', () => {
    expect(() => release('notes', 'fdroid', 'HEAD', join(repo, '.tmp/x'))).toThrow();
  });
});

describe('release.mjs plan and bump', () => {
  it('plans server and web for an app change, nothing for a docs change', () => {
    const before = git('rev-parse', 'HEAD');
    write('app/src/a.ts', 'x');
    const app = commit('app');
    expect(release('plan', before, app)).toBe('server web');
    write('docs/a.md', 'x');
    expect(release('plan', app, commit('docs'))).toBe('');
  });

  it('bumps the version files and plans every channel for that commit', () => {
    const before = git('rev-parse', 'HEAD');
    const was = release('version');
    const printed = release('bump', 'patch');
    expect(printed).toMatch(/^\d+\.\d+\.\d+ \(\d+\)$/);
    expect(release('version')).not.toBe(was);
    expect(git('diff', '--name-only').split('\n').sort()).toEqual([...VERSION_FILES].sort());
    expect(release('plan', before, commit('release'))).toBe('server web github-apk play-internal testflight');
  });
});
