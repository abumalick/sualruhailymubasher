import type { CourseDTO, LiveDTO } from '@albadr/shared';
import { ar, bookHref, editionPage, startText } from '../ui/format';
import { hijriToday, medinaDate } from './time';

export type LiveView = 'closed' | 'expanded' | 'collapsed';

// The broadcast the open player belongs to. Kept after the server reports the end ({isLive:false, courseId:null})
// so the bar still names the lesson and links the book while the listener is still on it.
export interface LivePlayer {
  view: LiveView;
  courseId: string | null;
  startedAt: string | null;
}

export type LiveEvent =
  | { type: 'open'; live: LiveDTO }
  | { type: 'state'; live: LiveDTO }
  | { type: 'expand' | 'collapse' | 'navigate' | 'close' | 'play-recording' };

export const CLOSED: LivePlayer = { view: 'closed', courseId: null, startedAt: null };

export function nextLivePlayer(p: LivePlayer, e: LiveEvent): LivePlayer {
  switch (e.type) {
    case 'open':
      return { view: 'expanded', courseId: e.live.courseId, startedAt: e.live.startedAt };
    case 'state':
      return p.view !== 'closed' && e.live.isLive ? { ...p, courseId: e.live.courseId, startedAt: e.live.startedAt } : p;
    case 'expand':
      return p.view === 'closed' ? p : { ...p, view: 'expanded' };
    case 'collapse':
      return p.view === 'closed' ? p : { ...p, view: 'collapsed' };
    case 'navigate':
      return p.view === 'expanded' ? { ...p, view: 'collapsed' } : p;
    case 'close':
    case 'play-recording':
      return CLOSED;
  }
}

export interface LiveLesson {
  number: number;
  start: { startPoint: string | null; pdfIndex: number | null; startPage: number | null } | null;
}

// The lesson on air is the one held on the broadcast's Medina day. course.next is not always it: once that lesson is
// published next counts past it, and 150 min after the scheduled start next moves on while a long broadcast runs.
export function liveLesson(course: CourseDTO, startedAt: string | null): LiveLesson {
  const next = course.next;
  const started = startedAt ? new Date(startedAt) : null;
  const onAirDay = started && !Number.isNaN(started.getTime()) ? medinaDate(started) : null;
  const heldToday = started && onAirDay ? course.latest.find((l) => l.hijriDate === hijriToday(started)) : undefined;
  if (heldToday) return { number: heldToday.number, start: { startPoint: heldToday.startPoint, pdfIndex: heldToday.pdfIndex, startPage: heldToday.startPage } };
  if (!next) return { number: (course.latest[0]?.number ?? 0) + 1, start: null };
  if (!onAirDay || next.date <= onAirDay) {
    return { number: next.number, start: { startPoint: next.startPoint, pdfIndex: next.pdfIndex, startPage: next.startPage } };
  }
  const number = next.number - 1;
  const own = course.latest.find((l) => l.number === number);
  if (own) return { number, start: { startPoint: own.startPoint, pdfIndex: own.pdfIndex, startPage: own.startPage } };
  const prev = course.latest.find((l) => l.number === number - 1);
  if (prev && (prev.endPoint || prev.endPage !== null)) {
    return { number, start: { startPoint: prev.endPoint, pdfIndex: prev.endPdfIndex ?? prev.pdfIndex, startPage: prev.endPage } };
  }
  return { number, start: null };
}

export interface LiveContext {
  title: string;
  header: string;
  start: string | null;
  edition: string | null;
  book: string | null;
  bookLabel: string;
  status: { live: boolean; text: string };
}

export function liveContext(course: CourseDTO | undefined, isLive: boolean, startedAt: string | null): LiveContext {
  const lesson = course ? liveLesson(course, startedAt) : null;
  const start = lesson?.start ?? null;
  const label = lesson ? `الدرس ${ar(lesson.number)}` : null;
  const edition = course && start ? editionPage(course, start.startPage) : null;
  const liveText = [label ? `مباشر · ${label}` : 'بث مباشر', edition].filter(Boolean).join(' · ');
  return {
    title: course?.title ?? 'البث المباشر',
    header: label ? `البث المباشر · ${label}` : 'البث المباشر',
    start: lesson && start ? startText({ startPoint: start.startPoint, number: lesson.number }) : null,
    edition,
    book: course && start ? bookHref(course, start.pdfIndex, start.startPage, true) : null,
    bookLabel: start?.startPage != null ? `تابع في الكتاب · ص ${ar(start.startPage)}` : 'تابع في الكتاب',
    status: isLive ? { live: true, text: liveText } : { live: false, text: 'انتهى البث' },
  };
}
