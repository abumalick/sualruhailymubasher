import { describe, expect, it } from 'vitest';
import type { LessonDTO } from '@albadr/shared';
import { nextPassage } from '../src/estimate';
import type { CourseRow } from '../src/repo';

const course = { id: 'c' } as CourseRow;
const next = { date: '2026-11-02', time: '05:25' };
const lesson = (number: number, o: Partial<LessonDTO> = {}): LessonDTO => ({
  number,
  hijriDate: '',
  startPoint: 'x',
  pdfIndex: null,
  startPage: null,
  endPoint: null,
  endPage: null,
  recordingUrl: null,
  detailPath: '',
  ...o,
});

describe('nextPassage', () => {
  it('returns null without a next lesson', () => {
    expect(nextPassage(course, [lesson(1)], null)).toBeNull();
  });

  it('estimates from the median pace', () => {
    const latest = [
      lesson(3, { startPage: 14, endPage: 16, pdfIndex: 1 }),
      lesson(2, { startPage: 11, endPage: 14 }),
      lesson(1, { startPage: 9, endPage: 11 }),
    ];
    latest[0] = { ...latest[0], endPage: null };
    latest.push(lesson(0, { startPage: 5, endPage: 7 }));
    expect(nextPassage(course, latest, next)).toEqual({
      ...next,
      number: 4,
      startPoint: null,
      pdfIndex: 1,
      startPage: 16,
      estEndPage: 18,
      estimated: true,
    });
  });

  it('uses the transcribed end point exactly', () => {
    const latest = [lesson(3, { startPage: 14, endPage: 16, endPoint: 'باب', pdfIndex: 2 })];
    expect(nextPassage(course, latest, next)).toMatchObject({
      number: 4,
      startPoint: 'باب',
      startPage: 16,
      pdfIndex: 2,
      estEndPage: 18,
      estimated: false,
    });
  });

  it('leaves pages null when nothing is known', () => {
    expect(nextPassage(course, [lesson(5)], next)).toMatchObject({
      number: 6,
      startPage: null,
      estEndPage: null,
      estimated: true,
    });
    expect(nextPassage(course, [], next)).toMatchObject({ number: 1, startPage: null, pdfIndex: null });
  });
});
