import type { ExceptionDTO } from '@sualruhaily/shared';
import { describe, expect, it } from 'vitest';
import { asrTime } from '../src/prayer';
import { courseInWindow, isLessonDay, lessonTime, nextLessonDate } from '../src/schedule';
import type { CourseRow } from '../src/repo';
import { addDays, hijriToMedinaDate, isRecentDate, medinaDate, medinaInstant, normalizeHijri, weekday } from '../src/time';

const tafsir: CourseRow = {
  id: 'tafsir-saadi', title: 'شرح تفسير السعدي', slot: 'fajr', place: '', weekdays: [0, 1, 2, 3, 4, 5],
  offsetMin: 25, seriesId: 456, pdfUrls: [], edition: null, pageOffsets: [], lessonWord: 'الدرس', active: true, sort: 1,
};
const tawhid: CourseRow = {
  id: 'kitab-tawhid', title: 'كتاب التوحيد', slot: 'maghrib', place: '', weekdays: [0, 1, 2, 3, 4],
  offsetMin: 30, seriesId: 481, pdfUrls: [], edition: null, pageOffsets: [], lessonWord: 'الدرس', active: true, sort: 2,
};
const kitab: CourseRow = {
  id: 'kitab-tawhid', title: 'شرح كتاب التوحيد', slot: 'fajr', place: 'المسجد النبوي (الغربية)', weekdays: [6],
  offsetMin: 33, seriesId: 287, pdfUrls: [], edition: null, pageOffsets: [], lessonWord: 'الدرس', active: true, sort: 1,
};
const kabair: CourseRow = {
  id: 'kabair', title: 'شرح كتاب الكبائر للذهبي', slot: 'asr', place: 'مسجد قباء', weekdays: [2],
  offsetMin: 26, seriesId: 251, pdfUrls: [], edition: null, pageOffsets: [], lessonWord: 'الدرس', active: true, sort: 2,
};
const dalil: CourseRow = {
  id: 'dalil-talib', title: 'شرح دليل الطالب', slot: 'asr', place: 'المسجد النبوي (حلقة ٢)', weekdays: [4, 5, 6],
  offsetMin: 29, seriesId: 69, pdfUrls: [], edition: null, pageOffsets: [], lessonWord: 'الدرس', active: true, sort: 4,
};
const ex = (p: Partial<ExceptionDTO> & Pick<ExceptionDTO, 'kind' | 'dateFrom'>): ExceptionDTO => ({
  id: 1, courseId: null, dateTo: null, time: null, note: '', ...p,
});

describe('time', () => {
  it('converts between Medina dates and instants', () => {
    expect(medinaDate(new Date('2026-10-30T22:00:00Z'))).toBe('2026-10-31');
    expect(medinaInstant('2026-11-01', '05:25').toISOString()).toBe('2026-11-01T02:25:00.000Z');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(weekday('2026-11-01')).toBe(0);
  });
});

describe('hijriToMedinaDate', () => {
  it('converts an Umm al-Qura date at any distance from now', () => {
    expect(hijriToMedinaDate('09-05-1448')).toBe('2026-10-20');
    expect(hijriToMedinaDate('10-05-1448')).toBe('2026-10-21');
    expect(hijriToMedinaDate('20-05-1448')).toBe('2026-10-31');
    expect(hijriToMedinaDate('01-04-1448')).toBe('2026-09-12');
    expect(hijriToMedinaDate('15-03-1447')).toBe('2025-09-07');
  });

  it('returns null for an impossible or malformed date', () => {
    expect(hijriToMedinaDate('30-01-1448')).toBeNull();
    expect(hijriToMedinaDate('')).toBeNull();
  });
});

describe('isRecentDate', () => {
  const now = new Date('2026-11-15T09:00:00Z');
  it('counts the last 10 days inclusive', () => {
    expect(isRecentDate('2026-11-05', now)).toBe(true);
    expect(isRecentDate('2026-11-04', now)).toBe(false);
    expect(isRecentDate(null, now)).toBe(false);
  });
});

