import type { LessonDTO, NextPassageDTO } from '@albadr/shared';
import type { CourseRow } from './repo';

const DEFAULT_PACE = 2;

function pace(latest: LessonDTO[]): number {
  const diffs = latest
    .filter((l) => l.startPage !== null && l.endPage !== null)
    .map((l) => l.endPage! - l.startPage!)
    .sort((a, b) => a - b);
  if (diffs.length === 0) return DEFAULT_PACE;
  const mid = diffs.length >> 1;
  const median = diffs.length % 2 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
  return Math.max(1, Math.round(median));
}

export function nextPassage(
  _course: CourseRow,
  latest: LessonDTO[],
  next: { date: string; time: string } | null,
  number = (latest[0]?.number ?? 0) + 1,
): NextPassageDTO | null {
  if (!next) return null;
  const last = latest[0];
  const step = pace(latest);
  const ended = !!last && last.endPage !== null;
  const unpublished = last ? number - last.number - 1 : 0;
  const base = {
    date: next.date,
    time: next.time,
    number,
    pdfIndex: (ended ? last!.endPdfIndex ?? last!.pdfIndex : last?.pdfIndex) ?? null,
  };

  if (ended && unpublished === 0) {
    return { ...base, startPoint: last!.endPoint, startPage: last!.endPage, estEndPage: last!.endPage! + step, estimated: false };
  }
  const following = ended ? last!.endPage : last && last.startPage !== null ? last.startPage + step : null;
  const startPage = following === null ? null : following + step * unpublished;
  return {
    ...base,
    startPoint: null,
    startPage,
    estEndPage: startPage === null ? null : startPage + step,
    estimated: true,
  };
}
