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