describe('lessonTime', () => {
  it('adds the course offset to Fajr or sunset of that date', () => {
    expect(lessonTime(tafsir, '2026-11-01')).toBe('05:34');
    expect(lessonTime(tawhid, '2026-11-02')).toBe('18:11');
  });

  it('adds the offset to Asr for an asr course', () => {
    expect(asrTime('2026-11-17')).toBe('15:13');
    expect(lessonTime(kabair, '2026-11-17')).toBe('15:39');
  });
});

describe('nextLessonDate', () => {
  it('skips Saturday', () => {
    expect(nextLessonDate(tafsir, [], new Date('2026-10-30T22:00:00Z'))).toEqual({ date: '2026-11-01', time: '05:34' });
  });

  it('keeps a lesson in progress as next until 150 minutes after start', () => {
    expect(nextLessonDate(tafsir, [], new Date('2026-11-01T04:30:00Z'))?.date).toBe('2026-11-01');
    expect(nextLessonDate(tafsir, [], new Date('2026-11-01T05:03:00Z'))?.date).toBe('2026-11-01');
    expect(nextLessonDate(tafsir, [], new Date('2026-11-01T05:05:00Z'))?.date).toBe('2026-11-02');
  });

  it('skips a cancelled day', () => {
    const e = [ex({ kind: 'cancel', courseId: 'kitab-tawhid', dateFrom: '2026-11-02' })];
    expect(nextLessonDate(tawhid, e, new Date('2026-11-02T10:00:00Z'))?.date).toBe('2026-11-03');
  });

  it('ignores exceptions of another course', () => {
    const e = [ex({ kind: 'cancel', courseId: 'tafsir-saadi', dateFrom: '2026-11-03' })];
    expect(nextLessonDate(tawhid, e, new Date('2026-11-02T20:00:00Z'))?.date).toBe('2026-11-03');
  });

  it('skips a pause range', () => {
    const e = [ex({ kind: 'pause', dateFrom: '2026-11-08', dateTo: '2026-11-12' })];
    expect(nextLessonDate(tawhid, e, new Date('2026-11-07T20:00:00Z'))?.date).toBe('2026-11-15');
  });

  it('follows a move', () => {
    const e = [ex({ kind: 'move', courseId: 'kitab-tawhid', dateFrom: '2026-11-03', dateTo: '2026-11-07', time: '19:00' })];
    expect(nextLessonDate(tawhid, e, new Date('2026-11-02T20:00:00Z'))).toEqual({ date: '2026-11-04', time: '18:10' });
    expect(nextLessonDate(tawhid, e, new Date('2026-11-05T20:00:00Z'))).toEqual({ date: '2026-11-07', time: '19:00' });
  });

  it('returns null when nothing is scheduled within 60 days', () => {
    const e = [ex({ kind: 'pause', dateFrom: '2026-11-01', dateTo: '2027-03-01' })];
    expect(nextLessonDate(tawhid, e, new Date('2026-10-31T00:00:00Z'))).toBeNull();
  });
});

describe('isLessonDay', () => {
  it('holds an extra lesson on a normally free day', () => {
    const e = [ex({ kind: 'extra', courseId: 'kitab-tawhid', dateFrom: '2026-11-06', time: '18:20' })];
    expect(isLessonDay(tawhid, '2026-11-06', e)).toEqual({ held: true, time: '18:20' });
    expect(isLessonDay(tawhid, '2026-11-06', [])).toMatchObject({ held: false });
  });

  it('uses the prayer-relative time when an extra has none', () => {
    const e = [ex({ kind: 'extra', dateFrom: '2026-11-06' })];
    expect(isLessonDay(tawhid, '2026-11-06', e)).toEqual({ held: true, time: '18:09' });
  });

  it('moves a lesson from dateFrom to dateTo', () => {
    const e = [ex({ kind: 'move', dateFrom: '2026-11-03', dateTo: '2026-11-06', time: '17:00' })];
    expect(isLessonDay(tawhid, '2026-11-03', e).held).toBe(false);
    expect(isLessonDay(tawhid, '2026-11-06', e)).toEqual({ held: true, time: '17:00' });
  });
});

