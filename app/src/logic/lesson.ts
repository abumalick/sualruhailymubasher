import type { CourseDTO, LessonDTO, LiveDTO, NextPassageDTO } from '@sualruhaily/shared';
import type { Ticks } from './ticks';
import { liveLesson } from './live';
import { hijriToday, lessonInstant } from './time';

export const LESSON_MS = 150 * 60_000;

export const nextStart = (c: CourseDTO): number => (c.next ? lessonInstant(c.next.date, c.next.time).getTime() : Infinity);

export type Top =
  | { kind: 'live'; lessonNumber: number }
  | { kind: 'next'; next: NextPassageDTO; read: boolean }
  | { kind: 'today'; next: NextPassageDTO; read: boolean; ended: boolean }
  | { kind: 'none' };

export type Last =
  | { kind: 'recording'; lesson: LessonDTO; reviewed: boolean }
  | { kind: 'awaiting'; lessonNumber: number }
  | null;

export interface LessonModel {
  top: Top;
  last: Last;
  archiveSkip: number | null;
}

// The lesson that happened but isn't published yet, if any. The previous recording stays "last" while a lesson is on
// air or under 150 min old; after that, or once the server counted the broadcast, "last" waits for the new one.
function awaitingNumber(c: CourseDTO, latest: LessonDTO, onAir: boolean, nowMs: number): number | null {
  if (latest.hijriDate === hijriToday(new Date(nowMs))) return latest.recordingUrl ? null : latest.number;
  if (onAir || !c.next) return null;
  if (c.next.number > latest.number + 1) return latest.number + 1;
  if (nowMs >= nextStart(c) + LESSON_MS && c.next.number > latest.number) return c.next.number;
  return null;
}

export function buildLesson(course: CourseDTO, live: LiveDTO, ticks: Ticks, now: Date): LessonModel {
  const nowMs = now.getTime();
  const onAir = live.isLive && live.courseId === course.id;
  const key = (n: number) => `${course.id}:${n}`;

  let top: Top;
  const next = course.next;
  if (onAir) top = { kind: 'live', lessonNumber: liveLesson(course, live.startedAt).number };
  else if (!next) top = { kind: 'none' };
  else if (nowMs < nextStart(course)) top = { kind: 'next', next, read: ticks.read.has(key(next.number)) };
  else top = { kind: 'today', next, read: ticks.read.has(key(next.number)), ended: nowMs >= nextStart(course) + LESSON_MS };

  const latest = course.latest[0];
  if (!latest) return { top, last: null, archiveSkip: null };
  const awaiting = awaitingNumber(course, latest, onAir, nowMs);
  if (awaiting === latest.number) return { top, last: { kind: 'awaiting', lessonNumber: awaiting }, archiveSkip: latest.number };
  if (awaiting !== null) return { top, last: { kind: 'awaiting', lessonNumber: awaiting }, archiveSkip: null };
  if (!latest.recordingUrl) return { top, last: { kind: 'awaiting', lessonNumber: latest.number }, archiveSkip: latest.number };
  return { top, last: { kind: 'recording', lesson: latest, reviewed: ticks.reviewed.has(key(latest.number)) }, archiveSkip: latest.number };
}
