import { toArabicDigits } from './digits';

export function lessonLabel(lessonWord: string, section: string, n: number | null): string {
  if (n === null) return section === '' ? lessonWord : section;
  return section === '' ? `${lessonWord} ${toArabicDigits(n)}` : `${section} – الدرس ${toArabicDigits(n)}`;
}

export const noticePlace = (title: string, place: string): string => (place === '' ? title : `${title} · ${place}`);
