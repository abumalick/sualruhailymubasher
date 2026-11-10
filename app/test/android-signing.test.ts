// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const androidDir = fileURLToPath(new URL('../android', import.meta.url));
const SIGNING_VARS = ['ALBADR_KEYSTORE', 'ALBADR_KEYSTORE_PASSWORD', 'ALBADR_KEY_ALIAS', 'ALBADR_KEY_PASSWORD'];
const hasJava = spawnSync('java', ['-version']).status === 0;
// Gradle can only evaluate the project once `npx cap sync android` has generated the plugin projects
const synced = existsSync(`${androidDir}/capacitor-cordova-android-plugins/cordova.variables.gradle`);

// `-m` is Gradle's dry run: it builds the task graph, where the guard lives, without running any task
const dryRun = (task: string) => {
  const env = { ...process.env };
  for (const name of SIGNING_VARS) delete env[name];
  return spawnSync('./gradlew', ['-q', '-m', task], { cwd: androidDir, env, encoding: 'utf8' });
};

describe.skipIf(!hasJava || !synced)('Android release signing (needs Java and cap sync)', () => {
  it.each(['bundleRelease', 'assembleRelease'])('refuses %s without the upload key', (task) => {
    const run = dryRun(task);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('needs the upload key');
  }, 180_000);

  it('still builds debug without it', () => {
    expect(dryRun('assembleDebug').status).toBe(0);
  }, 180_000);
});
