import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonInput, LessonUpsertResult } from '@sualruhaily/shared';
import type { Fcm } from '../src/fcm';
import type { Env } from '../src/index';
import { latestLessons, lessonsBefore, patchLesson, upsertCourse } from '../src/repo';
import { adminRoutes } from '../src/routes/admin';

const sendToTopic = vi.fn();
const NOW = new Date('2026-11-15T09:00:00Z');
const app = new Hono<{ Bindings: Env }>();
app.use('*', async (c, next) => {
  const set = (c as unknown as { set: (k: string, v: unknown) => void }).set;
  set('fcm', { sendToTopic } as unknown as Fcm);
  set('now', NOW);
  await next();
});
app.route('/', adminRoutes);

const post = (body: unknown, token: string | null = env.ADMIN_TOKEN) =>
  app.request(
    '/api/admin/lessons',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token === null ? {} : { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify(body),
    },
    env,
  );

const input = (courseId: string, sectionNumber: number, over: Partial<LessonInput> = {}): LessonInput => ({
  courseId,
  section: '',
  sectionNumber,
  hijriDate: '27/ 5/ 1448',
  startPoint: `نقطة ${sectionNumber}`,
  recordingUrl: null,
  sourceRef: `${courseId}:${sectionNumber}`,
  ...over,
});

const send = async (body: LessonInput) => {
  const res = await post(body);
  expect(res.status).toBe(200);
  return (await res.json()) as LessonUpsertResult;
};

const TAWHID = { title: 'شرح كتاب التوحيد', slot: 'fajr' as const, place: '', weekdays: [6], offsetMin: 33, seriesId: 1, pdfUrls: [], active: true };
const KABAIR = { ...TAWHID, title: 'شرح كتاب الكبائر', slot: 'asr' as const, weekdays: [2] };

beforeEach(async () => {
  sendToTopic.mockReset().mockResolvedValue(undefined);
  await env.DB.exec('DELETE FROM sent_notifications');
  await env.DB.exec('DELETE FROM lessons');
  await env.DB.exec('DELETE FROM sections');
  await upsertCourse(env.DB, 'kitab-tawhid', TAWHID);
  await upsertCourse(env.DB, 'kabair', KABAIR);
});

