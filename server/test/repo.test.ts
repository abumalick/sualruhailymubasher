import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  addException,
  deleteException,
  getLive,
  getSetting,
  insertLessonIfNew,
  latestLessons,
  lessonsBefore,
  listCourses,
  listExceptions,
  markSent,
  patchLesson,
  pendingTranscriptions,
  expectedNextNumber,
  recordBroadcast,
  setLive,
  setRecordingUrl,
  setSetting,
  upsertCourse,
} from '../src/repo';

const db = env.DB;
const lesson = (number: number) => ({
  number,
  hijriDate: `${number}-01-1448`,
  startPoint: `point ${number}`,
  recordingUrl: null,
  detailPath: `/detail/${number}`,
});

describe('courses', () => {
  it('lists seeded courses with decoded fields', async () => {
    const all = await listCourses(db);
    const t = all.find((c) => c.id === 'kitab-tawhid');
    expect(t?.weekdays).toEqual([0, 1, 2, 3, 4]);
    expect(t?.pdfUrls).toHaveLength(3);
    expect(t?.seriesId).toBe(481);
    expect(t?.active).toBe(true);
    expect(t?.offsetMin).toBe(30);
    expect(all.find((c) => c.id === 'tafsir-saadi')?.offsetMin).toBe(25);
    expect(all.map((c) => c.sort)).toEqual([...all.map((c) => c.sort)].sort((a, b) => a - b));
  });

  it('upserts and filters by activeOnly', async () => {
    const input = { title: 'T', slot: 'fajr' as const, weekdays: [1], offsetMin: 10, seriesId: 9, pdfUrls: [], active: false };
    await upsertCourse(db, 'c-up', input);
    expect((await listCourses(db)).find((c) => c.id === 'c-up')?.active).toBe(false);
    expect((await listCourses(db, { activeOnly: true })).some((c) => c.id === 'c-up')).toBe(false);
    await upsertCourse(db, 'c-up', { ...input, title: 'T2', active: true });
    const c = (await listCourses(db, { activeOnly: true })).find((x) => x.id === 'c-up');
    expect(c?.title).toBe('T2');
  });
});

