import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { insertLessonIfNew, setLive, setSetting } from '../src/repo';

const call = (method: string, path: string, body?: unknown, token: string | null = env.ADMIN_TOKEN) =>
  exports.default.fetch(`http://example.com${path}`, {
    method,
    headers: {
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const lesson = (number: number) => ({
  number,
  hijriDate: `${number}-01-1448`,
  startPoint: `نقطة ${number}`,
  recordingUrl: `https://al-badr.net/download/${number}.mp3`,
  detailPath: `/detail/${number}`,
});

const course = {
  title: 'دورة',
  slot: 'fajr',
  weekdays: [0, 1],
  offsetMin: 25,
  seriesId: 1,
  pdfUrls: [],
  active: true,
};

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM lessons').run();
  await env.DB.prepare('DELETE FROM exceptions').run();
  await env.DB.prepare("DELETE FROM courses WHERE id NOT IN ('tafsir-saadi','kitab-tawhid')").run();
  await setSetting(env.DB, 'live_mode', 'embed');
  await setLive(env.DB, { isLive: false, broadcastUid: null, streamUrl: null, courseId: null, startedAt: null });
});

describe('auth', () => {
  it('rejects missing and wrong tokens', async () => {
    expect((await call('GET', '/api/admin/courses', undefined, null)).status).toBe(401);
    expect((await call('GET', '/api/admin/courses', undefined, 'nope')).status).toBe(401);
    expect((await call('GET', '/api/admin/courses', undefined, '')).status).toBe(401);
  });

  it('accepts the right token', async () => {
    expect((await call('GET', '/api/admin/courses')).status).toBe(200);
  });

  it('answers CORS preflight without a token', async () => {
    const res = await exports.default.fetch('http://example.com/api/admin/courses', {
      method: 'OPTIONS',
      headers: { Origin: 'http://x', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
  });
});

describe('courses', () => {
  it('inserts a new course with sort = max+1 and lists inactive ones', async () => {
    expect((await call('PUT', '/api/admin/courses/new', { ...course, active: false })).status).toBe(204);
    const rows = (await (await call('GET', '/api/admin/courses')).json()) as any[];
    const row = rows.find((r) => r.id === 'new');
    expect(row.active).toBe(false);
    expect(row.sort).toBe(Math.max(...rows.filter((r) => r.id !== 'new').map((r) => r.sort)) + 1);
  });

  it('updates an existing course without changing sort', async () => {
    const before = ((await (await call('GET', '/api/admin/courses')).json()) as any[]).find((r) => r.id === 'kitab-tawhid');
    await call('PUT', '/api/admin/courses/kitab-tawhid', { ...course, title: 'جديد' });
    const after = ((await (await call('GET', '/api/admin/courses')).json()) as any[]).find((r) => r.id === 'kitab-tawhid');
    expect(after.title).toBe('جديد');
    expect(after.sort).toBe(before.sort);
  });

  it.each([
    { ...course, title: '' },
    { ...course, slot: 'asr' },
    { ...course, weekdays: [7] },
    { ...course, weekdays: [1.5] },
    { ...course, offsetMin: 121 },
    { ...course, offsetMin: -1 },
    { ...course, offsetMin: 1.5 },
    { ...course, offsetMin: undefined },
    { ...course, seriesId: -1 },
    { ...course, pdfUrls: [1] },
    { ...course, active: 'yes' },
    'text',
  ])('rejects invalid course %#', async (body) => {
    const res = await call('PUT', '/api/admin/courses/x', body);
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty('error');
  });
});

describe('lessons', () => {
  it('PATCH sets end fields and the lesson leaves pending', async () => {
    await insertLessonIfNew(env.DB, 'tafsir-saadi', lesson(5));
    const pending = () => call('GET', '/api/admin/pending-transcriptions').then((r) => r.json() as Promise<any[]>);
    expect((await pending()).map((p) => p.number)).toEqual([5]);
    const res = await call('PATCH', '/api/admin/lessons/tafsir-saadi/5', { endPoint: 'نهاية', endPage: 12 });
    expect(res.status).toBe(204);
    expect(await pending()).toEqual([]);
    const row = await env.DB.prepare('SELECT end_point, end_page FROM lessons WHERE number = 5').first();
    expect(row).toEqual({ end_point: 'نهاية', end_page: 12 });
  });

  it('404 for a missing lesson', async () => {
    expect((await call('PATCH', '/api/admin/lessons/tafsir-saadi/99', { endPage: 3 })).status).toBe(404);
  });

  it.each([{ endPage: 'x' }, { endPage: 0 }, { pdfIndex: -1 }, { startPoint: 3 }, { other: 1 }, { endPage: 1.5 }])(
    'rejects invalid patch %#',
    async (body) => {
      await insertLessonIfNew(env.DB, 'tafsir-saadi', lesson(5));
      expect((await call('PATCH', '/api/admin/lessons/tafsir-saadi/5', body)).status).toBe(400);
    },
  );
});

describe('exceptions', () => {
  it('creates, lists upcoming and deletes', async () => {
    const res = await call('POST', '/api/admin/exceptions', { courseId: null, kind: 'cancel', dateFrom: '2999-01-01', note: 'x' });
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: number };
    await call('POST', '/api/admin/exceptions', { courseId: 'tafsir-saadi', kind: 'pause', dateFrom: '2000-01-01' });
    const list = (await (await call('GET', '/api/admin/exceptions')).json()) as any[];
    expect(list.map((e) => e.id)).toEqual([id]);
    expect((await call('DELETE', `/api/admin/exceptions/${id}`)).status).toBe(204);
    expect((await call('DELETE', `/api/admin/exceptions/${id}`)).status).toBe(404);
  });

  it.each([
    { courseId: null, kind: 'nope', dateFrom: '2999-01-01' },
    { courseId: null, kind: 'cancel', dateFrom: '01-01-2999' },
    { courseId: 5, kind: 'cancel', dateFrom: '2999-01-01' },
    { courseId: null, kind: 'move', dateFrom: '2999-01-01', time: '25:00' },
  ])('rejects invalid exception %#', async (body) => {
    expect((await call('POST', '/api/admin/exceptions', body)).status).toBe(400);
  });
});

describe('settings and misc', () => {
  it('live_mode direct exposes streamUrl while live', async () => {
    await setLive(env.DB, { isLive: true, broadcastUid: 'u', streamUrl: 'https://s/x', courseId: null, startedAt: new Date().toISOString() });
    const state = async () => (await (await exports.default.fetch('http://example.com/api/state')).json()) as any;
    expect((await state()).live.streamUrl).toBeNull();
    expect((await call('PUT', '/api/admin/settings/live_mode', { value: 'direct' })).status).toBe(204);
    const live = (await state()).live;
    expect(live.mode).toBe('direct');
    expect(live.streamUrl).toBe('https://s/x');
  });

  it('rejects an unknown live_mode', async () => {
    expect((await call('PUT', '/api/admin/settings/live_mode', { value: 'x' })).status).toBe(400);
  });

  it('test-push requires a topic', async () => {
    expect((await call('POST', '/api/admin/test-push', {})).status).toBe(400);
  });
});
