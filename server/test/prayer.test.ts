import { describe, expect, it } from 'vitest';
import { asrMinutes, fajrTime, sunsetTime } from '../src/prayer';
import umm from './fixtures/umm-al-qura-medina-2026.json';

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const near = (actual: string, expected: string, tol = 3) =>
  expect(Math.abs(minutes(actual) - minutes(expected))).toBeLessThanOrEqual(tol);

// Reference: api.aladhan.com/v1/timings/<DD-MM-YYYY>?latitude=24.4672&longitude=39.6111&method=4
// (Umm al-Qura, Fajr 18.5°), fetched 2026-10-30.
describe('Medina prayer times', () => {
  it.each([
    ['2026-10-30', '05:08', '17:43'],
    ['2026-11-02', '05:09', '17:41'],
    ['2026-05-15', '04:12', '18:58'],
    ['2026-02-15', '05:37', '18:16'],
  ])('%s fajr %s sunset %s', (date, fajr, sunset) => {
    near(fajrTime(date), fajr);
    near(sunsetTime(date), sunset);
  });

  it('formats HH:MM', () => {
    expect(fajrTime('2026-06-21')).toMatch(/^0[34]:\d\d$/);
  });
});

// Fixture: api.aladhan.com/v1/timings/<15th of each month of 2026>?latitude=24.4672&longitude=39.6111&method=4&school=0
describe('asrMinutes', () => {
  it('matches Umm al-Qura for Medina', () => {
    expect(umm).toHaveLength(12);
    for (const { date, asr } of umm) {
      expect(Math.abs(asrMinutes(date) - minutes(asr)), date).toBeLessThanOrEqual(2);
    }
  });
});
