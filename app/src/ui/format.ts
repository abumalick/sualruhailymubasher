import { toArabicDigits, type CourseDTO, type NextPassageDTO, type Slot } from '@sualruhaily/shared';
import { medinaDate } from '../logic/time';

export const ar = (n: number) => toArabicDigits(n);
export const arText = (s: string) => s.replace(/\d/g, (d) => toArabicDigits(Number(d)));

const SLOT_NAME: Record<Slot, string> = { fajr: 'الفجر', asr: 'العصر', maghrib: 'المغرب' };
export const slotName = (slot: Slot) => SLOT_NAME[slot];

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

export const startText = (next: { startPoint: string | null; number: number }) => (next.startPoint ? arText(next.startPoint) : `يتابع من حيث توقف الدرس ${ar(next.number - 1)}`);

// Lesson pages are PDF page numbers; people read the number printed on the page.
export function printedPage(course: Pick<CourseDTO, 'pageOffsets'>, pdfIndex: number | null, page: number | null): number | null {
  if (page === null) return null;
  const printed = page - (course.pageOffsets?.[pdfIndex ?? 0] ?? 0);
  return printed >= 1 ? printed : null;
}

export const pageSuffix = (printed: number | null) => (printed === null ? '' : ` · ص ${ar(printed)}`);

export const bookLabel = (action: string, printed: number | null) => (printed === null ? 'افتح الكتاب' : `${action} · ص ${ar(printed)}`);

export function passageLine(course: Pick<CourseDTO, 'pageOffsets'>, next: NextPassageDTO): string {
  const start = startText(next);
  const end = printedPage(course, next.pdfIndex, next.estEndPage);
  return end === null ? start : `${start} · إلى نحو ص ${ar(end)}`;
}

// The next lesson's estimated pages, only when the book is open at its start: a book opened elsewhere (the lesson on
// air once next has moved past it, a review) would show another lesson's range.
export function passageRange(course: Pick<CourseDTO, 'pageOffsets' | 'next'>, pdfIndex: number, page: number): string {
  const next = course.next;
  if (!next || next.pdfIndex !== pdfIndex || next.startPage !== page) return '';
  const start = printedPage(course, next.pdfIndex, next.startPage);
  const end = printedPage(course, next.pdfIndex, next.estEndPage);
  return start !== null && end !== null ? `ص ${ar(start)} إلى نحو ${ar(end)}` : '';
}

export function editionPage(course: CourseDTO, page: number | null): string | null {
  if (course.pdfUrls.length > 0 || !course.edition || page === null) return null;
  return `ص ${ar(page)} · ${course.edition}`;
}

export function bookHref(course: CourseDTO, pdfIndex: number | null, page: number | null, marker = false): string | null {
  if (course.pdfUrls.length === 0) return null;
  if (page === null) return `#/book/${course.id}/${pdfIndex ?? 0}/1`;
  return `#/book/${course.id}/${pdfIndex ?? 0}/${page}${marker ? '?marker=1' : ''}`;
}

export function courseLabel(c: CourseDTO, all: CourseDTO[]): string {
  const shared = all.some((o) => o.id !== c.id && o.slot === c.slot);
  return shared ? c.title : `درس ${slotName(c.slot)}`;
}

export function summary(all: CourseDTO[], ids: string[]): string {
  const picked = all.filter((c) => ids.includes(c.id));
  if (picked.length === 0) return '';
  if (picked.length === all.length) {
    if (all.length === 1) return courseLabel(all[0], all);
    return all.length === 2 ? 'الدرسان كلاهما' : 'كل الدروس';
  }
  const names = picked.map((c) => courseLabel(c, all)).join(' و');
  return picked.length === 1 ? `${names} فقط` : names;
}

export const REMINDER: Record<Slot, string> = {
  fajr: 'مساء اليوم السابق · ٩:٠٠ م',
  asr: 'قبل الدرس بثلاث ساعات',
  maghrib: 'عصر يوم الدرس · ٣:٣٠ م',
};
