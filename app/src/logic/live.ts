import type { CourseDTO } from '@albadr/shared';
import { ar, bookHref, editionPage, startText } from '../ui/format';
import { liveLessonNumber } from './home';

export type LiveView = 'closed' | 'expanded' | 'collapsed';
export type LiveEvent = 'open' | 'expand' | 'collapse' | 'navigate' | 'close' | 'play-recording';

export function nextLiveView(view: LiveView, event: LiveEvent): LiveView {
  switch (event) {
    case 'open':
    case 'expand':
      return 'expanded';
    case 'collapse':
      return view === 'closed' ? 'closed' : 'collapsed';
    case 'navigate':
      return view === 'expanded' ? 'collapsed' : view;
    case 'close':
    case 'play-recording':
      return 'closed';
  }
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

export function liveContext(course: CourseDTO | undefined, isLive: boolean): LiveContext {
  const next = course?.next ?? null;
  const lesson = course ? `الدرس ${ar(liveLessonNumber(course))}` : null;
  const edition = course && next ? editionPage(course, next.startPage) : null;
  const liveText = [lesson ? `مباشر · ${lesson}` : 'بث مباشر', edition].filter(Boolean).join(' · ');
  return {
    title: course?.title ?? 'البث المباشر',
    header: lesson ? `البث المباشر · ${lesson}` : 'البث المباشر',
    start: next ? startText(next) : null,
    edition,
    book: course && next ? bookHref(course, next.pdfIndex, next.startPage, true) : null,
    bookLabel: next?.startPage != null ? `تابع في الكتاب · ص ${ar(next.startPage)}` : 'تابع في الكتاب',
    status: isLive ? { live: true, text: liveText } : { live: false, text: 'انتهى البث' },
  };
}
