import { toArabicDigits, type CourseDTO, type NextPassageDTO, type Slot } from '@albadr/shared';
import { medinaDate } from '../logic/time';

export const ar = (n: number) => toArabicDigits(n);
export const arText = (s: string) => s.replace(/\d/g, (d) => toArabicDigits(Number(d)));

export const slotName = (slot: Slot) => (slot === 'fajr' ? 'الفجر' : 'المغرب');

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function weekdayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function dayWord(date: string, now: Date): string {
  if (date === medinaDate(now)) return 'اليوم';
  if (date === medinaDate(new Date(now.getTime() + 86_400_000))) return 'غدًا';
  return `يوم ${weekdayOf(date)}`;
}

export function clock12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${ar(h % 12 || 12)}:${arText(String(m).padStart(2, '0'))} ${h < 12 ? 'ص' : 'م'}`;
}

export function schedule(weekdays: number[]): string {
  const off = [0, 1, 2, 3, 4, 5, 6].filter((d) => !weekdays.includes(d)).map((d) => WEEKDAYS[d]);
  if (off.length === 0) return 'يوميًّا';
  if (off.length <= 2) return `يوميًّا عدا ${off.join(' و')}`;
  return [...weekdays].sort().map((d) => WEEKDAYS[d]).join('، ');
}

export function passageLine(next: NextPassageDTO): string {
  const start = next.startPoint ? arText(next.startPoint) : `يتابع من حيث توقف الدرس ${ar(next.number - 1)}`;
  return next.estEndPage === null ? start : `${start} · إلى نحو ص ${ar(next.estEndPage)}`;
}

export function bookHref(course: CourseDTO, pdfIndex: number | null, page: number | null, marker = false): string | null {
  if (course.pdfUrls.length === 0) return null;
  if (page === null) return `#/book/${course.id}/${pdfIndex ?? 0}/1`;
  return `#/book/${course.id}/${pdfIndex ?? 0}/${page}${marker ? '?marker=1' : ''}`;
}
