import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  ensureSection,
  insertLessonIfNew,
  latestLessons,
  lessonsBefore,
  nextInSequence,
  patchLesson,
  pendingTranscriptions,
  previousInSequence,
  setRecordingUrl,
  upsertCourse,
} from '../src/repo';

const db = env.DB;
const course = { title: 'D', slot: 'asr' as const, place: '', weekdays: [4], offsetMin: 10, seriesId: 69, pdfUrls: ['u1'], active: true };

const add = (courseId: string, number: number, section: string, sectionNumber: number | null) =>
  insertLessonIfNew(db, courseId, {
    number,
    section,
    sectionNumber,
    hijriDate: `${number}-01-1448`,
    startPoint: `${section} ${sectionNumber}`,
    recordingUrl: null,
    detailPath: `/d/${courseId}/${number}`,
  });

describe('sequence order', () => {
  it('orders a late lesson into its place and chains the start page from its sequence predecessor', async () => {
    await upsertCourse(db, 'seq-late', course);
    await add('seq-late', 1, 'كتاب الحدود', 10);
    await patchLesson(db, 'seq-late', 1, { endPage: 40, endPdfIndex: 0 });
    await add('seq-late', 2, 'كتاب الحدود', 12);
    await add('seq-late', 3, 'كتاب الحدود', 11);

    expect((await latestLessons(db, 'seq-late', 10)).map((l) => l.number)).toEqual([2, 3, 1]);
    expect((await previousInSequence(db, 'seq-late', 2))?.number).toBe(3);
    expect((await nextInSequence(db, 'seq-late', 1))?.number).toBe(3);
    expect(await previousInSequence(db, 'seq-late', 1)).toBeNull();
    expect(await nextInSequence(db, 'seq-late', 2)).toBeNull();
    const lessons = await latestLessons(db, 'seq-late', 10);
    expect(lessons.find((l) => l.number === 3)).toMatchObject({ startPage: 40, pdfIndex: 0 });
  });

  it('re-chains the sequence-next lesson when a lesson gets its end page', async () => {
    await upsertCourse(db, 'seq-rechain', course);
    await add('seq-rechain', 1, 'كتاب الحدود', 10);
    await add('seq-rechain', 2, 'كتاب الحدود', 12);
    await add('seq-rechain', 3, 'كتاب الحدود', 11);
    await patchLesson(db, 'seq-rechain', 1, { endPage: 40 });
    await patchLesson(db, 'seq-rechain', 3, { endPage: 55 });
    const byNumber = Object.fromEntries((await latestLessons(db, 'seq-rechain', 10)).map((l) => [l.number, l]));
    expect(byNumber[3].startPage).toBe(40);
    expect(byNumber[2].startPage).toBe(55);
  });

  it('gives a new section the next ord and orders sections by ord', async () => {
    await upsertCourse(db, 'seq-sections', course);
    await add('seq-sections', 1, 'كتاب القضاء', 7);
    await add('seq-sections', 2, 'كتاب الشهادات', 1);
    const qada = await ensureSection(db, 'seq-sections', 'كتاب القضاء');
    const shahadat = await ensureSection(db, 'seq-sections', 'كتاب الشهادات');
    expect(shahadat).toBe(qada + 1);
    expect(await ensureSection(db, 'seq-sections', 'كتاب القضاء')).toBe(qada);

    expect((await nextInSequence(db, 'seq-sections', 1))?.number).toBe(2);
    expect(await nextInSequence(db, 'seq-sections', 1)).toMatchObject({ section: 'كتاب الشهادات', sectionNumber: 1 });
    expect((await previousInSequence(db, 'seq-sections', 2))?.number).toBe(1);
    expect((await lessonsBefore(db, 'seq-sections', 2, 5)).map((l) => l.number)).toEqual([1]);
    expect(await lessonsBefore(db, 'seq-sections', 1, 5)).toEqual([]);
  });

  it('orders a lesson without a section number after the numbered ones of its section, by number', async () => {
    await upsertCourse(db, 'seq-legacy', course);
    await add('seq-legacy', 5, 'كتاب الصدقات', null);
    await add('seq-legacy', 6, 'كتاب الصدقات', 2);
    await add('seq-legacy', 7, 'كتاب الصدقات', null);
    await add('seq-legacy', 8, 'كتاب الصدقات', 1);
    expect((await latestLessons(db, 'seq-legacy', 10)).map((l) => l.number)).toEqual([7, 5, 6, 8]);
    expect((await previousInSequence(db, 'seq-legacy', 5))?.number).toBe(6);
    expect((await nextInSequence(db, 'seq-legacy', 6))?.number).toBe(5);
  });

  it('keeps lessons of an unregistered section visible and first', async () => {
    await upsertCourse(db, 'seq-plain', course);
    await add('seq-plain', 1, '', 1);
    await add('seq-plain', 2, 'كتاب الحدود', 1);
    expect((await latestLessons(db, 'seq-plain', 10)).map((l) => l.number)).toEqual([2, 1]);
  });

  it('pendingTranscriptions takes the next start point and prevNumber from the sequence', async () => {
    await upsertCourse(db, 'seq-pend', course);
    await add('seq-pend', 1, 'كتاب القضاء', 7);
    await add('seq-pend', 2, 'كتاب الشهادات', 1);
    await add('seq-pend', 3, 'كتاب القضاء', 8);
    await setRecordingUrl(db, 'seq-pend', 1, 'r1');
    await setRecordingUrl(db, 'seq-pend', 3, 'r3');
    const pending = (await pendingTranscriptions(db)).filter((p) => p.courseId === 'seq-pend');
    expect(pending.map(({ number, nextStartPoint, prevNumber }) => ({ number, nextStartPoint, prevNumber }))).toEqual([
      { number: 1, nextStartPoint: 'كتاب القضاء 8', prevNumber: null },
      { number: 3, nextStartPoint: 'كتاب الشهادات 1', prevNumber: 1 },
    ]);
  });

  describe('late arrival re-chains the next lesson', () => {
    const startOf = async (courseId: string, number: number) =>
      (await latestLessons(db, courseId, 20)).find((l) => l.number === number)?.startPage;

    it('drops a stale chained start, then follows the late lesson end page', async () => {
      await upsertCourse(db, 'seq-stale', course);
      await add('seq-stale', 1, 'كتاب الحدود', 10);
      await patchLesson(db, 'seq-stale', 1, { endPage: 40 });
      await add('seq-stale', 2, 'كتاب الحدود', 12);
      expect(await startOf('seq-stale', 2)).toBe(40);
      await add('seq-stale', 3, 'كتاب الحدود', 11);
      expect(await startOf('seq-stale', 2)).toBeNull();
      expect(await startOf('seq-stale', 3)).toBe(40);
      await patchLesson(db, 'seq-stale', 3, { endPage: 55 });
      expect(await startOf('seq-stale', 2)).toBe(55);
    });

    it('never overwrites a start page set by an explicit patch', async () => {
      await upsertCourse(db, 'seq-explicit', course);
      await add('seq-explicit', 1, 'كتاب الحدود', 10);
      await patchLesson(db, 'seq-explicit', 1, { endPage: 40 });
      await add('seq-explicit', 2, 'كتاب الحدود', 12);
      await patchLesson(db, 'seq-explicit', 2, { startPage: 41 });
      await add('seq-explicit', 3, 'كتاب الحدود', 11);
      expect(await startOf('seq-explicit', 2)).toBe(41);
      await patchLesson(db, 'seq-explicit', 3, { endPage: 55 });
      expect(await startOf('seq-explicit', 2)).toBe(41);
    });
  });

  it('orders a legacy row and a new row by number after the migration backfill', async () => {
    await upsertCourse(db, 'seq-backfill', course);
    await db
      .prepare(
        `INSERT INTO lessons (course_id, number, hijri_date, start_point, detail_path, created_at)
         VALUES ('seq-backfill', 4, '', 'p', '/d/4', '')`,
      )
      .run();
    await db.prepare("UPDATE lessons SET section_number = number WHERE section_number IS NULL").run();
    await add('seq-backfill', 5, '', 5);
    expect((await latestLessons(db, 'seq-backfill', 10)).map((l) => l.number)).toEqual([5, 4]);
    expect((await previousInSequence(db, 'seq-backfill', 5))?.number).toBe(4);
  });
});