describe('courseInWindow', () => {
  const courses = [tafsir, tawhid];

  it('finds the course whose window contains the instant', () => {
    expect(courseInWindow(courses, [], new Date('2026-11-02T02:15:00Z'))?.id).toBe('tafsir-saadi');
    expect(courseInWindow(courses, [], new Date('2026-11-02T04:55:00Z'))?.id).toBe('tafsir-saadi');
    expect(courseInWindow(courses, [], new Date('2026-11-02T15:30:00Z'))?.id).toBe('kitab-tawhid');
  });

  it('follows the prayer time across the year', () => {
    // Mixlr start times observed on this channel (Medina): 04:47 2026-05-07, 06:03 2026-02-23, 18:15 2026-10-22
    expect(courseInWindow(courses, [], new Date('2026-05-07T01:47:00Z'))?.id).toBe('tafsir-saadi');
    expect(courseInWindow(courses, [], new Date('2026-02-23T03:03:00Z'))?.id).toBe('tafsir-saadi');
    expect(courseInWindow(courses, [], new Date('2026-10-22T15:15:00Z'))?.id).toBe('kitab-tawhid');
    expect(courseInWindow(courses, [], new Date('2026-11-02T02:12:00Z'))).toBeNull();
  });

  it('returns null outside every window', () => {
    expect(courseInWindow(courses, [], new Date('2026-11-02T08:00:00Z'))).toBeNull();
    expect(courseInWindow(courses, [], new Date('2026-11-06T15:30:00Z'))).toBeNull();
  });

  it('honours an extra lesson and a cancellation', () => {
    const extra = [ex({ kind: 'extra', courseId: 'kitab-tawhid', dateFrom: '2026-11-06' })];
    expect(courseInWindow(courses, extra, new Date('2026-11-06T15:30:00Z'))?.id).toBe('kitab-tawhid');
    const cancel = [ex({ kind: 'cancel', courseId: 'kitab-tawhid', dateFrom: '2026-11-02' })];
    expect(courseInWindow(courses, cancel, new Date('2026-11-02T15:30:00Z'))).toBeNull();
  });
});

describe('asr courses', () => {
  const start = medinaInstant('2026-11-17', lessonTime(kabair, '2026-11-17')).getTime();
  const at = (offsetMin: number) => new Date(start + offsetMin * 60_000);

  it('opens the window 20 minutes before the start and closes it 150 minutes after', () => {
    expect(courseInWindow([kabair], [], at(-20))?.id).toBe('kabair');
    expect(courseInWindow([kabair], [], at(150))?.id).toBe('kabair');
    expect(courseInWindow([kabair], [], at(151))).toBeNull();
    expect(courseInWindow([kabair], [], at(-21))).toBeNull();
  });

  it('picks the fajr or the asr course of a Saturday by the time of day', () => {
    const courses = [kitab, kabair, dalil];
    const fajr = medinaInstant('2026-11-21', lessonTime(kitab, '2026-11-21'));
    const asr = medinaInstant('2026-11-21', lessonTime(dalil, '2026-11-21'));
    expect(courseInWindow(courses, [], fajr)?.id).toBe('kitab-tawhid');
    expect(courseInWindow(courses, [], asr)?.id).toBe('dalil-talib');
  });

  it('picks the same Saturday course whatever the order of the course list', () => {
    const courses = [dalil, kabair, kitab];
    const fajr = medinaInstant('2026-11-21', lessonTime(kitab, '2026-11-21'));
    const asr = medinaInstant('2026-11-21', lessonTime(dalil, '2026-11-21'));
    expect(courseInWindow(courses, [], fajr)?.id).toBe('kitab-tawhid');
    expect(courseInWindow(courses, [], asr)?.id).toBe('dalil-talib');
  });
});

describe('normalizeHijri', () => {
  it.each([
    ['٢٧/ ٥/ ١٤٤٨', '27-05-1448'],
    ['1448/5/20', '20-05-1448'],
    ['27-05-1448', '27-05-1448'],
    ['٢٠ / ٠٥ / ١٤٤٨', '20-05-1448'],
    ['۲۷/۵/۱۴۴۸', '27-05-1448'],
  ])('%s -> %s', (raw, want) => expect(normalizeHijri(raw)).toBe(want));

  it.each(['', 'tomorrow', '27/5', '32/5/1448', '27/13/1448', '0/5/1448', '27/5/148'])('rejects %j', (raw) =>
    expect(normalizeHijri(raw)).toBeNull(),
  );
});
