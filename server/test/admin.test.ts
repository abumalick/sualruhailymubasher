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

  it.each(['Tafsir', 'a_b', 'a.b', 'x'.repeat(41), '%D8%A3'])('rejects course id %s (it becomes an FCM topic)', async (id) => {
    expect((await call('PUT', `/api/admin/courses/${id}`, course)).status).toBe(400);
  });

  it('stores the edition label and clears it when omitted', async () => {
    const edition = () =>
      call('GET', '/api/admin/courses').then(async (r) => ((await r.json()) as any[]).find((c) => c.id === 'ed').edition);
    await call('PUT', '/api/admin/courses/ed', { ...course, edition: 'طبعة دار ابن الجوزي' });
    expect(await edition()).toBe('طبعة دار ابن الجوزي');
    await call('PUT', '/api/admin/courses/ed', course);
    expect(await edition()).toBeNull();
  });

  it('stores the per-volume page offsets, keeps them when a save omits them, clears them with []', async () => {
    const offsets = () =>
      call('GET', '/api/admin/courses').then(async (r) => ((await r.json()) as any[]).find((c) => c.id === 'po').pageOffsets);
    await call('PUT', '/api/admin/courses/po', course);
    expect(await offsets()).toEqual([]);
    await call('PUT', '/api/admin/courses/po', { ...course, pdfUrls: ['a', 'b'], pageOffsets: [2, 0] });
    expect(await offsets()).toEqual([2, 0]);
    await call('PUT', '/api/admin/courses/po', { ...course, pdfUrls: ['a', 'b'], title: 'من صفحة إدارة قديمة' });
    expect(await offsets()).toEqual([2, 0]);
    await call('PUT', '/api/admin/courses/po', { ...course, pageOffsets: [] });
    expect(await offsets()).toEqual([]);
  });

  it('accepts a new book id', async () => {
    expect((await call('PUT', '/api/admin/courses/tafsir-saadi-2', course)).status).toBe(204);
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
    { ...course, edition: 5 },
    { ...course, pageOffsets: [1.5] },
    { ...course, pageOffsets: ['2'] },
    { ...course, pageOffsets: 2 },
    { ...course, pdfUrls: ['a'], pageOffsets: [2, 2] },
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

  it('PATCH null clears a field', async () => {
    await insertLessonIfNew(env.DB, 'tafsir-saadi', lesson(5));
    await call('PATCH', '/api/admin/lessons/tafsir-saadi/5', { endPoint: 'نهاية', endPage: 12, endPdfIndex: 1 });
    expect((await call('PATCH', '/api/admin/lessons/tafsir-saadi/5', { endPoint: null, endPage: null, endPdfIndex: null })).status).toBe(204);
    const row = await env.DB.prepare('SELECT end_point, end_page, end_pdf_index FROM lessons WHERE number = 5').first();
    expect(row).toEqual({ end_point: null, end_page: null, end_pdf_index: null });
  });

  it('PATCH endPage fills the next lesson start when unknown', async () => {
    await insertLessonIfNew(env.DB, 'tafsir-saadi', lesson(5));
    await insertLessonIfNew(env.DB, 'tafsir-saadi', lesson(6));
    await call('PATCH', '/api/admin/lessons/tafsir-saadi/5', { pdfIndex: 1, endPage: 12 });
    const start = () => env.DB.prepare('SELECT start_page, pdf_index FROM lessons WHERE number = 6').first();
    expect(await start()).toEqual({ start_page: 12, pdf_index: 1 });
    await call('PATCH', '/api/admin/lessons/tafsir-saadi/5', { endPage: 14, endPdfIndex: 2 });
    expect(await start()).toEqual({ start_page: 12, pdf_index: 1 });
  });

  it('PATCH endPdfIndex is used for the next lesson volume', async () => {
    await insertLessonIfNew(env.DB, 'tafsir-saadi', lesson(5));
    await insertLessonIfNew(env.DB, 'tafsir-saadi', lesson(6));
    await call('PATCH', '/api/admin/lessons/tafsir-saadi/5', { pdfIndex: 0, endPage: 2, endPdfIndex: 1 });
    expect(await env.DB.prepare('SELECT start_page, pdf_index FROM lessons WHERE number = 6').first()).toEqual({ start_page: 2, pdf_index: 1 });
  });

  it('404 for a missing lesson', async () => {
    expect((await call('PATCH', '/api/admin/lessons/tafsir-saadi/99', { endPage: 3 })).status).toBe(404);
  });

  it.each([{ endPage: 'x' }, { endPage: 0 }, { pdfIndex: -1 }, { startPoint: 3 }, { other: 1 }, { endPage: 1.5 }, { startPoint: null }, { endPdfIndex: -1 }])(
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
    { courseId: null, kind: 'cancel', dateFrom: '2026-02-31' },
    { courseId: null, kind: 'pause', dateFrom: '2026-02-01', dateTo: '2026-13-01' },
    { courseId: 'no-such-course', kind: 'cancel', dateFrom: '2999-01-01' },
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

  it('app_update is stored and served in the state', async () => {
    const policy = { android: { min: '1.0.17', latest: '1.0.17' }, ios: { min: null, latest: null } };
    expect((await call('PUT', '/api/admin/settings/app_update', policy)).status).toBe(204);
    const state = (await (await exports.default.fetch('http://example.com/api/state')).json()) as any;
    expect(state.update).toEqual(policy);
    expect((await call('PUT', '/api/admin/settings/app_update', {})).status).toBe(204);
  });

  it.each([
    [{ android: { min: '1.0.18', latest: '1.0.17' } }],
    [{ android: { min: '1.0.17', latest: null } }],
    [{ ios: { min: 'one', latest: null } }],
    [{ web: { min: null, latest: null } }],
    [[]],
  ])('rejects app_update %j', async (body) => {
    expect((await call('PUT', '/api/admin/settings/app_update', body)).status).toBe(400);
  });

  it('test-push requires a topic', async () => {
    expect((await call('POST', '/api/admin/test-push', {})).status).toBe(400);
  });

  it('test-push only accepts topics the jobs send to', async () => {
    expect((await call('POST', '/api/admin/test-push', { topic: 'c-tafsir-saadi-foo' })).status).toBe(400);
    expect((await call('POST', '/api/admin/test-push', { topic: 'c-nope-live' })).status).toBe(400);
    for (const topic of ['c-tafsir-saadi-live', 'c-kitab-tawhid-prep', 'live-other']) {
      expect((await call('POST', '/api/admin/test-push', { topic })).status).not.toBe(400);
    }
  });
});
