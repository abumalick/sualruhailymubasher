const MEDINA_OFFSET_MS = 3 * 3600_000;
const DAY_MS = 86_400_000;

export function medinaDate(at: Date): string {
  return new Date(at.getTime() + MEDINA_OFFSET_MS).toISOString().slice(0, 10);
}

export function medinaInstant(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+03:00`);
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

const HIJRI = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
});
const HIJRI_SCAN_DAYS = 60;

export function hijriToMedinaDate(hijri: string, around: Date): string | null {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(hijri);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const center = medinaDate(around);
  for (let i = -HIJRI_SCAN_DAYS; i <= HIJRI_SCAN_DAYS; i++) {
    const date = addDays(center, i);
    const parts = HIJRI.formatToParts(new Date(`${date}T12:00:00Z`));
    const part = (type: string) => Number.parseInt(parts.find((p) => p.type === type)?.value ?? '', 10);
    if (part('day') === d && part('month') === mo && part('year') === y) return date;
  }
  return null;
}

const EASTERN_DIGITS = /[٠-٩۰-۹]/g;
const toLatinDigits = (s: string) =>
  s.replace(EASTERN_DIGITS, (d) => String(d.charCodeAt(0) >= 0x06f0 ? d.charCodeAt(0) - 0x06f0 : d.charCodeAt(0) - 0x0660));

// Caption dates come as "٢٧/ ٥/ ١٤٤٨" (day first) or "1448/5/20" (year first); stored form is DD-MM-YYYY.
export function normalizeHijri(raw: string): string | null {
  const parts = toLatinDigits(raw).split(/\s*[/-]\s*/).map((p) => p.trim());
  if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) return null;
  const [a, b, c] = parts;
  const [d, m, y] = a.length === 4 ? [c, b, a] : [a, b, c];
  const [day, month] = [Number(d), Number(m)];
  if (y.length !== 4 || day < 1 || day > 30 || month < 1 || month > 12) return null;
  return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${y}`;
}
