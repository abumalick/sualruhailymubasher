import type { CourseDTO, LiveDTO } from '@sualruhaily/shared';
import { bookHref, editionPage, pageSuffix, previousLabel, printedPage, startText } from '../ui/format';
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
  label: string | null;
  start: { startPoint: string | null; pdfIndex: number | null; startPage: number | null } | null;
}

const startOf = (l: { startPoint: string | null; pdfIndex: number | null; startPage: number | null }) => ({ startPoint: l.startPoint, pdfIndex: l.pdfIndex, startPage: l.startPage });

// The lesson on air is the one held on the broadcast's Medina day. course.next is not always it: once that lesson is
// published next counts past it, and 150 min after the scheduled start next moves on while a long broadcast runs.
// A lesson not published yet has no label: its place in the sheikh's sequence is not known before it is.
export function liveLesson(course: CourseDTO, startedAt: string | null): LiveLesson {
  const next = course.next;
  const started = startedAt ? new Date(startedAt) : null;
  const onAirDay = started && !Number.isNaN(started.getTime()) ? medinaDate(started) : null;
  const heldToday = started && onAirDay ? course.latest.find((l) => l.hijriDate === hijriToday(started)) : undefined;
  if (heldToday) return { label: heldToday.label, start: startOf(heldToday) };
  if (!next) return { label: null, start: null };
  if (!onAirDay || next.date <= onAirDay) return { label: null, start: startOf(next) };
  const newest = course.latest[0];
  if (course.unpublished === 0) return newest ? { label: newest.label, start: startOf(newest) } : { label: null, start: null };
  if (course.unpublished === 1 && newest && (newest.endPoint || newest.endPage !== null)) {
    return { label: null, start: { startPoint: newest.endPoint, pdfIndex: newest.endPdfIndex ?? newest.pdfIndex, startPage: newest.endPage } };
  }
  return { label: null, start: null };
}

export const liveLabel = (course: CourseDTO, startedAt: string | null): string | null => liveLesson(course, startedAt).label;

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
  const label = lesson?.label ?? null;
  const start = lesson?.start ?? null;
  const edition = course && start ? editionPage(course, start.startPage) : null;
  const liveText = [label ? `مباشر · ${label}` : 'بث مباشر', edition].filter(Boolean).join(' · ');
  return {
    title: course?.title ?? 'البث المباشر',
    header: label ? `البث المباشر · ${label}` : 'البث المباشر',
    start: lesson && start ? startText(start, lesson?.label || !course ? null : previousLabel(course)) : null,
    edition,
    book: course && start ? bookHref(course, start.pdfIndex, start.startPage, true) : null,
    bookLabel: `تابع في الكتاب${course && start ? pageSuffix(printedPage(course, start.pdfIndex, start.startPage)) : ''}`,
    status: isLive ? { live: true, text: liveText } : { live: false, text: 'انتهى البث' },
  };
}

export const listeningLive = (p: LivePlayer, src: { kind: 'live' | 'recording' } | null): boolean => p.view !== 'closed' || src?.kind === 'live';

// Where the book's back arrow leads when nothing of the app sits behind it: the lesson's tab, which also holds the
// live hero during its broadcast.
export const bookBack = (courseId: string): string => `#/course/${courseId}`;

export const backAction = (p: LivePlayer, canGoBack: boolean): 'collapse' | 'back' | 'none' =>
  p.view === 'expanded' ? 'collapse' : canGoBack ? 'back' : 'none';
