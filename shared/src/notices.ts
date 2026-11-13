import { toArabicDigits } from './digits';

// The wording of the course notifications, shared so the onboarding's preview shows what the server sends.
export const NOTICE_TITLE = { live: '🔴 بدأ البث المباشر', rec: 'التسجيل متاح · راجع الدرس', prep: 'حضّر للدرس القادم' } as const;

export const lessonNoticeBody = (courseTitle: string, number: number): string => `${courseTitle} · الدرس ${toArabicDigits(number)}`;

export function prepNoticeBody(courseTitle: string, startPoint: string | null, number: number): string {
  const detail = startPoint ? startPoint : number > 1 ? `يتابع من حيث توقف الدرس ${toArabicDigits(number - 1)}` : null;
  return detail ? `${courseTitle} · ${detail}` : courseTitle;
}
