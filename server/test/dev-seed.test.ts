import { env, exports } from 'cloudflare:workers';
import { afterAll, describe, expect, it } from 'vitest';
import seed from '../seed/dev.sql?raw';

const statements = seed
  .split('\n')
  .filter((line) => line.trim() && !line.startsWith('--'))
  .map((line) => env.DB.prepare(line));

const applySeed = () => env.DB.batch(statements);

afterAll(async () => {
  await env.DB.prepare('DELETE FROM lessons').run();
  await env.DB.prepare("UPDATE courses SET title = replace(title, ' (محلي)', '')").run();
});

describe('server/seed/dev.sql (worktree dev data)', () => {
  it('applies on top of the migrations, twice, and fills the home screen state', async () => {
    await applySeed();
    await applySeed();

    const res = await exports.default.fetch('http://example.com/api/state');
    const body = (await res.json()) as any;

    expect(body.courses.map((c: any) => c.id)).toEqual(['tafsir-saadi', 'kitab-tawhid']);
    for (const course of body.courses) {
      expect(course.title).toMatch(/[^)] \(محلي\)$/);
      expect(course.latest).toHaveLength(5);
      expect(course.next).not.toBeNull();
    }
    expect(body.courses[0].edition).toBe('طبعة دار ابن الجوزي');
  });
});
