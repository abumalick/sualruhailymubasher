import { noticePlace } from './labels';

// The wording of the course notifications, shared so the onboarding's preview shows what the server sends.
export const NOTICE_TITLE = { live: '🔴 بدأ البث المباشر', rec: 'التسجيل متاح · راجع الدرس', prep: 'حضّر للدرس القادم' } as const;

export const lessonNoticeBody = (courseTitle: string, place: string): string => noticePlace(courseTitle, place);

export function prepNoticeBody(courseTitle: string, place: string, startPoint: string | null): string {
  const head = noticePlace(courseTitle, place);
  return startPoint ? `${head} — يبدأ من: ${startPoint}` : head;
}
