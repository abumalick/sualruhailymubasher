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

    expect(body.courses.map((c: any) => c.id)).toEqual(['kitab-tawhid', 'kabair', 'targhib', 'dalil-talib']);
    for (const course of body.courses) {
      expect(course.title).toMatch(/[^)] \(محلي\)$/);
      expect(course.latest).toHaveLength(course.id === 'dalil-talib' ? 5 : 3);
      expect(course.place).not.toBe('');
      expect(course.next).not.toBeNull();
    }
    expect(body.courses[1].latest.map((l: any) => l.number)).toEqual([59, 57, 53]);
    expect(body.courses[1].latest[0]).toMatchObject({ label: 'المجلس ٥٩' });
    expect(body.courses[3].latest.slice(0, 3).map((l: any) => l.label)).toEqual([
      'كتاب الشهادات – الدرس ١', 'كتاب القضاء – الدرس ٧', 'كتاب القضاء – الدرس ٦',
    ]);
    expect(body.courses[3].latest[1]).toMatchObject({ number: 7, detailPath: 'tg:1111' });
  });
});