describe('lessons', () => {
  it('insertLessonIfNew returns true then false and sets created_at', async () => {
    expect(await insertLessonIfNew(db, 'l-ins', lesson(1))).toBe(true);
    expect(await insertLessonIfNew(db, 'l-ins', lesson(1))).toBe(false);
    const row = await db.prepare('SELECT created_at FROM lessons WHERE course_id = ?').bind('l-ins').first<{ created_at: string }>();
    expect(new Date(row!.created_at).toISOString()).toBe(row!.created_at);
  });

  it('latestLessons and lessonsBefore are newest first, camelCase', async () => {
    for (let n = 1; n <= 5; n++) await insertLessonIfNew(db, 'l-list', lesson(n));
    const latest = await latestLessons(db, 'l-list', 3);
    expect(latest.map((l) => l.number)).toEqual([5, 4, 3]);
    expect(latest[0]).toEqual({
      ...lesson(5),
      pdfIndex: null,
      startPage: null,
      endPoint: null,
      endPage: null,
      endPdfIndex: null,
    });
    expect((await lessonsBefore(db, 'l-list', 4, 2)).map((l) => l.number)).toEqual([3, 2]);
    expect((await lessonsBefore(db, 'l-list', null, 2)).map((l) => l.number)).toEqual([5, 4]);
  });

  it('setRecordingUrl and patchLesson', async () => {
    await insertLessonIfNew(db, 'l-patch', lesson(1));
    await setRecordingUrl(db, 'l-patch', 1, 'https://x/a.mp3');
    expect(await patchLesson(db, 'l-patch', 1, { endPoint: 'e', endPage: 7, pdfIndex: 2 })).toBe(true);
    expect(await patchLesson(db, 'l-patch', 1, {})).toBe(true);
    const [l] = await latestLessons(db, 'l-patch', 1);
    expect(l).toMatchObject({ recordingUrl: 'https://x/a.mp3', endPoint: 'e', endPage: 7, pdfIndex: 2, startPoint: 'point 1' });
    expect(await patchLesson(db, 'l-patch', 99, { endPage: 1 })).toBe(false);
    expect(await patchLesson(db, 'l-patch', 99, {})).toBe(false);
  });

  it('insertLessonIfNew starts a lesson where the previous one ended', async () => {
    await insertLessonIfNew(db, 'l-chain', lesson(1));
    await patchLesson(db, 'l-chain', 1, { pdfIndex: 0, endPage: 40, endPdfIndex: 1 });
    await insertLessonIfNew(db, 'l-chain', lesson(2));
    expect((await latestLessons(db, 'l-chain', 1))[0]).toMatchObject({ number: 2, startPage: 40, pdfIndex: 1 });
    await insertLessonIfNew(db, 'l-chain', lesson(3));
    expect((await latestLessons(db, 'l-chain', 1))[0]).toMatchObject({ number: 3, startPage: null, pdfIndex: null });
  });

  it('pendingTranscriptions: recording set, no end_page, among the newest 3, oldest first', async () => {
    const course = { title: 'P', slot: 'fajr' as const, weekdays: [1], offsetMin: 10, seriesId: 1, pdfUrls: ['u1'], active: true };
    await upsertCourse(db, 'l-pend', course);
    for (const n of [3, 1, 2, 4]) await insertLessonIfNew(db, 'l-pend', lesson(n));
    await setRecordingUrl(db, 'l-pend', 3, 'r3');
    await setRecordingUrl(db, 'l-pend', 1, 'r1');
    await setRecordingUrl(db, 'l-pend', 2, 'r2');
    await patchLesson(db, 'l-pend', 2, { endPage: 5 });
    const pending = (await pendingTranscriptions(db)).filter((p) => p.courseId === 'l-pend');
    expect(pending).toEqual([{ courseId: 'l-pend', number: 3, recordingUrl: 'r3', startPoint: 'point 3', pdfUrls: ['u1'] }]);
  });

  it('pendingTranscriptions ignores a backfilled backlog', async () => {
    const course = { title: 'B', slot: 'fajr' as const, weekdays: [1], offsetMin: 10, seriesId: 1, pdfUrls: [], active: true };
    for (const id of ['l-back', 'l-back2']) {
      await upsertCourse(db, id, course);
      for (let n = 1; n <= 10; n++) {
        await insertLessonIfNew(db, id, lesson(n));
        await setRecordingUrl(db, id, n, `r${n}`);
      }
    }
    const pending = (await pendingTranscriptions(db)).filter((p) => p.courseId.startsWith('l-back'));
    expect(pending.map((p) => `${p.courseId}:${p.number}`)).toEqual([
      'l-back:8', 'l-back:9', 'l-back:10', 'l-back2:8', 'l-back2:9', 'l-back2:10',
    ]);
  });
});

