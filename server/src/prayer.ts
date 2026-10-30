// Solar-position prayer times (PrayTimes.org algorithm) for Medina, UTC+3.
const LAT = 24.4672;
const LNG = 39.6111;
const TZ = 3;
const FAJR_ANGLE = 18.5;
const SUNSET_ANGLE = 0.833;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const fix = (a: number, b: number) => ((a % b) + b) % b;

function julian(date: string): number {
  let [y, m, d] = date.split('-').map(Number) as [number, number, number];
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
}

function sun(jd: number): { decl: number; eqt: number } {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * D;
  const ra = fix(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15, 24);
  return { decl: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L)))), eqt: q / 15 - ra };
}

function sunAngleHours(date: string, angle: number, guessHours: number, beforeNoon: boolean): number {
  const jd = julian(date) - LNG / (15 * 24) + guessHours / 24;
  const { decl, eqt } = sun(jd);
  const noon = fix(12 - eqt, 24);
  const t =
    deg(
      Math.acos(
        (-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(LAT))) / (Math.cos(rad(decl)) * Math.cos(rad(LAT))),
      ),
    ) / 15;
  return (beforeNoon ? noon - t : noon + t) + TZ - LNG / 15;
}

export const fajrMinutes = (date: string) => sunAngleHours(date, FAJR_ANGLE, 5, true) * 60;
export const sunsetMinutes = (date: string) => sunAngleHours(date, SUNSET_ANGLE, 18, false) * 60;

export function formatMinutes(minutes: number): string {
  const m = fix(Math.round(minutes), 1440);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export const fajrTime = (date: string) => formatMinutes(fajrMinutes(date));
export const sunsetTime = (date: string) => formatMinutes(sunsetMinutes(date));
