import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../src/index';
import { ensureSection, insertLessonIfNew, latestLessons, patchLesson, upsertCourse } from '../src/repo';
import { adminRoutes } from '../src/routes/admin';

const app = new Hono<{ Bindings: Env }>();
app.route('/', adminRoutes);

const call = (method: string, path: string, body?: unknown, token: string | null = env.ADMIN_TOKEN) =>
  app.request(
    path,
    {
      method,
      headers: { 'Content-Type': 'application/json', ...(token === null ? {} : { Authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );

const COURSE = { title: 'شرح كتاب الكبائر', slot: 'asr' as const, place: '', weekdays: [2], offsetMin: 33, seriesId: 1, pdfUrls: [], active: true };

const add = (number: number, section: string, sectionNumber: number) =>
  insertLessonIfNew(env.DB, 'sec-c', { number, section, sectionNumber, hijriDate: `${number}-01-1448`, startPoint: 'س', recordingUrl: null, detailPath: `/d/${number}` });

beforeEach(async () => {
  await env.DB.exec('DELETE FROM lessons');
  await env.DB.exec('DELETE FROM sections');
  await upsertCourse(env.DB, 'sec-c', COURSE);
  await ensureSection(env.DB, 'sec-c', 'كتاب الصلاة');
  await ensureSection(env.DB, 'sec-c', 'كتاب الزكاة');
  await add(1, 'كتاب الصلاة', 1);
  await add(2, 'كتاب الزكاة', 1);
});

describe('/api/admin/sections/:courseId', () => {
  it('lists the sections in order', async () => {
    const res = await call('GET', '/api/admin/sections/sec-c');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(['كتاب الصلاة', 'كتاب الزكاة']);
  });

  it('reordering changes which lesson is the latest', async () => {
    expect((await latestLessons(env.DB, 'sec-c', 2)).map((l) => l.section)).toEqual(['كتاب الزكاة', 'كتاب الصلاة']);
    const res = await call('PUT', '/api/admin/sections/sec-c', { order: ['كتاب الزكاة', 'كتاب الصلاة'] });
    expect(res.status).toBe(204);
    expect((await latestLessons(env.DB, 'sec-c', 2)).map((l) => l.section)).toEqual(['كتاب الصلاة', 'كتاب الزكاة']);
    expect(await (await call('GET', '/api/admin/sections/sec-c')).json()).toEqual(['كتاب الزكاة', 'كتاب الصلاة']);
  });

  it('re-chains a start at a section boundary to the new predecessor', async () => {
    await env.DB.exec('DELETE FROM lessons');
    await add(1, 'كتاب الصلاة', 1);
    await patchLesson(env.DB, 'sec-c', 1, { pdfIndex: 0, endPage: 40, endPdfIndex: 0 });
    await add(2, 'كتاب الزكاة', 1);
    await patchLesson(env.DB, 'sec-c', 2, { endPage: 90, endPdfIndex: 0 });
    const start = async (n: number) => (await env.DB.prepare('SELECT start_page FROM lessons WHERE course_id = ? AND number = ?').bind('sec-c', n).first<{ start_page: number | null }>())!.start_page;
    expect(await start(2)).toBe(40);
    await call('PUT', '/api/admin/sections/sec-c', { order: ['كتاب الزكاة', 'كتاب الصلاة'] });
    expect(await start(1)).toBe(90);
    expect(await start(2)).toBeNull();
  });

  it.each([
    ['an unknown section', { order: ['كتاب الصلاة', 'كتاب الحج'] }],
    ['a missing section', { order: ['كتاب الصلاة'] }],
    ['a repeated section', { order: ['كتاب الصلاة', 'كتاب الصلاة'] }],
    ['no order', {}],
    ['a non-string entry', { order: ['كتاب الصلاة', 2] }],
  ])('rejects %s with 400 and leaves the order alone', async (_n, body) => {
    expect((await call('PUT', '/api/admin/sections/sec-c', body)).status).toBe(400);
    expect(await (await call('GET', '/api/admin/sections/sec-c')).json()).toEqual(['كتاب الصلاة', 'كتاب الزكاة']);
  });

  it('requires the admin token', async () => {
    expect((await call('GET', '/api/admin/sections/sec-c', undefined, null)).status).toBe(401);
    expect((await call('PUT', '/api/admin/sections/sec-c', { order: [] }, 'wrong')).status).toBe(401);
  });
});
