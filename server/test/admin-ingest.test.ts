import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestIndex, SlotCancellationResult } from '@sualruhaily/shared';
import type { Fcm } from '../src/fcm';
import type { Env } from '../src/index';
import { adminRoutes } from '../src/routes/admin';

const app = new Hono<{ Bindings: Env }>();
app.use('*', async (c, next) => {
  const set = (c as unknown as { set: (k: string, v: unknown) => void }).set;
  set('fcm', { sendToTopic: vi.fn() } as unknown as Fcm);
  set('now', new Date('2026-11-15T09:00:00Z'));
  await next();
});
app.route('/', adminRoutes);

const call = (method: string, path: string, body?: unknown, token: string | null = env.ADMIN_TOKEN) =>
  app.request(
    path,
    {
      method,
      headers: {
        ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );

const cancel = (body: unknown, token: string | null = env.ADMIN_TOKEN) => call('POST', '/api/admin/slot-cancellations', body, token);

const BY_DATE = { sourceRef: 'tg:971', slot: 'asr', date: '2026-10-10', note: 'اعتذار الشيخ عن درس العصر' };

const exceptionRows = async () =>
  (await env.DB.prepare('SELECT course_id, kind, date_from, note, source_ref FROM exceptions ORDER BY id').all()).results;

beforeEach(async () => {
  await env.DB.exec('DELETE FROM exceptions');
  await env.DB.exec('DELETE FROM lessons');
  await env.DB.exec('DELETE FROM sections');
});

describe('POST /api/admin/slot-cancellations', () => {
  it('cancels every course of the slot on a date', async () => {
    const res = await cancel(BY_DATE);
    expect(res.status).toBe(200);
    expect((await res.json()) as SlotCancellationResult).toEqual({ date: '2026-10-10', courseIds: ['dalil-talib'], created: 1 });
    expect(await exceptionRows()).toEqual([
      { course_id: 'dalil-talib', kind: 'cancel', date_from: '2026-10-10', note: BY_DATE.note, source_ref: 'tg:971' },
    ]);
  });

  it('is idempotent per ref', async () => {
    await cancel(BY_DATE);
    const res = await cancel(BY_DATE);
    expect((await res.json()) as SlotCancellationResult).toEqual({ date: '2026-10-10', courseIds: ['dalil-talib'], created: 0 });
    expect(await exceptionRows()).toHaveLength(1);
  });

  it('accepts a Hijri date', async () => {
    const res = await cancel({ sourceRef: 'tg:1093', slot: 'asr', hijriDate: '1448/6/1', note: 'محاضرة: خطر الإشاعات على العقيدة والفكر' });
    expect(res.status).toBe(200);
    expect((await res.json()) as SlotCancellationResult).toMatchObject({ date: '2026-11-11', courseIds: ['targhib'] });
  });

  it('answers 200 with nothing created when no course sits in that slot that day', async () => {
    const res = await cancel({ ...BY_DATE, date: '2026-11-15' });
    expect(res.status).toBe(200);
    expect((await res.json()) as SlotCancellationResult).toEqual({ date: '2026-11-15', courseIds: [], created: 0 });
    expect(await exceptionRows()).toEqual([]);
  });

  it.each([
    ['both dates', { ...BY_DATE, hijriDate: '1448/6/1' }],
    ['neither date', { sourceRef: 'tg:1', slot: 'asr', note: 'x' }],
    ['a garbage Hijri date', { sourceRef: 'tg:1', slot: 'asr', hijriDate: 'garbage', note: 'x' }],
    ['an empty sourceRef', { ...BY_DATE, sourceRef: '' }],
    ['a non-string note', { ...BY_DATE, note: 3 }],
    ['an unknown slot', { ...BY_DATE, slot: 'dhuhr' }],
    ['an impossible date', { ...BY_DATE, date: '2026-02-30' }],
  ])('rejects %s', async (_, body) => {
    expect((await cancel(body)).status).toBe(400);
    expect(await exceptionRows()).toEqual([]);
  });

  it('requires the admin token', async () => {
    expect((await cancel(BY_DATE, null)).status).toBe(401);
  });
});

describe('GET /api/admin/ingest-index', () => {
  it('lists ingested lessons and cancellation refs only', async () => {
    const lesson = (n: number, recordingUrl: string | null) => ({
      courseId: 'kitab-tawhid', section: '', sectionNumber: n, hijriDate: '27/ 5/ 1448', startPoint: `نقطة ${n}`, recordingUrl, sourceRef: `tg:${n}`,
    });
    expect((await call('POST', '/api/admin/lessons', lesson(8, 'https://m/8.mp3'))).status).toBe(200);
    expect((await call('POST', '/api/admin/lessons', lesson(9, null))).status).toBe(200);
    await env.DB.exec(
      "INSERT INTO lessons (course_id, number, hijri_date, start_point, detail_path, created_at) VALUES ('kitab-tawhid', 50, '01-01-1448', 'x', '/d/50', 0)",
    );
    await cancel(BY_DATE);
    await cancel({ ...BY_DATE, slot: 'fajr', date: '2026-11-14' });

    const res = await call('GET', '/api/admin/ingest-index');
    expect(res.status).toBe(200);
    const index = (await res.json()) as IngestIndex;
    expect(index.lessons).toEqual([
      { sourceRef: 'tg:8', courseId: 'kitab-tawhid', section: '', sectionNumber: 8, recordingUrl: 'https://m/8.mp3' },
      { sourceRef: 'tg:9', courseId: 'kitab-tawhid', section: '', sectionNumber: 9, recordingUrl: null },
    ]);
    expect(index.exceptionRefs).toEqual(['tg:971']);
  });

  it('requires the admin token', async () => {
    expect((await call('GET', '/api/admin/ingest-index', undefined, null)).status).toBe(401);
  });
});

const upload = (file: string, headers: Record<string, string>, body: BodyInit | null = new Uint8Array([1, 2, 3]), token: string | null = env.ADMIN_TOKEN, course = 'dalil-talib') =>
  app.request(
    `/api/admin/media/lessons/${course}/${file}`,
    { method: 'PUT', headers: { ...(token === null ? {} : { Authorization: `Bearer ${token}` }), ...headers }, body },
    env,
  );

describe('PUT /api/admin/media/lessons/:courseId/:file', () => {
  it('stores the body in R2 and returns its public url', async () => {
    const res = await upload('1112.mp3', { 'Content-Type': 'audio/mpeg', 'Content-Length': '3' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: `${env.MEDIA_BASE}/lessons/dalil-talib/1112.mp3` });
    const obj = await env.MEDIA.get('lessons/dalil-talib/1112.mp3');
    expect([...new Uint8Array((await obj?.arrayBuffer()) ?? new ArrayBuffer(0))]).toEqual([1, 2, 3]);
    expect(obj?.httpMetadata?.contentType).toBe('audio/mpeg');
  });

  it('accepts m4a as audio/mp4', async () => {
    expect((await upload('1113.m4a', { 'Content-Type': 'audio/mp4', 'Content-Length': '3' })).status).toBe(200);
  });

  it('refuses a body over the cap', async () => {
    expect((await upload('1114.mp3', { 'Content-Type': 'audio/mpeg', 'Content-Length': '95000001' })).status).toBe(413);
    expect(await env.MEDIA.get('lessons/dalil-talib/1114.mp3')).toBeNull();
  });

  it('refuses a missing length', async () => {
    expect((await upload('1115.mp3', { 'Content-Type': 'audio/mpeg' }, null)).status).toBe(411);
  });

  it('refuses a content type that does not match the extension', async () => {
    expect((await upload('1116.m4a', { 'Content-Type': 'audio/mpeg', 'Content-Length': '3' })).status).toBe(415);
    expect((await upload('1116.mp3', { 'Content-Type': 'video/mp4', 'Content-Length': '3' })).status).toBe(415);
  });

  it('refuses a bad file name or an unknown course', async () => {
    expect((await upload('abc.mp3', { 'Content-Type': 'audio/mpeg', 'Content-Length': '3' })).status).toBe(400);
    expect((await upload('1117.mp3', { 'Content-Type': 'audio/mpeg', 'Content-Length': '3' }, undefined, env.ADMIN_TOKEN, 'nope')).status).toBe(400);
  });

  it('needs the admin token', async () => {
    expect((await upload('1118.mp3', { 'Content-Type': 'audio/mpeg', 'Content-Length': '3' }, undefined, null)).status).toBe(401);
  });
});

describe('ingest heartbeat', () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM settings WHERE key = 'heartbeat_ingest'");
  });

  it('is null before the first beat', async () => {
    expect(await (await call('GET', '/api/admin/heartbeats')).json()).toEqual({ ingest: null });
  });

  it('round-trips a beat stamped with the current time', async () => {
    expect((await call('PUT', '/api/admin/heartbeat/ingest', { ok: false, summary: 'tdl busy' })).status).toBe(204);
    expect(await (await call('GET', '/api/admin/heartbeats')).json()).toEqual({
      ingest: { at: '2026-11-15T09:00:00.000Z', ok: false, summary: 'tdl busy' },
    });
  });

  it('refuses a malformed beat', async () => {
    expect((await call('PUT', '/api/admin/heartbeat/ingest', { ok: 'yes', summary: 'x' })).status).toBe(400);
    expect((await call('PUT', '/api/admin/heartbeat/ingest', { ok: true })).status).toBe(400);
  });
});
