import type { CourseDTO, LessonDTO, LiveDTO, NextPassageDTO } from '@sualruhaily/shared';
import type { Ticks } from './ticks';
import { hijriToday, lessonInstant } from './time';

export const LESSON_MS = 150 * 60_000;

export const nextStart = (c: CourseDTO): number => (c.next ? lessonInstant(c.next.date, c.next.time).getTime() : Infinity);

export type Top =
  | { kind: 'live' }
  | { kind: 'next'; next: NextPassageDTO; read: boolean }
  | { kind: 'today'; next: NextPassageDTO; read: boolean; ended: boolean }
  | { kind: 'none' };

export type Last =
  | { kind: 'recording'; lesson: LessonDTO; reviewed: boolean }
  | { kind: 'awaiting'; label: string | null }
  | null;

export interface LessonModel {
  top: Top;
  last: Last;
  archiveSkip: number | null;
}

// Ticks are keyed by number. The next lesson has none yet: its key counts on from the newest lesson, and is never shown.
export const nextTickNumber = (c: CourseDTO): number => (c.latest[0]?.number ?? 0) + 1 + c.unpublished;

// The lesson that happened but isn't published yet, if any: the newest one itself ('own', recording still missing)
// or a later one ('later'). The previous recording stays "last" while a lesson is on air or under 150 min old; after
// that, or once the server counted the broadcast, "last" waits for the new one.
function awaiting(c: CourseDTO, latest: LessonDTO, onAir: boolean, nowMs: number): 'own' | 'later' | null {
  if (latest.hijriDate === hijriToday(new Date(nowMs))) return latest.recordingUrl ? null : 'own';
  if (onAir) return null;
  if (c.unpublished > 0) return 'later';
  if (!c.next) return null;
  if (nowMs >= nextStart(c) + LESSON_MS) return 'later';
  return null;
}

export function buildLesson(course: CourseDTO, live: LiveDTO, ticks: Ticks, now: Date): LessonModel {
  const nowMs = now.getTime();
  const onAir = live.isLive && live.courseId === course.id;
  const key = (n: number) => `${course.id}:${n}`;

  let top: Top;
  const next = course.next;
  const nextKey = key(nextTickNumber(course));
  if (onAir) top = { kind: 'live' };
  else if (!next) top = { kind: 'none' };
  else if (nowMs < nextStart(course)) top = { kind: 'next', next, read: ticks.read.has(nextKey) };
  else top = { kind: 'today', next, read: ticks.read.has(nextKey), ended: nowMs >= nextStart(course) + LESSON_MS };

  const latest = course.latest[0];
  if (!latest) return { top, last: null, archiveSkip: null };
  const wait = awaiting(course, latest, onAir, nowMs);
  if (wait === 'own') return { top, last: { kind: 'awaiting', label: latest.label }, archiveSkip: latest.number };
  if (wait === 'later') return { top, last: { kind: 'awaiting', label: null }, archiveSkip: null };
  if (!latest.recordingUrl) return { top, last: { kind: 'awaiting', label: latest.label }, archiveSkip: latest.number };
  return { top, last: { kind: 'recording', lesson: latest, reviewed: ticks.reviewed.has(key(latest.number)) }, archiveSkip: latest.number };
}
