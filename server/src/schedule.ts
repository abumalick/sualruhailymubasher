import type { ExceptionDTO } from '@sualruhaily/shared';
import { fajrMinutes, formatMinutes, sunsetMinutes } from './prayer';
import type { CourseRow } from './repo';
import { addDays, medinaDate, medinaInstant, weekday } from './time';

const LESSON_MS = 150 * 60_000;
const LEAD_MS = 20 * 60_000;
const SEARCH_DAYS = 60;

const applies = (e: ExceptionDTO, courseId: string) => e.courseId === null || e.courseId === courseId;
const covers = (e: ExceptionDTO, date: string) => e.dateFrom <= date && date <= (e.dateTo ?? e.dateFrom);

export function lessonTime(course: CourseRow, date: string): string {
  const prayer = course.slot === 'fajr' ? fajrMinutes(date) : sunsetMinutes(date);
  return formatMinutes(prayer + course.offsetMin);
}

export function isLessonDay(
  course: CourseRow,
  date: string,
  exceptions: ExceptionDTO[],
): { held: boolean; time: string } {
  const mine = exceptions.filter((e) => applies(e, course.id));
  const added = mine.find(
    (e) => (e.kind === 'extra' && covers(e, date)) || (e.kind === 'move' && e.dateTo === date),
  );
  if (added) return { held: true, time: added.time ?? lessonTime(course, date) };

  const removed = mine.some(
    (e) =>
      ((e.kind === 'cancel' || e.kind === 'pause') && covers(e, date)) ||
      (e.kind === 'move' && e.dateFrom === date),
  );
  return { held: !removed && course.weekdays.includes(weekday(date)), time: lessonTime(course, date) };
}

export function nextLessonDate(
  course: CourseRow,
  exceptions: ExceptionDTO[],
  from: Date,
): { date: string; time: string } | null {
  const threshold = from.getTime() - LESSON_MS;
  const first = medinaDate(new Date(threshold));
  for (let i = 0; i <= SEARCH_DAYS; i++) {
    const date = addDays(first, i);
    const day = isLessonDay(course, date, exceptions);
    if (day.held && medinaInstant(date, day.time).getTime() >= threshold) {
      return { date, time: day.time };
    }
  }
  return null;
}

export function courseInWindow(
  courses: CourseRow[],
  exceptions: ExceptionDTO[],
  at: Date,
): CourseRow | null {
  const today = medinaDate(at);
  for (const course of courses) {
    for (const date of [addDays(today, -1), today]) {
      const day = isLessonDay(course, date, exceptions);
      if (!day.held) continue;
      const start = medinaInstant(date, day.time).getTime();
      if (at.getTime() >= start - LEAD_MS && at.getTime() <= start + LESSON_MS) return course;
    }
  }
  return null;
}