describe('expectedNextNumber', () => {
  const backdate = (courseId: string) =>
    db.prepare("UPDATE lessons SET created_at = '2026-10-01T00:00:00.000Z' WHERE course_id = ?").bind(courseId).run();

  // hijri dates of lesson() are months away from this instant, so created_at is the anchor
  const FALLBACK_NOW = new Date('2026-11-01T00:00:00Z');

  it('counts lesson days broadcast after the latest scraped lesson (created_at fallback)', async () => {
    expect(await expectedNextNumber(db, 'n-none', '2026-11-01', FALLBACK_NOW)).toBe(1);
    await recordBroadcast(db, 'n0', 'n-none', '2026-10-20T02:30:00.000Z');
    expect(await expectedNextNumber(db, 'n-none', '2026-11-01', FALLBACK_NOW)).toBe(2);

    await insertLessonIfNew(db, 'n-c', lesson(7));
    await backdate('n-c');
    expect(await expectedNextNumber(db, 'n-c', '2026-11-01', FALLBACK_NOW)).toBe(8);
    await recordBroadcast(db, 'b1', 'n-c', '2026-09-30T02:30:00.000Z');
    await recordBroadcast(db, 'b2', 'n-c', '2026-10-20T02:30:00.000Z');
    await recordBroadcast(db, 'b2', 'n-c', '2026-10-20T02:30:00.000Z');
    await recordBroadcast(db, 'b3', 'n-c', '2026-10-20T03:10:00.000Z');
    await recordBroadcast(db, 'b4', 'other', '2026-10-21T02:30:00.000Z');
    await recordBroadcast(db, 'b5', null, '2026-10-21T02:30:00.000Z');
    expect(await expectedNextNumber(db, 'n-c', '2026-11-01', FALLBACK_NOW)).toBe(9);
    expect(await expectedNextNumber(db, 'n-c', '2026-10-20', FALLBACK_NOW)).toBe(8);

    await insertLessonIfNew(db, 'n-c', lesson(8));
    expect(await expectedNextNumber(db, 'n-c', '2026-11-01', FALLBACK_NOW)).toBe(9);
  });
});

describe('expectedNextNumber anchored on the held date', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const held = (number: number, hijriDate: string) =>
    insertLessonIfNew(db, 'h-c', { ...lesson(number), hijriDate });

  it('still counts the next broadcast when the lesson is published after it', async () => {
    await recordBroadcast(db, 'h7', 'h-c', '2026-10-20T02:30:00.000Z');
    await recordBroadcast(db, 'h8', 'h-c', '2026-10-21T02:30:00.000Z');
    await held(7, '09-05-1448');
    expect(await expectedNextNumber(db, 'h-c', '2026-10-22', now)).toBe(9);
    await held(8, '10-05-1448');
    expect(await expectedNextNumber(db, 'h-c', '2026-10-22', now)).toBe(9);
  });
});

describe('exceptions', () => {
  it('add, list relevant from date, delete', async () => {
    const past = await addException(db, { courseId: null, kind: 'cancel', dateFrom: '2020-01-01' });
    const ranged = await addException(db, { courseId: 'x', kind: 'pause', dateFrom: '2020-01-05', dateTo: '2020-02-10', note: 'n' });
    const future = await addException(db, { courseId: 'x', kind: 'move', dateFrom: '2020-03-01', dateTo: '2020-03-02', time: '19:00' });
    const list = (await listExceptions(db, '2020-02-01')).filter((e) => [past, ranged, future].includes(e.id));
    expect(list.map((e) => e.id)).toEqual([ranged, future]);
    expect(list[0]).toEqual({ id: ranged, courseId: 'x', kind: 'pause', dateFrom: '2020-01-05', dateTo: '2020-02-10', time: null, note: 'n' });
    expect(list[1]!.time).toBe('19:00');
    expect(await deleteException(db, ranged)).toBe(true);
    expect(await deleteException(db, ranged)).toBe(false);
  });
});

describe('live and settings', () => {
  it('round-trips live state', async () => {
    expect(await getLive(db)).toEqual({ isLive: false, broadcastUid: null, streamUrl: null, courseId: null, startedAt: null });
    const s = { isLive: true, broadcastUid: 'u', streamUrl: 's', courseId: 'c', startedAt: '2026-01-01T00:00:00.000Z' };
    await setLive(db, s);
    expect(await getLive(db)).toEqual(s);
  });

  it('settings', async () => {
    expect(await getSetting(db, 'live_mode')).toBe('embed');
    expect(await getSetting(db, 'nope')).toBeNull();
    await setSetting(db, 'live_mode', 'direct');
    expect(await getSetting(db, 'live_mode')).toBe('direct');
  });

  it('markSent is true only once', async () => {
    expect(await markSent(db, 'live:abc')).toBe(true);
    expect(await markSent(db, 'live:abc')).toBe(false);
  });
});
