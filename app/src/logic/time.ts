const MEDINA_OFFSET_MS = 3 * 3600_000;

const shifted = (now: Date) => new Date(now.getTime() + MEDINA_OFFSET_MS);
const pad = (n: number) => String(n).padStart(2, '0');

export function medinaDate(now: Date): string {
  const d = shifted(now);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function medinaWeekday(now: Date): number {
  return shifted(now).getUTCDay();
}

export function lessonInstant(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - MEDINA_OFFSET_MS);
}

export function previousDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return medinaDate(new Date(Date.UTC(y, m - 1, d - 1, 12) - MEDINA_OFFSET_MS));
}

export function hijriToday(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(shifted(now));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('day')}-${get('month')}-${get('year')}`;
}

export function hijriLabel(now: Date): { weekday: string; day: string } {
  const parts = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).formatToParts(shifted(now));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { weekday: get('weekday'), day: `${get('day')} ${get('month')}` };
}
