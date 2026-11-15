import { toArabicDigits } from './digits';

export function lessonLabel(lessonWord: string, section: string, n: number): string {
  return section === '' ? `${lessonWord} ${toArabicDigits(n)}` : `${section} – الدرس ${toArabicDigits(n)}`;
}
