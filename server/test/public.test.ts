import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { insertLessonIfNew, recordBroadcast, setLive, setSetting } from '../src/repo';

const get = (path: string) => exports.default.fetch(`http://example.com${path}`);

const lesson = (number: number) => ({
  number,
  hijriDate: `${number}-01-1448`,
  startPoint: `نقطة ${number}`,
  recordingUrl: null,
  detailPath: `/detail/${number}`,
});

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM lessons').run();
  await env.DB.prepare('DELETE FROM exceptions').run();
  await env.DB.prepare('DELETE FROM broadcasts').run();
  await setSetting(env.DB, 'live_mode', 'embed');
  await env.DB.prepare("DELETE FROM settings WHERE key = 'app_update'").run();
  await setLive(env.DB, { isLive: false, broadcastUid: null, streamUrl: null, courseId: null, startedAt: null });
});

describe('GET /api/state', () => {
  it('returns the full StateDTO with cache and CORS headers', async () => {
    for (let n = 1; n <= 7; n++) await insertLessonIfNew(env.DB, 'dalil-talib', lesson(n));
    const res = await get('/api/state');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=15');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = (await res.json()) as any;
    expect(Number.isNaN(Date.parse(body.generatedAt))).toBe(false);
    expect(body.courses.map((c: any) => c.id)).toEqual(['kitab-tawhid', 'kabair', 'targhib', 'dalil-talib']);
    const saadi = body.courses[3];
    expect(Object.keys(saadi).sort()).toEqual(
      ['edition', 'exceptions', 'id', 'latest', 'lessonWord', 'next', 'pageOffsets', 'pdfUrls', 'place', 'slot', 'time', 'title', 'unpublished', 'weekdays'].sort(),
    );
    expect(saadi).toMatchObject({ slot: 'asr', place: 'المسجد النبوي (حلقة ٢)', weekdays: [4, 5, 6], pageOffsets: [] });
    expect(body.courses[1]).toMatchObject({ slot: 'asr', place: 'مسجد قباء' });
    expect(saadi.latest.map((l: any) => l.number)).toEqual([7, 6, 5, 4, 3]);
    expect(saadi.next).not.toHaveProperty('number');
    expect(saadi).toMatchObject({ lessonWord: 'الدرس', unpublished: 0 });
    expect(saadi.latest.every((l: any) => typeof l.label === 'string' && l.label !== '')).toBe(true);
    expect(saadi.latest[0]).toMatchObject({ label: 'الدرس ٧', section: '', sectionNumber: 7, dateFlag: false });
    expect(body.courses[1].lessonWord).toBe('المجلس');
    expect(saadi.time).toBe(saadi.next.time);
    expect(saadi.time).toMatch(/^1[56]:\d\d$/);
    expect(body.links).toHaveLength(4);
    expect(body.links[0]).toEqual({ title: 'الموقع الرسمي', url: 'https://sualruhaily.com' });
    expect(body.links[3].url).toBe('https://sualruhaily.mixlr.com');
  });

  it('counts lessons broadcast but not yet on media.sualruhailymubasher.com as unpublished', async () => {
    const next = async () => ((await (await get('/api/state')).json()) as any).courses[3].unpublished;
    await insertLessonIfNew(env.DB, 'dalil-talib', { ...lesson(7), hijriDate: '30-01-1448' });
    await env.DB.prepare("UPDATE lessons SET created_at = '2026-01-01T00:00:00.000Z'").run();
    await recordBroadcast(env.DB, 'b-8', 'dalil-talib', '2026-01-04T02:30:00.000Z');
    expect(await next()).toBe(1);
    await insertLessonIfNew(env.DB, 'dalil-talib', { ...lesson(8), hijriDate: '30-01-1448' });
    expect(await next()).toBe(0);
  });

  it('hides streamUrl in embed mode even when live', async () => {
    await setLive(env.DB, {
      isLive: true,
      broadcastUid: 'b1',
      streamUrl: 'https://stream.example/x',
      courseId: 'dalil-talib',
      startedAt: '2026-10-30T02:00:00.000Z',
    });
    const { live } = (await (await get('/api/state')).json()) as any;
    expect(live).toEqual({
      isLive: true,
      mode: 'embed',
      embedUrl: 'https://sualruhaily.mixlr.com/embed',
      streamUrl: null,
      courseId: 'dalil-talib',
      startedAt: '2026-10-30T02:00:00.000Z',
    });
  });

  it('exposes streamUrl in direct mode only while live', async () => {
    await setSetting(env.DB, 'live_mode', 'direct');
    await setLive(env.DB, {
      isLive: true,
      broadcastUid: 'b1',
      streamUrl: 'https://stream.example/x',
      courseId: null,
      startedAt: null,
    });
    expect(((await (await get('/api/state')).json()) as any).live.streamUrl).toBe('https://stream.example/x');
    await setLive(env.DB, {
      isLive: false,
      broadcastUid: null,
      streamUrl: 'https://stream.example/x',
      courseId: null,
      startedAt: null,
    });
    const { live } = (await (await get('/api/state')).json()) as any;
    expect(live.mode).toBe('direct');
    expect(live.streamUrl).toBeNull();
  });

  it('lists upcoming exceptions only', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO exceptions (course_id, kind, date_from, note) VALUES (NULL, 'cancel', '2020-01-01', 'old')"),
      env.DB.prepare("INSERT INTO exceptions (course_id, kind, date_from, note) VALUES (NULL, 'cancel', '2999-01-01', 'future')"),
    ]);
    const body = (await (await get('/api/state')).json()) as any;
    expect(body.courses[0].exceptions.map((e: any) => e.note)).toEqual(['future']);
  });
});

describe('GET /api/state update field', () => {
  const update = async () => ((await (await get('/api/state')).json()) as any).update;

  it('is absent while no update is set', async () => {
    expect(await update()).toBeUndefined();
  });

  it('carries the stored policy', async () => {
    const policy = { android: { min: '1.0.17', latest: '1.0.18' }, ios: { min: null, latest: '1.0.18' } };
    await setSetting(env.DB, 'app_update', JSON.stringify(policy));
    expect(await update()).toEqual(policy);
  });

  it('is absent when the stored value is not JSON, so the state still answers', async () => {
    await setSetting(env.DB, 'app_update', '{oops');
    const res = await get('/api/state');
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).update).toBeUndefined();
  });
});

describe('GET /api/courses/:id/lessons', () => {
  it('404s for an unknown course', async () => {
    expect((await get('/api/courses/nope/lessons')).status).toBe(404);
  });

  it('caps limit at 50, pages with before, newest first, CORS *', async () => {
    for (let n = 1; n <= 60; n++) await insertLessonIfNew(env.DB, 'dalil-talib', lesson(n));
    const big = await get('/api/courses/dalil-talib/lessons?limit=500');
    expect(big.headers.get('access-control-allow-origin')).toBe('*');
    const rows = (await big.json()) as any[];
    expect(rows).toHaveLength(50);
    expect(rows[0].number).toBe(60);
    const page = (await (await get('/api/courses/dalil-talib/lessons?before=10&limit=3')).json()) as any[];
    expect(page.map((l) => l.number)).toEqual([9, 8, 7]);
  });

  it('falls back to defaults on invalid params', async () => {
    for (let n = 1; n <= 30; n++) await insertLessonIfNew(env.DB, 'dalil-talib', lesson(n));
    const rows = (await (await get('/api/courses/dalil-talib/lessons?before=abc&limit=-3')).json()) as any[];
    expect(rows).toHaveLength(20);
    expect(rows[0].number).toBe(30);
  });
});
