import type { CourseDTO, LessonDTO, LiveDTO, StateDTO } from '@sualruhaily/shared';
import { toArabicDigits } from '@sualruhaily/shared';
import { FIXTURE_STATE } from '../src/dev/fixture-state';

const [tafsir, tawhid] = FIXTURE_STATE.courses;

// Lesson texts, pages and edition as served by /api/state (tafsir lesson 460, tawhid lessons 13–15).
export const TAFSIR: CourseDTO = {
  ...tafsir,
  pdfUrls: [],
  edition: 'طبعة دار ابن الجوزي',
  next: {
    ...tafsir.next!,
    date: '2026-11-03',
    startPoint: 'تفسير سورة التوبة: من الآية (٨) ﴿كَيْفَ وَإِنْ يَظْهَرُوا عَلَيْكُمْ لَا يَرْقُبُوا فِيكُمْ إِلًّا وَلَا ذِمَّةً...﴾',
    startPage: 636,
  },
};

const tawhidLesson = (l: Partial<LessonDTO> & Pick<LessonDTO, 'number'>): LessonDTO => ({ ...tawhid.latest[0], sectionNumber: l.number, label: `المجلس ${toArabicDigits(l.number)}`, ...l });
export const TAWHID_14 = tawhidLesson({
  number: 14,
  startPoint: 'من قوله: وقال الخليل عليه السلام: ﴿وَاجْنُبْنِي وَبَنِيَّ أَنْ نَعْبُدَ الْأَصْنَامَ﴾',
  pdfIndex: 0,
  startPage: 275,
  endPoint: 'من قوله: <فيه مسائل: الأولى: الخوف من الشرك>…',
  endPage: 280,
  endPdfIndex: 0,
});
export const TAWHID_13 = tawhidLesson({ number: 13, startPoint: 'من قوله: باب الخوف من الشرك', pdfIndex: 0, startPage: 270, endPage: 275, endPdfIndex: 0 });

export const TAWHID: CourseDTO = {
  ...tawhid,
  pageOffsets: [2, 2, 2],
  latest: [TAWHID_14, TAWHID_13],
  next: { ...tawhid.next!, date: '2026-11-02', pdfIndex: 0, startPoint: TAWHID_14.endPoint, startPage: 280, estEndPage: 285, estimated: false },
};

// The broadcast's start, Medina dates 2026-11-02 (Maghrib) and 2026-11-03 (Fajr).
export const STARTED = { 'kabair': '2026-11-02T15:10:00Z', 'kitab-tawhid': '2026-11-03T02:30:00Z' } as Record<string, string>;

export const liveDTO = (courseId: string | null): LiveDTO => ({
  ...FIXTURE_STATE.live,
  embedUrl: 'about:blank#mixlr',
  isLive: true,
  courseId,
  startedAt: courseId ? STARTED[courseId] : '2026-11-02T10:00:00Z',
});

export const liveState = (courseId: string | null): StateDTO => ({ ...FIXTURE_STATE, courses: [TAFSIR, TAWHID], live: liveDTO(courseId) });

// What server/src/jobs/live.ts handleOffline writes once the broadcast has ended.
export const endedState = (): StateDTO => ({
  ...FIXTURE_STATE,
  courses: [TAFSIR, TAWHID],
  live: { ...FIXTURE_STATE.live, embedUrl: 'about:blank#mixlr', isLive: false, courseId: null, startedAt: null },
});
