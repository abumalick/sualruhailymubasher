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
    expect(all.map((c) => c.sort)).toEqual([...all.map((c) => c.sort)].sort((a, b) => a - b));
  });

  it('upserts and filters by activeOnly', async () => {
    const input = { title: 'T', slot: 'fajr' as const, weekdays: [1], time: '05:00', seriesId: 9, pdfUrls: [], active: false };
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

  it('pendingTranscriptions: recording set, no end_page, oldest first', async () => {
    const course = { title: 'P', slot: 'fajr' as const, weekdays: [1], time: '05:00', seriesId: 1, pdfUrls: ['u1'], active: true };
    await upsertCourse(db, 'l-pend', course);
    for (const n of [3, 1, 2, 4]) await insertLessonIfNew(db, 'l-pend', lesson(n));
    await setRecordingUrl(db, 'l-pend', 3, 'r3');
    await setRecordingUrl(db, 'l-pend', 1, 'r1');
    await setRecordingUrl(db, 'l-pend', 2, 'r2');
    await patchLesson(db, 'l-pend', 2, { endPage: 5 });
    const pending = (await pendingTranscriptions(db)).filter((p) => p.courseId === 'l-pend');
    expect(pending).toEqual([
      { courseId: 'l-pend', number: 1, recordingUrl: 'r1', startPoint: 'point 1', pdfUrls: ['u1'] },
      { courseId: 'l-pend', number: 3, recordingUrl: 'r3', startPoint: 'point 3', pdfUrls: ['u1'] },
    ]);
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
