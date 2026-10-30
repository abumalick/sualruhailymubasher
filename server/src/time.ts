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