describe('POST /api/admin/lessons', () => {
  it('pushes only a new recording on the newest lesson of a course that already had lessons', async () => {
    expect(await send(input('kitab-tawhid', 8))).toMatchObject({ number: 1, created: true, pushed: false });
    expect(await send(input('kitab-tawhid', 9))).toMatchObject({ number: 2, created: true, pushed: false });
    expect(sendToTopic).not.toHaveBeenCalled();

    const tenth = input('kitab-tawhid', 10, { recordingUrl: 'https://m/10.mp3' });
    expect(await send(tenth)).toMatchObject({ number: 3, created: true, pushed: true });
    expect(sendToTopic).toHaveBeenCalledTimes(1);
    expect(sendToTopic.mock.calls[0][0]).toBe('c-kitab-tawhid-rec');
    expect(sendToTopic.mock.calls[0][1]).toMatchObject({
      body: 'شرح كتاب التوحيد · الدرس ١٠',
      data: { kind: 'rec', courseId: 'kitab-tawhid', number: '3' },
    });

    expect(await send({ ...tenth, sourceRef: 'kitab-tawhid:10b' })).toMatchObject({ number: 3, created: false, pushed: false });
    expect(sendToTopic).toHaveBeenCalledTimes(1);

    expect(await send(input('kitab-tawhid', 7, { recordingUrl: 'https://m/7.mp3' }))).toMatchObject({ created: true, pushed: false });
    expect(sendToTopic).toHaveBeenCalledTimes(1);
  });

  it('does not push a whole backfill, only a recent newest recording', async () => {
    const dates = ['1/3', '8/3', '15/3', '22/3', '29/3', '6/4', '13/4', '20/4', '27/4'];
    for (const [i, d] of dates.entries()) {
      await send(input('kitab-tawhid', i + 1, { hijriDate: `${d}/1448`, recordingUrl: `https://m/${i + 1}.mp3` }));
    }
    expect(sendToTopic).not.toHaveBeenCalled();
    const tenth = await send(input('kitab-tawhid', 10, { hijriDate: '1448/5/27', recordingUrl: 'https://m/10.mp3' }));
    expect(tenth).toMatchObject({ created: true, pushed: true });
    expect(sendToTopic).toHaveBeenCalledTimes(1);
  });

  it('answers 409 when the identity matches one lesson and the source_ref another', async () => {
    await send(input('kitab-tawhid', 1, { sourceRef: 'a' }));
    await send(input('kitab-tawhid', 2, { sourceRef: 'b' }));
    const res = await post(input('kitab-tawhid', 1, { sourceRef: 'b' }));
    expect(res.status).toBe(409);
    expect((await res.json()) as { error: string }).toHaveProperty('error');
  });

  it('pushes when a recording is added later to the newest lesson, not when it is unchanged', async () => {
    await send(input('kitab-tawhid', 1, { recordingUrl: 'https://m/1.mp3' }));
    await send(input('kitab-tawhid', 2));
    expect(await send(input('kitab-tawhid', 2, { recordingUrl: 'https://m/2.mp3' }))).toMatchObject({ created: false, pushed: true });
    expect(await send(input('kitab-tawhid', 2, { recordingUrl: 'https://m/2.mp3' }))).toMatchObject({ pushed: false });
    expect(sendToTopic).toHaveBeenCalledTimes(1);
  });

  it('updates the start point and keeps an existing recording when the repost has none', async () => {
    await send(input('kitab-tawhid', 5, { recordingUrl: 'https://m/5.mp3' }));
    await send(input('kitab-tawhid', 5, { startPoint: 'جديد', sourceRef: 'x' }));
    const [l] = await latestLessons(env.DB, 'kitab-tawhid', 1);
    expect(l).toMatchObject({ startPoint: 'جديد', recordingUrl: 'https://m/5.mp3', hijriDate: '27-05-1448' });
  });

  it('moves a lesson to the corrected identity when the source_ref matches and the identity is free', async () => {
    const S = 'كتاب الصدقات';
    await send(input('kitab-tawhid', 12, { section: S, sourceRef: 'tg:1' }));
    expect(await send(input('kitab-tawhid', 11, { section: S, sourceRef: 'tg:1' }))).toMatchObject({ number: 1, created: false });
    expect(await latestLessons(env.DB, 'kitab-tawhid', 5)).toMatchObject([{ number: 1, section: S, sectionNumber: 11 }]);
    expect(await send(input('kitab-tawhid', 12, { section: S, sourceRef: 'tg:2' }))).toMatchObject({ number: 2, created: true });
  });

  it('moves a lesson to a corrected section, registering it', async () => {
    await send(input('kitab-tawhid', 1, { section: 'كتاب الحدود', sourceRef: 'tg:1' }));
    await send(input('kitab-tawhid', 1, { section: 'كتاب الشهادات', sourceRef: 'tg:1' }));
    const [l] = await latestLessons(env.DB, 'kitab-tawhid', 1);
    expect(l).toMatchObject({ number: 1, section: 'كتاب الشهادات', sectionNumber: 1 });
    const { results } = await env.DB.prepare("SELECT section FROM sections WHERE course_id = 'kitab-tawhid' ORDER BY ord").all();
    expect(results.map((r) => r.section)).toEqual(['كتاب الحدود', 'كتاب الشهادات']);
  });

  it('re-chains the moved lesson and both its neighbours', async () => {
    const S = 'كتاب الصدقات';
    for (const n of [10, 12, 13]) await send(input('kitab-tawhid', n, { section: S, sourceRef: `tg:${n}` }));
    const [one, two, three] = [1, 2, 3];
    await patchLesson(env.DB, 'kitab-tawhid', one, { pdfIndex: 0, endPage: 40, endPdfIndex: 0 });
    await patchLesson(env.DB, 'kitab-tawhid', two, { endPage: 60, endPdfIndex: 0 });
    await send(input('kitab-tawhid', 12, { section: S, sourceRef: 'tg:12' }));
    const pages = async () => Object.fromEntries((await lessonsBefore(env.DB, 'kitab-tawhid', null, 9)).map((l) => [l.number, l.startPage]));
    expect(await pages()).toEqual({ 1: null, 2: 40, 3: 60 });
    await send(input('kitab-tawhid', 14, { section: S, sourceRef: 'tg:12' }));
    expect(await pages()).toEqual({ 1: null, 2: null, 3: 40 });
    expect(await lessonsBefore(env.DB, 'kitab-tawhid', null, 9)).toMatchObject([{ number: 2, sectionNumber: 14 }, { number: 3 }, { number: 1 }]);
  });

  it('answers 409 when the corrected identity belongs to another lesson', async () => {
    await send(input('kitab-tawhid', 11, { sourceRef: 'a' }));
    await send(input('kitab-tawhid', 12, { sourceRef: 'b' }));
    expect((await post(input('kitab-tawhid', 11, { sourceRef: 'b' }))).status).toBe(409);
    expect((await latestLessons(env.DB, 'kitab-tawhid', 2)).map((l) => l.sectionNumber)).toEqual([12, 11]);
  });

  it('answers 409, not 500, when the source_ref belongs to a lesson of another course', async () => {
    await send(input('kitab-tawhid', 1, { sourceRef: 'tg:9' }));
    await send(input('kabair', 5, { sourceRef: 'tg:5' }));
    expect((await post(input('kabair', 5, { sourceRef: 'tg:9' }))).status).toBe(409);
    expect((await post(input('kabair', 6, { sourceRef: 'tg:9' }))).status).toBe(409);
    expect(await latestLessons(env.DB, 'kabair', 5)).toMatchObject([{ sectionNumber: 5 }]);
  });

  it('keeps the sequence for Kaba\'ir and flags dates that are not a course weekday', async () => {
    const a = await send(input('kabair', 53, { hijriDate: '1448/5/20' }));
    const b = await send(input('kabair', 54, { hijriDate: '1448/5/12' }));
    expect([a.dateFlag, b.dateFlag]).toEqual([true, true]);
    expect((await latestLessons(env.DB, 'kabair', 5)).map((l) => l.number)).toEqual([2, 1]);
    expect(await send(input('kabair', 55, { hijriDate: '٢٣/ ٥/ ١٤٤٨' }))).toMatchObject({ dateFlag: false });
  });

  it('registers sections in order of arrival', async () => {
    await send(input('kitab-tawhid', 1, { section: 'كتاب الشهادات' }));
    await send(input('kitab-tawhid', 1, { section: 'كتاب الحدود', sourceRef: 'h1' }));
    const { results } = await env.DB.prepare("SELECT section FROM sections WHERE course_id = 'kitab-tawhid' AND section <> '' ORDER BY ord").all();
    expect(results.map((r) => r.section)).toEqual(['كتاب الشهادات', 'كتاب الحدود']);
  });

  it('rejects a bad token, an unknown course and an invalid body', async () => {
    expect((await post(input('kabair', 1), 'wrong')).status).toBe(401);
    expect((await post(input('nope', 1))).status).toBe(400);
    expect((await post(input('kabair', 0))).status).toBe(400);
    expect((await post(input('kabair', 1.5))).status).toBe(400);
    expect((await post(input('kabair', 1, { hijriDate: 'tomorrow' }))).status).toBe(400);
    expect((await post({ ...input('kabair', 1), sourceRef: undefined })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
  });

  it('still answers 200 when the push fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await send(input('kitab-tawhid', 1));
    sendToTopic.mockRejectedValue(new Error('fcm down'));
    expect(await send(input('kitab-tawhid', 2, { recordingUrl: 'https://m/2.mp3' }))).toMatchObject({ created: true, pushed: false });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
